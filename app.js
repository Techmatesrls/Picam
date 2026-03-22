/* ========================================
   PICAM - APP.JS v2.1.0
   Inventario + Ordini + Report + Scansione Veloce
   ======================================== */

// ==========================================
// CONFIGURAZIONE GOOGLE
// ==========================================

const GOOGLE_CONFIG = {
    clientId: '531186661114-h0t8okuq99ft6j889lq1b6skgo2pl074.apps.googleusercontent.com',
    scopes: 'https://www.googleapis.com/auth/drive',
    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
};

// ==========================================
// STATO GLOBALE
// ==========================================

const APP = {
    // Google Auth
    tokenClient: null,
    accessToken: null,
    userEmail: null,
    
    // Configurazione
    config: {
        folderId: '',
        folderPath: '',
        deposito: ''
    },
    
    // Dati caricati
    data: {
        articoli: [],
        codbar: [],
        artdep: [],
        clienti: [],
        merged: [],
        clientiMerged: []
    },
    
    // Inventario - Coda movimenti
    queue: [],
    
    // Inventario - Cronologia (ultimi inseriti)
    invHistory: [],
    
    // Ordini - Coda ordini
    ordiniQueue: [],
    
    // Ordine corrente
    currentOrdine: {
        cliente: null,
        righe: [],
        registro: '01',
        numero: 1
    },
    
    // Articolo selezionato per inventario
    selectedArticle: null,
    
    // Articolo per aggiunta riga ordine
    selectedArticleForOrder: null,
    
    // Indice movimento in modifica
    editingMovIndex: -1,
    
    // Indice ordine in modifica
    editingOrdineIndex: -1,
    
    // Quantità corrente inventario
    currentQty: '0',
    
    // Scanner
    html5QrCode: null,
    scannerCallback: null,
    fastScanMode: false,
    fastScanModeOrd: false,
    
    // PDF corrente per condivisione
    currentPdfBlob: null,
    currentPdfName: ''
};

// ==========================================
// INIZIALIZZAZIONE
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    loadQueue();
    loadInvHistory();
    loadOrdiniQueue();
    initEventListeners();
    updateQueueBadge();
    updateMenuBadges();
    waitForGoogle();
});

function waitForGoogle() {
    if (typeof google !== 'undefined' && google.accounts) {
        initGoogleIdentity();
    } else {
        setTimeout(waitForGoogle, 100);
    }
}

function initGoogleIdentity() {
    APP.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CONFIG.clientId,
        scope: GOOGLE_CONFIG.scopes,
        prompt: '',
        callback: handleTokenResponse
    });
    
    const savedToken = localStorage.getItem('picam_access_token');
    const savedExpiry = localStorage.getItem('picam_token_expiry');
    const savedEmail = localStorage.getItem('picam_user_email');
    const cachedData = localStorage.getItem('picam_merged_data');
    
    const tokenValid = savedToken && savedExpiry && new Date().getTime() < parseInt(savedExpiry);
    
    if (tokenValid) {
        APP.accessToken = savedToken;
        APP.userEmail = savedEmail;
        onUserLoggedIn();
    } else if (cachedData && savedEmail) {
        APP.userEmail = savedEmail;
        tryAutoRefreshToken();
    } else {
        clearExpiredSession();
    }
}

function tryAutoRefreshToken() {
    showStatus('setup-status', 'Riconnessione in corso...', 'loading');
    try {
        APP.tokenClient.requestAccessToken({ prompt: '' });
    } catch (e) {
        clearExpiredSession();
        showStatus('setup-status', 'Sessione scaduta. Accedi di nuovo.', 'error');
    }
}

function clearExpiredSession() {
    localStorage.removeItem('picam_access_token');
    localStorage.removeItem('picam_token_expiry');
    APP.accessToken = null;
    document.getElementById('btn-google-login').classList.remove('hidden');
    document.getElementById('user-info').classList.add('hidden');
    document.getElementById('step-folder').classList.add('disabled');
    document.getElementById('step-deposito').classList.add('disabled');
    document.getElementById('btn-load-data').disabled = true;
}

function handleTokenResponse(response) {
    if (response.error) {
        console.error('Errore token:', response.error);
        showStatus('setup-status', 'Errore di autenticazione: ' + response.error, 'error');
        return;
    }
    
    APP.accessToken = response.access_token;
    
    fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${APP.accessToken}` }
    })
    .then(res => res.json())
    .then(data => {
        APP.userEmail = data.email;
        const expiry = new Date().getTime() + (3600 * 1000);
        localStorage.setItem('picam_access_token', APP.accessToken);
        localStorage.setItem('picam_token_expiry', expiry.toString());
        localStorage.setItem('picam_user_email', APP.userEmail);
        onUserLoggedIn();
    })
    .catch(err => {
        console.error('Errore info utente:', err);
        onUserLoggedIn();
    });
}

function onUserLoggedIn() {
    document.getElementById('btn-google-login').classList.add('hidden');
    document.getElementById('user-info').classList.remove('hidden');
    document.getElementById('user-email').textContent = APP.userEmail || 'Connesso';
    
    document.getElementById('step-folder').classList.remove('disabled');
    document.getElementById('step-deposito').classList.remove('disabled');
    
    document.getElementById('input-folder').value = APP.config.folderPath || '';
    document.getElementById('input-deposito').value = APP.config.deposito || '';
    
    updateLoadButton();
    
    const cachedData = localStorage.getItem('picam_merged_data');
    const cachedClienti = localStorage.getItem('picam_clienti_data');
    if (APP.config.folderPath && APP.config.deposito && cachedData) {
        try {
            APP.data.merged = JSON.parse(cachedData);
            if (cachedClienti) APP.data.clientiMerged = JSON.parse(cachedClienti);
            showScreen('screen-menu');
            updateMenuStats();
            showToast('Dati caricati dalla cache', 'success');
        } catch (e) {
            console.error('Errore cache:', e);
        }
    }
}

function initEventListeners() {
    // Login Google
    document.getElementById('btn-google-login').addEventListener('click', handleGoogleLogin);
    document.getElementById('btn-logout').addEventListener('click', handleLogout);
    
    // Setup
    document.getElementById('btn-browse-folder').addEventListener('click', browseGoogleDrive);
    document.getElementById('input-folder').addEventListener('input', updateLoadButton);
    document.getElementById('input-deposito').addEventListener('input', updateLoadButton);
    document.getElementById('btn-load-data').addEventListener('click', handleLoadData);
    
    // Menu
    document.getElementById('btn-menu-settings').addEventListener('click', () => showScreen('screen-setup'));
    document.getElementById('btn-open-inventario').addEventListener('click', openInventario);
    document.getElementById('btn-open-ordini').addEventListener('click', openOrdini);
    
    // Inventario - Header
    document.getElementById('btn-inv-back').addEventListener('click', () => showScreen('screen-menu'));
    
    // Inventario - Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    
    // Inventario - Consulta tab
    document.getElementById('search-input').addEventListener('input', handleSearch);
    document.getElementById('btn-scan-search').addEventListener('click', () => openScanner('search'));
    document.getElementById('btn-clear-search').addEventListener('click', clearSearch);
    document.getElementById('filter-gruppo').addEventListener('change', handleSearch);
    document.getElementById('filter-locazione').addEventListener('change', handleSearch);
    document.getElementById('btn-close-detail').addEventListener('click', closeDetail);
    document.getElementById('btn-to-inventory').addEventListener('click', goToInventoryFromDetail);
    
    // Inventario - Tab inventario
    document.getElementById('inv-search-input').addEventListener('input', handleInventorySearch);
    document.getElementById('btn-scan-inventory').addEventListener('click', () => openScanner('inventory'));
    document.getElementById('toggle-fast-scan').addEventListener('change', (e) => {
        APP.fastScanMode = e.target.checked;
    });
    
    // Inventario - Numpad
    document.querySelectorAll('.numpad-btn').forEach(btn => {
        btn.addEventListener('click', handleNumpadClick);
    });
    document.getElementById('btn-confirm-inventory').addEventListener('click', confirmInventory);
    
    // Inventario - Coda
    document.getElementById('btn-sync').addEventListener('click', syncQueue);
    document.getElementById('btn-clear-queue').addEventListener('click', clearQueue);
    document.getElementById('btn-report-inv').addEventListener('click', generateInventoryReport);
    
    // Modifica movimento
    document.getElementById('btn-close-edit-mov').addEventListener('click', closeEditMovModal);
    document.getElementById('btn-save-edit-mov').addEventListener('click', saveEditMov);
    document.getElementById('btn-delete-mov').addEventListener('click', deleteEditMov);
    
    // Ordini - Header
    document.getElementById('btn-ord-back').addEventListener('click', () => showScreen('screen-menu'));
    document.getElementById('btn-ord-list').addEventListener('click', showOrdiniList);
    
    // Ordini - Cliente
    document.getElementById('ord-cliente-search').addEventListener('input', handleClienteSearch);
    document.getElementById('btn-scan-cliente').addEventListener('click', () => openScanner('cliente'));
    
    // Ordini - Articoli
    document.getElementById('ord-articolo-search').addEventListener('input', handleArticoloOrdineSearch);
    document.getElementById('btn-scan-articolo').addEventListener('click', () => openScanner('articolo-ordine'));
    document.getElementById('toggle-fast-scan-ord').addEventListener('change', (e) => {
        APP.fastScanModeOrd = e.target.checked;
    });
    
    // Ordini - Conferma
    document.getElementById('btn-conferma-ordine').addEventListener('click', confermaOrdine);
    
    // Modal Aggiungi Riga
    document.getElementById('btn-close-add-riga').addEventListener('click', closeModalAddRiga);
    document.getElementById('riga-qta').addEventListener('input', updateRigaTotale);
    document.getElementById('riga-prezzo').addEventListener('input', updateRigaTotale);
    document.getElementById('riga-sconto').addEventListener('input', updateRigaTotale);
    document.getElementById('btn-conferma-riga').addEventListener('click', confermaRiga);
    
    // Modal Clienti
    document.getElementById('btn-close-clienti').addEventListener('click', () => {
        document.getElementById('modal-clienti').classList.add('hidden');
    });
    
    // Modal Articoli
    document.getElementById('btn-close-articoli').addEventListener('click', () => {
        document.getElementById('modal-articoli').classList.add('hidden');
    });
    
    // Modal Ordini List
    document.getElementById('btn-close-ordini-list').addEventListener('click', () => {
        document.getElementById('modal-ordini-list').classList.add('hidden');
    });
    document.getElementById('btn-sync-ordini').addEventListener('click', syncOrdiniQueue);
    document.getElementById('btn-clear-ordini').addEventListener('click', clearOrdiniQueue);
    document.getElementById('btn-report-ordini').addEventListener('click', generateOrdiniReport);
    
    // Modal Modifica Ordine
    document.getElementById('btn-close-edit-ordine').addEventListener('click', () => {
        document.getElementById('modal-edit-ordine').classList.add('hidden');
    });
    document.getElementById('btn-save-edit-ordine').addEventListener('click', saveEditOrdine);
    document.getElementById('btn-delete-ordine').addEventListener('click', deleteEditOrdine);
    
    // Modal Condivisione
    document.getElementById('btn-close-share').addEventListener('click', () => {
        document.getElementById('modal-share').classList.add('hidden');
    });
    document.getElementById('btn-share-native').addEventListener('click', shareNative);
    document.getElementById('btn-share-whatsapp').addEventListener('click', shareWhatsApp);
    document.getElementById('btn-share-email').addEventListener('click', shareEmail);
    document.getElementById('btn-share-drive').addEventListener('click', shareDrive);
    document.getElementById('btn-share-download').addEventListener('click', shareDownload);
    
    // Scanner
    document.getElementById('btn-close-scanner').addEventListener('click', closeScanner);
    document.getElementById('btn-cancel-scanner').addEventListener('click', closeScanner);
}

// ==========================================
// FEEDBACK SONORO E VIBRAZIONE
// ==========================================

function playSuccessSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.2);
    } catch (e) {
        console.log('Audio non supportato');
    }
}

function playErrorSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.frequency.value = 300;
        oscillator.type = 'square';
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
        console.log('Audio non supportato');
    }
}

function vibrate(pattern = [100]) {
    if (navigator.vibrate) {
        navigator.vibrate(pattern);
    }
}

function feedbackSuccess() {
    playSuccessSound();
    vibrate([50, 50, 50]);
}

function feedbackError() {
    playErrorSound();
    vibrate([200]);
}

// ==========================================
// NAVIGAZIONE SCHERMATE
// ==========================================

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    
    if (screenId === 'screen-menu') {
        updateMenuStats();
        updateMenuBadges();
        document.getElementById('menu-user-email').textContent = APP.userEmail || '';
        document.getElementById('menu-deposito').textContent = `DEP: ${APP.config.deposito}`;
    }
    
    if (screenId === 'screen-inventario') {
        document.getElementById('header-deposito-inv').textContent = `DEP: ${APP.config.deposito}`;
        populateFilters();
        renderInvHistory();
    }
    
    if (screenId === 'screen-ordini') {
        initNewOrdine();
    }
}

function updateMenuStats() {
    document.getElementById('stat-articoli').textContent = APP.data.merged.length;
    document.getElementById('stat-clienti').textContent = APP.data.clientiMerged.length;
}

function updateMenuBadges() {
    const invBadge = document.getElementById('menu-badge-inv');
    const ordBadge = document.getElementById('menu-badge-ord');
    
    if (APP.queue.length > 0) {
        invBadge.textContent = APP.queue.length;
        invBadge.classList.add('visible');
    } else {
        invBadge.classList.remove('visible');
    }
    
    if (APP.ordiniQueue.length > 0) {
        ordBadge.textContent = APP.ordiniQueue.length;
        ordBadge.classList.add('visible');
    } else {
        ordBadge.classList.remove('visible');
    }
}

function openInventario() {
    showScreen('screen-inventario');
}

function openOrdini() {
    showScreen('screen-ordini');
}

// ==========================================
// AUTENTICAZIONE GOOGLE
// ==========================================

function handleGoogleLogin() {
    if (!APP.tokenClient) {
        showStatus('setup-status', 'Google API non ancora caricata, riprova...', 'error');
        waitForGoogle();
        return;
    }
    APP.tokenClient.requestAccessToken();
}

function handleLogout() {
    if (APP.accessToken) {
        google.accounts.oauth2.revoke(APP.accessToken);
    }
    
    APP.accessToken = null;
    APP.userEmail = null;
    localStorage.removeItem('picam_access_token');
    localStorage.removeItem('picam_token_expiry');
    localStorage.removeItem('picam_user_email');
    
    document.getElementById('btn-google-login').classList.remove('hidden');
    document.getElementById('user-info').classList.add('hidden');
    document.getElementById('step-folder').classList.add('disabled');
    document.getElementById('step-deposito').classList.add('disabled');
    document.getElementById('btn-load-data').disabled = true;
    
    showScreen('screen-setup');
    showToast('Disconnesso', 'success');
}

// ==========================================
// GOOGLE DRIVE API
// ==========================================

async function browseGoogleDrive() {
    if (!APP.accessToken) {
        showToast('Effettua prima il login', 'error');
        return;
    }
    
    try {
        showStatus('setup-status', 'Caricamento cartelle...', 'loading');
        
        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name,parents)&orderBy=name&pageSize=100`,
            { headers: { 'Authorization': `Bearer ${APP.accessToken}` } }
        );
        
        if (!response.ok) throw new Error('Errore caricamento cartelle');
        
        const data = await response.json();
        showFolderPicker(data.files);
        
    } catch (e) {
        console.error('Errore browse:', e);
        showStatus('setup-status', 'Errore caricamento cartelle', 'error');
    }
}

function showFolderPicker(folders) {
    const existingModal = document.getElementById('folder-picker-modal');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.id = 'folder-picker-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>📁 Seleziona cartella</h3>
                <button class="btn-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            <div class="modal-body">
                <div class="folder-list">
                    ${folders.length === 0 ? '<p class="empty-message">Nessuna cartella trovata</p>' : ''}
                    ${folders.map(f => `
                        <div class="folder-item" data-id="${f.id}" data-name="${f.name}">
                            <span class="folder-icon">📁</span>
                            <span class="folder-name">${f.name}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelectorAll('.folder-item').forEach(item => {
        item.addEventListener('click', () => {
            APP.config.folderId = item.dataset.id;
            APP.config.folderPath = item.dataset.name;
            document.getElementById('input-folder').value = item.dataset.name;
            modal.remove();
            updateLoadButton();
            showStatus('setup-status', `Cartella selezionata: ${item.dataset.name}`, 'success');
        });
    });
    
    showStatus('setup-status', '', '');
}

async function findFolderByPath(path) {
    if (APP.config.folderId && APP.config.folderPath === path) {
        return APP.config.folderId;
    }
    
    const folderName = path.split('/').pop();
    
    const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
        { headers: { 'Authorization': `Bearer ${APP.accessToken}` } }
    );
    
    if (!response.ok) throw new Error('Cartella non trovata');
    
    const data = await response.json();
    if (data.files.length === 0) throw new Error(`Cartella "${path}" non trovata`);
    
    APP.config.folderId = data.files[0].id;
    return data.files[0].id;
}

async function findOrCreateFolder(parentId, folderName) {
    const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${parentId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
        { headers: { 'Authorization': `Bearer ${APP.accessToken}` } }
    );
    
    const searchData = await searchResponse.json();
    if (searchData.files && searchData.files.length > 0) {
        return searchData.files[0].id;
    }
    
    const createResponse = await fetch(
        'https://www.googleapis.com/drive/v3/files',
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${APP.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId]
            })
        }
    );
    
    const createData = await createResponse.json();
    return createData.id;
}

async function downloadFileFromDrive(folderId, fileName) {
    const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and name='${fileName}' and trashed=false&fields=files(id,name,mimeType)`,
        { headers: { 'Authorization': `Bearer ${APP.accessToken}` } }
    );
    
    if (!searchResponse.ok) throw new Error(`Errore ricerca ${fileName}`);
    
    const searchData = await searchResponse.json();
    if (searchData.files.length === 0) throw new Error(`File "${fileName}" non trovato`);
    
    const fileId = searchData.files[0].id;
    
    const downloadResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { 'Authorization': `Bearer ${APP.accessToken}` } }
    );
    
    if (!downloadResponse.ok) throw new Error(`Errore download ${fileName}`);
    
    return await downloadResponse.arrayBuffer();
}

async function uploadFileToDrive(folderId, fileName, content, mimeType = 'text/plain') {
    const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and name='${fileName}' and trashed=false&fields=files(id)`,
        { headers: { 'Authorization': `Bearer ${APP.accessToken}` } }
    );
    
    const searchData = await searchResponse.json();
    const existingFileId = searchData.files && searchData.files.length > 0 ? searchData.files[0].id : null;
    
    const metadata = {
        name: fileName,
        mimeType: mimeType
    };
    
    if (!existingFileId) {
        metadata.parents = [folderId];
    }
    
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const closeDelimiter = "\r\n--" + boundary + "--";
    
    let body;
    if (typeof content === 'string') {
        body = delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: ' + mimeType + '\r\n\r\n' +
            content +
            closeDelimiter;
    } else {
        // Per contenuto binario (PDF)
        const reader = new FileReader();
        const base64 = await new Promise((resolve) => {
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(content);
        });
        
        body = delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: ' + mimeType + '\r\n' +
            'Content-Transfer-Encoding: base64\r\n\r\n' +
            base64 +
            closeDelimiter;
    }
    
    let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    let method = 'POST';
    
    if (existingFileId) {
        url = `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`;
        method = 'PATCH';
    }
    
    const response = await fetch(url, {
        method: method,
        headers: {
            'Authorization': `Bearer ${APP.accessToken}`,
            'Content-Type': 'multipart/related; boundary=' + boundary
        },
        body: body
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Errore upload: ${errorData.error?.message || response.status}`);
    }
    
    return await response.json();
}

// ==========================================
// CONFIGURAZIONE
// ==========================================

function loadConfig() {
    const saved = localStorage.getItem('picam_config');
    if (saved) {
        try {
            APP.config = JSON.parse(saved);
        } catch (e) {
            console.error('Errore caricamento config:', e);
        }
    }
}

function saveConfig() {
    APP.config.folderPath = document.getElementById('input-folder').value.trim();
    APP.config.deposito = document.getElementById('input-deposito').value.trim().toUpperCase();
    localStorage.setItem('picam_config', JSON.stringify(APP.config));
}

function updateLoadButton() {
    const folder = document.getElementById('input-folder').value.trim();
    const deposito = document.getElementById('input-deposito').value.trim();
    const hasToken = !!APP.accessToken;
    document.getElementById('btn-load-data').disabled = !(hasToken && folder && deposito);
}

// ==========================================
// CARICAMENTO DATI
// ==========================================

async function handleLoadData() {
    const folderPath = document.getElementById('input-folder').value.trim();
    const deposito = document.getElementById('input-deposito').value.trim().toUpperCase();
    
    if (!folderPath || !deposito) {
        showStatus('setup-status', 'Compila tutti i campi', 'error');
        return;
    }
    
    if (!APP.accessToken) {
        showStatus('setup-status', 'Effettua prima il login', 'error');
        return;
    }
    
    saveConfig();
    showStatus('setup-status', 'Ricerca cartella...', 'loading');
    
    try {
        const folderId = await findFolderByPath(folderPath);
        
        showStatus('setup-status', 'Scaricamento articoli.xlsx...', 'loading');
        const articoliData = await downloadFileFromDrive(folderId, 'articoli.xlsx');
        APP.data.articoli = parseExcelData(articoliData);
        
        showStatus('setup-status', 'Scaricamento codbar.xlsx...', 'loading');
        const codbarData = await downloadFileFromDrive(folderId, 'codbar.xlsx');
        APP.data.codbar = parseExcelData(codbarData);
        
        showStatus('setup-status', 'Scaricamento artdep.xlsx...', 'loading');
        const artdepData = await downloadFileFromDrive(folderId, 'artdep.xlsx');
        APP.data.artdep = parseExcelData(artdepData);
        
        showStatus('setup-status', 'Scaricamento clicom.xlsx (clienti)...', 'loading');
        try {
            const clientiData = await downloadFileFromDrive(folderId, 'clicom.xlsx');
            APP.data.clienti = parseExcelData(clientiData);
        } catch (e) {
            console.log('File clienti non trovato, continuo senza');
            APP.data.clienti = [];
        }
        
        showStatus('setup-status', 'Elaborazione dati...', 'loading');
        mergeData();
        mergeClienti();
        
        localStorage.setItem('picam_merged_data', JSON.stringify(APP.data.merged));
        localStorage.setItem('picam_clienti_data', JSON.stringify(APP.data.clientiMerged));
        
        showStatus('setup-status', `✅ Caricati ${APP.data.merged.length} articoli e ${APP.data.clientiMerged.length} clienti`, 'success');
        feedbackSuccess();
        
        setTimeout(() => {
            showScreen('screen-menu');
        }, 1000);
        
    } catch (e) {
        console.error('Errore caricamento:', e);
        showStatus('setup-status', `Errore: ${e.message}`, 'error');
        feedbackError();
    }
}

function parseExcelData(arrayBuffer) {
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet);
}

function mergeData() {
    const deposito = APP.config.deposito;
    
    const barcodeMap = {};
    APP.data.codbar.forEach(row => {
        const cod = row.cba_cod_art || row.CBA_COD_ART;
        const bar = row.cba_cod_bar || row.CBA_COD_BAR;
        if (cod) barcodeMap[cod.toString().trim()] = bar || '';
    });
    
    const existMap = {};
    APP.data.artdep.forEach(row => {
        const cod = row.ard_cod || row.ARD_COD;
        const dep = (row.ard_cod_dep || row.ARD_COD_DEP || '').toString().trim();
        
        if (cod && dep === deposito) {
            existMap[cod.toString().trim()] = {
                esistenza: parseFloat(row.ard_esi_att_q_p || row.ARD_ESI_ATT_Q_P) || 0,
                locazione: (row.ard_loc_mag || row.ARD_LOC_MAG || '').toString().trim()
            };
        }
    });
    
    APP.data.merged = APP.data.articoli.map(art => {
        const cod = (art.art_cod || art.ART_COD || '').toString().trim();
        const barcode = barcodeMap[cod] || '';
        const exist = existMap[cod] || { esistenza: 0, locazione: '' };
        
        return {
            codice: cod,
            des1: (art.art_des_1 || art.ART_DES_1 || '').toString().trim(),
            des2: (art.art_des_2 || art.ART_DES_2 || '').toString().trim(),
            barcode: barcode.toString().trim(),
            gruppo: (art.art_gru_ven || art.ART_GRU_VEN || '').toString().trim(),
            um: (art.art_u_m_ven || art.ART_U_M_VEN || '').toString().trim(),
            lis1: parseFloat(art.art_lis_1 || art.ART_LIS_1) || 0,
            lis2: parseFloat(art.art_lis_2 || art.ART_LIS_2) || 0,
            lis3: parseFloat(art.art_lis_3 || art.ART_LIS_3) || 0,
            lis4: parseFloat(art.art_lis_4 || art.ART_LIS_4) || 0,
            datUltVen: art.art_dat_ult_ven || art.ART_DAT_ULT_VEN || '',
            przUltVen: parseFloat(art.art_prz_ult_ven || art.ART_PRZ_ULT_VEN) || 0,
            datUltAcq: art.art_dat_ult_acq || art.ART_DAT_ULT_ACQ || '',
            przUltAcq: parseFloat(art.art_prz_ult_acq || art.ART_PRZ_ULT_ACQ) || 0,
            codIva: parseInt(art.art_cod_iva_a || art.ART_COD_IVA_A) || 22,
            esistenza: exist.esistenza,
            locazione: exist.locazione
        };
    }).filter(a => a.codice);
}

function mergeClienti() {
    APP.data.clientiMerged = APP.data.clienti.map(cli => {
        return {
            codice: (cli.clc_cod_cli || cli.CLC_COD_CLI || '').toString().trim(),
            ragSoc1: (cli.clc_rag_soc_1 || cli.CLC_RAG_SOC_1 || '').toString().trim(),
            ragSoc2: (cli.clc_rag_soc_2 || cli.CLC_RAG_SOC_2 || '').toString().trim(),
            indirizzo: (cli.clc_ind || cli.CLC_IND || '').toString().trim(),
            cap: (cli.clc_cap || cli.CLC_CAP || '').toString().trim(),
            localita: (cli.clc_loc || cli.CLC_LOC || '').toString().trim(),
            provincia: (cli.clc_pro || cli.CLC_PRO || '').toString().trim(),
            email: (cli.clc_e_mail || cli.CLC_E_MAIL || '').toString().trim(),
            telefono: (cli.clc_tel || cli.CLC_TEL || '').toString().trim(),
            partitaIva: (cli.clc_par_iva || cli.CLC_PAR_IVA || '').toString().trim(),
            pec: (cli.clc_pec || cli.CLC_PEC || '').toString().trim(),
            codPag: (cli.clc_cod_pag || cli.CLC_COD_PAG || '').toString().trim()
        };
    }).filter(c => c.codice);
}

// ==========================================
// INVENTARIO - TAB NAVIGATION
// ==========================================

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });
    
    if (tabName !== 'inventario') {
        resetInventory();
    }
    
    if (tabName === 'coda') {
        renderQueue();
    }
    
    if (tabName === 'inventario') {
        renderInvHistory();
    }
}

// ==========================================
// INVENTARIO - CRONOLOGIA
// ==========================================

function loadInvHistory() {
    const saved = localStorage.getItem('picam_inv_history');
    if (saved) {
        try { APP.invHistory = JSON.parse(saved); } catch (e) { APP.invHistory = []; }
    }
}

function saveInvHistory() {
    // Mantieni solo gli ultimi 20
    APP.invHistory = APP.invHistory.slice(-20);
    localStorage.setItem('picam_inv_history', JSON.stringify(APP.invHistory));
}

function addToInvHistory(item) {
    APP.invHistory.push({
        codice: item.codice,
        des1: item.des1,
        locazione: item.locazione,
        quantita: item.quantita,
        timestamp: new Date().toISOString()
    });
    saveInvHistory();
}

function renderInvHistory() {
    const container = document.getElementById('inv-history-list');
    if (!container) return;
    
    if (APP.invHistory.length === 0) {
        container.innerHTML = '<p class="empty-message-small">Nessun articolo inserito</p>';
        return;
    }
    
    // Mostra gli ultimi 5 (in ordine inverso - più recenti prima)
    const recent = APP.invHistory.slice(-5).reverse();
    
    container.innerHTML = recent.map((item, idx) => `
        <div class="history-item">
            <div class="history-item-info">
                <span class="history-item-code">${item.codice}</span>
                <span class="history-item-desc">${item.des1}</span>
            </div>
            <div class="history-item-meta">
                <span class="history-item-loc">📍 ${item.locazione || 'N/D'}</span>
                <span class="history-item-qty">${item.quantita}</span>
            </div>
        </div>
    `).join('');
}

// ==========================================
// INVENTARIO - RICERCA E FILTRI
// ==========================================

function populateFilters() {
    const gruppi = [...new Set(APP.data.merged.map(a => a.gruppo).filter(Boolean))].sort();
    const locazioni = [...new Set(APP.data.merged.map(a => a.locazione).filter(Boolean))].sort();
    
    const selectGruppo = document.getElementById('filter-gruppo');
    const selectLocazione = document.getElementById('filter-locazione');
    
    selectGruppo.innerHTML = '<option value="">Tutti i gruppi</option>';
    gruppi.forEach(g => {
        selectGruppo.innerHTML += `<option value="${g}">${g}</option>`;
    });
    
    selectLocazione.innerHTML = '<option value="">Tutte le locazioni</option>';
    locazioni.forEach(l => {
        selectLocazione.innerHTML += `<option value="${l}">${l}</option>`;
    });
}

function handleSearch() {
    const query = document.getElementById('search-input').value.toLowerCase().trim();
    const gruppo = document.getElementById('filter-gruppo').value;
    const locazione = document.getElementById('filter-locazione').value;
    
    document.getElementById('btn-clear-search').classList.toggle('hidden', !query);
    
    let results = APP.data.merged;
    
    if (query) {
        results = results.filter(a => 
            a.codice.toLowerCase().includes(query) ||
            a.des1.toLowerCase().includes(query) ||
            a.des2.toLowerCase().includes(query) ||
            a.barcode.includes(query) ||
            a.locazione.toLowerCase().includes(query)
        );
    }
    
    if (gruppo) results = results.filter(a => a.gruppo === gruppo);
    if (locazione) results = results.filter(a => a.locazione === locazione);
    
    renderResults(results);
}

function clearSearch() {
    document.getElementById('search-input').value = '';
    document.getElementById('btn-clear-search').classList.add('hidden');
    handleSearch();
}

function renderResults(results) {
    const container = document.getElementById('results-list');
    const countEl = document.getElementById('results-count');
    
    countEl.textContent = `${results.length} articoli trovati`;
    
    if (results.length === 0) {
        container.innerHTML = '<p class="empty-message">Nessun articolo trovato</p>';
        return;
    }
    
    const limited = results.slice(0, 100);
    
    container.innerHTML = limited.map(art => `
        <div class="result-item" data-codice="${art.codice}">
            <div class="result-icon">📦</div>
            <div class="result-info">
                <div class="result-code">${art.codice}</div>
                <div class="result-desc">${art.des1}</div>
            </div>
            <div class="result-qty">
                <div class="result-qty-value">${art.esistenza}</div>
                <div class="result-qty-label">${art.um || 'pz'}</div>
            </div>
        </div>
    `).join('');
    
    container.querySelectorAll('.result-item').forEach(item => {
        item.addEventListener('click', () => showDetail(item.dataset.codice));
    });
}

// ==========================================
// INVENTARIO - DETTAGLIO ARTICOLO
// ==========================================

function showDetail(codice) {
    const art = APP.data.merged.find(a => a.codice === codice);
    if (!art) return;
    
    document.getElementById('det-codice').textContent = art.codice;
    document.getElementById('det-des1').textContent = art.des1 || '-';
    document.getElementById('det-des2').textContent = art.des2 || '-';
    document.getElementById('det-barcode').textContent = art.barcode || '-';
    document.getElementById('det-gruppo').textContent = art.gruppo || '-';
    document.getElementById('det-um').textContent = art.um || '-';
    
    document.getElementById('det-lis1').textContent = formatPrice(art.lis1);
    document.getElementById('det-lis2').textContent = formatPrice(art.lis2);
    document.getElementById('det-lis3').textContent = formatPrice(art.lis3);
    document.getElementById('det-lis4').textContent = formatPrice(art.lis4);
    
    document.getElementById('det-ult-ven').textContent = formatDate(art.datUltVen);
    document.getElementById('det-prz-ven').textContent = formatPrice(art.przUltVen);
    document.getElementById('det-ult-acq').textContent = formatDate(art.datUltAcq);
    document.getElementById('det-prz-acq').textContent = formatPrice(art.przUltAcq);
    
    document.getElementById('det-esistenza').textContent = art.esistenza;
    document.getElementById('det-locazione').textContent = art.locazione || '-';
    
    APP.selectedArticle = art;
    
    document.getElementById('article-detail').classList.remove('hidden');
}

function closeDetail() {
    document.getElementById('article-detail').classList.add('hidden');
}

function goToInventoryFromDetail() {
    closeDetail();
    switchTab('inventario');
    if (APP.selectedArticle) {
        selectArticleForInventory(APP.selectedArticle);
    }
}

// ==========================================
// INVENTARIO - TAB INVENTARIO
// ==========================================

function handleInventorySearch() {
    const query = document.getElementById('inv-search-input').value.toLowerCase().trim();
    
    if (!query) {
        resetInventory();
        return;
    }
    
    let art = APP.data.merged.find(a => 
        a.codice.toLowerCase() === query || 
        a.barcode === query
    );
    
    if (!art) {
        const matches = APP.data.merged.filter(a =>
            a.codice.toLowerCase().includes(query) ||
            a.des1.toLowerCase().includes(query) ||
            a.barcode.includes(query)
        );
        
        if (matches.length === 1) {
            art = matches[0];
        } else if (matches.length > 1) {
            showInventorySuggestions(matches);
            return;
        }
    }
    
    if (art) {
        selectArticleForInventory(art);
    } else {
        resetInventory();
    }
}

function showInventorySuggestions(matches) {
    const container = document.getElementById('inv-article-info');
    container.classList.remove('empty', 'selected');
    
    container.innerHTML = `
        <p style="margin-bottom: 8px; font-size: 12px; color: var(--text-muted);">
            ${matches.length} risultati - seleziona:
        </p>
        <div style="max-height: 150px; overflow-y: auto;">
            ${matches.slice(0, 10).map(a => `
                <div class="suggestion-item" data-codice="${a.codice}">
                    <div class="suggestion-code">${a.codice}</div>
                    <div class="suggestion-desc">${a.des1}</div>
                </div>
            `).join('')}
        </div>
    `;
    
    container.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            const art = APP.data.merged.find(a => a.codice === item.dataset.codice);
            if (art) selectArticleForInventory(art);
        });
    });
    
    document.getElementById('inv-quantity-section').classList.add('hidden');
}

function selectArticleForInventory(art) {
    APP.selectedArticle = art;
    APP.currentQty = '0';
    
    const container = document.getElementById('inv-article-info');
    container.classList.remove('empty');
    container.classList.add('selected');
    
    container.innerHTML = `
        <div class="inv-article-code">${art.codice}</div>
        <div class="inv-article-desc">${art.des1}</div>
        <div class="inv-article-meta">
            <span>📦 Esistenza: <strong>${art.esistenza}</strong></span>
            <span>📍 ${art.locazione || 'N/D'}</span>
        </div>
    `;
    
    document.getElementById('inv-quantity').textContent = '0';
    document.getElementById('inv-quantity-section').classList.remove('hidden');
    document.getElementById('inv-search-input').value = art.codice;
}

function resetInventory() {
    APP.selectedArticle = null;
    APP.currentQty = '0';
    
    const container = document.getElementById('inv-article-info');
    container.classList.add('empty');
    container.classList.remove('selected');
    container.innerHTML = '<p class="empty-message">Cerca o scansiona un articolo</p>';
    
    document.getElementById('inv-quantity-section').classList.add('hidden');
}

function handleNumpadClick(e) {
    const btn = e.target.closest('.numpad-btn');
    if (!btn) return;
    
    const num = btn.dataset.num;
    const action = btn.dataset.action;
    
    if (action === 'clear') {
        APP.currentQty = '0';
    } else if (action === 'back') {
        APP.currentQty = APP.currentQty.slice(0, -1) || '0';
    } else if (num !== undefined) {
        if (APP.currentQty === '0') {
            APP.currentQty = num;
        } else {
            APP.currentQty += num;
        }
    }
    
    document.getElementById('inv-quantity').textContent = APP.currentQty;
}

function confirmInventory() {
    if (!APP.selectedArticle) {
        showToast('Seleziona un articolo', 'error');
        return;
    }
    
    const qty = parseInt(APP.currentQty) || 0;
    
    const movItem = {
        codice: APP.selectedArticle.codice,
        des1: APP.selectedArticle.des1,
        locazione: APP.selectedArticle.locazione,
        quantita: qty,
        timestamp: new Date().toISOString()
    };
    
    APP.queue.push(movItem);
    saveQueue();
    updateQueueBadge();
    
    // Aggiungi alla cronologia
    addToInvHistory(movItem);
    renderInvHistory();
    
    feedbackSuccess();
    showToast(`✅ ${APP.selectedArticle.codice}: ${qty}`, 'success');
    
    document.getElementById('inv-search-input').value = '';
    resetInventory();
    
    // In modalità scansione veloce, riapri lo scanner
    if (APP.fastScanMode) {
        setTimeout(() => openScanner('inventory'), 300);
    }
}

// ==========================================
// INVENTARIO - CODA MOVIMENTI
// ==========================================

function loadQueue() {
    const saved = localStorage.getItem('picam_queue');
    if (saved) {
        try { APP.queue = JSON.parse(saved); } catch (e) { APP.queue = []; }
    }
}

function saveQueue() {
    localStorage.setItem('picam_queue', JSON.stringify(APP.queue));
}

function updateQueueBadge() {
    const badge = document.getElementById('badge-coda');
    const count = APP.queue.length;
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
}

function renderQueue() {
    const container = document.getElementById('queue-list');
    const countEl = document.getElementById('queue-count');
    const btnSync = document.getElementById('btn-sync');
    const btnClear = document.getElementById('btn-clear-queue');
    const btnReport = document.getElementById('btn-report-inv');
    const summaryEl = document.getElementById('queue-summary');
    
    countEl.textContent = `${APP.queue.length} movimenti`;
    
    const hasItems = APP.queue.length > 0;
    btnSync.disabled = !hasItems;
    btnClear.disabled = !hasItems;
    btnReport.disabled = !hasItems;
    
    if (!hasItems) {
        container.innerHTML = '<p class="empty-message">Nessun movimento in coda</p>';
        summaryEl.classList.add('hidden');
        return;
    }
    
    // Riepilogo per locazione
    const locSummary = {};
    APP.queue.forEach(item => {
        const loc = item.locazione || 'N/D';
        if (!locSummary[loc]) locSummary[loc] = 0;
        locSummary[loc]++;
    });
    
    document.getElementById('queue-summary-content').innerHTML = Object.entries(locSummary)
        .map(([loc, count]) => `<span class="summary-item">📍 ${loc}: <strong>${count}</strong></span>`)
        .join('');
    summaryEl.classList.remove('hidden');
    
    container.innerHTML = APP.queue.map((item, idx) => `
        <div class="queue-item" data-index="${idx}">
            <div class="queue-item-info">
                <span class="queue-item-code">${item.codice}</span>
                <span class="queue-item-loc">📍 ${item.locazione || 'N/D'}</span>
            </div>
            <span class="queue-item-qty">${item.quantita}</span>
            <button class="queue-item-edit" data-index="${idx}">✏️</button>
        </div>
    `).join('');
    
    container.querySelectorAll('.queue-item-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openEditMovModal(parseInt(btn.dataset.index));
        });
    });
}

function openEditMovModal(index) {
    const item = APP.queue[index];
    if (!item) return;
    
    APP.editingMovIndex = index;
    
    document.getElementById('edit-mov-codice').textContent = item.codice;
    document.getElementById('edit-mov-desc').textContent = item.des1 || '';
    document.getElementById('edit-mov-loc').textContent = `📍 ${item.locazione || 'N/D'}`;
    document.getElementById('edit-mov-qta').value = item.quantita;
    
    document.getElementById('modal-edit-mov').classList.remove('hidden');
}

function closeEditMovModal() {
    document.getElementById('modal-edit-mov').classList.add('hidden');
    APP.editingMovIndex = -1;
}

function saveEditMov() {
    if (APP.editingMovIndex < 0) return;
    
    const newQty = parseInt(document.getElementById('edit-mov-qta').value) || 0;
    APP.queue[APP.editingMovIndex].quantita = newQty;
    saveQueue();
    renderQueue();
    closeEditMovModal();
    feedbackSuccess();
    showToast('Movimento aggiornato', 'success');
}

function deleteEditMov() {
    if (APP.editingMovIndex < 0) return;
    
    if (!confirm('Eliminare questo movimento?')) return;
    
    APP.queue.splice(APP.editingMovIndex, 1);
    saveQueue();
    updateQueueBadge();
    renderQueue();
    closeEditMovModal();
    showToast('Movimento eliminato', 'success');
}

async function syncQueue() {
    if (APP.queue.length === 0) return;
    if (!APP.accessToken) {
        showStatus('sync-status', 'Effettua il login', 'error');
        return;
    }
    
    showStatus('sync-status', 'Sincronizzazione...', 'loading');
    
    try {
        const content = APP.queue.map(item => `${item.codice};${item.quantita}`).join('\n');
        const folderId = await findFolderByPath(APP.config.folderPath);
        await uploadFileToDrive(folderId, 'movint.txt', content);
        
        APP.queue = [];
        saveQueue();
        updateQueueBadge();
        updateMenuBadges();
        renderQueue();
        
        feedbackSuccess();
        showStatus('sync-status', '✅ Sincronizzato!', 'success');
        showToast('✅ movint.txt aggiornato', 'success');
    } catch (e) {
        console.error('Errore sync:', e);
        feedbackError();
        showStatus('sync-status', `Errore: ${e.message}`, 'error');
    }
}

function clearQueue() {
    if (!confirm('Eliminare tutti i movimenti in coda?')) return;
    APP.queue = [];
    saveQueue();
    updateQueueBadge();
    updateMenuBadges();
    renderQueue();
    showToast('Coda svuotata', 'success');
}

// ==========================================
// PDF REPORT INVENTARIO
// ==========================================

async function generateInventoryReport() {
    if (APP.queue.length === 0) {
        showToast('Nessun movimento da esportare', 'error');
        return;
    }
    
    showStatus('sync-status', 'Generazione PDF...', 'loading');
    
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        const today = new Date();
        const dateStr = today.toLocaleDateString('it-IT');
        const timeStr = today.toLocaleTimeString('it-IT');
        
        // Intestazione
        doc.setFontSize(20);
        doc.setFont(undefined, 'bold');
        doc.text('Report Inventario', 105, 20, { align: 'center' });
        
        doc.setFontSize(12);
        doc.setFont(undefined, 'normal');
        doc.text(`Data: ${dateStr} ${timeStr}`, 20, 35);
        doc.text(`Deposito: ${APP.config.deposito}`, 20, 42);
        doc.text(`Operatore: ${APP.userEmail || 'N/D'}`, 20, 49);
        doc.text(`Totale movimenti: ${APP.queue.length}`, 20, 56);
        
        // Riepilogo per locazione
        const locSummary = {};
        APP.queue.forEach(item => {
            const loc = item.locazione || 'N/D';
            if (!locSummary[loc]) locSummary[loc] = 0;
            locSummary[loc]++;
        });
        
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('Riepilogo per Locazione', 20, 70);
        
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        let y = 78;
        Object.entries(locSummary).forEach(([loc, count]) => {
            doc.text(`${loc}: ${count} articoli`, 25, y);
            y += 6;
        });
        
        // Dettaglio movimenti
        y += 10;
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('Dettaglio Movimenti', 20, y);
        y += 10;
        
        // Header tabella
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        doc.text('Codice', 20, y);
        doc.text('Descrizione', 55, y);
        doc.text('Loc.', 140, y);
        doc.text('Qta', 165, y);
        y += 2;
        doc.line(20, y, 190, y);
        y += 5;
        
        doc.setFont(undefined, 'normal');
        APP.queue.forEach(item => {
            if (y > 280) {
                doc.addPage();
                y = 20;
            }
            doc.text(item.codice.substring(0, 20), 20, y);
            doc.text((item.des1 || '').substring(0, 45), 55, y);
            doc.text((item.locazione || 'N/D').substring(0, 10), 140, y);
            doc.text(item.quantita.toString(), 165, y);
            y += 6;
        });
        
        // Footer
        doc.setFontSize(8);
        doc.text('Generato da Picam - Techmatesrls', 105, 290, { align: 'center' });
        
        // Salva PDF
        const pdfBlob = doc.output('blob');
        const fileName = `Report_Inventario_${dateStr.replace(/\//g, '-')}.pdf`;
        
        APP.currentPdfBlob = pdfBlob;
        APP.currentPdfName = fileName;
        
        showStatus('sync-status', '✅ PDF generato!', 'success');
        document.getElementById('modal-share').classList.remove('hidden');
        
    } catch (e) {
        console.error('Errore generazione PDF:', e);
        showStatus('sync-status', `Errore: ${e.message}`, 'error');
    }
}

// ==========================================
// ORDINI - INIZIALIZZAZIONE
// ==========================================

function loadOrdiniQueue() {
    const saved = localStorage.getItem('picam_ordini_queue');
    if (saved) {
        try { APP.ordiniQueue = JSON.parse(saved); } catch (e) { APP.ordiniQueue = []; }
    }
    
    const savedNum = localStorage.getItem('picam_ordini_last_num');
    if (savedNum) {
        APP.currentOrdine.numero = parseInt(savedNum) + 1;
    }
}

function saveOrdiniQueue() {
    localStorage.setItem('picam_ordini_queue', JSON.stringify(APP.ordiniQueue));
}

function initNewOrdine() {
    const today = new Date();
    const dateStr = today.toLocaleDateString('it-IT');
    
    APP.currentOrdine = {
        cliente: null,
        righe: [],
        registro: '01',
        numero: APP.currentOrdine.numero || 1
    };
    
    document.getElementById('ord-data').value = dateStr;
    document.getElementById('ord-registro').value = '01';
    document.getElementById('ord-numero').value = APP.currentOrdine.numero;
    
    document.getElementById('ord-cliente-search').value = '';
    document.getElementById('ord-cliente-info').classList.remove('hidden');
    document.getElementById('ord-cliente-detail').classList.add('hidden');
    
    document.getElementById('ord-articolo-search').value = '';
    renderOrdineRighe();
    updateOrdineTotali();
    updateConfermaButton();
}

// ==========================================
// ORDINI - GESTIONE CLIENTE
// ==========================================

function handleClienteSearch() {
    const query = document.getElementById('ord-cliente-search').value.toLowerCase().trim();
    
    if (!query || query.length < 2) return;
    
    const matches = APP.data.clientiMerged.filter(c =>
        c.codice.toLowerCase().includes(query) ||
        c.ragSoc1.toLowerCase().includes(query) ||
        c.partitaIva.includes(query)
    );
    
    if (matches.length === 1) {
        selectCliente(matches[0]);
    } else if (matches.length > 1) {
        showClientiList(matches);
    }
}

function showClientiList(clienti) {
    const container = document.getElementById('clienti-list');
    
    container.innerHTML = clienti.slice(0, 50).map(c => `
        <div class="cliente-item" data-codice="${c.codice}">
            <div class="cliente-item-code">${c.codice}</div>
            <div class="cliente-item-name">${c.ragSoc1}</div>
            <div class="cliente-item-addr">${c.localita} (${c.provincia})</div>
        </div>
    `).join('');
    
    container.querySelectorAll('.cliente-item').forEach(item => {
        item.addEventListener('click', () => {
            const cli = APP.data.clientiMerged.find(c => c.codice === item.dataset.codice);
            if (cli) {
                selectCliente(cli);
                document.getElementById('modal-clienti').classList.add('hidden');
            }
        });
    });
    
    document.getElementById('modal-clienti').classList.remove('hidden');
}

function selectCliente(cliente) {
    APP.currentOrdine.cliente = cliente;
    
    document.getElementById('ord-cliente-search').value = cliente.ragSoc1;
    document.getElementById('ord-cliente-info').classList.add('hidden');
    document.getElementById('ord-cliente-detail').classList.remove('hidden');
    
    document.getElementById('ord-cli-codice').textContent = cliente.codice;
    document.getElementById('ord-cli-ragsoc').textContent = cliente.ragSoc1;
    document.getElementById('ord-cli-indirizzo').textContent = cliente.indirizzo;
    document.getElementById('ord-cli-citta').textContent = `${cliente.cap} ${cliente.localita} (${cliente.provincia})`;
    document.getElementById('ord-cli-piva').textContent = `P.IVA: ${cliente.partitaIva}`;
    document.getElementById('ord-cod-pag').value = cliente.codPag || '';
    
    feedbackSuccess();
    updateConfermaButton();
}

// ==========================================
// ORDINI - GESTIONE ARTICOLI
// ==========================================

function handleArticoloOrdineSearch() {
    const query = document.getElementById('ord-articolo-search').value.toLowerCase().trim();
    
    if (!query || query.length < 2) return;
    
    const matches = APP.data.merged.filter(a =>
        a.codice.toLowerCase().includes(query) ||
        a.des1.toLowerCase().includes(query) ||
        a.barcode.includes(query)
    );
    
    if (matches.length === 1) {
        openModalAddRiga(matches[0]);
    } else if (matches.length > 1) {
        showArticoliList(matches);
    }
}

function showArticoliList(articoli) {
    const container = document.getElementById('articoli-ord-list');
    
    container.innerHTML = articoli.slice(0, 50).map(a => `
        <div class="articolo-item" data-codice="${a.codice}">
            <div class="articolo-item-code">${a.codice}</div>
            <div class="articolo-item-desc">${a.des1}</div>
            <div class="articolo-item-meta">
                <span>📦 ${a.esistenza} ${a.um}</span>
                <span>📍 ${a.locazione || 'N/D'}</span>
            </div>
        </div>
    `).join('');
    
    container.querySelectorAll('.articolo-item').forEach(item => {
        item.addEventListener('click', () => {
            const art = APP.data.merged.find(a => a.codice === item.dataset.codice);
            if (art) {
                document.getElementById('modal-articoli').classList.add('hidden');
                openModalAddRiga(art);
            }
        });
    });
    
    document.getElementById('modal-articoli').classList.remove('hidden');
}

function openModalAddRiga(articolo) {
    APP.selectedArticleForOrder = articolo;
    
    document.getElementById('riga-art-codice').textContent = articolo.codice;
    document.getElementById('riga-art-desc').textContent = articolo.des1;
    document.getElementById('riga-art-esist').textContent = articolo.esistenza;
    document.getElementById('riga-art-loc').textContent = articolo.locazione || 'N/D';
    
    document.getElementById('riga-qta').value = 1;
    document.getElementById('riga-prezzo').value = articolo.lis1 || 0;
    document.getElementById('riga-sconto').value = 0;
    
    updateRigaTotale();
    
    document.getElementById('modal-add-riga').classList.remove('hidden');
}

function closeModalAddRiga() {
    document.getElementById('modal-add-riga').classList.add('hidden');
    APP.selectedArticleForOrder = null;
}

function updateRigaTotale() {
    const qta = parseFloat(document.getElementById('riga-qta').value) || 0;
    const prezzo = parseFloat(document.getElementById('riga-prezzo').value) || 0;
    const sconto = parseFloat(document.getElementById('riga-sconto').value) || 0;
    
    const totale = qta * prezzo * (1 - sconto / 100);
    
    document.getElementById('riga-totale-value').textContent = formatPrice(totale);
}

function confermaRiga() {
    if (!APP.selectedArticleForOrder) return;
    
    const art = APP.selectedArticleForOrder;
    const qta = parseFloat(document.getElementById('riga-qta').value) || 0;
    const prezzo = parseFloat(document.getElementById('riga-prezzo').value) || 0;
    const sconto = parseFloat(document.getElementById('riga-sconto').value) || 0;
    
    if (qta <= 0) {
        showToast('Inserisci una quantità valida', 'error');
        return;
    }
    
    const riga = {
        codice: art.codice,
        des1: art.des1,
        des2: art.des2,
        um: art.um,
        qta: qta,
        prezzo: prezzo,
        sconto: sconto,
        codIva: art.codIva || 22,
        totale: qta * prezzo * (1 - sconto / 100)
    };
    
    APP.currentOrdine.righe.push(riga);
    
    closeModalAddRiga();
    document.getElementById('ord-articolo-search').value = '';
    renderOrdineRighe();
    updateOrdineTotali();
    updateConfermaButton();
    
    feedbackSuccess();
    showToast(`✅ Aggiunto ${art.codice}`, 'success');
    
    // In modalità scansione veloce, riapri lo scanner
    if (APP.fastScanModeOrd) {
        setTimeout(() => openScanner('articolo-ordine'), 300);
    }
}

function renderOrdineRighe() {
    const container = document.getElementById('ord-righe-list');
    
    if (APP.currentOrdine.righe.length === 0) {
        container.innerHTML = '<p class="empty-message">Nessun articolo inserito</p>';
        return;
    }
    
    container.innerHTML = APP.currentOrdine.righe.map((r, i) => `
        <div class="riga-ordine">
            <div class="riga-ordine-header">
                <span class="riga-ordine-codice">${r.codice}</span>
                <button class="btn-remove-riga" data-index="${i}">🗑️</button>
            </div>
            <div class="riga-ordine-desc">${r.des1}</div>
            <div class="riga-ordine-values">
                <span>Qta: ${r.qta}</span>
                <span>€ ${r.prezzo.toFixed(2)}</span>
                ${r.sconto > 0 ? `<span>-${r.sconto}%</span>` : ''}
                <span class="riga-ordine-tot">€ ${r.totale.toFixed(2)}</span>
            </div>
        </div>
    `).join('');
    
    container.querySelectorAll('.btn-remove-riga').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index);
            APP.currentOrdine.righe.splice(idx, 1);
            renderOrdineRighe();
            updateOrdineTotali();
            updateConfermaButton();
        });
    });
}

function updateOrdineTotali() {
    let totNetto = 0;
    let totIva = 0;
    
    APP.currentOrdine.righe.forEach(r => {
        totNetto += r.totale;
        totIva += r.totale * (r.codIva / 100);
    });
    
    const totOrdine = totNetto + totIva;
    const totPagare = totOrdine;
    
    document.getElementById('ord-tot-netto').textContent = formatPrice(totNetto);
    document.getElementById('ord-tot-iva').textContent = formatPrice(totIva);
    document.getElementById('ord-tot-ordine').textContent = formatPrice(totOrdine);
    document.getElementById('ord-tot-pagare').textContent = formatPrice(totPagare);
}

function updateConfermaButton() {
    const hasCliente = !!APP.currentOrdine.cliente;
    const hasRighe = APP.currentOrdine.righe.length > 0;
    document.getElementById('btn-conferma-ordine').disabled = !(hasCliente && hasRighe);
}

// ==========================================
// ORDINI - CONFERMA E SALVATAGGIO
// ==========================================

function confermaOrdine() {
    if (!APP.currentOrdine.cliente || APP.currentOrdine.righe.length === 0) {
        showToast('Completa l\'ordine', 'error');
        return;
    }
    
    const registro = document.getElementById('ord-registro').value || '01';
    const codPag = document.getElementById('ord-cod-pag').value || '';
    
    let totNetto = 0;
    let totIva = 0;
    APP.currentOrdine.righe.forEach(r => {
        totNetto += r.totale;
        totIva += r.totale * (r.codIva / 100);
    });
    
    const ordine = {
        numero: APP.currentOrdine.numero,
        registro: registro,
        data: new Date(),
        cliente: APP.currentOrdine.cliente,
        codPag: codPag,
        righe: APP.currentOrdine.righe,
        totNetto: totNetto,
        totIva: totIva,
        totOrdine: totNetto + totIva,
        totPagare: totNetto + totIva
    };
    
    APP.ordiniQueue.push(ordine);
    saveOrdiniQueue();
    updateMenuBadges();
    
    localStorage.setItem('picam_ordini_last_num', APP.currentOrdine.numero.toString());
    APP.currentOrdine.numero++;
    
    feedbackSuccess();
    showToast(`✅ Ordine #${ordine.numero} salvato`, 'success');
    
    initNewOrdine();
}

// ==========================================
// ORDINI - LISTA E SINCRONIZZAZIONE
// ==========================================

function showOrdiniList() {
    const container = document.getElementById('ordini-queue-list');
    const btnSync = document.getElementById('btn-sync-ordini');
    const btnClear = document.getElementById('btn-clear-ordini');
    const btnReport = document.getElementById('btn-report-ordini');
    
    const hasItems = APP.ordiniQueue.length > 0;
    btnSync.disabled = !hasItems;
    btnClear.disabled = !hasItems;
    btnReport.disabled = !hasItems;
    
    if (!hasItems) {
        container.innerHTML = '<p class="empty-message">Nessun ordine in coda</p>';
    } else {
        container.innerHTML = APP.ordiniQueue.map((o, i) => `
            <div class="ordine-queue-item" data-index="${i}">
                <div class="ordine-queue-header">
                    <span>Ordine #${o.numero}</span>
                    <span>${new Date(o.data).toLocaleDateString('it-IT')}</span>
                </div>
                <div class="ordine-queue-cliente">${o.cliente.ragSoc1}</div>
                <div class="ordine-queue-totale">€ ${o.totOrdine.toFixed(2)} - ${o.righe.length} articoli</div>
                <button class="ordine-queue-edit" data-index="${i}">✏️ Modifica</button>
            </div>
        `).join('');
        
        container.querySelectorAll('.ordine-queue-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openEditOrdineModal(parseInt(btn.dataset.index));
            });
        });
    }
    
    document.getElementById('modal-ordini-list').classList.remove('hidden');
}

function openEditOrdineModal(index) {
    const ordine = APP.ordiniQueue[index];
    if (!ordine) return;
    
    APP.editingOrdineIndex = index;
    
    document.getElementById('edit-ord-num').textContent = ordine.numero;
    document.getElementById('edit-ord-cliente').textContent = ordine.cliente.ragSoc1;
    document.getElementById('edit-ord-totale-val').textContent = formatPrice(ordine.totOrdine);
    
    const righeContainer = document.getElementById('edit-ord-righe');
    righeContainer.innerHTML = ordine.righe.map((r, i) => `
        <div class="edit-ord-riga">
            <span class="edit-ord-riga-code">${r.codice}</span>
            <span class="edit-ord-riga-desc">${r.des1}</span>
            <input type="number" class="edit-ord-riga-qta" data-index="${i}" value="${r.qta}" min="0">
            <span class="edit-ord-riga-tot">€ ${r.totale.toFixed(2)}</span>
            <button class="edit-ord-riga-del" data-index="${i}">🗑️</button>
        </div>
    `).join('');
    
    // Event listeners per modifica quantità
    righeContainer.querySelectorAll('.edit-ord-riga-qta').forEach(input => {
        input.addEventListener('change', () => {
            const rigaIdx = parseInt(input.dataset.index);
            const newQta = parseFloat(input.value) || 0;
            ordine.righe[rigaIdx].qta = newQta;
            ordine.righe[rigaIdx].totale = newQta * ordine.righe[rigaIdx].prezzo * (1 - ordine.righe[rigaIdx].sconto / 100);
            recalcOrdineInEdit(ordine);
        });
    });
    
    // Event listeners per eliminazione riga
    righeContainer.querySelectorAll('.edit-ord-riga-del').forEach(btn => {
        btn.addEventListener('click', () => {
            const rigaIdx = parseInt(btn.dataset.index);
            ordine.righe.splice(rigaIdx, 1);
            openEditOrdineModal(index); // Refresh
        });
    });
    
    document.getElementById('modal-edit-ordine').classList.remove('hidden');
}

function recalcOrdineInEdit(ordine) {
    let totNetto = 0;
    let totIva = 0;
    ordine.righe.forEach(r => {
        totNetto += r.totale;
        totIva += r.totale * (r.codIva / 100);
    });
    ordine.totNetto = totNetto;
    ordine.totIva = totIva;
    ordine.totOrdine = totNetto + totIva;
    ordine.totPagare = totNetto + totIva;
    
    document.getElementById('edit-ord-totale-val').textContent = formatPrice(ordine.totOrdine);
}

function saveEditOrdine() {
    if (APP.editingOrdineIndex < 0) return;
    
    saveOrdiniQueue();
    document.getElementById('modal-edit-ordine').classList.add('hidden');
    showOrdiniList();
    feedbackSuccess();
    showToast('Ordine aggiornato', 'success');
}

function deleteEditOrdine() {
    if (APP.editingOrdineIndex < 0) return;
    
    if (!confirm('Eliminare questo ordine?')) return;
    
    APP.ordiniQueue.splice(APP.editingOrdineIndex, 1);
    saveOrdiniQueue();
    updateMenuBadges();
    document.getElementById('modal-edit-ordine').classList.add('hidden');
    showOrdiniList();
    showToast('Ordine eliminato', 'success');
}

async function syncOrdiniQueue() {
    if (APP.ordiniQueue.length === 0) return;
    if (!APP.accessToken) {
        showStatus('ordini-sync-status', 'Effettua il login', 'error');
        return;
    }
    
    showStatus('ordini-sync-status', 'Sincronizzazione ordini...', 'loading');
    
    try {
        const folderId = await findFolderByPath(APP.config.folderPath);
        const ordiniFolderId = await findOrCreateFolder(folderId, 'Ordini');
        
        const anagrafiche = [];
        const testate = [];
        const dettagli = [];
        
        APP.ordiniQueue.forEach(o => {
            const cli = o.cliente;
            const dataOrdine = formatDateForExport(o.data);
            
            anagrafiche.push([
                cli.codice,
                `"${cli.ragSoc1}"`,
                cli.ragSoc2 ? `"${cli.ragSoc2}"` : '',
                `"${cli.indirizzo}"`,
                `"${cli.cap}"`,
                `"${cli.localita}"`,
                `"${cli.provincia}"`,
                cli.email ? `"${cli.email}"` : '',
                cli.telefono ? `"${cli.telefono}"` : '',
                `"${cli.partitaIva}"`,
                cli.pec ? `"${cli.pec}"` : ''
            ].join('|'));
            
            testate.push([
                cli.codice,
                '',
                `"${APP.config.deposito}"`,
                'S',
                o.codPag || '',
                dataOrdine,
                dataOrdine,
                '', '', '',
                '"OCL"',
                Math.round(o.totNetto),
                Math.round(o.totIva),
                Math.round(o.totOrdine),
                Math.round(o.totPagare),
                `"${o.registro}"`,
                o.numero
            ].join('|'));
            
            o.righe.forEach(r => {
                dettagli.push([
                    `"${r.codice}"`,
                    cli.codice,
                    `"${r.des1}"`,
                    r.des2 ? `"${r.des2}"` : '',
                    `"${r.um}"`,
                    r.qta,
                    Math.round(r.prezzo),
                    r.sconto > 0 ? r.sconto : '',
                    `"${o.registro}"`,
                    o.numero
                ].join('|'));
            });
        });
        
        await uploadFileToDrive(ordiniFolderId, 'ordini-anagrafiche', anagrafiche.join('\r\n'));
        await uploadFileToDrive(ordiniFolderId, 'ordini-testate', testate.join('\r\n'));
        await uploadFileToDrive(ordiniFolderId, 'ordini-dettagli', dettagli.join('\r\n'));
        
        APP.ordiniQueue = [];
        saveOrdiniQueue();
        updateMenuBadges();
        
        feedbackSuccess();
        showStatus('ordini-sync-status', '✅ Ordini sincronizzati!', 'success');
        showToast('✅ Ordini salvati su Google Drive', 'success');
        
        showOrdiniList();
        
    } catch (e) {
        console.error('Errore sync ordini:', e);
        feedbackError();
        showStatus('ordini-sync-status', `Errore: ${e.message}`, 'error');
    }
}

function clearOrdiniQueue() {
    if (!confirm('Eliminare tutti gli ordini in coda?')) return;
    APP.ordiniQueue = [];
    saveOrdiniQueue();
    updateMenuBadges();
    showOrdiniList();
    showToast('Coda ordini svuotata', 'success');
}

// ==========================================
// PDF REPORT ORDINI
// ==========================================

async function generateOrdiniReport() {
    if (APP.ordiniQueue.length === 0) {
        showToast('Nessun ordine da esportare', 'error');
        return;
    }
    
    showStatus('ordini-sync-status', 'Generazione PDF...', 'loading');
    
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        const today = new Date();
        const dateStr = today.toLocaleDateString('it-IT');
        
        APP.ordiniQueue.forEach((ordine, idx) => {
            if (idx > 0) doc.addPage();
            
            // Intestazione
            doc.setFontSize(18);
            doc.setFont(undefined, 'bold');
            doc.text(`ORDINE N° ${ordine.numero}`, 105, 20, { align: 'center' });
            
            doc.setFontSize(11);
            doc.setFont(undefined, 'normal');
            doc.text(`Data: ${new Date(ordine.data).toLocaleDateString('it-IT')}`, 20, 35);
            doc.text(`Registro: ${ordine.registro}`, 20, 42);
            
            // Cliente
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text('CLIENTE', 20, 55);
            
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text(ordine.cliente.ragSoc1, 20, 63);
            doc.text(ordine.cliente.indirizzo, 20, 70);
            doc.text(`${ordine.cliente.cap} ${ordine.cliente.localita} (${ordine.cliente.provincia})`, 20, 77);
            doc.text(`P.IVA: ${ordine.cliente.partitaIva}`, 20, 84);
            
            // Articoli
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text('ARTICOLI', 20, 100);
            
            let y = 110;
            doc.setFontSize(9);
            doc.setFont(undefined, 'bold');
            doc.text('Codice', 20, y);
            doc.text('Descrizione', 55, y);
            doc.text('Qta', 130, y);
            doc.text('Prezzo', 145, y);
            doc.text('Totale', 170, y);
            y += 2;
            doc.line(20, y, 190, y);
            y += 6;
            
            doc.setFont(undefined, 'normal');
            ordine.righe.forEach(r => {
                doc.text(r.codice.substring(0, 18), 20, y);
                doc.text(r.des1.substring(0, 40), 55, y);
                doc.text(r.qta.toString(), 130, y);
                doc.text(`€ ${r.prezzo.toFixed(2)}`, 145, y);
                doc.text(`€ ${r.totale.toFixed(2)}`, 170, y);
                y += 6;
            });
            
            // Totali
            y += 10;
            doc.line(130, y, 190, y);
            y += 8;
            doc.text(`Netto: € ${ordine.totNetto.toFixed(2)}`, 140, y);
            y += 6;
            doc.text(`IVA: € ${ordine.totIva.toFixed(2)}`, 140, y);
            y += 6;
            doc.setFont(undefined, 'bold');
            doc.text(`TOTALE: € ${ordine.totOrdine.toFixed(2)}`, 140, y);
            
            // Footer
            doc.setFontSize(8);
            doc.setFont(undefined, 'normal');
            doc.text('Generato da Picam - Techmatesrls', 105, 290, { align: 'center' });
        });
        
        const pdfBlob = doc.output('blob');
        const fileName = `Report_Ordini_${dateStr.replace(/\//g, '-')}.pdf`;
        
        APP.currentPdfBlob = pdfBlob;
        APP.currentPdfName = fileName;
        
        showStatus('ordini-sync-status', '✅ PDF generato!', 'success');
        document.getElementById('modal-share').classList.remove('hidden');
        
    } catch (e) {
        console.error('Errore generazione PDF:', e);
        showStatus('ordini-sync-status', `Errore: ${e.message}`, 'error');
    }
}

// ==========================================
// CONDIVISIONE
// ==========================================

async function shareNative() {
    if (!APP.currentPdfBlob) return;
    
    const file = new File([APP.currentPdfBlob], APP.currentPdfName, { type: 'application/pdf' });
    
    if (navigator.share && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                files: [file],
                title: APP.currentPdfName,
                text: 'Report generato da Picam'
            });
            document.getElementById('modal-share').classList.add('hidden');
        } catch (e) {
            if (e.name !== 'AbortError') {
                showToast('Errore condivisione', 'error');
            }
        }
    } else {
        showToast('Condivisione non supportata su questo dispositivo', 'error');
    }
}

function shareWhatsApp() {
    // WhatsApp non supporta direttamente file PDF via URL, usiamo il download + messaggio
    shareDownload();
    const text = encodeURIComponent(`Report Picam: ${APP.currentPdfName}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
    document.getElementById('modal-share').classList.add('hidden');
}

function shareEmail() {
    const subject = encodeURIComponent(`Report Picam - ${APP.currentPdfName}`);
    const body = encodeURIComponent(`In allegato il report generato da Picam.\n\nNota: scaricare prima il file PDF e allegarlo manualmente.`);
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
    shareDownload();
    document.getElementById('modal-share').classList.add('hidden');
}

async function shareDrive() {
    if (!APP.currentPdfBlob || !APP.accessToken) {
        showToast('Effettua il login per salvare su Drive', 'error');
        return;
    }
    
    try {
        const folderId = await findFolderByPath(APP.config.folderPath);
        const reportFolderId = await findOrCreateFolder(folderId, 'Report');
        
        await uploadFileToDrive(reportFolderId, APP.currentPdfName, APP.currentPdfBlob, 'application/pdf');
        
        feedbackSuccess();
        showToast(`✅ Salvato in Drive/Report/${APP.currentPdfName}`, 'success');
        document.getElementById('modal-share').classList.add('hidden');
    } catch (e) {
        console.error('Errore salvataggio Drive:', e);
        showToast(`Errore: ${e.message}`, 'error');
    }
}

function shareDownload() {
    if (!APP.currentPdfBlob) return;
    
    const url = URL.createObjectURL(APP.currentPdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = APP.currentPdfName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Download avviato', 'success');
    document.getElementById('modal-share').classList.add('hidden');
}

// ==========================================
// SCANNER BARCODE
// ==========================================

function openScanner(mode) {
    if (APP.html5QrCode) {
        APP.html5QrCode.stop().then(() => {
            APP.html5QrCode = null;
            startScanner(mode);
        }).catch(() => {
            APP.html5QrCode = null;
            startScanner(mode);
        });
    } else {
        startScanner(mode);
    }
}

function startScanner(mode) {
    APP.scannerCallback = mode;
    document.getElementById('scanner-overlay').classList.remove('hidden');
    
    // Mostra hint scansione veloce
    const fastMode = (mode === 'inventory' && APP.fastScanMode) || (mode === 'articolo-ordine' && APP.fastScanModeOrd);
    document.getElementById('scanner-fast-hint').classList.toggle('hidden', !fastMode);
    
    const config = {
        fps: 10,
        qrbox: { width: 250, height: 100 },
        aspectRatio: 1.777
    };
    
    APP.html5QrCode = new Html5Qrcode('scanner-reader');
    
    APP.html5QrCode.start(
        { facingMode: 'environment' },
        config,
        onScanSuccess,
        () => {}
    ).catch(err => {
        console.error('Errore scanner:', err);
        showToast('Impossibile avviare la fotocamera', 'error');
        closeScanner();
    });
}

function onScanSuccess(decodedText) {
    const callback = APP.scannerCallback;
    const fastMode = (callback === 'inventory' && APP.fastScanMode) || (callback === 'articolo-ordine' && APP.fastScanModeOrd);
    
    feedbackSuccess();
    console.log('Barcode letto:', decodedText);
    
    if (!fastMode) {
        // Modalità normale: chiudi scanner
        closeScanner();
    }
    
    setTimeout(() => {
        if (callback === 'search') {
            document.getElementById('search-input').value = decodedText;
            handleSearch();
            if (!fastMode) closeScanner();
        } else if (callback === 'inventory') {
            processInventoryScan(decodedText, fastMode);
        } else if (callback === 'cliente') {
            document.getElementById('ord-cliente-search').value = decodedText;
            handleClienteSearch();
            if (!fastMode) closeScanner();
        } else if (callback === 'articolo-ordine') {
            processArticoloOrdineScan(decodedText, fastMode);
        }
    }, 100);
}

function processInventoryScan(barcode, fastMode) {
    const art = APP.data.merged.find(a => a.barcode === barcode || a.codice === barcode);
    
    if (art) {
        if (fastMode) {
            // In modalità veloce: aggiungi direttamente con quantità 1
            const movItem = {
                codice: art.codice,
                des1: art.des1,
                locazione: art.locazione,
                quantita: 1,
                timestamp: new Date().toISOString()
            };
            
            APP.queue.push(movItem);
            saveQueue();
            updateQueueBadge();
            addToInvHistory(movItem);
            
            showToast(`⚡ ${art.codice}: 1`, 'success');
        } else {
            document.getElementById('inv-search-input').value = barcode;
            selectArticleForInventory(art);
        }
    } else {
        feedbackError();
        showToast(`Articolo "${barcode}" non trovato`, 'error');
    }
}

function processArticoloOrdineScan(barcode, fastMode) {
    const art = APP.data.merged.find(a => a.barcode === barcode || a.codice === barcode);
    
    if (art) {
        if (fastMode) {
            // In modalità veloce: aggiungi direttamente con quantità 1 e prezzo listino 1
            const riga = {
                codice: art.codice,
                des1: art.des1,
                des2: art.des2,
                um: art.um,
                qta: 1,
                prezzo: art.lis1 || 0,
                sconto: 0,
                codIva: art.codIva || 22,
                totale: art.lis1 || 0
            };
            
            APP.currentOrdine.righe.push(riga);
            renderOrdineRighe();
            updateOrdineTotali();
            updateConfermaButton();
            
            showToast(`⚡ ${art.codice} aggiunto`, 'success');
        } else {
            document.getElementById('ord-articolo-search').value = barcode;
            openModalAddRiga(art);
        }
    } else {
        feedbackError();
        showToast(`Articolo "${barcode}" non trovato`, 'error');
    }
}

function closeScanner() {
    const overlay = document.getElementById('scanner-overlay');
    if (overlay) overlay.classList.add('hidden');
    
    if (APP.html5QrCode) {
        const scanner = APP.html5QrCode;
        APP.html5QrCode = null;
        scanner.stop().then(() => scanner.clear()).catch(() => {});
    }
    
    const scannerReader = document.getElementById('scanner-reader');
    if (scannerReader) scannerReader.innerHTML = '';
    
    APP.scannerCallback = null;
}

// ==========================================
// UTILITÀ
// ==========================================

function formatPrice(value) {
    if (!value || value === 0) return '€ 0,00';
    return new Intl.NumberFormat('it-IT', {
        style: 'currency',
        currency: 'EUR'
    }).format(value);
}

function formatDate(value) {
    if (!value) return '-';
    if (typeof value === 'string' && value.includes('/')) return value;
    if (typeof value === 'number') {
        const date = new Date((value - 25569) * 86400 * 1000);
        return date.toLocaleDateString('it-IT');
    }
    return value.toString();
}

function formatDateForExport(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}${month}${year}`;
}

function showStatus(elementId, message, type) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.className = 'status-message';
    if (type) el.classList.add(type);
}

function showToast(message, type = '') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ==========================================
// SERVICE WORKER
// ==========================================

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW registrato:', reg.scope))
            .catch(err => console.log('SW errore:', err));
    });
}
