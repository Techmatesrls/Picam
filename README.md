# Picam Inventario - PWA

Applicazione Progressive Web App per la gestione inventario di magazzino con integrazione Picam.

## Funzionalità

### 📋 Consultazione Articoli
- Ricerca per codice, descrizione, locazione
- Filtri per gruppo merceologico e locazione
- Scansione barcode con fotocamera
- Visualizzazione dettagli completi (anagrafica, prezzi, esistenze)

### 📦 Inventario
- Selezione articolo per ricerca o barcode
- Tastierino numerico per inserimento quantità
- Conferma e registrazione in coda locale

### 📤 Sincronizzazione
- Coda movimenti offline
- Export file movint.txt (formato: codice;quantità)
- Salvataggio su Google Drive via File System API

## Installazione su GitHub Pages

1. Carica tutti i file nel repository GitHub
2. Attiva GitHub Pages nelle impostazioni
3. Accedi all'URL: `https://tuousername.github.io/Picam`

## File richiesti

L'app legge tre file Excel dalla cartella Google Drive:

- **articoli.xlsx** - Anagrafica articoli (esportato con ExcelOut)
- **codbar.xlsx** - Codici a barre (esportato con ExcelOut)
- **artdep.xlsx** - Esistenze per deposito (esportato con ExcelOut)

## Formato output

Il file **movint.txt** generato ha il formato:
```
CODICE_ARTICOLO;QUANTITA
CODICE_ARTICOLO;QUANTITA
...
```

## Primo utilizzo

1. Apri l'app dal browser
2. Configura il percorso della cartella Google Drive
3. Inserisci il codice deposito
4. Carica i file xlsx (seleziona cartella o carica singoli file)
5. Inizia a inventariare!

## Installazione come App

### Android (Chrome)
1. Apri l'URL in Chrome
2. Tocca il menu (⋮) → "Aggiungi a schermata Home"
3. L'icona apparirà nella home

### iOS (Safari)
1. Apri l'URL in Safari
2. Tocca il pulsante Condividi
3. Seleziona "Aggiungi a Home"

## Requisiti tecnici

- Browser moderno (Chrome 80+, Safari 14+, Firefox 75+)
- Connessione internet per il primo caricamento
- Fotocamera per scansione barcode

## Modalità Offline

L'app funziona offline dopo il primo caricamento:
- Le anagrafiche vengono salvate in cache
- I movimenti inventario sono salvati localmente
- La sincronizzazione avviene quando torna la connessione

## Struttura file

```
Picam/
├── index.html      # Pagina principale
├── styles.css      # Stili CSS
├── app.js          # Logica applicazione
├── sw.js           # Service Worker (offline)
├── manifest.json   # Configurazione PWA
├── icon-192.png    # Icona piccola
├── icon-512.png    # Icona grande
└── README.md       # Questo file
```

---

**Versione**: 1.0  
**Sviluppato da**: Techmatesrls  
**Data**: Marzo 2026
