const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');
const fs = require('fs'); // Apenas uma declaração de 'fs' é necessária
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// =================== CORREÇÃO DO BANCO DE DADOS ===================
// Lógica para ler a senha do secret do Docker ou do .env
const password = process.env.DB_PASSWORD_FILE
  ? fs.readFileSync(process.env.DB_PASSWORD_FILE, 'utf8').trim()
  : process.env.DB_PASSWORD;

// Configuração do Pool usando variáveis de ambiente individuais
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USERNAME,
  password: password, // Usamos a senha lida do secret ou do .env
  database: process.env.DB_DATABASE,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
// =================== FIM DA CORREÇÃO ===================


// Database connection with retry
async function connectWithRetry() {
  let retries = 5;
  while (retries) {
    try {
      const client = await pool.connect();
      console.log('✅ Connected to PostgreSQL database');
      client.release();
      break;
    } catch (err) {
      console.log(`❌ Database connection failed. Retries left: ${retries - 1}`);
      retries -= 1;
      if (retries === 0) {
        console.error('❌ Could not connect to database:', err.stack);
        process.exit(1);
      }
      await new Promise(res => setTimeout(res, 5000));
    }
  }
}

// Enhanced security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      workerSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'https://sms.druzzo.com.br',
    'http://localhost:8080'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files with proper headers
app.use(express.static(path.join(__dirname), {
  setHeaders: (res, path) => {
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Enhanced request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
  console.log(`${timestamp} - ${req.method} ${req.path} - IP: ${ip} - User-Agent: ${req.get('User-Agent')?.substring(0, 50)}...`);
  next();
});

// Rate limiting middleware (simple implementation)
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 100; // requests per window

app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();

  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
  } else {
    const clientData = requestCounts.get(ip);
    if (now > clientData.resetTime) {
      clientData.count = 1;
      clientData.resetTime = now + RATE_LIMIT_WINDOW;
    } else {
      clientData.count++;
      if (clientData.count > RATE_LIMIT_MAX) {
        return res.status(429).json({
          error: 'Too many requests',
          message: 'Rate limit exceeded. Please try again later.'
        });
      }
    }
  }
  next();
});

// Enhanced health check endpoint
app.get('/health', async (req, res) => {
  try {
    const dbResult = await pool.query('SELECT NOW(), version()');
    const memUsage = process.memoryUsage();

    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: '2.0.0',
      database: {
        status: 'connected',
        timestamp: dbResult.rows[0].now,
        version: dbResult.rows[0].version.split(' ')[0]
      },
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
        total: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
        external: Math.round(memUsage.external / 1024 / 1024) + ' MB',
        rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB'
      },
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        pid: process.pid
      }
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Database connection failed',
      uptime: process.uptime(),
      details: process.env.NODE_ENV === 'development' ? error.message : 'Service unavailable'
    });
  }
});

// Serve main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API information endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'SMS App DS API',
    version: '2.0.0',
    description: 'Sistema de Comandos SMS para Rastreadores',
    endpoints: {
      models: {
        'GET /api/models': 'Listar modelos de equipamentos',
        'POST /api/models': 'Adicionar novo modelo',
        'PUT /api/models/:id': 'Atualizar modelo',
        'DELETE /api/models/:id': 'Deletar modelo'
      },
      commands: {
        'GET /api/models/:modelId/commands': 'Listar comandos por modelo',
        'POST /api/commands': 'Adicionar novo comando',
        'PUT /api/commands/:id': 'Atualizar comando',
        'DELETE /api/commands/:id': 'Deletar comando'
      },
      sms: {
        'POST /api/sms/send': 'Enviar comando SMS',
        'GET /api/sms/history': 'Histórico de envios',
        'GET /api/sms/stats': 'Estatísticas de envios'
      },
      reports: {
        'GET /api/reports/pdf': 'Gerar relatório PDF',
        'GET /api/reports/csv': 'Exportar dados CSV'
      }
    },
    documentation: 'https://github.com/DevHMedeiros/sms-app-ds',
    support: 'admin@druzzo.com.br'
  });
});

// ==================== DEVICE MODELS ROUTES ====================

// Get all device models
app.get('/api/models', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        m.*,
        COUNT(c.id) as command_count
      FROM device_models m
      LEFT JOIN commands c ON m.id = c.model_id
      GROUP BY m.id
      ORDER BY m.name
    `);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch models',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Add new device model
app.post('/api/models', async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Model name is required'
      });
    }

    const result = await pool.query(
      'INSERT INTO device_models (name, description, created_at) VALUES ($1, $2, NOW()) RETURNING *',
      [name.trim(), description || null]
    );

    res.status(201).json({
      success: true,
      message: 'Model added successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error adding model:', error);
    if (error.code === '23505') { // Unique violation
      res.status(409).json({
        success: false,
        error: 'Model name already exists'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to add model',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
});

// Update device model
app.put('/api/models/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Model name is required'
      });
    }

    const result = await pool.query(
      'UPDATE device_models SET name = $1, description = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      [name.trim(), description || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Model not found'
      });
    }

    res.json({
      success: true,
      message: 'Model updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating model:', error);
    if (error.code === '23505') {
      res.status(409).json({
        success: false,
        error: 'Model name already exists'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to update model'
      });
    }
  }
});

// Delete device model
app.delete('/api/models/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if model has commands
    const commandCheck = await pool.query('SELECT COUNT(*) FROM commands WHERE model_id = $1', [id]);
    const commandCount = parseInt(commandCheck.rows[0].count);

    if (commandCount > 0) {
      return res.status(409).json({
        success: false,
        error: `Cannot delete model. It has ${commandCount} associated commands.`,
        suggestion: 'Delete all commands first or use force delete.'
      });
    }

    const result = await pool.query('DELETE FROM device_models WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Model not found'
      });
    }

    res.json({
      success: true,
      message: 'Model deleted successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error deleting model:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete model'
    });
  }
});

// ==================== COMMANDS ROUTES ====================

// Get commands for a specific model
app.get('/api/models/:modelId/commands', async (req, res) => {
  try {
    const { modelId } = req.params;

    const result = await pool.query(`
      SELECT 
        c.*,
        m.name as model_name
      FROM commands c
      JOIN device_models m ON c.model_id = m.id
      WHERE c.model_id = $1
      ORDER BY c.command_text
    `, [modelId]);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      modelId: parseInt(modelId)
    });
  } catch (error) {
    console.error('Error fetching commands:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch commands'
    });
  }
});

// Get all commands
app.get('/api/commands', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.*,
        m.name as model_name
      FROM commands c
      JOIN device_models m ON c.model_id = m.id
      ORDER BY m.name, c.command_text
    `);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching commands:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch commands'
    });
  }
});

// Add new command
app.post('/api/commands', async (req, res) => {
  try {
    const { modelId, commandText, description } = req.body;

    if (!modelId || !commandText || commandText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Model ID and command text are required'
      });
    }

    // Check if model exists
    const modelCheck = await pool.query('SELECT id FROM device_models WHERE id = $1', [modelId]);
    if (modelCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Model not found'
      });
    }

    const result = await pool.query(
      'INSERT INTO commands (model_id, command_text, description, created_at) VALUES ($1, $2, $3, NOW()) RETURNING *',
      [modelId, commandText.trim(), description || null]
    );

    res.status(201).json({
      success: true,
      message: 'Command added successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error adding command:', error);
    if (error.code === '23505') {
      res.status(409).json({
        success: false,
        error: 'Command already exists for this model'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to add command'
      });
    }
  }
});

// Update command
app.put('/api/commands/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { commandText, description } = req.body;

    if (!commandText || commandText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Command text is required'
      });
    }

    const result = await pool.query(
      'UPDATE commands SET command_text = $1, description = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      [commandText.trim(), description || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Command not found'
      });
    }

    res.json({
      success: true,
      message: 'Command updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating command:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update command'
    });
  }
});

// Delete command
app.delete('/api/commands/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM commands WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Command not found'
      });
    }

    res.json({
      success: true,
      message: 'Command deleted successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error deleting command:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete command'
    });
  }
});

// ==================== SMS ROUTES ====================

// Send SMS command
app.post('/api/sms/send', async (req, res) => {
  try {
    const { phoneNumbers, modelId, commandText, notes } = req.body;

    if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Phone numbers array is required'
      });
    }

    if (!modelId || !commandText || commandText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Model ID and command text are required'
      });
    }

    // Validate phone numbers
    const phoneRegex = /^[\d\+\-\(\)\s]{10,20}$/;
    const invalidPhones = phoneNumbers.filter(phone => !phoneRegex.test(phone.trim()));

    if (invalidPhones.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone numbers detected',
        invalidPhones
      });
    }

    // Check if model exists
    const modelCheck = await pool.query('SELECT name FROM device_models WHERE id = $1', [modelId]);
    if (modelCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Model not found'
      });
    }

    const modelName = modelCheck.rows[0].name;
    const results = [];
    const errors = [];

    // Process each phone number
    for (const phone of phoneNumbers) {
      try {
        const cleanPhone = phone.trim();

        // Here you would integrate with your SMS service
        // For now, we'll simulate SMS sending and log to database
        const smsResult = await sendSMSCommand(cleanPhone, commandText, modelName);

        const result = await pool.query(`
          INSERT INTO sms_history 
          (phone_number, model_id, command_text, status, sent_at, details, notes, response_data) 
          VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7) 
          RETURNING *
        `, [
          cleanPhone,
          modelId,
          commandText.trim(),
          smsResult.success ? 'sent' : 'failed',
          smsResult.details || null,
          notes || null,
          JSON.stringify(smsResult)
        ]);

        results.push({
          phone: cleanPhone,
          status: smsResult.success ? 'sent' : 'failed',
          id: result.rows[0].id,
          details: smsResult.details
        });

      } catch (error) {
        console.error(`Error sending SMS to ${phone}:`, error);
        errors.push({
          phone: phone.trim(),
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.status === 'sent').length;
    const failCount = results.filter(r => r.status === 'failed').length + errors.length;

    res.json({
      success: successCount > 0,
      message: `SMS processing completed. Sent: ${successCount}, Failed: ${failCount}`,
      summary: {
        total: phoneNumbers.length,
        sent: successCount,
        failed: failCount
      },
      results,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Error in SMS send endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send SMS',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Mock SMS sending function (replace with real SMS service)
async function sendSMSCommand(phoneNumber, command, modelName) {
  try {
    // Simulate SMS sending delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Simulate success/failure (90% success rate)
    const success = Math.random() > 0.1;

    if (success) {
      return {
        success: true,
        details: `Command "${command}" sent successfully to ${modelName} device`,
        messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        cost: 0.05 // Simulated cost
      };
    } else {
      return {
        success: false,
        details: 'SMS delivery failed - network error',
        errorCode: 'NETWORK_ERROR'
      };
    }
  } catch (error) {
    return {
      success: false,
      details: error.message,
      errorCode: 'UNKNOWN_ERROR'
    };
  }
}

// Get SMS history with advanced filtering
app.get('/api/sms/history', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      modelId,
      phoneNumber,
      dateFrom,
      dateTo,
      search
    } = req.query;

    const offset = (page - 1) * limit;
    let whereClause = '';
    const params = [];
    let paramCount = 0;

    // Build dynamic WHERE clause
    const conditions = [];

    if (status) {
      paramCount++;
      conditions.push(`h.status = $${paramCount}`);
      params.push(status);
    }

    if (modelId) {
      paramCount++;
      conditions.push(`h.model_id = $${paramCount}`);
      params.push(modelId);
    }

    if (phoneNumber) {
      paramCount++;
      conditions.push(`h.phone_number ILIKE $${paramCount}`);
      params.push(`%${phoneNumber}%`);
    }

    if (dateFrom) {
      paramCount++;
      conditions.push(`h.sent_at >= $${paramCount}`);
      params.push(dateFrom);
    }

    if (dateTo) {
      paramCount++;
      conditions.push(`h.sent_at <= $${paramCount}`);
      params.push(dateTo);
    }

    if (search) {
      paramCount++;
      conditions.push(`(h.command_text ILIKE $${paramCount} OR h.notes ILIKE $${paramCount} OR m.name ILIKE $${paramCount})`);
      params.push(`%${search}%`);
    }

    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    // Add pagination parameters
    params.push(limit, offset);
    const limitParam = paramCount + 1;
    const offsetParam = paramCount + 2;

    const query = `
      SELECT 
        h.*,
        m.name as model_name,
        CASE 
          WHEN h.status = 'sent' THEN '✅'
          WHEN h.status = 'failed' THEN '❌'
          WHEN h.status = 'pending' THEN '⏳'
          ELSE '❓'
        END as status_icon
      FROM sms_history h
      LEFT JOIN device_models m ON h.model_id = m.id
      ${whereClause}
      ORDER BY h.sent_at DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    const result = await pool.query(query, params);

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) 
      FROM sms_history h
      LEFT JOIN device_models m ON h.model_id = m.id
      ${whereClause}
    `;

    const countResult = await pool.query(countQuery, params.slice(0, paramCount));
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
        hasNext: (page * limit) < total,
        hasPrev: page > 1
      },
      filters: {
        status,
        modelId,
        phoneNumber,
        dateFrom,
        dateTo,
        search
      }
    });
  } catch (error) {
    console.error('Error fetching SMS history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch SMS history'
    });
  }
});

// Get SMS statistics
app.get('/api/sms/stats', async (req, res) => {
  try {
    const { period = '30' } = req.query; // days

    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_messages,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(DISTINCT phone_number) as unique_numbers,
        COUNT(DISTINCT model_id) as models_used,
        DATE_TRUNC('day', sent_at) as date
      FROM sms_history 
      WHERE sent_at >= NOW() - INTERVAL '${parseInt(period)} days'
      GROUP BY DATE_TRUNC('day', sent_at)
      ORDER BY date DESC
    `);

    const totals = await pool.query(`
      SELECT 
        COUNT(*) as total_messages,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
        COUNT(DISTINCT phone_number) as unique_numbers,
        ROUND(AVG(CASE WHEN status = 'sent' THEN 1.0 ELSE 0.0 END) * 100, 2) as success_rate
      FROM sms_history 
      WHERE sent_at >= NOW() - INTERVAL '${parseInt(period)} days'
    `);

    const topModels = await pool.query(`
      SELECT 
        m.name,
        COUNT(*) as usage_count,
        COUNT(CASE WHEN h.status = 'sent' THEN 1 END) as success_count
      FROM sms_history h
      JOIN device_models m ON h.model_id = m.id
      WHERE h.sent_at >= NOW() - INTERVAL '${parseInt(period)} days'
      GROUP BY m.id, m.name
      ORDER BY usage_count DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      period: `${period} days`,
      summary: totals.rows[0],
      daily: stats.rows,
      topModels: topModels.rows
    });
  } catch (error) {
    console.error('Error fetching SMS stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch SMS statistics'
    });
  }
});

// ==================== REPORTS ROUTES ====================

// Generate PDF report (placeholder - requires puppeteer or similar)
app.get('/api/reports/pdf', async (req, res) => {
  try {
    const { period = 'week' } = req.query;

    // This would generate a PDF report
    // For now, return a placeholder response
    res.json({
      success: true,
      message: 'PDF report generation not implemented yet',
      suggestion: 'Use CSV export for now',
      period
    });
  } catch (error) {
    console.error('Error generating PDF report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate PDF report'
    });
  }
});

// Export CSV data
app.get('/api/reports/csv', async (req, res) => {
  try {
    const { period = '30' } = req.query;

    const result = await pool.query(`
      SELECT 
        h.phone_number,
        m.name as model_name,
        h.command_text,
        h.status,
        h.sent_at,
        h.notes,
        h.details
      FROM sms_history h
      LEFT JOIN device_models m ON h.model_id = m.id
      WHERE h.sent_at >= NOW() - INTERVAL '${parseInt(period)} days'
      ORDER BY h.sent_at DESC
    `);

    // Generate CSV content
    const headers = ['Phone Number', 'Model', 'Command', 'Status', 'Sent At', 'Notes', 'Details'];
    let csvContent = headers.join(',') + '\n';

    result.rows.forEach(row => {
      const csvRow = [
        `"${row.phone_number}"`,
        `"${row.model_name || ''}"`,
        `"${row.command_text}"`,
        `"${row.status}"`,
        `"${row.sent_at}"`,
        `"${row.notes || ''}"`,
        `"${row.details || ''}"`
      ].join(',');
      csvContent += csvRow + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="sms_report_${period}days.csv"`);
    res.send(csvContent);

  } catch (error) {
    console.error('Error generating CSV report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate CSV report'
    });
  }
});

// ==================== LEGACY SMS ROUTES (for compatibility) ====================

// Legacy SMS routes for backward compatibility
app.get('/api/sms', async (req, res) => {
  // Redirect to new history endpoint
  req.url = '/api/sms/history';
  return app._router.handle(req, res);
});

app.post('/api/sms', async (req, res) => {
  try {
    const { phone, message, sender } = req.body;

    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        error: 'Phone and message are required'
      });
    }

    const result = await pool.query(
      'INSERT INTO sms_messages (phone, message, sender, created_at) VALUES ($1, $2, $3, NOW()) RETURNING *',
      [phone, message, sender || 'system']
    );

    res.status(201).json({
      success: true,
      message: 'SMS sent successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error sending SMS:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send SMS'
    });
  }
});

// ==================== DATABASE INITIALIZATION ====================

async function initializeDatabase() {
  try {
    console.log('🔄 Initializing database tables...');

    // Create device_models table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_models (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create commands table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS commands (
        id SERIAL PRIMARY KEY,
        model_id INTEGER REFERENCES device_models(id) ON DELETE CASCADE,
        command_text VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(model_id, command_text)
      )
    `);

    // Create sms_history table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sms_history (
        id SERIAL PRIMARY KEY,
        phone_number VARCHAR(20) NOT NULL,
        model_id INTEGER REFERENCES device_models(id),
        command_text VARCHAR(255) NOT NULL,
        status VARCHAR(20) DEFAULT 'sent',
        sent_at TIMESTAMP DEFAULT NOW(),
        details TEXT,
        notes TEXT,
        response_data JSONB
      )
    `);

    // Create legacy sms_messages table for compatibility
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sms_messages (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) NOT NULL,
        message TEXT NOT NULL,
        sender VARCHAR(100) DEFAULT 'system',
        status VARCHAR(20) DEFAULT 'sent',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sms_history_phone ON sms_history(phone_number);
      CREATE INDEX IF NOT EXISTS idx_sms_history_status ON sms_history(status);
      CREATE INDEX IF NOT EXISTS idx_sms_history_sent_at ON sms_history(sent_at);
      CREATE INDEX IF NOT EXISTS idx_commands_model_id ON commands(model_id);
    `);

    // Insert sample data
    await pool.query(`
      INSERT INTO device_models (name, description) 
      VALUES 
        ('TK103', 'Rastreador GPS TK103 - Modelo básico'),
        ('TK102', 'Rastreador GPS TK102 - Modelo compacto'),
        ('GT06', 'Rastreador GPS GT06 - Modelo avançado'),
        ('ST901', 'Rastreador GPS ST901 - Modelo profissional'),
        ('TK303', 'Rastreador GPS TK303 - Modelo veicular'),
        ('GT02A', 'Rastreador GPS GT02A - Modelo pessoal')
      ON CONFLICT (name) DO NOTHING
    `);

    // Insert sample commands
    const sampleCommands = [
      { model: 'TK103', commands: ['RESET123456', 'STATUS123456', 'GPRS123456', 'APN123456'] },
      { model: 'TK102', commands: ['begin123456', 'end123456', 'check123456', 'fix060s123456'] },
      { model: 'GT06', commands: ['RESET#', 'STATUS#', 'GPRS#', 'SERVER#'] },
      { model: 'ST901', commands: ['*123456*000#', '*123456*001#', '*123456*002#', '*123456*003#'] }
    ];

    for (const { model, commands } of sampleCommands) {
      const modelResult = await pool.query('SELECT id FROM device_models WHERE name = $1', [model]);
      if (modelResult.rows.length > 0) {
        const modelId = modelResult.rows[0].id;
        for (const command of commands) {
          await pool.query(`
            INSERT INTO commands (model_id, command_text, description) 
            VALUES ($1, $2, $3) 
            ON CONFLICT (model_id, command_text) DO NOTHING
          `, [modelId, command, `Comando ${command} para ${model}`]);
        }
      }
    }

    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  }
}

// ==================== ERROR HANDLING ====================

// Enhanced error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  res.status(err.status || 500).json({
    success: false,
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || 'unknown'
  });
});

// Enhanced 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    suggestion: 'Check the API documentation at /api'
  });
});

// ==================== GRACEFUL SHUTDOWN ====================

async function gracefulShutdown(signal) {
  console.log(`🔄 ${signal} received, shutting down gracefully...`);

  // Close database connections
  try {
    await pool.end();
    console.log('✅ Database connections closed');
  } catch (error) {
    console.error('❌ Error closing database connections:', error);
  }

  // Close server
  if (server) {
    server.close(() => {
      console.log('✅ HTTP server closed');
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      console.log('❌ Forcing server close');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// ==================== SERVER STARTUP ====================

let server;

async function startServer() {
  try {
    // Connect to database with retry
    await connectWithRetry();

    // Initialize database
    await initializeDatabase();

    // Start HTTP server
    server = app.listen(PORT, '0.0.0.0', () => {
      console.log('🚀 SMS App DS Server Started Successfully!');
      console.log('='.repeat(50));
      console.log(`📱 Application: http://localhost:${PORT}`);
      console.log(`📊 Health Check: http://localhost:${PORT}/health`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/api`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🗄️  Database: Connected`);
      console.log(`🔒 Security: Enhanced`);
      console.log(`📈 Monitoring: Active`);
      console.log('='.repeat(50));
    });

    // Handle server errors
    server.on('error', (error) => {
      console.error('❌ Server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use`);
        process.exit(1);
      }
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

module.exports = app;
