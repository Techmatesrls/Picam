// ==========================================
// PICAM v3.0 - Database Module (IndexedDB)
// ==========================================

const DB_NAME = 'PicamDB';
const DB_VERSION = 1;

let db = null;

// ==========================================
// INIZIALIZZAZIONE DATABASE
// ==========================================

function initDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('Errore apertura IndexedDB:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            console.log('IndexedDB aperto con successo');
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            console.log('Creazione/aggiornamento schema IndexedDB...');

            // Store ARTICOLI con indici
            if (!database.objectStoreNames.contains('articoli')) {
                const articoliStore = database.createObjectStore('articoli', { keyPath: 'codice' });
                articoliStore.createIndex('barcode', 'barcode', { unique: false });
                articoliStore.createIndex('des1', 'des1', { unique: false });
                articoliStore.createIndex('gruppo', 'gruppo', { unique: false });
                articoliStore.createIndex('locazione', 'locazione', { unique: false });
            }

            // Store CLIENTI con indici
            if (!database.objectStoreNames.contains('clienti')) {
                const clientiStore = database.createObjectStore('clienti', { keyPath: 'codice' });
                clientiStore.createIndex('ragSoc1', 'ragSoc1', { unique: false });
                clientiStore.createIndex('partitaIva', 'partitaIva', { unique: false });
            }

            // Store FORNITORI con indici
            if (!database.objectStoreNames.contains('fornitori')) {
                const fornitoriStore = database.createObjectStore('fornitori', { keyPath: 'codice' });
                fornitoriStore.createIndex('ragSoc1', 'ragSoc1', { unique: false });
                fornitoriStore.createIndex('partitaIva', 'partitaIva', { unique: false });
            }

            // Store CODA INVENTARIO
            if (!database.objectStoreNames.contains('queueInventario')) {
                database.createObjectStore('queueInventario', { keyPath: 'id', autoIncrement: true });
            }

            // Store CODA ORDINI CLIENTI
            if (!database.objectStoreNames.contains('queueOrdiniClienti')) {
                database.createObjectStore('queueOrdiniClienti', { keyPath: 'id', autoIncrement: true });
            }

            // Store CODA ORDINI FORNITORI
            if (!database.objectStoreNames.contains('queueOrdiniFornitori')) {
                database.createObjectStore('queueOrdiniFornitori', { keyPath: 'id', autoIncrement: true });
            }

            // Store METADATA (contatori, config, ecc.)
            if (!database.objectStoreNames.contains('metadata')) {
                database.createObjectStore('metadata', { keyPath: 'key' });
            }

            console.log('Schema IndexedDB creato');
        };
    });
}

// ==========================================
// OPERAZIONI GENERICHE
// ==========================================

function getStore(storeName, mode = 'readonly') {
    if (!db) throw new Error('Database non inizializzato');
    const transaction = db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
}

function clearStore(storeName) {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName, 'readwrite');
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function countStore(storeName) {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName, 'readonly');
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// ==========================================
// ARTICOLI
// ==========================================

async function saveArticoli(articoli, onProgress) {
    await clearStore('articoli');
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('articoli', 'readwrite');
        const store = transaction.objectStore('articoli');
        
        let processed = 0;
        const total = articoli.length;
        const batchSize = 500;
        
        function processBatch(startIndex) {
            const endIndex = Math.min(startIndex + batchSize, total);
            
            for (let i = startIndex; i < endIndex; i++) {
                store.put(articoli[i]);
                processed++;
            }
            
            if (onProgress) {
                onProgress(Math.round((processed / total) * 100));
            }
            
            if (endIndex < total) {
                setTimeout(() => processBatch(endIndex), 0);
            }
        }
        
        transaction.oncomplete = () => resolve(total);
        transaction.onerror = () => reject(transaction.error);
        
        processBatch(0);
    });
}

function searchArticoli(query, limit = 50) {
    return new Promise((resolve, reject) => {
        if (!query || query.length < 2) {
            resolve([]);
            return;
        }
        
        const queryLower = query.toLowerCase();
        const results = [];
        
        const store = getStore('articoli', 'readonly');
        const request = store.openCursor();
        
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            
            if (cursor && results.length < limit) {
                const art = cursor.value;
                
                // Ricerca su codice, barcode, descrizione
                if (art.codice.toLowerCase().includes(queryLower) ||
                    (art.barcode && art.barcode.includes(query)) ||
                    art.des1.toLowerCase().includes(queryLower)) {
                    results.push(art);
                }
                
                cursor.continue();
            } else {
                resolve(results);
            }
        };
        
        request.onerror = () => reject(request.error);
    });
}

function getArticoloByCode(codice) {
    return new Promise((resolve, reject) => {
        const store = getStore('articoli', 'readonly');
        const request = store.get(codice);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function getArticoloByBarcode(barcode) {
    return new Promise((resolve, reject) => {
        const store = getStore('articoli', 'readonly');
        const index = store.index('barcode');
        const request = index.get(barcode);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function getAllArticoli() {
    return new Promise((resolve, reject) => {
        const store = getStore('articoli', 'readonly');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// ==========================================
// CLIENTI
// ==========================================

async function saveClienti(clienti, onProgress) {
    await clearStore('clienti');
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('clienti', 'readwrite');
        const store = transaction.objectStore('clienti');
        
        clienti.forEach((cli, idx) => {
            store.put(cli);
            if (onProgress && idx % 100 === 0) {
                onProgress(Math.round((idx / clienti.length) * 100));
            }
        });
        
        transaction.oncomplete = () => resolve(clienti.length);
        transaction.onerror = () => reject(transaction.error);
    });
}

function searchClienti(query, limit = 50) {
    return new Promise((resolve, reject) => {
        if (!query || query.length < 2) {
            resolve([]);
            return;
        }
        
        const queryLower = query.toLowerCase();
        const results = [];
        
        const store = getStore('clienti', 'readonly');
        const request = store.openCursor();
        
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            
            if (cursor && results.length < limit) {
                const cli = cursor.value;
                
                if (cli.codice.toLowerCase().includes(queryLower) ||
                    cli.ragSoc1.toLowerCase().includes(queryLower) ||
                    cli.partitaIva.includes(query)) {
                    results.push(cli);
                }
                
                cursor.continue();
            } else {
                resolve(results);
            }
        };
        
        request.onerror = () => reject(request.error);
    });
}

function getAllClienti() {
    return new Promise((resolve, reject) => {
        const store = getStore('clienti', 'readonly');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// ==========================================
// FORNITORI
// ==========================================

async function saveFornitori(fornitori, onProgress) {
    await clearStore('fornitori');
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('fornitori', 'readwrite');
        const store = transaction.objectStore('fornitori');
        
        fornitori.forEach((forn, idx) => {
            store.put(forn);
            if (onProgress && idx % 100 === 0) {
                onProgress(Math.round((idx / fornitori.length) * 100));
            }
        });
        
        transaction.oncomplete = () => resolve(fornitori.length);
        transaction.onerror = () => reject(transaction.error);
    });
}

function searchFornitori(query, limit = 50) {
    return new Promise((resolve, reject) => {
        if (!query || query.length < 2) {
            resolve([]);
            return;
        }
        
        const queryLower = query.toLowerCase();
        const results = [];
        
        const store = getStore('fornitori', 'readonly');
        const request = store.openCursor();
        
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            
            if (cursor && results.length < limit) {
                const forn = cursor.value;
                
                if (forn.codice.toLowerCase().includes(queryLower) ||
                    forn.ragSoc1.toLowerCase().includes(queryLower) ||
                    forn.partitaIva.includes(query)) {
                    results.push(forn);
                }
                
                cursor.continue();
            } else {
                resolve(results);
            }
        };
        
        request.onerror = () => reject(request.error);
    });
}

function getAllFornitori() {
    return new Promise((resolve, reject) => {
        const store = getStore('fornitori', 'readonly');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// ==========================================
// CODE (INVENTARIO, ORDINI)
// ==========================================

function addToQueue(storeName, item) {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName, 'readwrite');
        const request = store.add(item);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function updateQueueItem(storeName, item) {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName, 'readwrite');
        const request = store.put(item);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function deleteFromQueue(storeName, id) {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName, 'readwrite');
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function getQueue(storeName) {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName, 'readonly');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function clearQueue(storeName) {
    return clearStore(storeName);
}

// ==========================================
// METADATA
// ==========================================

function setMetadata(key, value) {
    return new Promise((resolve, reject) => {
        const store = getStore('metadata', 'readwrite');
        const request = store.put({ key, value });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function getMetadata(key) {
    return new Promise((resolve, reject) => {
        const store = getStore('metadata', 'readonly');
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result ? request.result.value : null);
        request.onerror = () => reject(request.error);
    });
}

// ==========================================
// STATISTICHE
// ==========================================

async function getStats() {
    const articoliCount = await countStore('articoli');
    const clientiCount = await countStore('clienti');
    const fornitoriCount = await countStore('fornitori');
    const queueInvCount = await countStore('queueInventario');
    const queueOrdCliCount = await countStore('queueOrdiniClienti');
    const queueOrdForCount = await countStore('queueOrdiniFornitori');
    
    return {
        articoli: articoliCount,
        clienti: clientiCount,
        fornitori: fornitoriCount,
        queueInventario: queueInvCount,
        queueOrdiniClienti: queueOrdCliCount,
        queueOrdiniFornitori: queueOrdForCount
    };
}

// ==========================================
// EXPORT MODULO
// ==========================================

const DB = {
    init: initDB,
    
    // Articoli
    saveArticoli,
    searchArticoli,
    getArticoloByCode,
    getArticoloByBarcode,
    getAllArticoli,
    countArticoli: () => countStore('articoli'),
    
    // Clienti
    saveClienti,
    searchClienti,
    getAllClienti,
    countClienti: () => countStore('clienti'),
    
    // Fornitori
    saveFornitori,
    searchFornitori,
    getAllFornitori,
    countFornitori: () => countStore('fornitori'),
    
    // Code
    addToQueue,
    updateQueueItem,
    deleteFromQueue,
    getQueue,
    clearQueue,
    countStore,  // Espongo la funzione generica countStore
    
    // Metadata
    setMetadata,
    getMetadata,
    
    // Stats
    getStats
};
