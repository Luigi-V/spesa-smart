// Spesa Smart - UI e logica (offline-first, nessuna libreria esterna)
import * as db from './db.js';

const APP_VERSION = 'v10';


/* v7: navigazione a tab robusta (delegata, indipendente dal DB) */
(function bindTabNavigationEarly(){
  try{
    document.addEventListener('click', (ev) => {
      try{
        const btn = ev.target?.closest?.('.tabbtn');
        if (!btn) return;
        const tab = btn.dataset?.go;
        if (!tab) return;
        ev.preventDefault?.();
        // non dipendere da variabili globali: usa dataset/id presenti in index.html
        const tabs = document.querySelectorAll?.('section.tab') || [];
        for (const s of tabs){
          const isTarget = (s.dataset?.tab === tab) || (s.id === 'tab-' + tab);
          if (isTarget) s.classList?.remove?.('hidden');
          else s.classList?.add?.('hidden');
        }
        const btns = document.querySelectorAll?.('.tabbtn') || [];
        for (const b of btns){
          const on = b.dataset?.go === tab;
          if (on) b.classList?.add?.('is-active'); else b.classList?.remove?.('is-active');
        }
        // prova a chiamare eventuale renderer se esiste (wrap try/catch)
        try{
          if (tab === 'registra' && typeof renderRegistra === 'function') renderRegistra();
          if (tab === 'lista' && typeof renderLista === 'function') renderLista();
          if (tab === 'storico' && typeof renderStorico === 'function') renderStorico();
          if (tab === 'impostazioni' && typeof renderImpostazioni === 'function') renderImpostazioni();
        }catch(e){
          console.error('Errore render tab:', tab, e);
        }
      }catch(e){
        console.error('Errore click nav:', e);
      }
    }, { capture:true });
  }catch(e){
    console.error('Errore bindTabNavigationEarly:', e);
  }
})();

const SCHEMA_VERSION = 1;

const CATEGORIES = [
  { name: 'Frutta e verdura', color: '#22c55e' },
  { name: 'Carne e pesce', color: '#ef4444' },
  { name: 'Latticini', color: '#60a5fa' },
  { name: 'Pane e cereali', color: '#f59e0b' },
  { name: 'Bevande', color: '#06b6d4' },
  { name: 'Surgelati', color: '#38bdf8' },
  { name: 'Dispensa', color: '#a78bfa' },
  { name: 'Casa e pulizia', color: '#10b981' },
  { name: 'Igiene personale', color: '#f472b6' },
  { name: 'Altro', color: '#94a3b8' }
];

const UNITS = ['pz','kg','g','l','ml'];

const fmtEUR = new Intl.NumberFormat('it-IT', { style:'currency', currency:'EUR' });
const fmtNum = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 3 });
const fmtNum2 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtQty3Input(n){
  const x = Number(n);
  if (!Number.isFinite(x)) return '';
  // usa formattazione it-IT con max 3 decimali, senza forzare zeri
  return fmtNum.format(x);
}


function safeRender(name, fn){
  try{ fn(); }
  catch(e){ console.error(`Errore rendering (${name}):`, e); }
}

function safeRenderAll(){
  // Re-render senza reload DB: usato per aggiornamenti immediati UI (es. delete con undo)
  try{
    state.analysisDirty = true;
    computeMonthSummary();
    renderLastPurchases();
    renderShoppingList();
    renderHistory();
    renderInstallSection();
  }catch(e){
    console.error('Errore safeRenderAll:', e);
  }
}

function qs(sel, root=document){ return root.querySelector(sel); }
function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }


function safeBind(sel, event, handler, opts){
  const el = typeof sel === 'string' ? qs(sel) : sel;
  if (!el){
    console.warn('[bind] elemento mancante:', sel);
    return false;
  }
  el.addEventListener(event, handler, opts);
  return true;
}

function escapeHTML(s){
  return String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function todayISO(){
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0,10);
}

function toDDMMYYYY(iso){
  if (!iso) return '—';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function parseDecimalIT(s){
  if (typeof s !== 'string') s = String(s ?? '');
  // Accetta sia "," che "." come separatore decimale (identici).
  // Rimuove spazi; se ci sono più punti, mantiene solo l'ultimo come separatore decimale.
  let cleaned = s.trim().replace(/\s+/g, '').replaceAll(',', '.');
  if (!cleaned) return NaN;
  // consenti ".5" / ",5"
  if (cleaned.startsWith('.')) cleaned = '0' + cleaned;
  // se ci sono più ".", tieni solo l'ultima come separatore decimale
  const lastDot = cleaned.lastIndexOf('.');
  if (lastDot !== -1) {
    const intPart = cleaned.slice(0, lastDot).replaceAll('.', '');
    const fracPart = cleaned.slice(lastDot + 1).replaceAll('.', '');
    cleaned = intPart + '.' + fracPart;
  }
  // valida (solo cifre e al massimo un punto)
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function parseSmartNumber(s){
  // Alias compatibile: stesso comportamento di parseDecimalIT (virgola/punto, spazi, migliaia)
  return parseDecimalIT(s);
}

function normalizeKey(name){
  return String(name ?? '').trim().toLowerCase();
}

function uuid(){
  // semplice ID unico: timestamp + random
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
}

function catColor(name){
  return (CATEGORIES.find(c => c.name === name) || CATEGORIES.at(-1)).color;
}

function unitPriceNormalized(priceTotal, qty, unit){
  // Normalizzazione: g -> €/kg, ml -> €/l, altrimenti €/unità della unit selezionata
  if (!Number.isFinite(priceTotal) || !Number.isFinite(qty) || qty <= 0) return NaN;
  const price = priceTotal / qty;
  if (unit === 'g') return price * 1000;     // €/kg
  if (unit === 'ml') return price * 1000;    // €/l
  return price;
}

function unitLabel(unit){
  if (unit === 'g') return '€/kg';
  if (unit === 'ml') return '€/l';
  return `€/${unit}`;
}

function daysBetween(aISO, bISO){
  const a = new Date(aISO + 'T00:00:00');
  const b = new Date(bISO + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

function addDays(iso, days){
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function safeText(el, text){ el.textContent = String(text ?? ''); }

const state = {
  analysisDirty: true,

  purchases: [],
  products: [],
  shoppingList: [],
  settings: new Map(),
  knownStores: [],
  mode: 'single',
  historyPage: 1,
  historyPageSize: 50,
  historyFiltered: [],
  beforeInstallPrompt: null,
  swWaiting: null,
  filterShoppingAll: false
};

// ------- Toast -------
function toast(msg, ms=2600){
  const wrap = qs('#toastWrap');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 250ms';
  }, ms-250);
  setTimeout(() => el.remove(), ms);


function toastWithAction(message, actionText, actionFn, duration=5000){
  const wrap = qs('#toastWrap');
  if (!wrap){ toast(message); return; }
  const div = document.createElement('div');
  div.className = 'toast';
  div.innerHTML = `
    <div class="toast__row">
      <div class="toast__msg">${escapeHTML(message)}</div>
      <button class="toast__action" type="button">${escapeHTML(actionText || 'OK')}</button>
    </div>
  `;
  const btn = div.querySelector('button');
  btn.addEventListener('click', async () => {
    try{ await actionFn?.(); }catch(e){ console.error(e); }
    div.remove();
  });
  wrap.appendChild(div);
  setTimeout(() => div.remove(), duration);
}
}

// ------- Modal -------
function openModal({title, bodyNode, actions=[]}){
  const modal = qs('#modal');
  safeText(qs('#modalTitle'), title);
  const body = qs('#modalBody');
  body.innerHTML = '';
  body.appendChild(bodyNode);

  const foot = qs('#modalFoot');
  foot.innerHTML = '';
  for (const a of actions){
    const b = document.createElement('button');
    b.className = a.className || 'btn btn--ghost';
    b.type = 'button';
    b.textContent = a.text;
    b.addEventListener('click', async () => {
      try{
        const res = await a.onClick?.();
        if (a.close !== false) closeModal();
        return res;
      }catch(e){
        console.error(e);
        toast('Errore: ' + (e?.message || 'operazione non riuscita'));
      }
    });
    foot.appendChild(b);
  }

  modal.classList.remove('hidden');
  qs('#modalClose').focus();
}

function closeModal(){
  qs('#modal').classList.add('hidden');
  qs('#modalBody').innerHTML = '';
  qs('#modalFoot').innerHTML = '';
}

function confirmModal({title, message, confirmText='Conferma', danger=false}){
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.innerHTML = `<p>${escapeHTML(message)}</p>`;
    openModal({
      title,
      bodyNode: box,
      actions: [
        { text:'Annulla', className:'btn btn--ghost', onClick: () => resolve(false) },
        { text: confirmText, className: danger ? 'btn btn--danger' : 'btn btn--primary', onClick: () => resolve(true) }
      ]
    });
  });
}

// ------- Service Worker registration & updates -------
async function initServiceWorker(){
  if (!('serviceWorker' in navigator)) return;
  try{
    const reg = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    // ascolta nuovi SW in attesa
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller){
          state.swWaiting = reg.waiting;
          showUpdateBanner(reg);
        }
      });
    });

    // se già in waiting
    if (reg.waiting && navigator.serviceWorker.controller){
      state.swWaiting = reg.waiting;
      showUpdateBanner(reg);
    }

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }catch(e){
    console.error(e);
  }
}

function showUpdateBanner(reg){
  const banner = qs('#updateBanner');
  banner.classList.remove('hidden');
  qs('#btnUpdateNow').onclick = () => {
    try{
      reg.waiting?.postMessage({ type:'SKIP_WAITING' });
    }catch(e){ console.error(e); }
  };
  qs('#btnUpdateDismiss').onclick = () => banner.classList.add('hidden');
}

// ------- Persistence / storage info -------
async function initStorageInfo(){
  const infoEl = qs('#storageInfo');
  try{
    const persisted = await navigator.storage?.persisted?.();
    const est = await navigator.storage?.estimate?.();
    const used = est?.usage ?? 0;
    const quota = est?.quota ?? 0;
    safeText(infoEl, `Archiviazione persistente: ${persisted ? 'Sì' : 'No'} • Spazio usato: ${formatBytes(used)} su ${formatBytes(quota)}`);
  }catch(e){
    safeText(infoEl, 'Informazioni memoria non disponibili su questo dispositivo.');
  }
}

function formatBytes(b){
  if (!Number.isFinite(b) || b <= 0) return '0 B';
  const u = ['B','KB','MB','GB'];
  let i=0, n=b;
  while(n>=1024 && i<u.length-1){ n/=1024; i++; }
  return `${n.toFixed(i===0?0:1)} ${u[i]}`;
}

async function requestPersistence(){
  try{
    const ok = await navigator.storage?.persist?.();
    toast(ok ? 'Archiviazione persistente concessa.' : 'Archiviazione persistente non concessa.');
    await initStorageInfo();
    return ok;
  }catch(e){
    toast('Impossibile richiedere archiviazione persistente.');
    return false;
  }
}

// ------- Data loading -------
async function loadAll(){
  const all = await db.exportAll();
  state.purchases = (all.purchases || []).slice().sort((a,b) => (b.date||'').localeCompare(a.date||'') || (b.createdAt||0)-(a.createdAt||0));
  state.products = (all.products || []).slice().sort((a,b) => (a.name||'').localeCompare(b.name||''));
  state.shoppingList = (all.shoppingList || []).slice().sort((a,b) => (b.createdAt||0)-(a.createdAt||0));
  state.settings = new Map((all.settings || []).map(s => [s.key, s.value]));
  state.knownStores = Array.from(new Set(state.purchases.map(p => p.store).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
}

function getSetting(key, fallback){
  return state.settings.has(key) ? state.settings.get(key) : fallback;
}
async function setSetting(key, value){
  state.settings.set(key, value);
  await db.put('settings', { key, value });
}

// ------- UI init helpers -------
function fillCategorySelect(sel){
  sel.innerHTML = '';
  for (const c of CATEGORIES){
    const o = document.createElement('option');
    o.value = c.name;
    o.textContent = c.name;
    sel.appendChild(o);
  }
}

function fillUnitSelect(sel){
  sel.innerHTML = '';
  for (const u of UNITS){
    const o = document.createElement('option');
    o.value = u;
    o.textContent = u;
    sel.appendChild(o);
  }
}

function fillDatalist(el, values){
  el.innerHTML = '';
  for (const v of values){
    const o = document.createElement('option');
    o.value = v;
    el.appendChild(o);
  }
}

function refreshDatalists(){
  const dlProducts = qs('#dlProducts');
  const names = state.products.map(p => p.name).filter(Boolean);
  fillDatalist(dlProducts, names);

  const dlStores = qs('#dlStores');
  fillDatalist(dlStores, state.knownStores);
}

function computeMonthSummary(){
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const sum = state.purchases
    .filter(p => (p.date||'').startsWith(ym))
    .reduce((acc,p) => acc + (Number(p.price)||0), 0);
  safeText(qs('#monthSummary'), `Spesa del mese: ${fmtEUR.format(sum)}`);
}

function renderLastPurchases(){
  const wrap = qs('#lastPurchases');
  wrap.innerHTML = '';
  const items = state.purchases.slice(0,8);
  if (items.length === 0){
    wrap.innerHTML = '<div class="small muted">Nessun acquisto registrato.</div>';
    return;
  }
  for (const p of items){
    const unitP = unitPriceNormalized(Number(p.price), Number(p.qty), p.unit);
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <div class="item__top">
        <div>
          <div class="item__title"><span class="dot" style="background:${catColor(p.category)}"></span>${escapeHTML(p.product)}</div>
          <div class="item__meta">${escapeHTML(toDDMMYYYY(p.date))} • ${escapeHTML(p.store || '—')} • ${escapeHTML(p.qty)} ${escapeHTML(p.unit)} • ${escapeHTML(fmtEUR.format(Number(p.price)||0))}</div>
          <div class="item__meta">Prezzo unitario: ${Number.isFinite(unitP) ? escapeHTML(fmtNum2.format(unitP)) + ' ' + escapeHTML(unitLabel(p.unit)) : '—'}</div>
        </div>
        <div class="item__actions">
          <button class="iconbtn iconbtn--danger" type="button" data-del="${escapeHTML(p.id)}" aria-label="Elimina acquisto" title="Elimina" style="width:40px;height:40px">🗑️</button>
        </div>
      </div>
    `;
    wrap.appendChild(div);
  }
}

// ------- Product hints and badge -------
function productHistory(productKey){
  const list = state.purchases.filter(p => p.productKey === productKey).slice().sort((a,b)=> (b.date||'').localeCompare(a.date||''));
  return list;
}

function avgUnitPrice(productKey){
  const h = productHistory(productKey);
  const vals = h.map(p => unitPriceNormalized(Number(p.price), Number(p.qty), p.unit)).filter(Number.isFinite);
  if (vals.length === 0) return NaN;
  return vals.reduce((a,b)=>a+b,0) / vals.length;
}

function updateUnitPriceAndBadge(){
  const qty = parseDecimalIT(qs('#pQty').value);
  const price = parseDecimalIT(qs('#pPrice').value);
  const unit = qs('#pUnit').value;
  const pill = qs('#unitPricePill');
  const badge = qs('#priceBadge');

  const u = unitPriceNormalized(price, qty, unit);
  if (!Number.isFinite(u)){
    safeText(pill, 'Prezzo unitario: —');
    badge.classList.add('hidden');
    return;
  }
  safeText(pill, `Prezzo unitario: ${fmtNum2.format(u)} ${unitLabel(unit)}`);

  const key = normalizeKey(qs('#pProduct').value);
  const avg = avgUnitPrice(key);
  if (!Number.isFinite(avg) || avg <= 0){
    badge.classList.remove('hidden');
    badge.className = 'badge badge--na';
    badge.textContent = 'Nessun confronto';
    return;
  }
  const diff = (u - avg) / avg;
  badge.classList.remove('hidden');
  if (diff < -0.05){
    badge.className = 'badge badge--ok';
    badge.textContent = 'Buon prezzo';
  } else if (diff > 0.05){
    badge.className = 'badge badge--bad';
    badge.textContent = 'Sopra la media';
  } else {
    badge.className = 'badge badge--mid';
    badge.textContent = 'In media';
  }
}

function updateProductHint(){
  const name = qs('#pProduct').value;
  const key = normalizeKey(name);
  const hint = qs('#productHint');
  hint.textContent = '';
  if (!key) return;

  const known = state.products.find(p => p.key === key);
  const hist = productHistory(key);
  if (known){
    // Autofill
    if (qs('#pCategory').value !== known.category) qs('#pCategory').value = known.category;
    if (qs('#pUnit').value !== known.unit) qs('#pUnit').value = known.unit;
  }

  if (hist.length > 0){
    const last = hist[0];
    const avg = avgUnitPrice(key);
    const lastU = unitPriceNormalized(Number(last.price), Number(last.qty), last.unit);
    const parts = [];
    parts.push(`Ultimo acquisto: ${toDDMMYYYY(last.date)}${last.store ? ' • ' + last.store : ''} • ${fmtEUR.format(Number(last.price)||0)}`);
    if (Number.isFinite(lastU)) parts.push(`Ultimo prezzo unitario: ${fmtNum2.format(lastU)} ${unitLabel(last.unit)}`);
    if (Number.isFinite(avg)) parts.push(`Media storica: ${fmtNum2.format(avg)} ${unitLabel(last.unit)}`);
    hint.textContent = parts.join(' | ');
    if (last.brand && !qs('#pBrand').value) qs('#pBrand').value = last.brand;
  }

  updateUnitPriceAndBadge();
}

// ------- Save purchase -------
function sanitizePurchase(raw){
  const product = String(raw.product ?? '').trim();
  const productKey = normalizeKey(product);
  const category = CATEGORIES.some(c=>c.name===raw.category) ? raw.category : 'Altro';
  const unit = UNITS.includes(raw.unit) ? raw.unit : 'pz';
  const qty = Number(raw.qty);
  const price = Number(raw.price);
  const date = String(raw.date ?? '').slice(0,10);
  const store = String(raw.store ?? '').trim().slice(0,60);
  const brand = String(raw.brand ?? '').trim().slice(0,60);
  const notes = String(raw.notes ?? '').trim().slice(0,220);
  const receiptId = raw.receiptId ?? null;

  if (!productKey) throw new Error('Prodotto mancante.');
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('Quantità non valida.');
  if (!Number.isFinite(price) || price < 0) throw new Error('Prezzo non valido.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Data non valida.');

  return {
    id: raw.id || uuid(),
    product,
    productKey,
    category,
    qty,
    unit,
    price,
    date,
    store: store || '',
    brand: brand || '',
    notes: notes || '',
    receiptId,
    createdAt: raw.createdAt || Date.now()
  };
}

async function upsertProductFromPurchase(p){
  const key = p.productKey;
  const existing = state.products.find(x => x.key === key);
  const rec = {
    key,
    name: p.product,
    category: p.category,
    unit: p.unit,
    synonyms: existing?.synonyms || []
  };
  await db.put('products', rec);
}

function clearSingleForm(keepDate=true){
  qs('#pProduct').value = '';
  qs('#pStore').value = '';
  qs('#pBrand').value = '';
  qs('#pNotes').value = '';
  qs('#pQty').value = '';
  qs('#pPrice').value = '';
  qs('#productHint').textContent = '';
  qs('#priceBadge').classList.add('hidden');
  safeText(qs('#unitPricePill'), 'Prezzo unitario: —');
  if (!keepDate) qs('#pDate').value = todayISO();
}

async function saveSingleFromForm(){
  const raw = {
    product: qs('#pProduct').value,
    category: qs('#pCategory').value,
    qty: parseDecimalIT(qs('#pQty').value),
    unit: qs('#pUnit').value,
    price: parseDecimalIT(qs('#pPrice').value),
    date: qs('#pDate').value,
    store: qs('#pStore').value,
    brand: qs('#pBrand').value,
    notes: qs('#pNotes').value,
    receiptId: null
  };
  const p = sanitizePurchase(raw);
  await db.put('purchases', p);
  await upsertProductFromPurchase(p);

  // Se era stato spuntato un auto-item, e ora c'è un acquisto più recente, reset automatico
  const checkedAuto = getSetting('checkedAuto', {});
  if (checkedAuto && checkedAuto[p.productKey]){
    const checkedDate = checkedAuto[p.productKey];
    if (checkedDate && p.date > checkedDate){
      delete checkedAuto[p.productKey];
      await setSetting('checkedAuto', checkedAuto);
    }
  }

  toast('Acquisto salvato');
    clearSingleForm(true);
    qs('#pProduct')?.focus();
    await refreshAll();
  clearSingleForm(true);
}

// ------- Shopping list (automatic + manual) -------
function computeAutoShopping(){
  // raggruppa per prodotto e calcola intervalli medi tra date distinte
  const byKey = new Map();
  for (const p of state.purchases){
    if (!p.productKey) continue;
    if (!byKey.has(p.productKey)) byKey.set(p.productKey, []);
    byKey.get(p.productKey).push(p);
  }
  const checkedAuto = getSetting('checkedAuto', {}) || {};
  const today = todayISO();
  const out = [];

  for (const [key, list] of byKey.entries()){
    // date distinte (desc)
    const dates = Array.from(new Set(list.map(x => x.date))).sort().reverse();
    const last = list.slice().sort((a,b)=> (b.date||'').localeCompare(a.date||''))[0];
    const lastDate = dates[0];
    const unitPList = list.map(p => unitPriceNormalized(Number(p.price), Number(p.qty), p.unit)).filter(Number.isFinite);
    const minUnitP = unitPList.length ? Math.min(...unitPList) : NaN;

    // cheapest store by avg unit price
    const byStore = new Map();
    for (const p of list){
      if (!p.store) continue;
      const u = unitPriceNormalized(Number(p.price), Number(p.qty), p.unit);
      if (!Number.isFinite(u)) continue;
      if (!byStore.has(p.store)) byStore.set(p.store, []);
      byStore.get(p.store).push(u);
    }
    let cheapestStore = '';
    let cheapestAvg = Infinity;
    for (const [st, arr] of byStore.entries()){
      const avg = arr.reduce((a,b)=>a+b,0)/arr.length;
      if (avg < cheapestAvg){ cheapestAvg = avg; cheapestStore = st; }
    }

    let status = 'Dati insufficienti';
    let statusColor = 'grey';
    let avgInterval = NaN;
    let nextDate = '';
    let delta = NaN;

    if (dates.length >= 2){
      const intervals = [];
      for (let i=dates.length-1;i>=1;i--){
        const newer = dates[i-1];
        const older = dates[i];
        intervals.push(daysBetween(older, newer));
      }
      avgInterval = Math.round(intervals.reduce((a,b)=>a+b,0)/intervals.length);
      avgInterval = clamp(avgInterval, 1, 365);
      nextDate = addDays(lastDate, avgInterval);
      delta = daysBetween(today, nextDate); // negativo se in ritardo (today > next)
      if (delta < 0){ status = 'In ritardo'; statusColor = 'red'; }
      else if (delta <= 3){ status = 'A breve'; statusColor = 'orange'; }
      else { status = 'Ok'; statusColor = 'green'; }
    }

    const checkedDate = checkedAuto[key] || null;
    const checked = Boolean(checkedDate && lastDate <= checkedDate);

    out.push({
      productKey: key,
      name: last.product,
      category: last.category,
      unit: last.unit,
      lastDate,
      nextDate,
      delta,
      status,
      statusColor,
      lastPrice: Number(last.price)||0,
      cheapestStore,
      minUnitP,
      checked
    });
  }

  // ordinamento: in ritardo -> a breve -> ok -> insufficienti, poi per categoria, poi nome
  const order = {'In ritardo':0,'A breve':1,'Ok':2,'Dati insufficienti':3};
  out.sort((a,b)=> (order[a.status]-order[b.status]) || (a.category.localeCompare(b.category)) || a.name.localeCompare(b.name));
  return out;
}

function renderShoppingList(){
  const autoWrap = qs('#shoppingAuto');
  const manualWrap = qs('#shoppingManual');
  autoWrap.innerHTML = '';
  manualWrap.innerHTML = '';

  const auto = computeAutoShopping();
  const showAll = state.filterShoppingAll;

  const neededAuto = auto.filter(it => it.status==='In ritardo' || it.status==='A breve' || it.status==='Dati insufficienti' ? true : showAll);
  const neededManual = state.shoppingList.filter(it => showAll ? true : (!it.checked));

  // counters
  const counters = { late:0, soon:0, ok:0 };
  for (const it of auto){
    if (it.status==='In ritardo') counters.late++;
    else if (it.status==='A breve') counters.soon++;
    else if (it.status==='Ok') counters.ok++;
  }
  qs('#autoCounters').innerHTML = `
    <div class="counter" style="border-color:rgba(220,38,38,0.35)">In ritardo: <b>${counters.late}</b></div>
    <div class="counter" style="border-color:rgba(245,158,11,0.35)">A breve: <b>${counters.soon}</b></div>
    <div class="counter" style="border-color:rgba(22,163,74,0.35)">Ok: <b>${counters.ok}</b></div>
  `;

  // group by category
  const grouped = new Map();
  for (const it of neededAuto){
    if (!grouped.has(it.category)) grouped.set(it.category, []);
    grouped.get(it.category).push(it);
  }

  for (const [cat, items] of grouped.entries()){
    const h = document.createElement('div');
    h.className = 'small muted';
    h.style.marginTop = '6px';
    h.textContent = cat;
    autoWrap.appendChild(h);

    for (const it of items){
      const div = document.createElement('div');
      div.className = 'item';
      const deltaTxt = (!it.nextDate || !Number.isFinite(it.delta))
        ? '—'
        : (it.delta < 0 ? `da ${Math.abs(it.delta)} giorni` : `tra ${it.delta} giorni`);

      const statusStyle = it.statusColor==='red' ? 'badge badge--bad'
        : it.statusColor==='orange' ? 'badge badge--mid'
        : it.statusColor==='green' ? 'badge badge--ok'
        : 'badge badge--na';

      const minTxt = Number.isFinite(it.minUnitP) ? `${fmtNum2.format(it.minUnitP)} ${unitLabel(it.unit)}` : '—';

      div.innerHTML = `
        <div class="item__top">
          <div>
            <div class="item__title"><span class="dot" style="background:${catColor(it.category)}"></span>${escapeHTML(it.name)}</div>
            <div class="item__meta">Ultimo acquisto: ${escapeHTML(toDDMMYYYY(it.lastDate))} • Prossimo: ${it.nextDate ? escapeHTML(toDDMMYYYY(it.nextDate)) : '—'} (${escapeHTML(deltaTxt)})</div>
            <div class="item__meta">Ultimo prezzo: ${escapeHTML(fmtEUR.format(it.lastPrice))} • Negozio più conveniente: ${escapeHTML(it.cheapestStore || '—')} • Min unitario: ${escapeHTML(minTxt)}</div>
          </div>
          <div class="item__actions">
            <button class="btn btn--ghost btn--mini" type="button" data-save-item="${escapeHTML(it.productKey)}" style="min-height:40px">Salva</button>
            <span class="${statusStyle}" style="align-self:flex-start">${escapeHTML(it.status)}</span>
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <label class="row" style="gap:8px">
            <input type="checkbox" ${it.checked ? 'checked' : ''} data-auto-check="${escapeHTML(it.productKey)}" />
            <span class="small">Spuntato</span>
          </label>
        </div>
      `;
      autoWrap.appendChild(div);
    }
  }

  if (neededAuto.length === 0){
    autoWrap.innerHTML = '<div class="small muted">Nessun elemento automatico da mostrare.</div>';
  }

  // manual
  if (neededManual.length === 0){
    manualWrap.innerHTML = '<div class="small muted">Nessuna voce manuale.</div>';
  } else {
    for (const it of neededManual){
      const div = document.createElement('div');
      div.className = 'item';
      div.innerHTML = `
        <div class="item__top">
          <div>
            <div class="item__title"><span class="dot" style="background:${catColor(it.category)}"></span>${escapeHTML(it.name)}</div>
            <div class="item__meta">Creato: ${escapeHTML(new Date(it.createdAt).toLocaleDateString('it-IT'))}</div>
          </div>
          <div class="item__actions">
            <button class="btn btn--ghost" type="button" data-manual-del="${escapeHTML(it.id)}">Elimina</button>
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <label class="row" style="gap:8px">
            <input type="checkbox" ${it.checked ? 'checked' : ''} data-manual-check="${escapeHTML(it.id)}" />
            <span class="small">Spuntato</span>
          </label>
        </div>
      `;
      manualWrap.appendChild(div);
    }
  }

  // attach handlers
  qsa('input[data-auto-check]').forEach(cb => {
    cb.addEventListener('change', async () => {
      const key = cb.getAttribute('data-auto-check');
      const checkedAuto = getSetting('checkedAuto', {}) || {};
      if (cb.checked) checkedAuto[key] = todayISO();
      else delete checkedAuto[key];
      await setSetting('checkedAuto', checkedAuto);
      toast(cb.checked ? 'Elemento spuntato.' : 'Spunta rimossa.');
      renderShoppingList();
    });
  });

  qsa('input[data-manual-check]').forEach(cb => {
    cb.addEventListener('change', async () => {
      const id = cb.getAttribute('data-manual-check');
      const it = state.shoppingList.find(x => x.id === id);
      if (!it) return;
      it.checked = cb.checked;
      await db.put('shoppingList', it);
      await refreshAll(false);
      toast(cb.checked ? 'Voce spuntata.' : 'Spunta rimossa.');
    });
  });

  qsa('button[data-manual-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-manual-del');
      const ok = await confirmModal({ title:'Elimina voce', message:'Vuoi eliminare questa voce manuale?', confirmText:'Elimina', danger:true });
      if (!ok) return;
      await db.del('shoppingList', id);
      toast('Voce eliminata.');
      await refreshAll();
    });
  });
}

async function addManualItem(name, category){
  const it = {
    id: uuid(),
    name: String(name).trim().slice(0,80),
    category,
    checked: false,
    createdAt: Date.now()
  };
  if (!it.name) throw new Error('Nome mancante.');
  await db.put('shoppingList', it);
  toast('Voce aggiunta.');
  await refreshAll();
}

async function removeCheckedManual(){
  const ok = await confirmModal({ title:'Rimuovi spuntati', message:'Rimuovere tutte le voci manuali spuntate?', confirmText:'Rimuovi', danger:true });
  if (!ok) return;
  const checked = state.shoppingList.filter(x => x.checked);
  for (const it of checked) await db.del('shoppingList', it.id);
  toast(`Rimosse ${checked.length} voci.`);
  await refreshAll();
}

async function shareShoppingList(){
  const auto = computeAutoShopping();
  const manual = state.shoppingList.filter(x => !x.checked);
  const lines = [];
  lines.push('Lista della spesa - Spesa Smart');
  lines.push('');
  const needAuto = auto.filter(it => it.status==='In ritardo' || it.status==='A breve' || it.status==='Dati insufficienti');
  if (needAuto.length){
    lines.push('Automatici:');
    for (const it of needAuto){
      lines.push(`- ${it.name} (${it.category})`);
    }
    lines.push('');
  }
  if (manual.length){
    lines.push('Manuali:');
    for (const it of manual){
      lines.push(`- ${it.name} (${it.category})`);
    }
  }
  const text = lines.join('\n');

  try{
    if (navigator.share){
      await navigator.share({ text, title: 'Lista della spesa' });
      toast('Lista condivisa.');
      return;
    }
  }catch(e){ /* utente ha annullato */ }

  try{
    await navigator.clipboard.writeText(text);
    toast('Lista copiata negli appunti.');
  }catch(e){
    toast('Impossibile condividere o copiare.');
  }
}

// ------- History -------
function applyHistoryFilters(){
  const search = normalizeKey(qs('#hSearch').value);
  const category = qs('#hCategory').value;
  const store = normalizeKey(qs('#hStore').value);
  const from = qs('#hFrom').value;
  const to = qs('#hTo').value;

  let list = state.purchases.slice();

  if (search){
    list = list.filter(p => {
      const blob = normalizeKey([p.product,p.brand,p.notes,p.store].join(' '));
      return blob.includes(search);
    });
  }
  if (category && category !== '__all__'){
    list = list.filter(p => p.category === category);
  }
  if (store){
    list = list.filter(p => normalizeKey(p.store).includes(store));
  }
  if (from) list = list.filter(p => (p.date||'') >= from);
  if (to) list = list.filter(p => (p.date||'') <= to);

  state.historyFiltered = list.sort((a,b)=> (b.date||'').localeCompare(a.date||'') || (b.createdAt||0)-(a.createdAt||0));
  state.historyPage = 1;
  renderHistory();
}

function renderHistory(){
  const wrap = qs('#historyList');
  wrap.innerHTML = '';

  const totalCount = state.historyFiltered.length;
  const slice = state.historyFiltered.slice(0, state.historyPage * state.historyPageSize);
  const totalSpent = slice.reduce((a,p)=>a+(Number(p.price)||0),0);
  safeText(qs('#historyStats'), `Risultati: ${totalCount} • Totale (pagina): ${fmtEUR.format(totalSpent)}`);

  if (slice.length === 0){
    wrap.innerHTML = '<div class="small muted">Nessun risultato.</div>';
  } else {
    for (const p of slice){
      const u = unitPriceNormalized(Number(p.price), Number(p.qty), p.unit);
      const div = document.createElement('div');
      div.className = 'item';
      div.innerHTML = `
        <div class="item__top">
          <div>
            <div class="item__title"><span class="dot" style="background:${catColor(p.category)}"></span>${escapeHTML(p.product)}</div>
            <div class="item__meta">${escapeHTML(toDDMMYYYY(p.date))} • ${escapeHTML(p.store || '—')} • ${escapeHTML(p.qty)} ${escapeHTML(p.unit)} • ${escapeHTML(fmtEUR.format(Number(p.price)||0))}</div>
            <div class="item__meta">Prezzo unitario: ${Number.isFinite(u) ? escapeHTML(fmtNum2.format(u)) + ' ' + escapeHTML(unitLabel(p.unit)) : '—'}</div>
          </div>
          <div class="item__actions">
            <button class="btn btn--ghost" type="button" data-edit="${escapeHTML(p.id)}">Modifica</button>
            <button class="btn btn--ghost" type="button" data-del="${escapeHTML(p.id)}">Elimina</button>
          </div>
        </div>
      `;
      wrap.appendChild(div);
    }
  }

  qs('#btnLoadMore').style.display = (slice.length < totalCount) ? 'inline-flex' : 'none';

  qsa('button[data-del]').forEach(btn => btn.addEventListener('click', () => deletePurchase(btn.getAttribute('data-del'))));
  qsa('button[data-edit]').forEach(btn => btn.addEventListener('click', () => editPurchase(btn.getAttribute('data-edit'))));
}

async function deletePurchase(id){
  const pid = String(id);
  const p = state.purchases.find(x => String(x.id) === pid) || await db.get('purchases', id);
  if (!p){
    toast('Acquisto non trovato.');
    return;
  }
  const msg = `${p.product || '—'}
${toDDMMYYYY(p.date)} • ${fmtEUR.format(Number(p.price)||0)}`;
  const ok = await confirmModal({ title:'Elimina acquisto', message: msg, confirmText:'Elimina', danger:true });
  if (!ok) return;

  // snapshot per undo
  const snapshot = { ...p };

  // 1) rimozione immediata UI (in-memory) + render
  state.purchases = state.purchases.filter(x => String(x.id) !== pid);
  safeRenderAll();

  // 2) Toast con undo: ripristina memoria + DB e re-render
  toastWithAction('Acquisto eliminato', 'Annulla', async () => {
    // evita duplicati se l'utente ha già ripristinato
    if (!state.purchases.some(x => String(x.id) === pid)){
      state.purchases.unshift(snapshot);
    }
    try{
      await db.put('purchases', snapshot);
      toast('Operazione annullata.');
    }catch(e){
      console.error('Undo delete failed:', e);
      toast('Impossibile annullare (errore DB).');
    }
    safeRenderAll();
  }, 5200);

  // 3) elimina da DB in background
  try{
    await db.del('purchases', id);
  }catch(e){
    console.error('DB delete failed:', e);
    toast('Errore eliminazione. Ricarico…');
    setTimeout(() => location.reload(), 1000);
  }
}


function buildEditForm(p){
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <form class="form" id="editForm">
      <label class="field"><span class="field__label">Prodotto</span><input class="input" name="product" required maxlength="80" value="${escapeHTML(p.product)}"/></label>
      <div class="grid2">
        <label class="field"><span class="field__label">Categoria</span><select class="select" name="category"></select></label>
        <label class="field"><span class="field__label">Negozio</span><input class="input" name="store" maxlength="60" value="${escapeHTML(p.store||'')}"/></label>
      </div>
      <div class="grid3">
        <label class="field"><span class="field__label">Quantità</span><input class="input" name="qty" inputmode="decimal" required value="${escapeHTML(fmtQty3Input(p.qty))}"/></label>
        <label class="field"><span class="field__label">Unità</span><select class="select" name="unit"></select></label>
        <label class="field"><span class="field__label">Prezzo totale (€)</span><input class="input" name="price" inputmode="decimal" required value="${escapeHTML(fmtNum2.format(Number(p.price)||0))}"/></label>
      </div>
      <div class="grid2">
        <label class="field"><span class="field__label">Data</span><input class="input" name="date" type="date" required value="${escapeHTML(p.date)}"/></label>
        <label class="field"><span class="field__label">Marca</span><input class="input" name="brand" maxlength="60" value="${escapeHTML(p.brand||'')}"/></label>
      </div>
      <label class="field"><span class="field__label">Note</span><textarea class="textarea" name="notes" rows="2" maxlength="220">${escapeHTML(p.notes||'')}</textarea></label>
    </form>
  `;
  const catSel = qs('select[name="category"]', wrap);
  fillCategorySelect(catSel);
  catSel.value = p.category;
  const unitSel = qs('select[name="unit"]', wrap);
  fillUnitSelect(unitSel);
  unitSel.value = p.unit;
  return wrap;
}

async function editPurchase(id){
  const p = state.purchases.find(x => x.id === id);
  if (!p){ toast('Acquisto non trovato.'); return; }
  const body = buildEditForm(p);

  openModal({
    title: 'Modifica acquisto',
    bodyNode: body,
    actions: [
      { text:'Annulla', className:'btn btn--ghost', onClick: ()=>{} },
      { text:'Salva', className:'btn btn--primary', onClick: async () => {
        const f = qs('#editForm', body);
        const upd = {
          ...p,
          product: f.product.value,
          productKey: normalizeKey(f.product.value),
          category: f.category.value,
          store: f.store.value,
          qty: parseDecimalIT(f.qty.value),
          unit: f.unit.value,
          price: parseDecimalIT(f.price.value),
          date: f.date.value,
          brand: f.brand.value,
          notes: f.notes.value
        };
        const clean = sanitizePurchase(upd);
        await db.put('purchases', clean);
        await upsertProductFromPurchase(clean);
        toast('Modifica salvata.');
        await refreshAll();
      }}
    ]
  });
}

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
  applyHistoryFilters();

  // settings info
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