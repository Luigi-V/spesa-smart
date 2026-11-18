# Spesa Smart (v5)

PWA offline per registrare acquisti, gestire la lista e mantenere uno storico.

## Pubblicazione su GitHub Pages
1. Metti tutti i file dell'app nella **radice** del repository.
2. Vai su **Settings → Pages**.
3. Seleziona **Branch: main** e **/ (root)**.

L’app è pensata per funzionare anche pubblicata in una **sottocartella** (tutti i percorsi sono relativi `./`).

## Installazione su Android
In Chrome:
1. apri il sito
2. menu ⋮
3. **Aggiungi a schermata Home**

## reset.html
Apri `reset.html` per rimuovere **service worker** e **cache** dell’app (non tocca i dati in IndexedDB).
Poi premi **Apri l'app**.

## Backup
Consiglio: esporta backup regolari dalle Impostazioni e conservali fuori dal telefono.

## Regola versione
A ogni nuova versione incrementare `VERSION` in:
- `index.html` (risorse con `?v=...` e testo versione)
- `js/app.js` (costante `VERSION`)
- `sw.js` (costante `VERSION` e nome cache)


Versione 5
