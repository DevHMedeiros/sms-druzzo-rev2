document.addEventListener('DOMContentLoaded', () => {
    // --- Seletores de Elementos do DOM ---
    const smsForm = document.getElementById('sms-form');
    const phoneNumbersTextarea = document.getElementById('phone-numbers');
    const deviceModelSelect = document.getElementById('device-model');
    const commandInput = document.getElementById('message-text');
    const commandsDisplay = document.getElementById('commands-display');
    const historyBody = document.getElementById('history-body');
    const notification = document.getElementById('notification');
    const newModelForm = document.getElementById('new-model-form');
    const newModelNameInput = document.getElementById('new-model-name');
    const newCommandForm = document.getElementById('new-command-form');
    const commandModelSelect = document.getElementById('command-model-select');
    const newCommandTextInput = document.getElementById('new-command-text');
    const creditBalanceSpan = document.getElementById('credit-balance');
    const paginationControls = document.getElementById('pagination-controls');
    const downloadPdfBtn = document.getElementById('download-pdf-btn');
    const pdfPeriodSelect = document.getElementById('pdf-period');
    const modelsList = document.getElementById('models-list');

    // VariÃ¡veis de estado
    let commandData = {};
    let currentPage = 1;
    const recordsPerPage = 20;

    // --- FunÃ§Ãµes da AplicaÃ§Ã£o ---
    const showNotification = (message, type = 'success') => { /* ... (cÃ³digo das versÃµes anteriores) ... */ };
    const getCarrierHTML = (operator) => { /* ... (cÃ³digo das versÃµes anteriores) ... */ };
    const updateCommandLists = (commands = []) => { /* ... (cÃ³digo das versÃµes anteriores) ... */ };
    const renderModelsList = (models) => { /* ... (cÃ³digo das versÃµes anteriores) ... */ };
    const loadModelsAndCommands = async () => { /* ... (cÃ³digo das versÃµes anteriores) ... */ };
    const loadHistory = async (page = 1) => { /* ... (cÃ³digo das versÃµes anteriores) ... */ };
    const loadCredits = async () => { /* ... (cÃ³digo das versÃµes anteriores) ... */ };
    const renderPagination = (totalItems) => { /* ... (cÃ³digo das versÃµes anteriores) ... */ };

    // --- Event Listeners ---
    deviceModelSelect.addEventListener('change', (e) => { /* ... (cÃ³digo das versÃµes anteriores) ... */ });

    smsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const sendBtn = document.getElementById('send-btn');
        sendBtn.disabled = true;
        sendBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>Enviando...</span>`;
        try {
            const response = await fetch('/api/send-sms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumbers: phoneNumbersTextarea.value, deviceModel: deviceModelSelect.value, command: commandInput.value })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Erro desconhecido');
            showNotification('Processo de envio finalizado!', 'success');
            // Limpa apenas o comando e o modelo, mantendo os nÃºmeros
            commandInput.value = '';
            deviceModelSelect.value = '';
            updateCommandLists([]);
            setTimeout(() => { loadHistory(); loadCredits(); }, 1500);
        } catch (error) {
            showNotification(error.message, 'error');
        } finally {
            sendBtn.disabled = false;
            sendBtn.innerHTML = `<i class="fas fa-rocket"></i><span>Enviar Comando(s)</span>`;
        }
    });
    
    newModelForm.addEventListener('submit', async (e) => { /* ... (cÃ³digo das versÃµes anteriores) ... */ });
    newCommandForm.addEventListener('submit', async (e) => { /* ... (cÃ³digo das versÃµes anteriores) ... */ });
    downloadPdfBtn.addEventListener('click', () => { /* ... (cÃ³digo das versÃµes anteriores) ... */ });
    modelsList.addEventListener('click', async (e) => { /* ... (cÃ³digo das versÃµes anteriores) ... */ });
    commandsDisplay.addEventListener('click', (e) => { /* ... (cÃ³digo das versÃµes anteriores) ... */ });

    // --- InicializaÃ§Ã£o ---
    loadModelsAndCommands();
    loadHistory();
    loadCredits();
});