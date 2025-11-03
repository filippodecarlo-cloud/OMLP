# 📱 OMLP Simulator - Installazione PWA su Android

Questa applicazione è ora una **Progressive Web App (PWA)** e può essere installata su dispositivi Android (e iOS/Desktop) come un'app nativa!

## ✅ Prerequisiti Completati

L'app è stata configurata con:
- ✓ `manifest.json` - Configurazione PWA
- ✓ `service-worker.js` - Funzionamento offline
- ✓ Meta tags per Android e iOS
- ✓ Supporto per installazione

## 🎨 Passo 1: Generare le Icone dell'App

Le icone dell'app devono essere generate prima dell'installazione. Hai due opzioni:

### Opzione A: Usando il Browser (Raccomandato ✨)

1. Apri il file `generate-icons.html` nel tuo browser
2. Clicca su "Generate All Icons"
3. Clicca su "Download All Icons" per scaricare tutte le icone
4. Salva tutte le icone nella cartella principale del progetto (dove si trova index.html)

### Opzione B: Usando Node.js con Canvas

```bash
# Installa il modulo canvas
npm install canvas

# Esegui lo script
node generate-icons.js
```

**Icone richieste:**
- icon-72x72.png
- icon-96x96.png
- icon-128x128.png
- icon-144x144.png
- icon-152x152.png
- icon-192x192.png
- icon-384x384.png
- icon-512x512.png

## 🌐 Passo 2: Servire l'Applicazione

Le PWA richiedono **HTTPS** (o localhost). Usa uno di questi metodi:

### Metodo 1: Server HTTP Python (per test locali)

```bash
# Con Python 3
python3 -m http.server 8000

# Oppure con Python 2
python -m SimpleHTTPServer 8000
```

Apri il browser e vai a: `http://localhost:8000`

### Metodo 2: Usando npx serve

```bash
npx serve -s . -p 8000
```

### Metodo 3: Deploy su un server HTTPS

Per l'installazione su Android reale, devi deployare l'app su un server HTTPS:
- **GitHub Pages** (gratis e facile)
- **Netlify** (gratis)
- **Vercel** (gratis)
- Qualsiasi hosting con SSL

#### Deploy veloce su GitHub Pages:

```bash
# Se non hai ancora il repository su GitHub
git remote add origin https://github.com/tuo-username/omlp.git

# Crea branch gh-pages
git checkout -b gh-pages
git push -u origin gh-pages

# Vai su Settings > Pages > seleziona branch gh-pages
```

L'app sarà disponibile su: `https://tuo-username.github.io/omlp`

## 📲 Passo 3: Installare su Android

### Da Chrome su Android:

1. **Apri l'app nel browser Chrome** (deve essere servita via HTTPS o localhost)

2. **Aspetta il prompt di installazione**
   - Chrome mostrerà automaticamente un banner "Aggiungi a schermata Home"

3. **Oppure usa il menu manuale:**
   - Tocca i tre puntini (⋮) in alto a destra
   - Seleziona "Aggiungi a schermata Home" o "Installa app"
   - Conferma l'installazione

4. **L'app apparirà nella schermata Home** come un'app nativa!

### Verifica PWA:

Prima di installare, verifica che la PWA sia configurata correttamente:

1. Apri Chrome DevTools (F12)
2. Vai alla tab "Application"
3. Controlla:
   - ✓ Manifest: dovrebbe mostrare tutti i dettagli
   - ✓ Service Workers: dovrebbe essere "activated and running"
   - ✓ Icons: tutte le icone devono essere caricate

## 🎯 Caratteristiche PWA

Una volta installata, l'app avrà:

### ✅ Funzionamento Offline
- L'app funziona anche senza connessione internet
- Tutti i file sono memorizzati nella cache locale
- Le librerie esterne (Chart.js, etc.) sono cached

### ✅ App Nativa
- Icona sulla schermata Home
- Splash screen al lancio
- Fullscreen (nessuna barra del browser)
- Task switcher Android

### ✅ Aggiornamenti Automatici
- Il service worker controlla automaticamente gli aggiornamenti
- Notifica quando c'è una nuova versione disponibile
- Prompt per ricaricare e aggiornare

## 🔧 Test e Debug

### Test in locale:

```bash
# Avvia server locale
python3 -m http.server 8000

# Apri in Chrome
# Vai su: http://localhost:8000

# Apri DevTools (F12)
# Controlla la console per messaggi del service worker
```

Dovresti vedere:
```
✅ Service Worker registered successfully
💾 PWA install prompt available
```

### Test su Android (via USB debugging):

1. **Abilita USB debugging su Android**
   - Settings > About Phone > Tocca 7 volte "Build Number"
   - Settings > Developer Options > Enable USB Debugging

2. **Connetti il telefono al PC**

3. **Apri Chrome sul PC**
   - Vai su: `chrome://inspect`
   - Vedrai il tuo dispositivo connesso
   - Puoi ispezionare le tab aperte sul telefono

4. **Apri l'app sul telefono**
   - I log appariranno nel DevTools del PC

## 🐛 Risoluzione Problemi

### L'icona "Installa" non appare:

- ✅ Verifica che tutte le icone siano generate e caricate
- ✅ Assicurati che l'app sia servita via HTTPS (o localhost)
- ✅ Controlla che manifest.json sia valido
- ✅ Verifica che il service worker sia registrato correttamente
- ✅ Prova a ricaricare la pagina (Ctrl+Shift+R)

### Service Worker non si registra:

- ✅ Controlla la console per errori
- ✅ Verifica che service-worker.js sia accessibile
- ✅ Assicurati che non ci siano errori JavaScript
- ✅ Prova a fare "Unregister" e ri-registrare (DevTools > Application > Service Workers)

### L'app non funziona offline:

- ✅ Verifica che il service worker sia "activated"
- ✅ Controlla la cache in DevTools > Application > Cache Storage
- ✅ Assicurati che tutti i file siano stati cached correttamente

### Icone non appaiono correttamente:

- ✅ Verifica che tutti i file icon-*.png esistano
- ✅ Controlla che le dimensioni siano corrette
- ✅ Ricontrolla i path nel manifest.json

## 📚 Risorse Utili

- [Web.dev - PWA](https://web.dev/progressive-web-apps/)
- [MDN - Progressive Web Apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [Google - PWA Checklist](https://web.dev/pwa-checklist/)

## 🚀 Next Steps

Dopo l'installazione puoi:

1. **Usare l'app offline** - Funziona senza internet!
2. **Condividere l'URL** - Altri possono installarla facilmente
3. **Aggiornare l'app** - Modifica i file, aumenta la versione in service-worker.js (CACHE_NAME), e gli utenti riceveranno l'aggiornamento
4. **Pubblicare su store** - Puoi anche creare un'app Android nativa usando TWA (Trusted Web Activity)

## 📝 Note per lo Sviluppo

### Aggiornare la PWA:

Quando modifichi i file dell'app:

1. **Modifica il numero di versione** in `service-worker.js`:
   ```javascript
   const CACHE_NAME = 'omlp-simulator-v2'; // Aumenta il numero
   ```

2. **Ricarica l'app** nel browser
   - Il service worker rileverà la nuova versione
   - Gli utenti vedranno un prompt per aggiornare

### Aggiungere nuovi file:

Se aggiungi nuovi file all'app, aggiornali in `service-worker.js`:

```javascript
const urlsToCache = [
  './',
  './index.html',
  './simulator.js',
  './styles.css',
  './nuovo-file.js', // ← Aggiungi qui
  // ...
];
```

---

**Fatto! 🎉**

Ora la tua app OMLP Simulator può essere installata su Android come una vera app nativa!
