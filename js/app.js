// Spesa Smart - UI e logica (offline-first, nessuna libreria esterna)
import * as db from './db.js';

const APP_VERSION = 'v8';




// --- Numeri "smart" (virgola/punto) ---
// Accetta sia ',' che '.' come separatore decimale.
// - trim + rimozione spazi
// - accetta ",5" e ".5" come 0.5
// - se presenti più separatori, considera SOLO l'ultimo come decimale e rimuove gli altri
// - ritorna NaN per input non valido


// ------- Backup / restore / CSV -------
function buildBackupPayload(){
  const settingsArr = Array.from(state.settings.entries()).map(([key,value])=>({key,value}));
  return {
    app: 'Spesa Smart',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    purchases: state.purchases,
    products: state.products,
    shoppingList: state.shoppingList,
    settings: settingsArr
  };
}

async function downloadBlobRobust(blob, filename){
  return new Promise((resolve, reject) => {
    try{
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      // Cleanup
      setTimeout(() => {
        try{ a.remove(); }catch(_){}
        try{ URL.revokeObjectURL(url); }catch(_){}
        resolve();
      }, 4000);
    }catch(e){
      reject(e);
    }
  });
}

async function exportBackup(){
  const payload = buildBackupPayload();
  const date = todayISO();
  const filename = `spesa-smart-backup-${date}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });

  try{
    const file = new File([blob], filename, { type:'application/json' });

    // 1) Web Share API con files (PWA Android)
    if (navigator.canShare && navigator.share){
      try{
        if (navigator.canShare({ files:[file] })){
          await navigator.share({ files:[file], title:'Backup Spesa Smart', text:'Backup dati Spesa Smart' });
          await setSetting('lastBackup', new Date().toISOString());
          toast('Backup esportato');
          await refreshAll(false);
          return;
        }
      }catch(e){
        // se l'utente annulla, non è un errore
        if (e && e.name === 'AbortError') return;
        console.warn('Web Share fallito, provo download classico:', e);
      }
    }

    // 2) Fallback download classico
    try{
      await downloadBlobRobust(blob, filename);
      await setSetting('lastBackup', new Date().toISOString());
      toast('Backup esportato');
      await refreshAll(false);
      return;
    }catch(e){
      console.error('Download fallito:', e);
      toast('Esportazione non riuscita.');
    }
  }catch(e){
    console.error(e);
    toast('Esportazione non riuscita.');
  }
}

function validateBackup(obj){
  if (!obj || typeof obj !== 'object') return { ok:false, error:'File non valido.' };
  if (obj.app !== 'Spesa Smart') return { ok:false, error:'Backup non riconosciuto.' };
  if (obj.schemaVersion !== SCHEMA_VERSION) return { ok:false, error:'Versione schema non supportata.' };
  const arrays = ['purchases','products','shoppingList','settings'];
  for (const k of arrays){
    if (!Array.isArray(obj[k])) return { ok:false, error:`Sezione mancante: ${k}` };
  }
  return { ok:true };
}

function sanitizeImported(data){
  const clean = { purchases:[], products:[], shoppingList:[], settings:[] };

  for (const p of data.purchases){
    try{ clean.purchases.push(sanitizePurchase(p)); }catch(e){ /* scarta */ }
  }
  for (const pr of data.products){
    const key = normalizeKey(pr.key || pr.name);
    const name = String(pr.name ?? '').trim().slice(0,80);
    if (!key || !name) continue;
    clean.products.push({
      key,
      name,
      category: CATEGORIES.some(c=>c.name===pr.category) ? pr.category : 'Altro',
      unit: UNITS.includes(pr.unit) ? pr.unit : 'pz',
      synonyms: Array.isArray(pr.synonyms) ? pr.synonyms.filter(x=>typeof x==='string').slice(0,50) : []
    });
  }
  for (const it of data.shoppingList){
    const id = String(it.id ?? '').trim();
    const name = String(it.name ?? '').trim().slice(0,80);
    if (!id || !name) continue;
    clean.shoppingList.push({
      id,
      name,
      category: CATEGORIES.some(c=>c.name===it.category) ? it.category : 'Altro',
      checked: Boolean(it.checked),
      createdAt: Number(it.createdAt)||Date.now()
    });
  }
  for (const st of data.settings){
    const key = String(st.key ?? '').trim();
    if (!key) continue;
    clean.settings.push({ key, value: st.value });
  }
  return clean;
}

async function importBackupFromFile(file){
  const text = await file.text();
  let obj;
  try{ obj = JSON.parse(text); }catch(e){ toast('JSON non valido.'); return; }
  const v = validateBackup(obj);
  if (!v.ok){ toast(v.error); return; }

  const clean = sanitizeImported(obj);

  // scelta merge/replace
  const box = document.createElement('div');
  box.innerHTML = `
    <p>Come vuoi importare il backup?</p>
    <ul>
      <li><b>Unisci</b>: aggiunge i record mancanti, saltando i duplicati.</li>
      <li><b>Sostituisci</b>: cancella i dati attuali e importa tutto.</li>
    </ul>
  `;

  openModal({
    title: 'Importa backup',
    bodyNode: box,
    actions: [
      { text:'Annulla', className:'btn btn--ghost', onClick: ()=>{} },
      { text:'Unisci ai dati esistenti', className:'btn btn--primary', onClick: async () => {
        const res = await db.importAllMerge(clean);
        toast(`Importati: acquisti ${res.imported.purchases}, prodotti ${res.imported.products}, lista ${res.imported.shoppingList}. Saltati: ${res.skipped.purchases}.`);
        await refreshAll();
      }},
      { text:'Sostituisci tutti i dati', className:'btn btn--danger', onClick: async () => {
        const ok = await confirmModal({ title:'Conferma sostituzione', message:'Questa operazione eliminerà tutti i dati correnti. Continuare?', confirmText:'Sì, sostituisci', danger:true });
        if (!ok) return;
        await db.importAllReplace(clean);
        toast('Importazione completata (sostituzione).');
        await refreshAll();
      }, close:false }
    ]
  });
}

function exportCSV(){
  const header = ['Data','Prodotto','Categoria','Quantità','Unità','Prezzo totale (€)','Negozio','Marca','Note','ID scontrino'];
  const rows = [header];

  for (const p of state.purchases.slice().sort((a,b)=> (a.date||'').localeCompare(b.date||''))){
    const price = Number(p.price)||0;
    const qty = Number(p.qty)||0;
    const priceIT = fmtNum2.format(price); // con virgola
    const qtyIT = fmtNum.format(qty);
    rows.push([
      p.date || '',
      p.product || '',
      p.category || '',
      qtyIT,
      p.unit || '',
      priceIT,
      p.store || '',
      p.brand || '',
      (p.notes || '').replaceAll('\n',' '),
      p.receiptId || ''
    ]);
  }

  const sep = ';';
  const csv = rows.map(r => r.map(cell => {
    const s = String(cell ?? '');
    const needs = s.includes(sep) || s.includes('"') || s.includes('\n');
    const esc = s.replaceAll('"','""');
    return needs ? `"${esc}"` : esc;
  }).join(sep)).join('\r\n');

  // UTF-8 BOM
  const blob = new Blob([new Uint8Array([0xEF,0xBB,0xBF]), csv], { type:'text/csv;charset=utf-8' });
  downloadBlob(blob, `spesa-smart-${todayISO()}.csv`);
  toast('CSV esportato.');
}

// ------- Backup reminder banner -------
function daysSince(dateISO){
  const d = new Date(dateISO);
  const today = new Date();
  return Math.floor((today - d) / 86400000);
}

async function maybeShowBackupReminder(){
  const banner = qs('#backupBanner');
  const freq = Number(getSetting('reminderDays', 7) || 7);
  const lastBackup = getSetting('lastBackup', null);
  const snoozeUntil = getSetting('snoozeUntil', null);

  if (state.purchases.length === 0 || !freq){
    banner.classList.add('hidden');
    return;
  }

  const now = new Date();
  if (snoozeUntil && new Date(snoozeUntil) > now){
    banner.classList.add('hidden');
    return;
  }

  const days = lastBackup ? daysSince(lastBackup) : Infinity;
  if (!lastBackup || days >= freq){
    qs('#backupBannerText').textContent = lastBackup
      ? `È passato ${days} giorni dall'ultimo backup.`
      : `Non hai ancora fatto un backup.`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

async function snoozeBackupReminder(){
  const until = new Date(Date.now() + 86400000).toISOString();
  await setSetting('snoozeUntil', until);
  qs('#backupBanner').classList.add('hidden');
  toast('Promemoria rimandato di 1 giorno.');
}

// ------- Install prompt -------
function renderInstallSection(){
  const wrap = qs('#installWrap');
  wrap.innerHTML = '';
  if (state.beforeInstallPrompt){
    const btn = document.createElement('button');
    btn.className = 'btn btn--primary';
    btn.textContent = 'Installa app';
    btn.addEventListener('click', async () => {
      try{
        state.beforeInstallPrompt.prompt();
        await state.beforeInstallPrompt.userChoice;
      }catch(e){}
      state.beforeInstallPrompt = null;
      renderInstallSection();
    });
    wrap.appendChild(btn);
  } else {
    const p = document.createElement('div');
    p.className = 'small muted';
    p.textContent = 'Per installare: apri il menu ⋮ di Chrome e scegli “Aggiungi a schermata Home”.';
    wrap.appendChild(p);
  }
}

// ------- Demo data -------
async function loadDemoData(){
  const ok = await confirmModal({ title:'Carica dati demo', message:'Caricare dati demo? I dati verranno aggiunti a quelli esistenti.', confirmText:'Carica', danger:false });
  if (!ok) return;

  const stores = ['Esselunga','Coop','Lidl','Conad','Carrefour'];
  const prod = [
    ['Latte intero', 'Latticini', 'l', 1],
    ['Yogurt bianco', 'Latticini', 'pz', 2],
    ['Pasta spaghetti', 'Dispensa', 'kg', 0.5],
    ['Riso', 'Dispensa', 'kg', 1],
    ['Pane', 'Pane e cereali', 'kg', 0.6],
    ['Acqua naturale', 'Bevande', 'l', 6],
    ['Caffè macinato', 'Dispensa', 'g', 250],
    ['Mele', 'Frutta e verdura', 'kg', 1.2],
    ['Banane', 'Frutta e verdura', 'kg', 1.1],
    ['Pomodori', 'Frutta e verdura', 'kg', 0.8],
    ['Insalata', 'Frutta e verdura', 'pz', 1],
    ['Petto di pollo', 'Carne e pesce', 'kg', 0.7],
    ['Tonno in scatola', 'Dispensa', 'pz', 4],
    ['Uova', 'Latticini', 'pz', 6],
    ['Olio extravergine', 'Dispensa', 'l', 1],
    ['Detersivo piatti', 'Casa e pulizia', 'ml', 750],
    ['Carta igienica', 'Casa e pulizia', 'pz', 1],
    ['Sapone mani', 'Igiene personale', 'ml', 500],
    ['Shampoo', 'Igiene personale', 'ml', 400],
    ['Gelato', 'Surgelati', 'pz', 1],
    ['Birra', 'Bevande', 'pz', 6],
    ['Sugo pronto', 'Dispensa', 'pz', 1],
    ['Formaggio grana', 'Latticini', 'g', 200],
    ['Prosciutto cotto', 'Carne e pesce', 'g', 150],
    ['Biscotti', 'Dispensa', 'pz', 1],
  ];

  const start = new Date();
  start.setMonth(start.getMonth()-6);
  start.setDate(1);

  const purchases = [];
  for (let m=0;m<6;m++){
    for (const [name,cat,unit,baseQty] of prod){
      // 0..2 acquisti per mese a seconda del prodotto
      const k = normalizeKey(name);
      const times = (['Latte intero','Pane','Acqua naturale','Mele','Banane','Pomodori','Insalata','Uova'].includes(name)) ? 2 : 1;
      for (let t=0;t<times;t++){
        const d = new Date(start.getFullYear(), start.getMonth()+m, 1);
        d.setDate(1 + Math.floor(Math.random()*27));
        const date = d.toISOString().slice(0,10);
        const store = stores[Math.floor(Math.random()*stores.length)];
        const qty = baseQty * (times===2 ? (t===0?1:1) : 1);
        // prezzi realistici
        const priceBase = {
          'l': 1.65,
          'kg': 2.20,
          'g': 0.0045,
          'ml': 0.0022,
          'pz': 2.50
        }[unit] || 2.0;
        const noise = 0.85 + Math.random()*0.35;
        const price = Math.max(0.3, qty * priceBase * noise);

        purchases.push({
          id: uuid(),
          product: name,
          productKey: k,
          category: cat,
          qty: roundQty(qty, unit),
          unit,
          price: roundMoney(price),
          date,
          store,
          brand: '',
          notes: '',
          receiptId: null,
          createdAt: Date.now() - Math.floor(Math.random()*1e9)
        });
      }
    }
  }

  // Inserisci nel DB
  for (const p of purchases){
    await db.put('purchases', p);
    await upsertProductFromPurchase(p);
  }

  toast(`Dati demo caricati: ${purchases.length} acquisti.`);
  await refreshAll();
}

function roundMoney(n){ return Math.round((Number(n) + 1e-9) * 100) / 100; }
function roundQty(q, unit){
  const n = Number(q);
  if (!Number.isFinite(n)) return 1;
  if (unit === 'g' || unit === 'ml') return Math.round(n);
  if (unit === 'kg' || unit === 'l') return Math.round(n*1000)/1000;
  return Math.round(n);
}


// ------- Salva da lista (modal) -------
let _saveItemCtx = null; // { type:'auto'|'manual', keyOrId }

function openSaveItemModal(ctx){
  _saveItemCtx = ctx;
  const m = qs('#saveItemModal');
  if (!m) return;

  // fill selects
  fillCategorySelect(qs('#siCategory'));
  fillUnitSelect(qs('#siUnit'));

  qs('#siDate').value = todayISO();

  m.classList.remove('hidden');
  qs('#siProduct')?.focus();
}

function closeSaveItemModal(){
  const m = qs('#saveItemModal');
  if (!m) return;
  m.classList.add('hidden');
  _saveItemCtx = null;
}

function prefillSaveItemModalFromAuto(productKey){
  const it = computeAutoShopping().find(x => x.productKey === productKey);
  const last = state.purchases.find(p => p.productKey === productKey);
  qs('#siProduct').value = it ? it.name : (last?.product || '');
  qs('#siCategory').value = (last?.category || it?.category || CATEGORIES[0].name);
  qs('#siUnit').value = (last?.unit || it?.unit || 'pz');
  qs('#siQty').value = String(last?.qty ?? 1);
  qs('#siPrice').value = (Number.isFinite(last?.price) ? String(last.price).replace('.', ',') : '');
  qs('#siStore').value = (last?.store || '');
}

function prefillSaveItemModalFromManual(id){
  const it = state.shoppingList.find(x => x.id === id);
  const key = productKeyFromName(it?.name || '');
  const last = state.purchases.find(p => p.productKey === key);
  qs('#siProduct').value = it?.name || '';
  qs('#siCategory').value = (last?.category || CATEGORIES[0].name);
  qs('#siUnit').value = (last?.unit || 'pz');
  qs('#siQty').value = String(last?.qty ?? 1);
  qs('#siPrice').value = (Number.isFinite(last?.price) ? String(last.price).replace('.', ',') : '');
  qs('#siStore').value = (last?.store || '');
}

async function savePurchaseFromSaveItemModal(){
  const product = qs('#siProduct').value.trim();
  const category = qs('#siCategory').value;
  const unit = qs('#siUnit').value;
  const qty = parseSmartNumber(qs('#siQty').value);
  const price = parseSmartNumber(qs('#siPrice').value);
  const date = qs('#siDate').value || todayISO();
  const store = qs('#siStore').value.trim();

  if (!product) throw new Error('Inserisci il prodotto.');
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('Quantità non valida.');
  if (!Number.isFinite(price) || price < 0) throw new Error('Prezzo non valido.');

  const p = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    product,
    productKey: productKeyFromName(product),
    category,
    qty,
    unit,
    price,
    date,
    store,
    brand: '',
    notes: '',
    receiptId: null
  };

  await db.put('purchases', p);

  // mark checked
  if (_saveItemCtx?.type === 'auto'){
    await setAutoChecked(p.productKey, true);
  } else if (_saveItemCtx?.type === 'manual'){
    const it = state.shoppingList.find(x => x.id === _saveItemCtx.id);
    if (it){
      it.checked = true;
      await db.put('shoppingList', it);
    }
  }

  state.analysisDirty = true;
  toast('Acquisto salvato');
  closeSaveItemModal();
  await refreshAll();
}

// ------- Wipe all data -------
async function wipeAll(){
  const ok1 = await confirmModal({ title:'Elimina tutti i dati', message:'Questa operazione eliminerà TUTTI i dati (acquisti, prodotti, lista, impostazioni). Continuare?', confirmText:'Continua', danger:true });
  if (!ok1) return;
  const ok2 = await confirmModal({ title:'Conferma finale', message:'Sei sicuro? Non è possibile annullare.', confirmText:'Sì, elimina tutto', danger:true });
  if (!ok2) return;

  try{
    await db.withTx(['purchases','products','shoppingList','settings'], 'readwrite', async (s) => {
      await Promise.all([
        new Promise((res,rej)=>{ const r=s.purchases.clear(); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }),
        new Promise((res,rej)=>{ const r=s.products.clear(); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }),
        new Promise((res,rej)=>{ const r=s.shoppingList.clear(); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }),
        new Promise((res,rej)=>{ const r=s.settings.clear(); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); })
      ]);
    });

    // reset stato in memoria
    state.purchases = [];
    state.products = [];
    state.shoppingList = [];
    state.settings = new Map();
    state.knownStores = [];
    state.analysisDirty = true;

    // pulizia eventuali chiavi localStorage usate
    try{
      for (const k of Object.keys(localStorage)){
        if (k.startsWith('spesa-smart') || k.startsWith('spesaSmart')) localStorage.removeItem(k);
      }
    }catch(_){}

    safeRender('datalists', () => refreshDatalists());
    safeRender('monthSummary', () => computeMonthSummary());
    safeRender('lastPurchases', () => renderLastPurchases());
    safeRender('shoppingList', () => renderShoppingList());
    safeRender('history', () => renderHistory());
    safeRender('settings', () => renderSettings());

    toast('Tutti i dati sono stati eliminati');
  }catch(e){
    console.error('Errore wipeAll:', e);
    toast('Errore eliminazione dati.');
  }
}

// ------- Navigation -------
function showTab(tab){
  qsa('.tab').forEach(t => t.classList.add('hidden'));
  const target = qs(`#tab-${tab}`);
  if (!target){
    console.warn('Tab non trovata:', tab);
    return;
  }
  target.classList.remove('hidden');
  qsa('.tabbtn').forEach(b => b.classList.toggle('is-active', b.dataset.go===tab));
  // per accessibilità: scroll top della pagina
  window.scrollTo({ top:0, behavior:'instant' });
}

function initNav(){
  // Event delegation: robusto anche se l'init dei dati fallisce o se i bottoni vengono ricreati.
  const nav = qs('.bottombar');
  if (nav && !nav.dataset.bound){
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.tabbtn');
      if (!btn) return;
      const tab = btn.dataset.go;
      if (tab) showTab(tab);
    });
    nav.dataset.bound = '1';
  }

  const quick = qs('#btnQuickAdd');
  if (quick && !quick.dataset.bound){
    quick.addEventListener('click', () => showTab('registra'));
    quick.dataset.bound = '1';
  }
}

// ------- Refresh all UI -------
async function refreshAll(renderEverything=true){
  await loadAll();
  state.analysisDirty = true;
  refreshDatalists();
  computeMonthSummary();
  renderLastPurchases();

  // Shopping
  if (renderEverything) renderShoppingList();

  // History
  // fill history category select
  const hCat = qs('#hCategory');
  hCat.innerHTML = '<option value="__all__">Tutte</option>';
  for (const c of CATEGORIES){
    const o = document.createElement('option'); o.value=c.name; o.textContent=c.name;
    hCat.appendChild(o);
  }
  applyHistoryFilters();  // settings info
  const last = getSetting('lastBackup', null);
  const purchasesCount = state.purchases.length;
  qs('#backupInfo').textContent = `Ultimo backup: ${last ? new Date(last).toLocaleString('it-IT') : 'mai'} • Acquisti: ${purchasesCount}`;

  // reminder select
  const rd = qs('#reminderDays');
  rd.value = String(getSetting('reminderDays', 7) || 7);

  await initStorageInfo();
  await maybeShowBackupReminder();

  qs('#appVersion') && (qs('#appVersion').textContent = 'Versione 6');
}

// ------- Init -------
async function init(){
  // Storage persistence request on startup (best effort)
  try{
    const ok = await navigator.storage?.persist?.();
    // non invadente: non mostra toast qui
    void ok;
  }catch(e){}

  await initServiceWorker();

  // install prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.beforeInstallPrompt = e;
    renderInstallSection();
  });
  renderInstallSection();

  // base selects
  fillCategorySelect(qs('#pCategory'));
  fillUnitSelect(qs('#pUnit'));
  fillCategorySelect(qs('#mCategory'));

  qs('#pDate').value = todayISO(); 
  
  // azioni lista spesa (delegation) - bottone Salva
  const autoWrap = qs('#shoppingAuto');
  if (autoWrap && !autoWrap.dataset.boundSave){
    autoWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-save-item]');
      if (!btn) return;
      const key = btn.getAttribute('data-save-item');
      prefillSaveItemModalFromAuto(key);
      openSaveItemModal({ type:'auto', productKey:key });
    });
    autoWrap.dataset.boundSave = '1';
  }
  const manualWrap = qs('#shoppingManual');
  if (manualWrap && !manualWrap.dataset.boundSave){
    manualWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-save-manual]');
      if (!btn) return;
      const id = btn.getAttribute('data-save-manual');
      prefillSaveItemModalFromManual(id);
      openSaveItemModal({ type:'manual', id });
    });
    manualWrap.dataset.boundSave = '1';
  }

  // modal salva da lista
  qs('#btnSaveItemCancel')?.addEventListener('click', closeSaveItemModal);
  qs('#saveItemModal')?.addEventListener('click', (e) => {
    if (e.target && e.target.getAttribute && e.target.getAttribute('data-close')==='1') closeSaveItemModal();
  });
  qs('#saveItemForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try{ await savePurchaseFromSaveItemModal(); }
    catch(err){ toast(err?.message || 'Errore nel salvataggio.'); }
  });

// azioni lista "Ultimi acquisti" (delegation)
  const lastWrap = qs('#lastPurchases');
  if (lastWrap && !lastWrap.dataset.bound){
    lastWrap.addEventListener('click', (e) => {
      const delBtn = e.target.closest('button[data-del]');
      if (!delBtn) return;
      const id = delBtn.getAttribute('data-del');
      if (id) deletePurchase(id);
    });
    lastWrap.dataset.bound = '1';
  }

  // single form listeners
  qs('#pProduct').addEventListener('input', updateProductHint);
  qs('#pQty').addEventListener('input', updateUnitPriceAndBadge);
  qs('#pPrice').addEventListener('input', updateUnitPriceAndBadge);
  qs('#pUnit').addEventListener('change', updateUnitPriceAndBadge);

  qs('#singleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try{ await saveSingleFromForm(); }
    catch(err){ toast(err?.message || 'Errore nel salvataggio.'); }
  });
  qs('#btnSingleReset').addEventListener('click', () => clearSingleForm(true));
  // shopping list
  qs('#manualForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try{
      await addManualItem(qs('#mName').value, qs('#mCategory').value);
      qs('#mName').value = '';
    }catch(err){ toast(err?.message || 'Errore'); }
  });
  qs('#btnClearChecked').addEventListener('click', removeCheckedManual);
  qs('#btnShareList').addEventListener('click', shareShoppingList);
  qs('#filterNeed').addEventListener('click', () => { state.filterShoppingAll=false; qs('#filterNeed').classList.add('is-active'); qs('#filterAll').classList.remove('is-active'); renderShoppingList(); });
  qs('#filterAll').addEventListener('click', () => { state.filterShoppingAll=true; qs('#filterAll').classList.add('is-active'); qs('#filterNeed').classList.remove('is-active'); renderShoppingList(); });

  // history
  qs('#btnApplyHistory').addEventListener('click', applyHistoryFilters);
  qs('#btnResetHistory').addEventListener('click', () => {
    qs('#hSearch').value = '';
    qs('#hCategory').value = '__all__';
    qs('#hStore').value = '';
    qs('#hFrom').value = '';
    qs('#hTo').value = '';
    applyHistoryFilters();
  });
  qs('#btnLoadMore').addEventListener('click', () => { state.historyPage++; renderHistory(); });

  // analysis product selector
  window.addEventListener('resize', () => {
    renderAnalysis();
    renderSelectedProductAnalysis();
  });

  // settings
  qs('#btnExportBackup').addEventListener('click', exportBackup);
  qs('#btnImportBackup').addEventListener('click', () => qs('#fileImport').click());
  qs('#fileImport').addEventListener('change', async () => {
    const file = qs('#fileImport').files?.[0];
    qs('#fileImport').value = '';
    if (!file) return;
    await importBackupFromFile(file);
  });
  qs('#btnExportCSV').addEventListener('click', exportCSV);

  qs('#reminderDays').addEventListener('change', async () => {
    await setSetting('reminderDays', Number(qs('#reminderDays').value));
    toast('Impostazione salvata.');
    await maybeShowBackupReminder();
  });

  qs('#btnRequestPersist').addEventListener('click', requestPersistence);

  qs('#btnLoadDemo').addEventListener('click', loadDemoData);
  qs('#btnWipeAll').addEventListener('click', wipeAll);

  // backup banner actions
  qs('#backupBannerDo').addEventListener('click', exportBackup);
  qs('#backupBannerLater').addEventListener('click', snoozeBackupReminder);
  qs('#backupBannerClose').addEventListener('click', () => qs('#backupBanner').classList.add('hidden'));

  // modal close
  qs('#modalClose').addEventListener('click', closeModal);
  qs('#modal').addEventListener('click', (e) => {
    const t = e.target;
    if (t?.dataset?.close) closeModal();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !qs('#modal').classList.contains('hidden')) closeModal();
  });

  // Nav deve funzionare anche se il caricamento dati fallisce
  initNav();

  // Caricamento DB separato dal rendering: mostra errore SOLO se IndexedDB fallisce davvero
  try{ await loadAll(); }
  catch(e){
    console.error('Errore IndexedDB (loadAll):', e);
    // v7: non mostrare errori di avvio a schermo
    /* no toast */
    // comunque proviamo a inizializzare la UI minima
  }

  // Render steps isolati: un errore di rendering non deve mostrare l'errore di caricamento dati
  safeRender('datalists', () => refreshDatalists());
  safeRender('monthSummary', () => computeMonthSummary());
  safeRender('lastPurchases', () => renderLastPurchases());
  safeRender('shoppingList', () => renderShoppingList());
  safeRender('history', () => renderHistory());
  safeRender('settings', () => renderSettings());

  // start on Registra
  showTab('registra');
}

init().catch((e) => {
  console.error(e);
  // Non mostrare toast generico: log only
});