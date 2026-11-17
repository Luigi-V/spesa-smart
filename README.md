# Spesa Smart (PWA offline)

**Spesa Smart** è una Progressive Web App (PWA) per tracciare gli acquisti di alimentari e analizzare prezzi/abitudini nel tempo.  
Funziona **100% offline**: non usa librerie esterne né CDN.

## Pubblicazione su GitHub Pages (root del repository)

1. **Crea un nuovo repository** su GitHub (es. `spesa-smart`).
2. Nel repository, carica **tutti i file** di questa app **nella root** (non dentro sottocartelle extra).
3. Vai su **Settings → Pages**.
4. In **Build and deployment** seleziona:
   - **Source:** *Deploy from a branch*
   - **Branch:** `main`
   - **Folder:** `/ (root)`
5. Salva. Dopo pochi minuti GitHub mostrerà l’URL del sito (es. `https://username.github.io/spesa-smart/`).

## Installazione su Android (Chrome)

1. Apri l’URL su **Chrome**.
2. Se compare il pulsante **“Installa app”** in **Impostazioni → Installa app**, toccalo.
3. In alternativa: menu **⋮** → **“Aggiungi a schermata Home”**.

## Backup e ripristino

### Esporta backup
- Vai in **Impostazioni → Backup → “Esporta backup”**.
- Verrà creato un file JSON: `spesa-smart-backup-YYYY-MM-DD.json`.
- Se supportato, l’app propone la condivisione tramite **Web Share** (utile per salvare su File/Drive); altrimenti parte un **download**.

### Importa backup
- Vai in **Impostazioni → Backup → “Importa backup”** e seleziona un file `.json`.
- Scegli:
  - **Unisci ai dati esistenti** (salta i duplicati per ID)
  - **Sostituisci tutti i dati** (cancella prima i dati correnti)

### Esporta CSV
- In **Impostazioni → Backup → “Esporta CSV”**.
- CSV con separatore **punto e virgola**, BOM UTF‑8 e decimali italiani (virgola).

## Aggiornare l’app (Service Worker)
Quando modifichi i file e pubblichi una nuova versione:
1. Apri `sw.js`
2. Incrementa il nome cache, ad esempio:
   - `spesa-smart-v1` → `spesa-smart-v2`
3. Pubblica su GitHub Pages.
4. Quando l’utente riapre l’app, comparirà il banner **“Nuova versione disponibile”** con pulsante **Aggiorna**.

## Note tecniche
- Dati salvati in **IndexedDB** (`spesaSmart`, versione 1).
- Tutto funziona con percorsi **relativi** per essere compatibile con GitHub Pages in sottopercorso.


## v5
- Fix avvio: separato caricamento IndexedDB dai render per evitare falso toast "Errore caricamento dati.".
- Fix grafici Analisi: roundRect con raggio clampato + render lazy solo quando il tab Analisi è visibile.
- Export backup/CSV più robusto: Web Share API con file e fallback download.
- Fix "Elimina tutti i dati": pulizia completa IndexedDB + reset stato + localStorage.
- Rimossa completamente la modalità "Scontrino rapido".
- Dopo salvataggio acquisto: reset completo form e focus su Prodotto.
- Lista spesa: aggiunto pulsante "Salva" per registrare rapidamente un acquisto dall’elemento.
- Service worker: cache version bump a spesa-smart-v4 e cleanup vecchie cache.


## Versione 6 (v6)
- Fix aggiornamento PWA su GitHub Pages: cache SW aggiornata a `spesa-smart-v6`, precache con `cache: 'reload'`, strategie: network-first per navigazioni e asset .js/.css/.html; cache-first solo per icone/immagini.
- Etichetta visibile in Impostazioni: **Versione 6** (anche in console all'avvio).

### Se l'app mostra ancora la vecchia versione
Su Chrome Android: **Impostazioni sito > Spazio di archiviazione > Cancella e reset**.
Attenzione: questa operazione cancella anche i dati locali. Prima fai **Esporta backup** dall'app.
In alternativa: disinstalla/reinstalla la PWA *solo dopo* aver esportato un backup.


## v7
- Badge versione in header (v7) per verificare subito la build caricata.
- Navigazione tab resa robusta (listener delegato su document in capture, indipendente dal caricamento dati).
- Nessun messaggio generico di errore di avvio mostrato a schermo: eventuali errori finiscono solo in console.
- Service Worker v7: cache `spesa-smart-v7`, pulizia cache vecchie, network-first per HTML/JS/CSS con `cache: 'reload'`, fallback offline.
- Registrazione SW con `updateViaCache: 'none'`.
- Aggiunta pagina `reset.html` per forzare aggiornamento (rimuove SW+Cache, preserva IndexedDB/localStorage).

### Procedura reset (Android Chrome / PWA)
1. Apri: `.../reset.html`
2. Attendi il messaggio: "Aggiornamento forzato completato. I tuoi dati non sono stati toccati."
3. Premi **Apri l'app**.
