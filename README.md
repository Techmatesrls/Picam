# 📦 Picam v3.0

**Gestione Inventario e Ordini con sincronizzazione Google Drive**

[![PWA](https://img.shields.io/badge/PWA-Ready-blue)](https://techmatesrls.github.io/Picam)
[![License](https://img.shields.io/badge/License-Proprietary-red)]()
[![Version](https://img.shields.io/badge/Version-3.0-green)]()

Picam è un'applicazione web progressiva (PWA) per la gestione di inventario e ordini, progettata per funzionare su smartphone e tablet con sincronizzazione automatica su Google Drive.

---

## ✨ Caratteristiche

### 📋 Inventario
- Scansione codici a barre con fotocamera
- Ricerca articoli per codice, barcode o descrizione
- Modalità scansione veloce (quantità automatica = 1)
- Cronologia ultime scansioni
- Export in formato INVENMAG.xlsx

### 🛒 Ordini Clienti
- Ricerca clienti per codice, ragione sociale o P.IVA
- Aggiunta articoli con quantità e prezzi
- Calcolo automatico totali
- Export in formato pipe-delimited per import gestionale

### 🏭 Ordini Fornitori
- Gestione completa ordini a fornitori
- Interfaccia dedicata con tema viola
- Stesso flusso operativo degli ordini clienti

### ⚡ Performance
- Supporto per **18.000+ articoli**
- Database locale con **IndexedDB**
- Ricerca indicizzata ultra-veloce
- Funzionamento **100% offline**

### 🎨 Design
- Interfaccia **3D grigio professionale**
- Ottimizzata per visibilità in luce
- Pulsanti con effetto rialzato
- Responsive per mobile e tablet

---

## 🚀 Demo

**URL:** [https://techmatesrls.github.io/Picam](https://techmatesrls.github.io/Picam)

> ⚠️ L'accesso richiede un account Google autorizzato come utente di test.

---

## 📱 Installazione

### Android (Chrome)
1. Apri Chrome e vai all'URL dell'app
2. Tocca il menu (⋮) → **"Installa app"**
3. Conferma l'installazione
4. L'icona Picam apparirà nella home screen

### iPhone/iPad (Safari)
1. Apri Safari e vai all'URL dell'app
2. Tocca l'icona **Condividi** (quadrato con freccia)
3. Seleziona **"Aggiungi a Home"**
4. Conferma con "Aggiungi"

---

## ⚙️ Configurazione

### Prerequisiti Google Cloud

1. Accedi a [Google Cloud Console](https://console.cloud.google.com)
2. Crea un progetto o seleziona quello esistente
3. Abilita **Google Drive API**
4. Configura la **schermata di consenso OAuth**
5. Crea **credenziali OAuth 2.0** (Applicazione Web)
6. Aggiungi gli utenti autorizzati in **"Utenti di test"**

### File Excel richiesti su Google Drive

Nella cartella configurata (es: `archivi/Ordini`) devono essere presenti:

| File | Descrizione |
|------|-------------|
| `articoli.xlsx` | Anagrafica articoli |
| `codbar.xlsx` | Codici a barre |
| `artdep.xlsx` | Giacenze per deposito |
| `clicom.xlsx` | Anagrafica clienti |
| `forcom.xlsx` | Anagrafica fornitori (opzionale) |

---

## 📁 Struttura File

```
Picam/
├── index.html          # Pagina principale
├── styles.css          # Stili CSS (design 3D grigio)
├── db.js               # Modulo database IndexedDB
├── app.js              # Logica applicazione
├── sw.js               # Service Worker per cache
├── manifest.json       # Configurazione PWA
├── icon-192.png        # Icona 192x192
├── icon-512.png        # Icona 512x512
└── README.md           # Questo file
```

---

## 🔄 Sincronizzazione

### File generati - Inventario
- `INVENMAG.xlsx` - Movimenti inventario

### File generati - Ordini Clienti
- `ordini-anagrafiche` - Anagrafica clienti
- `ordini-testate` - Testata ordini
- `ordini-dettagli` - Righe ordini

### File generati - Ordini Fornitori
- `ordfornitori-anagrafica` - Anagrafica fornitori
- `ordfornitori-testate` - Testata ordini
- `ordfornitori-dettagli` - Righe ordini

---

## 🛠️ Tecnologie

- **HTML5 / CSS3 / JavaScript** (ES6+)
- **IndexedDB** per storage locale
- **Google Drive API** per sincronizzazione
- **Google Identity Services** per autenticazione OAuth2
- **SheetJS (xlsx)** per lettura/scrittura Excel
- **html5-qrcode** per scansione barcode
- **jsPDF** per generazione report PDF
- **Service Worker** per funzionamento offline

---

## 🔧 Sviluppo

### Aggiornare la cache

Dopo ogni modifica, incrementare la versione cache in `sw.js`:

```javascript
const CACHE_NAME = 'picam-cache-v14'; // incrementare il numero
```

### Forzare refresh sul client

Aggiungere un parametro query string all'URL:

```
https://techmatesrls.github.io/Picam?v=15
```

---

## 📊 Compatibilità

| Browser | Versione Minima | Note |
|---------|-----------------|------|
| Chrome (Android) | 80+ | ✅ Consigliato |
| Safari (iOS) | 12+ | ✅ Supportato |
| Firefox | 75+ | ⚠️ Limitazioni scanner |
| Edge | 80+ | ✅ Supportato |

---

## 🐛 Risoluzione Problemi

### L'app non si aggiorna
```
Soluzione: Aggiungere ?v=XX all'URL per forzare il refresh
```

### Errore autenticazione Google
```
- Verificare che l'account sia negli "Utenti di test"
- Effettuare logout e nuovo login
```

### Scanner non funziona
```
- Verificare permessi fotocamera
- Usare Chrome (altri browser potrebbero non supportare)
- Verificare connessione HTTPS
```

### Cartella non trovata
```
- Verificare il percorso nelle impostazioni
- Verificare che la cartella esista su Drive
- Verificare i permessi dell'account
```

---

## 📄 Licenza

Software proprietario - Tutti i diritti riservati.

---

## 👨‍💻 Autore

**Techmatesrls**

📧 orlando@graziosi.eu

---

## 📝 Changelog

### v3.0 (Marzo 2026)
- 🎨 Nuovo design 3D grigio professionale
- ⚡ IndexedDB per supporto grandi database (100k+ articoli)
- 🔍 Ricerca indicizzata ultra-veloce
- 📱 Ottimizzazione visibilità in luce
- 💰 Visualizzazione prezzo vendita/acquisto negli ordini
- 📦 Visualizzazione giacenza nelle righe ordine
- 🐛 Fix selezione articoli con event delegation
- 🔄 Cache v15

### v2.3 (Marzo 2026)
- Aggiunta gestione ordini fornitori
- Miglioramenti scanner barcode
- Fix upload Google Drive

### v2.0 (Febbraio 2026)
- Aggiunta gestione ordini clienti
- Report PDF
- Modalità scansione veloce

### v1.0 (Gennaio 2026)
- Release iniziale
- Modulo inventario base
- Sincronizzazione Google Drive
