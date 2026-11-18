# Spesa Smart (v6)

PWA personale per registrare gli acquisti della spesa e generare la lista automatica.
Tutti i dati restano sul telefono (IndexedDB). Nessun server, nessun login.

## Pubblicazione su GitHub Pages
1. Crea un repository su GitHub.
2. Carica tutti i file nella root del repository (index.html, sw.js, manifest.webmanifest, reset.html, cartelle css, js, icons).
3. Vai su Settings, Pages, scegli branch main e cartella / (root), poi Save.
4. Dopo un minuto l'app è su https://UTENTE.github.io/REPO/

## Installazione su Android
1. Apri l'indirizzo in Chrome.
2. Premi il menu con i tre puntini, poi "Aggiungi a schermata Home" (oppure usa "Installa app" in Impostazioni).
3. Apri l'app almeno una volta con la connessione attiva: poi funziona anche offline.

## Aggiornamenti
A ogni nuova versione incrementa VERSION in sw.js e js/app.js, la versione scritta in index.html
e il parametro ?v= di css e js. L'app si aggiorna da sola alla riapertura con la rete.

## In caso di problemi: reset.html
Apri l'indirizzo dell'app seguito da reset.html. Cancella service worker e cache
senza toccare i dati. Poi premi "Apri l'app".

## Backup
Fai il backup regolarmente da Impostazioni, Esporta backup, e salvalo in File o Drive.
Se cancelli i dati di Chrome o disinstalli l'app, i dati non si recuperano senza backup.
