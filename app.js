/* ========================================
   PICAM INVENTARIO - APP.JS v1.1
   Con integrazione Google Drive API
   ======================================== */

// ==========================================
// CONFIGURAZIONE GOOGLE
// ==========================================

const GOOGLE_CONFIG = {
    clientId: '531186661114-h0t8okuq99ft6j889lq1b6skgo2pl074.apps.googleusercontent.com',
    scopes: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly',
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
        merged: []
    },
    
    // Coda movimenti
    queue: [],
    
    // Articolo selezionato per inventario
    selectedArticle: null,
    
    // Quantità corrente
    currentQty: '0',
    
    // Scanner
    html5QrCode: null,
    scannerCallback: null
};

// ==========================================
// INIZIALIZZAZIONE
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    loadQueue();
    initEventListeners();
    updateQueueBadge();
    
    // Aspetta che Google API sia caricata
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
    // Inizializza token client per accesso Drive
    APP.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CONFIG.clientId,
        scope: GOOGLE_CONFIG.scopes,
        callback: handleTokenResponse
    });
    
    // Controlla se c'è un token salvato
    const savedToken = localStorage.getItem('picam_access_token');
    const savedExpiry = localStorage.getItem('picam_token_expiry');
    const savedEmail = localStorage.getItem('picam_user_email');
    
    if (savedToken && savedExpiry && new Date().getTime() < parseInt(savedExpiry)) {
        APP.accessToken = savedToken;
        APP.userEmail = savedEmail;
        onUserLoggedIn();
    }
}

function handleTokenResponse(response) {
    if (response.error) {
        console.error('Errore token:', response.error);
        showStatus('setup-status', 'Errore di autenticazione: ' + response.error, 'error');
        return;
    }
    
    APP.accessToken = response.access_token;
    
    // Ottieni email utente
    fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${APP.accessToken}` }
    })
    .then(res => res.json())
    .then(data => {
        APP.userEmail = data.email;
        
        // Salva token (scade in 1 ora)
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
    // Aggiorna UI
    document.getElementById('btn-google-login').classList.add('hidden');
    document.getElementById('user-info').classList.remove('hidden');
    document.getElementById('user-email').textContent = APP.userEmail || 'Connesso';
    
    // Abilita step successivi
    document.getElementById('step-folder').classList.remove('disabled');
    document.getElementById('step-deposito').classList.remove('disabled');
    
    // Carica configurazione salvata
    document.getElementById('input-folder').value = APP.config.folderPath || '';
    document.getElementById('input-deposito').value = APP.config.deposito || '';
    
    updateLoadButton();
    
    // Se c'è cache, carica direttamente
    const cachedData = localStorage.getItem('picam_merged_data');
    if (APP.config.folderPath && APP.config.deposito && cachedData) {
        try {
            APP.data.merged = JSON.parse(cachedData);
            showMainScreen();
            populateFilters();
            showToast(`${APP.data.merged.length} articoli dalla cache`, 'success');
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
    
    // Header
    document.getElementById('btn-settings').addEventListener('click', showSetupScreen);
    
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    
    // Consulta tab
    document.getElementById('search-input').addEventListener('input', handleSearch);
    document.getElementById('btn-scan-search').addEventListener('click', () => openScanner('search'));
    document.getElementById('btn-clear-search').addEventListener('click', clearSearch);
    document.getElementById('filter-gruppo').addEventListener('change', handleSearch);
    document.getElementById('filter-locazione').addEventListener('change', handleSearch);
    document.getElementById('btn-close-detail').addEventListener('click', closeDetail);
    document.getElementById('btn-to-inventory').addEventListener('click', goToInventoryFromDetail);
    
    // Inventario tab
    document.getElementById('inv-search-input').addEventListener('input', handleInventorySearch);
    document.getElementById('btn-scan-inventory').addEventListener('click', () => openScanner('inventory'));
    
    // Numpad
    document.querySelectorAll('.numpad-btn').forEach(btn => {
        btn.addEventListener('click', handleNumpadClick);
    });
    document.getElementById('btn-confirm-inventory').addEventListener('click', confirmInventory);
    
    // Coda tab
    document.getElementById('btn-sync').addEventListener('click', syncQueue);
    document.getElementById('btn-clear-queue').addEventListener('click', clearQueue);
    
    // Scanner
    document.getElementById('btn-close-scanner').addEventListener('click', closeScanner);
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
    // Revoca token
    if (APP.accessToken) {
        google.accounts.oauth2.revoke(APP.accessToken);
    }
    
    // Pulisci stato
    APP.accessToken = null;
    APP.userEmail = null;
    localStorage.removeItem('picam_access_token');
    localStorage.removeItem('picam_token_expiry');
    localStorage.removeItem('picam_user_email');
    
    // Reset UI
    document.getElementById('btn-google-login').classList.remove('hidden');
    document.getElementById('user-info').classList.add('hidden');
    document.getElementById('step-folder').classList.add('disabled');
    document.getElementById('step-deposito').classList.add('disabled');
    document.getElementById('btn-load-data').disabled = true;
    
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
        
        // Cerca cartelle su Drive
        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name,parents)&orderBy=name&pageSize=100`,
            {
                headers: {
                    'Authorization': `Bearer ${APP.accessToken}`
                }
            }
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
    // Crea modal per selezione cartella
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
    
    // Event listeners per selezione
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
    // Se abbiamo già l'ID, usalo
    if (APP.config.folderId && APP.config.folderPath === path) {
        return APP.config.folderId;
    }
    
    // Altrimenti cerca per nome
    const folderName = path.split('/').pop();
    
    const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
        {
            headers: {
                'Authorization': `Bearer ${APP.accessToken}`
            }
        }
    );
    
    if (!response.ok) throw new Error('Cartella non trovata');
    
    const data = await response.json();
    if (data.files.length === 0) throw new Error(`Cartella "${path}" non trovata`);
    
    APP.config.folderId = data.files[0].id;
    return data.files[0].id;
}

async function downloadFileFromDrive(folderId, fileName) {
    // Cerca il file nella cartella
    const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and name='${fileName}' and trashed=false&fields=files(id,name,mimeType)`,
        {
            headers: {
                'Authorization': `Bearer ${APP.accessToken}`
            }
        }
    );
    
    if (!searchResponse.ok) throw new Error(`Errore ricerca ${fileName}`);
    
    const searchData = await searchResponse.json();
    if (searchData.files.length === 0) throw new Error(`File "${fileName}" non trovato nella cartella`);
    
    const fileId = searchData.files[0].id;
    
    // Scarica il contenuto
    const downloadResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
            headers: {
                'Authorization': `Bearer ${APP.accessToken}`
            }
        }
    );
    
    if (!downloadResponse.ok) throw new Error(`Errore download ${fileName}`);
    
    return await downloadResponse.arrayBuffer();
}

async function uploadFileToDrive(folderId, fileName, content) {
    // Cerca se esiste già
    const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and name='${fileName}' and trashed=false&fields=files(id)`,
        {
            headers: {
                'Authorization': `Bearer ${APP.accessToken}`
            }
        }
    );
    
    const searchData = await searchResponse.json();
    const existingFileId = searchData.files && searchData.files.length > 0 ? searchData.files[0].id : null;
    
    // Prepara i dati
    const metadata = {
        name: fileName,
        mimeType: 'text/plain'
    };
    
    if (!existingFileId) {
        metadata.parents = [folderId];
    }
    
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([content], { type: 'text/plain' }));
    
    let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    let method = 'POST';
    
    if (existingFileId) {
        url = `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`;
        method = 'PATCH';
    }
    
    const response = await fetch(url, {
        method: method,
        headers: {
            'Authorization': `Bearer ${APP.accessToken}`
        },
        body: form
    });
    
    if (!response.ok) throw new Error('Errore upload file');
    
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
        // Trova cartella
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
        
        showStatus('setup-status', 'Elaborazione dati...', 'loading');
        mergeData();
        
        // Salva in cache
        localStorage.setItem('picam_merged_data', JSON.stringify(APP.data.merged));
        
        showStatus('setup-status', `✅ Caricati ${APP.data.merged.length} articoli`, 'success');
        
        setTimeout(() => {
            showMainScreen();
            populateFilters();
        }, 1000);
        
    } catch (e) {
        console.error('Errore caricamento:', e);
        showStatus('setup-status', `Errore: ${e.message}`, 'error');
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
    
    // Crea mappa codice a barre
    const barcodeMap = {};
    APP.data.codbar.forEach(row => {
        const cod = row.cba_cod_art || row.CBA_COD_ART;
        const bar = row.cba_cod_bar || row.CBA_COD_BAR;
        if (cod) barcodeMap[cod.toString().trim()] = bar || '';
    });
    
    // Crea mappa esistenze (filtrata per deposito)
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
    
    // Merge dati
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
            esistenza: exist.esistenza,
            locazione: exist.locazione
        };
    }).filter(a => a.codice);
    
    console.log(`Merged ${APP.data.merged.length} articoli per deposito ${deposito}`);
}

// ==========================================
// NAVIGAZIONE
// ==========================================

function showMainScreen() {
    document.getElementById('screen-setup').classList.remove('active');
    document.getElementById('screen-main').classList.add('active');
    document.getElementById('header-deposito').textContent = `DEP: ${APP.config.deposito}`;
}

function showSetupScreen() {
    document.getElementById('screen-main').classList.remove('active');
    document.getElementById('screen-setup').classList.add('active');
    showStatus('setup-status', '', '');
}

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
}

// ==========================================
// RICERCA E FILTRI
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
    
    if (gruppo) {
        results = results.filter(a => a.gruppo === gruppo);
    }
    
    if (locazione) {
        results = results.filter(a => a.locazione === locazione);
    }
    
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
// DETTAGLIO ARTICOLO
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
// INVENTARIO
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
            a.des2.toLowerCase().includes(query) ||
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
                <div class="suggestion-item" data-codice="${a.codice}" style="
                    padding: 8px;
                    margin-bottom: 4px;
                    background: var(--bg-input);
                    border-radius: var(--radius-sm);
                    cursor: pointer;
                ">
                    <div style="font-family: var(--font-mono); font-size: 12px; color: var(--accent-primary);">
                        ${a.codice}
                    </div>
                    <div style="font-size: 11px; color: var(--text-secondary);">${a.des1}</div>
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
    
    APP.queue.push({
        codice: APP.selectedArticle.codice,
        quantita: qty,
        timestamp: new Date().toISOString()
    });
    
    saveQueue();
    updateQueueBadge();
    
    showToast(`✅ ${APP.selectedArticle.codice}: ${qty}`, 'success');
    
    document.getElementById('inv-search-input').value = '';
    resetInventory();
}

// ==========================================
// CODA MOVIMENTI
// ==========================================

function loadQueue() {
    const saved = localStorage.getItem('picam_queue');
    if (saved) {
        try {
            APP.queue = JSON.parse(saved);
        } catch (e) {
            APP.queue = [];
        }
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
    
    countEl.textContent = `${APP.queue.length} movimenti`;
    
    const hasItems = APP.queue.length > 0;
    btnSync.disabled = !hasItems;
    btnClear.disabled = !hasItems;
    
    if (!hasItems) {
        container.innerHTML = '<p class="empty-message">Nessun movimento in coda</p>';
        return;
    }
    
    container.innerHTML = APP.queue.map((item, index) => `
        <div class="queue-item">
            <span class="queue-item-code">${item.codice}</span>
            <span class="queue-item-qty">${item.quantita}</span>
        </div>
    `).join('');
}

async function syncQueue() {
    if (APP.queue.length === 0) return;
    
    if (!APP.accessToken) {
        showStatus('sync-status', 'Effettua il login per sincronizzare', 'error');
        return;
    }
    
    showStatus('sync-status', 'Sincronizzazione in corso...', 'loading');
    
    try {
        // Genera contenuto file
        const content = APP.queue.map(item => `${item.codice};${item.quantita}`).join('\n');
        
        // Trova cartella
        const folderId = await findFolderByPath(APP.config.folderPath);
        
        // Upload file
        await uploadFileToDrive(folderId, 'movint.txt', content);
        
        // Svuota coda
        APP.queue = [];
        saveQueue();
        updateQueueBadge();
        renderQueue();
        
        showStatus('sync-status', '✅ Sincronizzato su Google Drive!', 'success');
        showToast('✅ movint.txt aggiornato su Drive', 'success');
        
    } catch (e) {
        console.error('Errore sync:', e);
        showStatus('sync-status', `Errore: ${e.message}`, 'error');
    }
}

function clearQueue() {
    if (!confirm('Sei sicuro di voler eliminare tutti i movimenti in coda?')) return;
    
    APP.queue = [];
    saveQueue();
    updateQueueBadge();
    renderQueue();
    
    showToast('Coda svuotata', 'success');
}

// ==========================================
// SCANNER BARCODE
// ==========================================

function openScanner(mode) {
    APP.scannerCallback = mode;
    document.getElementById('scanner-overlay').classList.remove('hidden');
    
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
        onScanError
    ).catch(err => {
        console.error('Errore avvio scanner:', err);
        showToast('Impossibile avviare la fotocamera', 'error');
        closeScanner();
    });
}

function onScanSuccess(decodedText) {
    if (navigator.vibrate) {
        navigator.vibrate(100);
    }
    
    closeScanner();
    
    if (APP.scannerCallback === 'search') {
        document.getElementById('search-input').value = decodedText;
        handleSearch();
    } else if (APP.scannerCallback === 'inventory') {
        document.getElementById('inv-search-input').value = decodedText;
        handleInventorySearch();
    }
}

function onScanError(error) {
    // Ignora
}

function closeScanner() {
    document.getElementById('scanner-overlay').classList.add('hidden');
    
    if (APP.html5QrCode) {
        APP.html5QrCode.stop().catch(() => {});
        APP.html5QrCode = null;
    }
    
    APP.scannerCallback = null;
}

// ==========================================
// UTILITÀ
// ==========================================

function formatPrice(value) {
    if (!value || value === 0) return '-';
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

function showStatus(elementId, message, type) {
    const el = document.getElementById(elementId);
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
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
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
