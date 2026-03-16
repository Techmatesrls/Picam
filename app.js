/* ========================================
   PICAM INVENTARIO - APP.JS
   Applicazione PWA per inventario
   ======================================== */

// ==========================================
// STATO GLOBALE
// ==========================================

const APP = {
    // Configurazione
    config: {
        drivePath: '',
        deposito: ''
    },
    
    // Dati caricati
    data: {
        articoli: [],       // Da articoli.xlsx
        codbar: [],         // Da codbar.xlsx
        artdep: [],         // Da artdep.xlsx
        merged: []          // Dati aggregati
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
    
    // Se già configurato e dati presenti, vai alla schermata principale
    const cachedData = localStorage.getItem('picam_merged_data');
    if (APP.config.drivePath && APP.config.deposito && cachedData) {
        try {
            APP.data.merged = JSON.parse(cachedData);
            showMainScreen();
            populateFilters();
            showToast(`${APP.data.merged.length} articoli in cache`, 'success');
        } catch (e) {
            console.error('Errore caricamento cache:', e);
        }
    }
});

function initEventListeners() {
    // Setup screen
    document.getElementById('btn-load-data').addEventListener('click', handleLoadData);
    document.getElementById('input-path').value = APP.config.drivePath;
    document.getElementById('input-deposito').value = APP.config.deposito;
    
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
    APP.config.drivePath = document.getElementById('input-path').value.trim();
    APP.config.deposito = document.getElementById('input-deposito').value.trim().toUpperCase();
    localStorage.setItem('picam_config', JSON.stringify(APP.config));
}

// ==========================================
// CARICAMENTO DATI
// ==========================================

async function handleLoadData() {
    const path = document.getElementById('input-path').value.trim();
    const deposito = document.getElementById('input-deposito').value.trim().toUpperCase();
    
    if (!path) {
        showStatus('setup-status', 'Inserisci il percorso della cartella', 'error');
        return;
    }
    
    if (!deposito) {
        showStatus('setup-status', 'Inserisci il codice deposito', 'error');
        return;
    }
    
    saveConfig();
    showStatus('setup-status', 'Caricamento file in corso...', 'loading');
    
    try {
        // Nota: In ambiente PWA su GitHub Pages, non possiamo accedere direttamente
        // al filesystem. L'utente dovrà selezionare i file manualmente.
        // Usiamo File System Access API se disponibile, altrimenti input file.
        
        if ('showDirectoryPicker' in window) {
            await loadFilesWithPicker();
        } else {
            // Fallback: mostra istruzioni per caricare file manualmente
            showFileInputFallback();
        }
    } catch (e) {
        console.error('Errore caricamento:', e);
        showStatus('setup-status', `Errore: ${e.message}`, 'error');
    }
}

async function loadFilesWithPicker() {
    try {
        showStatus('setup-status', 'Seleziona la cartella con i file xlsx...', 'loading');
        
        const dirHandle = await window.showDirectoryPicker();
        
        const files = {
            articoli: null,
            codbar: null,
            artdep: null
        };
        
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file') {
                const name = entry.name.toLowerCase();
                if (name === 'articoli.xlsx') files.articoli = await entry.getFile();
                else if (name === 'codbar.xlsx') files.codbar = await entry.getFile();
                else if (name === 'artdep.xlsx') files.artdep = await entry.getFile();
            }
        }
        
        if (!files.articoli || !files.codbar || !files.artdep) {
            const missing = [];
            if (!files.articoli) missing.push('articoli.xlsx');
            if (!files.codbar) missing.push('codbar.xlsx');
            if (!files.artdep) missing.push('artdep.xlsx');
            throw new Error(`File mancanti: ${missing.join(', ')}`);
        }
        
        showStatus('setup-status', 'Elaborazione dati...', 'loading');
        
        // Leggi i file Excel
        APP.data.articoli = await parseExcelFile(files.articoli);
        APP.data.codbar = await parseExcelFile(files.codbar);
        APP.data.artdep = await parseExcelFile(files.artdep);
        
        // Aggrega i dati
        mergeData();
        
        // Salva in cache
        localStorage.setItem('picam_merged_data', JSON.stringify(APP.data.merged));
        
        showStatus('setup-status', `✅ Caricati ${APP.data.merged.length} articoli`, 'success');
        
        setTimeout(() => {
            showMainScreen();
            populateFilters();
        }, 1000);
        
    } catch (e) {
        if (e.name === 'AbortError') {
            showStatus('setup-status', 'Selezione annullata', 'error');
        } else {
            throw e;
        }
    }
}

function showFileInputFallback() {
    // Crea input file nascosti per fallback
    const container = document.createElement('div');
    container.innerHTML = `
        <div style="margin-top: 20px; padding: 16px; background: var(--bg-input); border-radius: var(--radius-md);">
            <p style="margin-bottom: 12px; font-size: 14px; color: var(--text-secondary);">
                Il tuo browser non supporta la selezione cartelle. Carica i file singolarmente:
            </p>
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <label class="file-input-label">
                    📄 articoli.xlsx
                    <input type="file" id="file-articoli" accept=".xlsx" style="display:none">
                </label>
                <label class="file-input-label">
                    📄 codbar.xlsx
                    <input type="file" id="file-codbar" accept=".xlsx" style="display:none">
                </label>
                <label class="file-input-label">
                    📄 artdep.xlsx
                    <input type="file" id="file-artdep" accept=".xlsx" style="display:none">
                </label>
            </div>
            <button id="btn-process-files" class="btn-primary" style="margin-top: 12px;">
                Elabora file
            </button>
        </div>
    `;
    
    // Aggiungi stili per label file
    const style = document.createElement('style');
    style.textContent = `
        .file-input-label {
            display: block;
            padding: 12px;
            background: var(--bg-card);
            border: 1px dashed var(--border-color);
            border-radius: var(--radius-sm);
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        }
        .file-input-label:hover {
            border-color: var(--accent-primary);
        }
        .file-input-label.loaded {
            border-color: var(--accent-primary);
            background: rgba(74, 222, 128, 0.1);
        }
    `;
    document.head.appendChild(style);
    
    const card = document.querySelector('.setup-card');
    card.appendChild(container);
    
    // Event listeners per file input
    ['articoli', 'codbar', 'artdep'].forEach(name => {
        document.getElementById(`file-${name}`).addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                e.target.parentElement.classList.add('loaded');
                e.target.parentElement.textContent = `✅ ${e.target.files[0].name}`;
            }
        });
    });
    
    document.getElementById('btn-process-files').addEventListener('click', processUploadedFiles);
}

async function processUploadedFiles() {
    const fileArticoli = document.getElementById('file-articoli').files[0];
    const fileCodbar = document.getElementById('file-codbar').files[0];
    const fileArtdep = document.getElementById('file-artdep').files[0];
    
    if (!fileArticoli || !fileCodbar || !fileArtdep) {
        showStatus('setup-status', 'Carica tutti e tre i file', 'error');
        return;
    }
    
    showStatus('setup-status', 'Elaborazione dati...', 'loading');
    
    try {
        APP.data.articoli = await parseExcelFile(fileArticoli);
        APP.data.codbar = await parseExcelFile(fileCodbar);
        APP.data.artdep = await parseExcelFile(fileArtdep);
        
        mergeData();
        
        localStorage.setItem('picam_merged_data', JSON.stringify(APP.data.merged));
        
        showStatus('setup-status', `✅ Caricati ${APP.data.merged.length} articoli`, 'success');
        
        setTimeout(() => {
            showMainScreen();
            populateFilters();
        }, 1000);
    } catch (e) {
        console.error('Errore elaborazione:', e);
        showStatus('setup-status', `Errore: ${e.message}`, 'error');
    }
}

function parseExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(sheet);
                resolve(json);
            } catch (err) {
                reject(err);
            }
        };
        
        reader.onerror = () => reject(new Error('Errore lettura file'));
        reader.readAsArrayBuffer(file);
    });
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
    }).filter(a => a.codice); // Rimuovi record senza codice
    
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
    document.getElementById('input-path').value = APP.config.drivePath;
    document.getElementById('input-deposito').value = APP.config.deposito;
    showStatus('setup-status', '', '');
}

function switchTab(tabName) {
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });
    
    // Reset inventory quando si cambia tab
    if (tabName !== 'inventario') {
        resetInventory();
    }
    
    // Aggiorna lista coda
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
    
    // Mostra/nascondi pulsante clear
    document.getElementById('btn-clear-search').classList.toggle('hidden', !query);
    
    // Filtra
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
    
    // Limita a 100 per performance
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
    
    // Event listeners
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
    
    // Salva articolo selezionato per eventuale passaggio a inventario
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
    
    // Cerca articolo esatto per codice o barcode
    let art = APP.data.merged.find(a => 
        a.codice.toLowerCase() === query || 
        a.barcode === query
    );
    
    // Se non trovato esatto, cerca parziale
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
            // Mostra suggerimenti
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
    
    // Aggiungi alla coda
    APP.queue.push({
        codice: APP.selectedArticle.codice,
        quantita: qty,
        timestamp: new Date().toISOString()
    });
    
    saveQueue();
    updateQueueBadge();
    
    showToast(`✅ ${APP.selectedArticle.codice}: ${qty}`, 'success');
    
    // Reset per prossimo articolo
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
    
    showStatus('sync-status', 'Preparazione file...', 'loading');
    
    try {
        // Genera contenuto file
        const content = APP.queue.map(item => `${item.codice};${item.quantita}`).join('\n');
        
        // Crea blob
        const blob = new Blob([content], { type: 'text/plain' });
        
        // Se File System Access API disponibile, salva direttamente
        if ('showSaveFilePicker' in window) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: 'movint.txt',
                    types: [{
                        description: 'File di testo',
                        accept: { 'text/plain': ['.txt'] }
                    }]
                });
                
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                
                // Svuota coda
                APP.queue = [];
                saveQueue();
                updateQueueBadge();
                renderQueue();
                
                showStatus('sync-status', '✅ File salvato con successo!', 'success');
            } catch (e) {
                if (e.name !== 'AbortError') throw e;
                showStatus('sync-status', 'Salvataggio annullato', 'error');
            }
        } else {
            // Fallback: download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'movint.txt';
            a.click();
            URL.revokeObjectURL(url);
            
            // Svuota coda
            APP.queue = [];
            saveQueue();
            updateQueueBadge();
            renderQueue();
            
            showStatus('sync-status', '✅ File scaricato! Spostalo nella cartella Google Drive.', 'success');
        }
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
    // Vibrazione feedback
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
    // Ignora errori di scansione continua
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
    // Se è già una stringa formattata, restituisci così
    if (typeof value === 'string' && value.includes('/')) return value;
    // Se è un numero Excel, converti
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
// SERVICE WORKER REGISTRATION
// ==========================================

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW registrato:', reg.scope))
            .catch(err => console.log('SW errore:', err));
    });
}
