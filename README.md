# 📦 Picam PWA

**Applicazione Web Progressiva per Inventario e Ordini**

[![GitHub Pages](https://img.shields.io/badge/Deploy-GitHub%20Pages-blue)](https://techmatesrls.github.io/Picam)
[![Version](https://img.shields.io/badge/Versione-2.2-green)]()
[![PWA](https://img.shields.io/badge/PWA-Ready-purple)]()

---

## 🎯 Panoramica

Picam PWA è un'applicazione web progressiva progettata per modernizzare la gestione di inventario e ordini del gestionale Picam. Funziona su smartphone, tablet e desktop, con o senza connessione internet.

### ✨ Caratteristiche Principali

- 📱 **Installabile** come app nativa su Android e iOS
- 📷 **Scanner barcode** integrato tramite fotocamera
- ☁️ **Sincronizzazione** con Google Drive
- 🔄 **Funziona offline** grazie al Service Worker
- 📊 **Export multiplo**: movint.txt, INVENMAG.xlsx, PDF

---

## 🚀 Accesso Rapido

### URL Applicazione
```
https://techmatesrls.github.io/Picam
```

### Aggiornamento Cache (se necessario)
```
https://techmatesrls.github.io/Picam?v=11
```

---

## 📋 Moduli

### 📦 Inventario
- Scansione articoli tramite barcode
- Ricerca per codice o descrizione
- Visualizzazione giacenza per deposito
- Modifica/elimina movimenti in coda
- Storico ultime 5 scansioni
- Scansione veloce (quantità automatica = 1)

**Formati di export:**
| Formato | Descrizione |
|---------|-------------|
| `movint.txt` | Formato semplice `codice;quantità` per excelin.exe |
| `INVENMAG.xlsx` | Formato nativo Picam (9 campi) |
| `Report PDF` | Riepilogo per locazione con totali |

### 🛒 Ordini
- Selezione cliente da anagrafica
- Aggiunta articoli tramite scansione o ricerca
- Gestione quantità e prezzi
- Numerazione automatica ordini
- Export su Google Drive

---

## 📁 File Richiesti su Google Drive

Nella cartella configurata devono essere presenti questi file Excel:

| File | Descrizione | Modulo |
|------|-------------|--------|
| `articoli.xlsx` | Anagrafica articoli | Inventario, Ordini |
| `codbar.xlsx` | Codici a barre | Inventario, Ordini |
| `artdep.xlsx` | Giacenze deposito | Inventario |
| `clicom.xlsx` | Anagrafica clienti | Ordini |

> **Nota:** I file vengono generati da **PicamExporter** (utility Windows inclusa nella documentazione)

---

## 📱 Installazione PWA

### Android (Chrome)
1. Aprire l'URL in Chrome
2. Toccare il menu (⋮) → **Installa app**
3. Confermare l'installazione
4. L'icona apparirà nella home

### iOS (Safari)
1. Aprire l'URL in Safari
2. Toccare **Condividi** → **Aggiungi a Home**
3. Confermare il nome e toccare **Aggiungi**

### Desktop (Chrome/Edge)
1. Aprire l'URL
2. Cliccare sull'icona di installazione nella barra indirizzi
3. Confermare l'installazione

---

## ⚙️ Configurazione Iniziale

1. **Login Google**: Toccare "Accedi con Google" e autorizzare l'accesso a Drive
2. **Impostazioni**: Configurare:
   - 📁 Percorso cartella Google Drive (es. `archivi/Ordini`)
   - 🏭 Codice deposito (es. `001`)
3. **Carica dati**: Toccare il pulsante per caricare le anagrafiche da Drive

---

## 🔧 Stack Tecnologico

| Componente | Tecnologia |
|------------|------------|
| Frontend | HTML5 + CSS3 + JavaScript ES6+ |
| Excel I/O | SheetJS 0.18.5 |
| Scanner | html5-qrcode 2.3.8 |
| PDF | jsPDF 2.5.1 |
| Auth | Google Identity Services |
| Storage | Google Drive API v3 |
| Offline | Service Worker (Cache v11) |

---

## 📊 Tracciato INVENMAG.xlsx

Il file di export inventario nel formato nativo Picam contiene:

| Campo | Descrizione | Valore |
|-------|-------------|--------|
| `ima_car_del` | Carattere cancellazione | (vuoto) |
| `ima_cod_ute` | Codice utente | (vuoto) |
| `ima_dat_reg` | Data registrazione | Data sistema |
| `ima_cod_dep` | Codice deposito | Da configurazione |
| `ima_cod_art` | Codice articolo | Codice scansionato |
| `ima_num_lot` | Numero lotto | (vuoto) |
| `ima_qta` | Quantità | Quantità inserita |
| `ima_not` | Note | (vuoto) |
| `ima_filler` | Filler | (vuoto) |

---

## 🛠️ Utility Correlate

### PicamExporter (Windows)

Utility desktop per:
- **Export** anagrafiche da Picam → Google Drive
- **Import** inventario da Google Drive → Picam

Scaricabile dalla [documentazione tecnica](./docs/).

---

## 🔐 Credenziali OAuth

L'app utilizza OAuth 2.0 per l'accesso a Google Drive:

- **Progetto**: Picam Inventario
- **Scope**: `https://www.googleapis.com/auth/drive`
- **Modalità**: Test (max 100 utenti)

> Per aggiungere utenti: Google Cloud Console → API e servizi → Schermata consenso OAuth → Utenti di test

---

## 📝 Changelog

### v2.2 (Marzo 2026)
- ✨ Nuovo export INVENMAG.xlsx formato nativo Picam
- 🔧 Miglioramenti UI pulsanti coda inventario

### v2.1 (Marzo 2026)
- ✨ Modifica/elimina movimenti singoli
- ✨ Storico ultime 5 scansioni
- ✨ Report PDF inventario e ordini
- ✨ Scansione veloce
- ✨ Feedback sonoro e vibrazione

### v2.0 (Marzo 2026)
- 🎉 Rilascio iniziale
- 📦 Modulo Inventario
- 🛒 Modulo Ordini
- ☁️ Integrazione Google Drive

---

## 🆘 Supporto

Per problemi o richieste:
- 📧 Email: orlando@graziosi.eu
- 🏢 Techmatesrls

---

## 📄 Licenza

Proprietario - © 2026 Techmatesrls
