const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://sms_user:JasonTricolor633@localhost:5432/sms_database'
});

async function initDatabase() {
  try {
    console.log('🔄 Initializing database...');
    
    // Create tables
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
    
    // Insert sample data
    await pool.query(`
      INSERT INTO sms_messages (phone, message, sender) 
      VALUES 
        ('+5511999999999', 'Welcome to SMS App!', 'system'),
        ('+5511888888888', 'Your account has been created successfully.', 'system')
      ON CONFLICT DO NOTHING
    `);
    
    console.log('✅ Database initialized successfully');
    
    // Test query
    const result = await pool.query('SELECT COUNT(*) FROM sms_messages');
    console.log(`📊 Total SMS messages: ${result.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Error initializing database:', error);
  } finally {
    await pool.end();
  }
}

initDatabase();