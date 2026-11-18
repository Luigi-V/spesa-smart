'use strict';
/* Spesa Smart – app.js */
const VERSION = 6;

/* ===================== NUMERI ===================== */
function parseNumber(str) {
  if (typeof str === 'number') return isFinite(str) ? str : NaN;
  if (str === null || str === undefined) return NaN;
  let s = String(str).replace(/\s+/g, '');
  if (s === '') return NaN;
  if (!/^[+-]?[\d.,]+$/.test(s)) return NaN;
  let sign = 1;
  if (s[0] === '-' || s[0] === '+') {
    if (s[0] === '-') sign = -1;
    s = s.slice(1);
  }
  const last = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  let intPart = s;
  let frac = '';
  if (last >= 0) {
    intPart = s.slice(0, last).replace(/[.,]/g, '');
    frac = s.slice(last + 1);
  }
  if (intPart === '' && frac === '') return NaN;
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(frac)) return NaN;
  const n = parseFloat((intPart || '0') + (frac ? '.' + frac : ''));
  return isFinite(n) ? sign * n : NaN;
}

/* ===================== COSTANTI ===================== */
const CATEGORIES = ['Frutta e verdura', 'Carne e pesce', 'Latticini', 'Pane e cereali', 'Bevande', 'Surgelati',
  'Dispensa', 'Casa e pulizia', 'Igiene personale', 'Altro'];
const DEFAULT_CATEGORY = 'Altro';
const UNITS = ['pz', 'kg', 'g', 'l', 'ml'];
const DB_NAME = 'spesaSmartDB';
const STORES = ['purchases', 'listItems', 'settings', 'synonyms'];
const EUR = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

const state = { purchases: [], listItems: [], settings: {}, synonyms: [] };
const ui = { listFilter: 'all', storicoLimit: 100, prefillKey: '', bannerDismissed: false, saving: false };
let db = null;
let deferredInstall = null;

/* ===================== UTILITÀ ===================== */
function $(id) { return document.getElementById(id); }
function on(id, evt, fn) { const e = $(id); if (e) e.addEventListener(evt, fn); }
function setVal(id, v) { const e = $(id); if (e) e.value = v; }
function getVal(id) { const e = $(id); return e ? e.value : ''; }
function setText(id, t) { const e = $(id); if (e) e.textContent = t; }
function pad(n) { return String(n).padStart(2, '0'); }
function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function keyOf(s) { return String(s || '').toLowerCase().trim().replace(/\s+/g, ' '); }
function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
function normCat(c) { return CATEGORIES.indexOf(c) >= 0 ? c : DEFAULT_CATEGORY; }
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
function fmtNum(n) { return String(Math.round(n * 10000) / 10000).replace('.', ','); }
function fmtPrice(n) { return Number(n).toFixed(2).replace('.', ','); }
function fmtMoney(n) { return EUR.format(n); }
function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1).replace('.', ',') + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1).replace('.', ',') + ' MB';
  return (b / 1073741824).toFixed(1).replace('.', ',') + ' GB';
}
function upsert(arr, rec, k) {
  const key = k || 'id';
  const i = arr.findIndex(x => x[key] === rec[key]);
  if (i >= 0) arr[i] = rec; else arr.push(rec);
}
function safe(p) { Promise.resolve(p).catch(e => console.error(e)); }

/* ===================== DATE ===================== */
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function isValidDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1900 || y > 2100) return false;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}
function dayNum(s) {
  const p = s.split('-').map(Number);
  return Date.UTC(p[0], p[1] - 1, p[2]) / 86400000;
}
function ymdFromDayNum(n) {
  const d = new Date(n * 86400000);
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}
function fmtDate(s) {
  if (!isValidDate(s)) return String(s || '');
  return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
}
function fmtDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/* ===================== PREZZO UNITARIO ===================== */
function unitPrice(qty, unit, price) {
  let q = qty, label = unit;
  if (unit === 'g') { q = qty / 1000; label = 'kg'; }
  else if (unit === 'ml') { q = qty / 1000; label = 'l'; }
  if (!(q > 0) || !isFinite(price)) return null;
  return { value: price / q, label: label };
}
function fmtUnitPrice(u) { return u ? EUR.format(u.value) + '/' + u.label : ''; }

/* ===================== TOAST ===================== */
let toastTimer = null;
function toast(msg, opt) {
  const box = $('toastBox');
  if (!box) return;
  clearTimeout(toastTimer);
  box.innerHTML = '';
  const t = document.createElement('div');
  t.className = 'toast' + (opt && opt.kind ? ' ' + opt.kind : '');
  const sp = document.createElement('span');
  sp.textContent = msg;
  t.appendChild(sp);
  if (opt && opt.action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = opt.action.label;
    b.addEventListener('click', () => {
      clearTimeout(toastTimer);
      box.innerHTML = '';
      try { opt.action.fn(); } catch (e) { console.error(e); }
    });
    t.appendChild(b);
  }
  box.appendChild(t);
  toastTimer = setTimeout(() => { box.innerHTML = ''; }, (opt && opt.duration) || 3000);
}

/* ===================== MODAL (unico gestore, a Promise) ===================== */
let modalQueue = Promise.resolve();
function openModal(opts) {
  const p = modalQueue.then(() => showModal(opts));
  modalQueue = p.then(() => undefined, () => undefined);
  return p;
}
function showModal(o) {
  return new Promise(resolve => {
    const root = $('modalRoot');
    if (!root) { resolve({ ok: false, value: null }); return; }
    const back = document.createElement('div');
    back.className = 'modal-back';
    const box = document.createElement('div');
    box.className = 'modal';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.innerHTML = '<h2>' + esc(o.title || '') + '</h2><div class="modal-body">' + (o.body || '') + '</div>' +
      '<div class="modal-actions"><button type="button" class="btn" data-act="cancel">' + esc(o.cancelLabel || 'Annulla') + '</button>' +
      '<button type="button" class="btn ' + (o.danger ? 'danger' : 'primary') + '" data-act="ok">' + esc(o.okLabel || 'Conferma') + '</button></div>';
    back.appendChild(box);
    root.appendChild(back);
    document.body.classList.add('modal-open');
    let done = false;
    function close(res) {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey);
      back.remove();
      if (!root.querySelector('.modal-back')) document.body.classList.remove('modal-open');
      resolve(res);
    }
    function onKey(e) { if (e.key === 'Escape') close({ ok: false, value: null }); }
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', e => { if (e.target === back) close({ ok: false, value: null }); });
    box.addEventListener('click', e => {
      const b = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!b) return;
      const act = b.getAttribute('data-act');
      if (act === 'cancel') { close({ ok: false, value: null }); return; }
      if (act === 'ok') {
        if (o.validate) {
          let err = null;
          try { err = o.validate(box); } catch (ex) { console.error(ex); err = 'Dati non validi'; }
          if (err) { toast(err, { kind: 'error' }); return; }
        }
        let value = true;
        try { value = o.collect ? o.collect(box) : true; } catch (ex) { console.error(ex); close({ ok: false, value: null }); return; }
        close({ ok: true, value: value });
      }
    });
    if (o.onOpen) { try { o.onOpen(box); } catch (ex) { console.error(ex); } }
  });
}
function confirmBox(title, bodyHtml, okLabel, danger) {
  return openModal({ title: title, body: bodyHtml, okLabel: okLabel || 'Conferma', danger: !!danger })
    .then(r => r.ok);
}

/* ===================== DATABASE ===================== */
function openDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('IndexedDB non disponibile')); return; }
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('purchases')) {
        const s = d.createObjectStore('purchases', { keyPath: 'id' });
        s.createIndex('date', 'date');
        s.createIndex('productKey', 'productKey');
        s.createIndex('store', 'store');
      }
      if (!d.objectStoreNames.contains('listItems')) d.createObjectStore('listItems', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' });
      if (!d.objectStoreNames.contains('synonyms')) d.createObjectStore('synonyms', { keyPath: 'alias' });
    };
    r.onsuccess = () => {
      const d = r.result;
      d.onversionchange = () => { d.close(); db = null; };
      d.onclose = () => { db = null; };
      resolve(d);
    };
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('Database bloccato'));
  });
}
async function ensureDB() {
  if (!db) db = await openDB();
  return db;
}
async function dbWrite(ops) {
  if (!ops.length) return;
  await ensureDB();
  const names = Array.from(new Set(ops.map(o => o.store)));
  await new Promise((resolve, reject) => {
    const t = db.transaction(names, 'readwrite');
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transazione annullata'));
    try {
      ops.forEach(o => {
        const s = t.objectStore(o.store);
        if (o.clear) s.clear();
        else if (Object.prototype.hasOwnProperty.call(o, 'del')) s.delete(o.del);
        else s.put(o.put);
      });
    } catch (e) {
      try { t.abort(); } catch (x) { /* ignora */ }
      reject(e);
    }
  });
}
async function loadAll() {
  await ensureDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORES, 'readonly');
    const out = {};
    STORES.forEach(n => {
      const r = t.objectStore(n).getAll();
      r.onsuccess = () => { out[n] = r.result; };
    });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Lettura annullata'));
  });
}
async function reloadState() {
  const out = await loadAll();
  state.purchases = out.purchases || [];
  state.listItems = out.listItems || [];
  state.synonyms = out.synonyms || [];
  state.settings = {};
  (out.settings || []).forEach(s => { if (s && typeof s.key === 'string') state.settings[s.key] = s.value; });
}
function getSetting(k, def) {
  return Object.prototype.hasOwnProperty.call(state.settings, k) ? state.settings[k] : def;
}
async function setSetting(k, v) {
  try { await dbWrite([{ store: 'settings', put: { key: k, value: v } }]); }
  catch (e) { console.error(e); toast("Impossibile salvare l'impostazione", { kind: 'error' }); return false; }
  state.settings[k] = v;
  renderAll();
  return true;
}

/* ===================== ACQUISTI: LOGICA ===================== */
function cmpPurchase(a, b) {
  return String(b.date).localeCompare(String(a.date)) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
}
function sortedPurchases() { return state.purchases.slice().sort(cmpPurchase); }
function purchasesOf(key) { return state.purchases.filter(p => p.productKey === key).sort(cmpPurchase); }
function lastPurchase(key) { return purchasesOf(key)[0] || null; }
function avgUnitPrice(key, label) {
  let sum = 0, n = 0;
  state.purchases.forEach(p => {
    if (p.productKey !== key) return;
    const u = unitPrice(p.qty, p.unit, p.price);
    if (u && u.label === label) { sum += u.value; n++; }
  });
  return n ? sum / n : null;
}
function buildPurchase(v) {
  const product = String(v.product || '').trim().replace(/\s+/g, ' ');
  if (!product) return { error: 'Inserisci il nome del prodotto' };
  const qty = parseNumber(v.qty);
  if (!(qty > 0)) return { error: 'La quantità deve essere maggiore di zero' };
  const price = parseNumber(v.price);
  if (!(price >= 0)) return { error: 'Inserisci un prezzo valido (0 o più)' };
  if (!isValidDate(v.date)) return { error: 'Data non valida' };
  return {
    data: {
      product: product,
      productKey: keyOf(product),
      category: normCat(v.category),
      qty: Math.round(qty * 10000) / 10000,
      unit: UNITS.indexOf(v.unit) >= 0 ? v.unit : 'pz',
      price: round2(price),
      date: v.date,
      store: String(v.store || '').trim(),
      brand: String(v.brand || '').trim(),
      notes: String(v.notes || '').trim()
    }
  };
}
function makePurchase(data, old) {
  const now = new Date().toISOString();
  return Object.assign({
    id: old ? old.id : uid(),
    receiptId: old && old.receiptId !== undefined ? old.receiptId : null,
    createdAt: old ? old.createdAt : now,
    updatedAt: now
  }, data);
}
async function storePurchase(p, extras, noReset) {
  const list = (extras || []).slice();
  const aid = 'auto:' + p.productKey;
  if (!noReset && !list.some(x => x.id === aid)) {
    const ex = state.listItems.find(i => i.id === aid);
    if (ex && (ex.checked || ex.hiddenUntilPurchase)) list.push({ id: aid, checked: false, hiddenUntilPurchase: false });
  }
  const ops = [{ store: 'purchases', put: p }].concat(list.map(r => ({ store: 'listItems', put: r })));
  try { await dbWrite(ops); } catch (e) { console.error(e); return false; }
  upsert(state.purchases, p);
  list.forEach(r => upsert(state.listItems, r));
  renderAll();
  return true;
}
async function askDeletePurchase(id) {
  const p = state.purchases.find(x => x.id === id);
  if (!p) return;
  const ok = await confirmBox("Eliminare l'acquisto?",
    '<p><strong>' + esc(p.product) + '</strong><br>' + esc(fmtDate(p.date)) + ' · ' + esc(fmtMoney(p.price)) + '</p>',
    'Elimina', true);
  if (!ok) return;
  try { await dbWrite([{ store: 'purchases', del: p.id }]); }
  catch (e) { console.error(e); toast("Impossibile eliminare l'acquisto", { kind: 'error' }); return; }
  state.purchases = state.purchases.filter(x => x.id !== p.id);
  renderAll();
  toast('Acquisto eliminato', { duration: 5000, action: { label: 'Annulla', fn: () => safe(undoDeletePurchase(p)) } });
}
async function undoDeletePurchase(p) {
  try { await dbWrite([{ store: 'purchases', put: p }]); }
  catch (e) { console.error(e); toast("Impossibile ripristinare l'acquisto", { kind: 'error' }); return; }
  upsert(state.purchases, p);
  renderAll();
  toast('Acquisto ripristinato');
}

/* ===================== FORM ACQUISTO (modal) ===================== */
function optionsHtml(list, sel) {
  return list.map(x => '<option value="' + esc(x) + '"' + (x === sel ? ' selected' : '') + '>' + esc(x) + '</option>').join('');
}
function formHtml(v) {
  return '<div class="form">' +
    '<label class="field">Prodotto *<input name="product" type="text" list="dl-products" autocomplete="off" value="' + esc(v.product) + '"></label>' +
    '<label class="field">Categoria<select name="category">' + optionsHtml(CATEGORIES, normCat(v.category)) + '</select></label>' +
    '<div class="grid2">' +
    '<label class="field">Quantità *<input name="qty" type="text" inputmode="decimal" value="' + esc(v.qty) + '"></label>' +
    '<label class="field">Unità<select name="unit">' + optionsHtml(UNITS, v.unit) + '</select></label>' +
    '</div>' +
    '<label class="field">Prezzo totale € *<input name="price" type="text" inputmode="decimal" value="' + esc(v.price) + '"></label>' +
    '<label class="field">Data acquisto *<input name="date" type="date" value="' + esc(v.date) + '"></label>' +
    '<label class="field">Negozio<input name="store" type="text" list="dl-stores" autocomplete="off" value="' + esc(v.store) + '"></label>' +
    '<label class="field">Marca<input name="brand" type="text" autocomplete="off" value="' + esc(v.brand) + '"></label>' +
    '<label class="field">Note<input name="notes" type="text" autocomplete="off" value="' + esc(v.notes) + '"></label>' +
    '</div>';
}
function readForm(box) {
  const g = n => { const e = box.querySelector('[name="' + n + '"]'); return e ? e.value : ''; };
  return { product: g('product'), category: g('category'), qty: g('qty'), unit: g('unit'), price: g('price'),
    date: g('date'), store: g('store'), brand: g('brand'), notes: g('notes') };
}
function purchaseModal(title, okLabel, v) {
  return openModal({
    title: title,
    body: formHtml(v),
    okLabel: okLabel,
    validate: box => buildPurchase(readForm(box)).error || null,
    collect: box => buildPurchase(readForm(box)).data
  });
}
async function editPurchase(id) {
  const p = state.purchases.find(x => x.id === id);
  if (!p) return;
  const r = await purchaseModal('Modifica acquisto', 'Salva', {
    product: p.product, category: p.category, qty: fmtNum(p.qty), unit: p.unit, price: fmtPrice(p.price),
    date: p.date, store: p.store || '', brand: p.brand || '', notes: p.notes || ''
  });
  if (!r.ok) return;
  const ok = await storePurchase(makePurchase(r.value, p), [], true);
  if (ok) toast('Acquisto aggiornato');
  else toast("Impossibile aggiornare l'acquisto", { kind: 'error' });
}

/* ===================== REGISTRA ===================== */
function readReg() {
  return { product: getVal('f-product'), category: getVal('f-category'), qty: getVal('f-qty'), unit: getVal('f-unit'),
    price: getVal('f-price'), date: getVal('f-date'), store: getVal('f-store'), brand: getVal('f-brand'), notes: getVal('f-notes') };
}
function resetRegForm() {
  setVal('f-product', '');
  setVal('f-category', DEFAULT_CATEGORY);
  setVal('f-qty', '1');
  setVal('f-unit', 'pz');
  setVal('f-price', '');
  setVal('f-date', todayStr());
  setVal('f-store', '');
  setVal('f-brand', '');
  setVal('f-notes', '');
  ui.prefillKey = '';
  refreshRegHints();
  const p = $('f-product');
  if (p) p.focus();
}
function maybePrefill() {
  const key = keyOf(getVal('f-product'));
  const last = key ? lastPurchase(key) : null;
  if (!last) { ui.prefillKey = ''; return; }
  if (ui.prefillKey === key) return;
  ui.prefillKey = key;
  setVal('f-category', normCat(last.category));
  setVal('f-unit', last.unit);
  setVal('f-brand', last.brand || '');
}
function refreshRegHints() {
  const v = readReg();
  const key = keyOf(v.product);
  const last = key ? lastPurchase(key) : null;
  const li = $('lastInfo');
  if (li) {
    if (last) {
      const u = unitPrice(last.qty, last.unit, last.price);
      li.innerHTML = '<strong>Ultimo acquisto</strong>: ' + esc(fmtDate(last.date)) +
        (last.store ? ' · ' + esc(last.store) : '') + ' · ' + esc(fmtMoney(last.price)) +
        (u ? ' · ' + esc(fmtUnitPrice(u)) : '');
      li.hidden = false;
    } else { li.innerHTML = ''; li.hidden = true; }
  }
  const qty = parseNumber(v.qty);
  const price = parseNumber(v.price);
  const cur = (qty > 0 && price >= 0) ? unitPrice(qty, v.unit, price) : null;
  const row = $('unitPriceRow');
  const val = $('unitPriceVal');
  if (row && val) {
    if (cur) { val.textContent = fmtUnitPrice(cur); row.hidden = false; }
    else { val.textContent = ''; row.hidden = true; }
  }
  const badge = $('priceBadge');
  if (badge) {
    badge.hidden = true; badge.textContent = ''; badge.className = 'badge';
    if (cur && key) {
      const avg = avgUnitPrice(key, cur.label);
      if (avg !== null && avg > 0) {
        if (cur.value <= avg * 0.95) { badge.textContent = 'Buon prezzo'; badge.className = 'badge good'; }
        else if (cur.value >= avg * 1.05) { badge.textContent = 'Sopra la media'; badge.className = 'badge high'; }
        else { badge.textContent = 'In media'; badge.className = 'badge avg'; }
        badge.hidden = false;
      }
    }
  }
}
async function onRegSubmit(e) {
  e.preventDefault();
  if (ui.saving) return;
  const r = buildPurchase(readReg());
  if (r.error) { toast(r.error, { kind: 'error' }); return; }
  ui.saving = true;
  let ok = false;
  try { ok = await storePurchase(makePurchase(r.data)); } finally { ui.saving = false; }
  if (ok) { toast('Acquisto salvato'); resetRegForm(); }
  else toast("Impossibile salvare l'acquisto", { kind: 'error' });
}
function renderRecent() {
  const c = $('recentList');
  if (!c) return;
  const list = sortedPurchases().slice(0, 8);
  if (!list.length) { c.innerHTML = '<p class="muted">Nessun acquisto registrato.</p>'; return; }
  c.innerHTML = list.map(p =>
    '<div class="row"><div class="row-main"><div class="row-title">' + esc(p.product) + '</div>' +
    '<div class="row-sub">' + esc(fmtDate(p.date)) + (p.store ? ' · ' + esc(p.store) : '') + '</div></div>' +
    '<div class="row-price">' + esc(fmtMoney(p.price)) + '</div>' +
    '<button type="button" class="icon-btn" data-act="del" data-id="' + esc(p.id) + '" aria-label="Elimina acquisto">' + TRASH + '</button></div>'
  ).join('');
}
function renderDatalists() {
  const prods = new Map();
  const stores = new Map();
  state.purchases.forEach(p => {
    if (!prods.has(p.productKey)) prods.set(p.productKey, p.product);
    if (p.store) { const k = keyOf(p.store); if (!stores.has(k)) stores.set(k, p.store); }
  });
  const fill = (id, map) => {
    const dl = $(id);
    if (!dl) return;
    const arr = Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'it'));
    dl.innerHTML = arr.map(x => '<option value="' + esc(x) + '"></option>').join('');
  };
  fill('dl-products', prods);
  fill('dl-stores', stores);
}

/* ===================== LISTA ===================== */
function computeAuto() {
  const byKey = new Map();
  state.purchases.forEach(p => {
    let a = byKey.get(p.productKey);
    if (!a) { a = []; byKey.set(p.productKey, a); }
    a.push(p);
  });
  const today = dayNum(todayStr());
  const out = [];
  byKey.forEach((arr, key) => {
    arr.sort(cmpPurchase);
    const last = arr[0];
    const dates = Array.from(new Set(arr.map(p => p.date))).sort();
    const st = state.listItems.find(i => i.id === 'auto:' + key) || null;
    const it = {
      kind: 'auto', id: 'auto:' + key, key: key, name: last.product, category: normCat(last.category),
      lastDate: last.date, checked: !!(st && st.checked), hidden: !!(st && st.hiddenUntilPurchase),
      status: 'insuf', nextDate: null, days: null, cheapest: null
    };
    if (dates.length >= 2) {
      const interval = (dayNum(dates[dates.length - 1]) - dayNum(dates[0])) / (dates.length - 1);
      const next = Math.round(dayNum(it.lastDate) + interval);
      it.nextDate = ymdFromDayNum(next);
      it.days = next - today;
      it.status = it.days < 0 ? 'late' : (it.days <= 3 ? 'soon' : 'ok');
    }
    const lu = unitPrice(last.qty, last.unit, last.price);
    if (lu) {
      const m = new Map();
      arr.forEach(p => {
        if (!p.store) return;
        const u = unitPrice(p.qty, p.unit, p.price);
        if (!u || u.label !== lu.label) return;
        let e = m.get(p.store);
        if (!e) { e = { sum: 0, n: 0 }; m.set(p.store, e); }
        e.sum += u.value; e.n++;
      });
      let best = null;
      m.forEach((e, s) => { const avg = e.sum / e.n; if (!best || avg < best.avg) best = { store: s, avg: avg }; });
      if (best) it.cheapest = { store: best.store, text: EUR.format(best.avg) + '/' + lu.label };
    }
    out.push(it);
  });
  return out;
}
function daysText(i) {
  if (i.days === null) return '';
  if (i.days < 0) return (-i.days) + (i.days === -1 ? ' giorno' : ' giorni') + ' di ritardo';
  if (i.days === 0) return 'previsto oggi';
  return 'tra ' + i.days + (i.days === 1 ? ' giorno' : ' giorni');
}
function itemHtml(i) {
  const pill = i.status === 'late' ? '<span class="pill late">In ritardo</span>'
    : i.status === 'soon' ? '<span class="pill soon">A breve</span>'
    : i.status === 'ok' ? '<span class="pill ok">Ok</span>'
    : i.status === 'manual' ? '<span class="pill manual">Manuale</span>' : '';
  let sub = '';
  if (i.kind === 'manual') sub = '<div class="item-sub">Voce manuale</div>';
  else if (i.status === 'insuf') sub = '<div class="item-sub">Ultimo acquisto: ' + esc(fmtDate(i.lastDate)) + ' · dati insufficienti per la stima</div>';
  else sub = '<div class="item-sub">Ultimo: ' + esc(fmtDate(i.lastDate)) + ' · Previsto: ' + esc(fmtDate(i.nextDate)) + ' · ' + esc(daysText(i)) + '</div>';
  if (i.cheapest) sub += '<div class="item-sub">Più conveniente: ' + esc(i.cheapest.store) + ' (' + esc(i.cheapest.text) + ')</div>';
  return '<div class="item' + (i.checked ? ' is-checked' : '') + '" data-id="' + esc(i.id) + '">' +
    '<label class="chk"><input type="checkbox" data-act="check"' + (i.checked ? ' checked' : '') + ' aria-label="Spunta"></label>' +
    '<div class="item-main"><div class="item-name">' + esc(i.name) + pill + '</div>' + sub + '</div>' +
    '<button type="button" class="btn small" data-act="save">Salva</button>' +
    (i.kind === 'manual' ? '<button type="button" class="icon-btn" data-act="delmanual" aria-label="Elimina voce">' + TRASH + '</button>' : '') +
    '</div>';
}
function getListItems() {
  const auto = computeAuto().filter(i => !i.hidden);
  const manual = state.listItems.filter(i => !String(i.id).startsWith('auto:')).map(i => ({
    kind: 'manual', id: i.id, key: i.productKey || keyOf(i.name), name: i.name, category: normCat(i.category),
    checked: !!i.checked, status: 'manual', days: null
  }));
  return { auto: auto, all: auto.concat(manual) };
}
function renderLista() {
  const c = $('listContainer');
  if (!c) return;
  const data = getListItems();
  let late = 0, soon = 0, ok = 0;
  data.auto.forEach(i => { if (i.status === 'late') late++; else if (i.status === 'soon') soon++; else if (i.status === 'ok') ok++; });
  setText('cnt-late', String(late));
  setText('cnt-soon', String(soon));
  setText('cnt-ok', String(ok));
  const fb = $('listFilter');
  if (fb) fb.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b.getAttribute('data-filter') === ui.listFilter));
  let items = data.all;
  if (ui.listFilter === 'buy') items = items.filter(i => i.status === 'late' || i.status === 'soon' || i.status === 'manual');
  const rank = { manual: 0, late: 1, soon: 2, ok: 3, insuf: 4 };
  const cmp = (a, b) => (rank[a.status] - rank[b.status]) || ((a.days || 0) - (b.days || 0)) || a.name.localeCompare(b.name, 'it');
  let html = '';
  CATEGORIES.forEach(cat => {
    const g = items.filter(i => i.category === cat && i.status !== 'insuf').sort(cmp);
    if (g.length) html += '<div class="group-title">' + esc(cat) + '</div>' + g.map(itemHtml).join('');
  });
  const ins = items.filter(i => i.status === 'insuf').sort((a, b) => a.name.localeCompare(b.name, 'it'));
  if (ins.length) html += '<div class="group-title">Dati insufficienti</div>' + ins.map(itemHtml).join('');
  if (!html) html = '<p class="muted">Nessuna voce. Registra qualche acquisto o aggiungi un prodotto a mano.</p>';
  c.innerHTML = html;
}
async function toggleCheck(id, checked) {
  const ex = state.listItems.find(i => i.id === id);
  let rec;
  if (String(id).startsWith('auto:')) rec = { id: id, checked: checked, hiddenUntilPurchase: ex ? !!ex.hiddenUntilPurchase : false };
  else { if (!ex) return; rec = Object.assign({}, ex, { checked: checked }); }
  try { await dbWrite([{ store: 'listItems', put: rec }]); }
  catch (e) { console.error(e); toast('Impossibile aggiornare la voce', { kind: 'error' }); renderAll(); return; }
  upsert(state.listItems, rec);
  renderAll();
}
async function addManual(e) {
  e.preventDefault();
  const name = getVal('manualName').trim().replace(/\s+/g, ' ');
  if (!name) { toast('Inserisci il nome del prodotto', { kind: 'error' }); return; }
  const key = keyOf(name);
  if (state.listItems.some(i => !String(i.id).startsWith('auto:') && !i.checked && (i.productKey || keyOf(i.name)) === key)) {
    toast('Voce già presente in lista', { kind: 'error' }); return;
  }
  const rec = { id: 'man:' + uid(), name: name, productKey: key, category: normCat(getVal('manualCat')), checked: false, createdAt: new Date().toISOString() };
  try { await dbWrite([{ store: 'listItems', put: rec }]); }
  catch (err) { console.error(err); toast('Impossibile aggiungere la voce', { kind: 'error' }); return; }
  state.listItems.push(rec);
  setVal('manualName', '');
  renderAll();
  toast('Voce aggiunta');
}
async function deleteManual(id) {
  const rec = state.listItems.find(i => i.id === id);
  if (!rec) return;
  try { await dbWrite([{ store: 'listItems', del: id }]); }
  catch (e) { console.error(e); toast('Impossibile eliminare la voce', { kind: 'error' }); return; }
  state.listItems = state.listItems.filter(i => i.id !== id);
  renderAll();
  toast('Voce eliminata', { duration: 5000, action: { label: 'Annulla', fn: () => safe(undoDeleteManual(rec)) } });
}
async function undoDeleteManual(rec) {
  try { await dbWrite([{ store: 'listItems', put: rec }]); }
  catch (e) { console.error(e); toast('Impossibile ripristinare la voce', { kind: 'error' }); return; }
  upsert(state.listItems, rec);
  renderAll();
}
async function clearChecked() {
  const ops = [];
  const manualIds = [];
  const autoRecs = [];
  state.listItems.forEach(i => {
    if (!i.checked) return;
    if (String(i.id).startsWith('auto:')) {
      if (!i.hiddenUntilPurchase) {
        const rec = { id: i.id, checked: true, hiddenUntilPurchase: true };
        autoRecs.push(rec);
        ops.push({ store: 'listItems', put: rec });
      }
    } else { manualIds.push(i.id); ops.push({ store: 'listItems', del: i.id }); }
  });
  if (!ops.length) { toast('Nessuna voce spuntata'); return; }
  try { await dbWrite(ops); }
  catch (e) { console.error(e); toast('Impossibile rimuovere le voci spuntate', { kind: 'error' }); return; }
  state.listItems = state.listItems.filter(i => manualIds.indexOf(i.id) < 0);
  autoRecs.forEach(r => upsert(state.listItems, r));
  renderAll();
  toast('Voci spuntate rimosse');
}
async function saveFromList(id) {
  let key, name, manualRec = null;
  if (String(id).startsWith('auto:')) {
    key = id.slice(5);
    const l = lastPurchase(key);
    if (!l) return;
    name = l.product;
  } else {
    manualRec = state.listItems.find(i => i.id === id);
    if (!manualRec) return;
    name = manualRec.name;
    key = manualRec.productKey || keyOf(name);
  }
  const last = lastPurchase(key);
  const v = {
    product: last ? last.product : name,
    category: last ? last.category : (manualRec ? manualRec.category : DEFAULT_CATEGORY),
    qty: last ? fmtNum(last.qty) : '1',
    unit: last ? last.unit : 'pz',
    price: last ? fmtPrice(last.price) : '',
    date: todayStr(),
    store: last ? (last.store || '') : '',
    brand: last ? (last.brand || '') : '',
    notes: ''
  };
  const r = await purchaseModal('Salva acquisto', 'Salva', v);
  if (!r.ok) return;
  const p = makePurchase(r.value);
  const extra = manualRec ? Object.assign({}, manualRec, { checked: true }) : { id: id, checked: true, hiddenUntilPurchase: false };
  const ok = await storePurchase(p, [extra]);
  if (ok) toast('Acquisto salvato');
  else toast("Impossibile salvare l'acquisto", { kind: 'error' });
}
async function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) { console.error(e); }
  }
  const ta = document.createElement('textarea');
  ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  return ok;
}
function shareList() {
  const items = getListItems().all.filter(i => !i.checked && (i.status === 'late' || i.status === 'soon' || i.status === 'manual'));
  if (!items.length) { toast('Nessuna voce da condividere'); return; }
  let text = 'Lista della spesa del ' + fmtDate(todayStr()) + '\n';
  CATEGORIES.forEach(cat => {
    const g = items.filter(i => i.category === cat);
    if (g.length) text += '\n' + cat + '\n' + g.map(i => '- ' + i.name).join('\n') + '\n';
  });
  if (navigator.share) {
    navigator.share({ title: 'Lista della spesa', text: text }).catch(e => {
      if (e && e.name === 'AbortError') return;
      console.error(e);
      safe(copyText(text).then(ok => toast(ok ? 'Lista copiata negli appunti' : 'Impossibile condividere la lista', ok ? undefined : { kind: 'error' })));
    });
  } else {
    safe(copyText(text).then(ok => toast(ok ? 'Lista copiata negli appunti' : 'Impossibile condividere la lista', ok ? undefined : { kind: 'error' })));
  }
}

/* ===================== STORICO ===================== */
function cardHtml(p) {
  const u = unitPrice(p.qty, p.unit, p.price);
  return '<div class="pcard"><div class="pcard-top"><div><div class="row-title">' + esc(p.product) + '</div>' +
    '<div class="row-sub">' + esc(fmtDate(p.date)) + (p.store ? ' · ' + esc(p.store) : '') + (p.brand ? ' · ' + esc(p.brand) : '') + '</div></div>' +
    '<div class="row-price">' + esc(fmtMoney(p.price)) + '</div></div>' +
    '<div class="row-sub">' + esc(p.category) + ' · ' + esc(fmtNum(p.qty)) + ' ' + esc(p.unit) + (u ? ' · ' + esc(fmtUnitPrice(u)) : '') + '</div>' +
    (p.notes ? '<div class="row-sub note">' + esc(p.notes) + '</div>' : '') +
    '<div class="pcard-actions"><button type="button" class="btn small" data-act="edit" data-id="' + esc(p.id) + '">Modifica</button>' +
    '<button type="button" class="icon-btn" data-act="del" data-id="' + esc(p.id) + '" aria-label="Elimina acquisto">' + TRASH + '</button></div></div>';
}
function renderStorico() {
  const list = $('historyList');
  if (!list) return;
  // opzioni negozio
  const sel = $('h-store');
  if (sel) {
    const cur = sel.value;
    const stores = new Map();
    state.purchases.forEach(p => { if (p.store) { const k = keyOf(p.store); if (!stores.has(k)) stores.set(k, p.store); } });
    const arr = Array.from(stores.values()).sort((a, b) => a.localeCompare(b, 'it'));
    sel.innerHTML = '<option value="">Tutti</option>' + arr.map(s => '<option value="' + esc(s) + '">' + esc(s) + '</option>').join('');
    sel.value = arr.indexOf(cur) >= 0 ? cur : '';
  }
  const q = keyOf(getVal('h-search'));
  const cat = getVal('h-cat');
  const store = getVal('h-store');
  const from = getVal('h-from');
  const to = getVal('h-to');
  const res = sortedPurchases().filter(p => {
    if (q && (keyOf(p.product) + ' ' + keyOf(p.brand) + ' ' + keyOf(p.notes)).indexOf(q) < 0) return false;
    if (cat && p.category !== cat) return false;
    if (store && keyOf(p.store) !== keyOf(store)) return false;
    if (from && p.date < from) return false;
    if (to && p.date > to) return false;
    return true;
  });
  const total = res.reduce((s, p) => s + p.price, 0);
  const sum = $('h-summary');
  if (sum) sum.innerHTML = '<strong>' + res.length + '</strong> ' + (res.length === 1 ? 'acquisto' : 'acquisti') + ' · Totale speso: <strong>' + esc(fmtMoney(total)) + '</strong>';
  if (!res.length) { list.innerHTML = '<p class="muted">Nessun acquisto trovato.</p>'; return; }
  const shown = res.slice(0, ui.storicoLimit);
  list.innerHTML = shown.map(cardHtml).join('') +
    (res.length > shown.length ? '<button type="button" class="btn block" data-act="more">Mostra altri</button>' : '');
}
function onPurchaseListClick(e) {
  const b = e.target.closest ? e.target.closest('[data-act]') : null;
  if (!b) return;
  const act = b.getAttribute('data-act');
  const id = b.getAttribute('data-id');
  if (act === 'del') safe(askDeletePurchase(id));
  else if (act === 'edit') safe(editPurchase(id));
  else if (act === 'more') { ui.storicoLimit += 100; renderStorico(); }
}
function resetHistoryFilters() {
  setVal('h-search', ''); setVal('h-cat', ''); setVal('h-store', ''); setVal('h-from', ''); setVal('h-to', '');
  ui.storicoLimit = 100;
  renderStorico();
}

/* ===================== BACKUP / IMPORT / CSV ===================== */
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function exportBackup() {
  try {
    const now = new Date().toISOString();
    const settingsArr = Object.keys(state.settings).filter(k => k !== 'lastBackupAt').map(k => ({ key: k, value: state.settings[k] }));
    settingsArr.push({ key: 'lastBackupAt', value: now });
    const data = { app: 'spesa-smart', schema: 1, exportedAt: now, purchases: state.purchases, listItems: state.listItems,
      settings: settingsArr, synonyms: state.synonyms };
    const json = JSON.stringify(data, null, 2);
    const name = 'spesa-smart-backup-' + todayStr() + '.json';
    let done = false;
    try {
      const file = new File([json], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Backup Spesa Smart' }); done = true; }
        catch (e) {
          if (e && e.name === 'AbortError') { toast('Esportazione annullata'); return; }
          console.error(e);
        }
      }
    } catch (e) { console.error(e); }
    if (!done) downloadBlob(new Blob([json], { type: 'application/json' }), name);
    await setSetting('lastBackupAt', now);
    toast('Backup esportato');
  } catch (e) {
    console.error(e);
    toast('Impossibile esportare il backup', { kind: 'error' });
  }
}
function exportCsv() {
  try {
    const q = v => {
      const s = String(v === null || v === undefined ? '' : v);
      return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const n = v => String(v).replace('.', ',');
    const rows = [['Data', 'Prodotto', 'Categoria', 'Quantità', 'Unità', 'Prezzo totale', 'Prezzo unitario', 'Unità prezzo', 'Negozio', 'Marca', 'Note'].join(';')];
    state.purchases.slice().sort((a, b) => -cmpPurchase(a, b)).forEach(p => {
      const u = unitPrice(p.qty, p.unit, p.price);
      rows.push([fmtDate(p.date), q(p.product), q(p.category), n(p.qty), p.unit, n(p.price.toFixed(2)),
        u ? n(u.value.toFixed(2)) : '', u ? u.label : '', q(p.store), q(p.brand), q(p.notes)].join(';'));
    });
    const blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, 'spesa-smart-acquisti-' + todayStr() + '.csv');
    toast('CSV esportato');
  } catch (e) {
    console.error(e);
    toast("Impossibile esportare il CSV", { kind: 'error' });
  }
}
function validateBackup(obj) {
  if (!obj || typeof obj !== 'object' || obj.app !== 'spesa-smart') return { error: 'File non valido: non è un backup di Spesa Smart' };
  if (obj.schema !== 1) return { error: 'Versione del backup non supportata' };
  const arr = x => Array.isArray(x) ? x : [];
  const now = new Date().toISOString();
  const res = { purchases: [], listItems: [], settings: [], synonyms: [], discarded: 0 };
  const seen = { purchases: new Set(), listItems: new Set(), settings: new Set(), synonyms: new Set() };
  const isStr = s => typeof s === 'string' && s.trim() !== '';
  arr(obj.purchases).forEach(r => {
    if (!r || !isStr(r.id) || !isStr(r.product) || typeof r.qty !== 'number' || !(r.qty > 0) || !isFinite(r.qty) ||
      typeof r.price !== 'number' || !(r.price >= 0) || !isFinite(r.price) || !isValidDate(r.date) ||
      UNITS.indexOf(r.unit) < 0 || seen.purchases.has(r.id)) { res.discarded++; return; }
    seen.purchases.add(r.id);
    const product = r.product.trim().replace(/\s+/g, ' ');
    res.purchases.push({
      id: r.id, product: product, productKey: keyOf(product), category: normCat(r.category), qty: r.qty, unit: r.unit,
      price: round2(r.price), date: r.date, store: typeof r.store === 'string' ? r.store : '',
      brand: typeof r.brand === 'string' ? r.brand : '', notes: typeof r.notes === 'string' ? r.notes : '',
      receiptId: r.receiptId === undefined ? null : r.receiptId,
      createdAt: isStr(r.createdAt) ? r.createdAt : now, updatedAt: isStr(r.updatedAt) ? r.updatedAt : now
    });
  });
  arr(obj.listItems).forEach(r => {
    if (!r || !isStr(r.id) || seen.listItems.has(r.id)) { res.discarded++; return; }
    if (r.id.startsWith('auto:')) {
      seen.listItems.add(r.id);
      res.listItems.push({ id: r.id, checked: !!r.checked, hiddenUntilPurchase: !!r.hiddenUntilPurchase });
    } else if (isStr(r.name)) {
      seen.listItems.add(r.id);
      res.listItems.push({ id: r.id, name: r.name.trim(), productKey: keyOf(r.name), category: normCat(r.category),
        checked: !!r.checked, createdAt: isStr(r.createdAt) ? r.createdAt : now });
    } else res.discarded++;
  });
  arr(obj.settings).forEach(r => {
    if (!r || !isStr(r.key) || seen.settings.has(r.key)) { res.discarded++; return; }
    seen.settings.add(r.key);
    res.settings.push({ key: r.key, value: r.value });
  });
  arr(obj.synonyms).forEach(r => {
    if (!r || !isStr(r.alias) || !isStr(r.productKey) || seen.synonyms.has(r.alias)) { res.discarded++; return; }
    seen.synonyms.add(r.alias);
    res.synonyms.push({ alias: r.alias, productKey: r.productKey });
  });
  return res;
}
async function handleImportFile(file) {
  let obj;
  try { obj = JSON.parse(await file.text()); }
  catch (e) { console.error(e); toast('File non valido: JSON non leggibile', { kind: 'error' }); return; }
  const data = validateBackup(obj);
  if (data.error) { toast(data.error, { kind: 'error' }); return; }
  const total = data.purchases.length + data.listItems.length + data.settings.length + data.synonyms.length;
  if (!total) { toast('Il backup non contiene record validi', { kind: 'error' }); return; }
  const r = await openModal({
    title: 'Importa backup',
    body: '<p>Il file contiene <strong>' + data.purchases.length + '</strong> acquisti, <strong>' + data.listItems.length +
      '</strong> voci di lista e <strong>' + data.settings.length + '</strong> impostazioni' +
      (data.discarded ? ' (' + data.discarded + ' record non validi scartati)' : '') + '.</p>' +
      '<label class="radio-row"><input type="radio" name="mode" value="merge" checked> Unisci ai dati esistenti</label>' +
      '<label class="radio-row"><input type="radio" name="mode" value="replace"> Sostituisci tutti i dati</label>',
    okLabel: 'Importa',
    collect: box => { const c = box.querySelector('input[name="mode"]:checked'); return c ? c.value : 'merge'; }
  });
  if (!r.ok) return;
  const mode = r.value;
  if (mode === 'replace') {
    const ok = await confirmBox('Sostituire tutti i dati?', '<p>I dati attuali verranno cancellati e sostituiti con quelli del backup.</p>', 'Sostituisci', true);
    if (!ok) return;
  }
  const ops = [];
  let added = 0, existing = 0;
  if (mode === 'replace') {
    STORES.forEach(s => ops.push({ store: s, clear: true }));
    data.purchases.forEach(x => ops.push({ store: 'purchases', put: x }));
    data.listItems.forEach(x => ops.push({ store: 'listItems', put: x }));
    data.settings.forEach(x => ops.push({ store: 'settings', put: x }));
    data.synonyms.forEach(x => ops.push({ store: 'synonyms', put: x }));
    added = total;
  } else {
    const have = {
      purchases: new Set(state.purchases.map(x => x.id)),
      listItems: new Set(state.listItems.map(x => x.id)),
      settings: new Set(Object.keys(state.settings)),
      synonyms: new Set(state.synonyms.map(x => x.alias))
    };
    const add = (store, arrIn, idKey) => arrIn.forEach(x => {
      if (have[store].has(x[idKey])) { existing++; return; }
      have[store].add(x[idKey]);
      ops.push({ store: store, put: x });
      added++;
    });
    add('purchases', data.purchases, 'id');
    add('listItems', data.listItems, 'id');
    add('settings', data.settings, 'key');
    add('synonyms', data.synonyms, 'alias');
  }
  try {
    await dbWrite(ops);
    await reloadState();
  } catch (e) {
    console.error(e);
    toast('Impossibile importare il backup', { kind: 'error' });
    try { await reloadState(); } catch (x) { console.error(x); }
    renderAll();
    return;
  }
  renderAll();
  toast(mode === 'replace'
    ? 'Importati ' + added + ' record' + (data.discarded ? ' (' + data.discarded + ' scartati)' : '')
    : 'Importati ' + added + ' nuovi record, ' + existing + ' già presenti' + (data.discarded ? ', ' + data.discarded + ' scartati' : ''),
    { duration: 4500 });
}

/* ===================== DEMO ===================== */
const DEMO_STORES = [{ n: 'Esselunga', f: 1.0 }, { n: 'Coop', f: 1.0 }, { n: 'Lidl', f: 0.9 }, { n: 'Conad', f: 1.05 }, { n: 'Carrefour', f: 0.97 }];
const DEMO_PRODUCTS = [
  { name: 'Latte intero', cat: 'Latticini', qty: 1, unit: 'l', price: 1.35, every: 6 },
  { name: 'Uova', cat: 'Latticini', qty: 6, unit: 'pz', price: 2.6, every: 14 },
  { name: 'Yogurt greco', cat: 'Latticini', qty: 2, unit: 'pz', price: 2.4, every: 10 },
  { name: 'Mozzarella', cat: 'Latticini', qty: 3, unit: 'pz', price: 2.3, every: 12 },
  { name: 'Parmigiano Reggiano', cat: 'Latticini', qty: 0.25, unit: 'kg', price: 5.2, every: 21 },
  { name: 'Pane', cat: 'Pane e cereali', qty: 0.5, unit: 'kg', price: 2.1, every: 4 },
  { name: 'Pasta spaghetti', cat: 'Pane e cereali', qty: 1, unit: 'kg', price: 1.4, every: 15 },
  { name: 'Riso', cat: 'Pane e cereali', qty: 1, unit: 'kg', price: 2.3, every: 30 },
  { name: 'Biscotti', cat: 'Pane e cereali', qty: 0.5, unit: 'kg', price: 2.5, every: 20 },
  { name: 'Banane', cat: 'Frutta e verdura', qty: 1, unit: 'kg', price: 1.9, every: 7 },
  { name: 'Mele', cat: 'Frutta e verdura', qty: 1.5, unit: 'kg', price: 2.8, every: 9 },
  { name: 'Insalata', cat: 'Frutta e verdura', qty: 1, unit: 'pz', price: 1.2, every: 6 },
  { name: 'Pomodori', cat: 'Frutta e verdura', qty: 0.8, unit: 'kg', price: 2.6, every: 8 },
  { name: 'Patate', cat: 'Frutta e verdura', qty: 2, unit: 'kg', price: 2.9, every: 16 },
  { name: 'Petto di pollo', cat: 'Carne e pesce', qty: 0.6, unit: 'kg', price: 6.5, every: 10 },
  { name: 'Salmone', cat: 'Carne e pesce', qty: 0.3, unit: 'kg', price: 7.2, every: 25 },
  { name: 'Macinato di manzo', cat: 'Carne e pesce', qty: 0.5, unit: 'kg', price: 5.4, every: 14 },
  { name: 'Acqua naturale', cat: 'Bevande', qty: 6, unit: 'l', price: 2.2, every: 10 },
  { name: 'Succo di frutta', cat: 'Bevande', qty: 1, unit: 'l', price: 1.8, every: 18 },
  { name: 'Caffè', cat: 'Dispensa', qty: 0.25, unit: 'kg', price: 3.6, every: 28 },
  { name: 'Olio extravergine', cat: 'Dispensa', qty: 1, unit: 'l', price: 7.9, every: 45 },
  { name: 'Passata di pomodoro', cat: 'Dispensa', qty: 2, unit: 'pz', price: 1.8, every: 20 },
  { name: 'Piselli surgelati', cat: 'Surgelati', qty: 0.45, unit: 'kg', price: 1.9, every: 26 },
  { name: 'Gelato', cat: 'Surgelati', qty: 0.5, unit: 'l', price: 3.4, every: 30 },
  { name: 'Detersivo piatti', cat: 'Casa e pulizia', qty: 1, unit: 'pz', price: 2.1, every: 40 },
  { name: 'Carta igienica', cat: 'Casa e pulizia', qty: 1, unit: 'pz', price: 4.5, every: 30 },
  { name: 'Dentifricio', cat: 'Igiene personale', qty: 1, unit: 'pz', price: 2.3, every: 60 },
  { name: 'Shampoo', cat: 'Igiene personale', qty: 1, unit: 'pz', price: 3.1, every: 50 }
];
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function buildDemo() {
  const rnd = mulberry32(20260101);
  const today = dayNum(todayStr());
  const start = today - 182;
  const out = [];
  DEMO_PRODUCTS.forEach(d => {
    const pref = DEMO_STORES[Math.floor(rnd() * DEMO_STORES.length)];
    const end = today - Math.floor(rnd() * d.every * 1.3);
    let t = start + Math.floor(rnd() * d.every);
    const slug = keyOf(d.name).replace(/[^a-z0-9]+/g, '-');
    while (t <= end) {
      const st = rnd() < 0.6 ? pref : DEMO_STORES[Math.floor(rnd() * DEMO_STORES.length)];
      const price = round2(d.price * st.f * (0.92 + rnd() * 0.16));
      const date = ymdFromDayNum(t);
      const iso = date + 'T12:00:00.000Z';
      out.push({ id: 'demo-' + slug + '-' + date, product: d.name, productKey: keyOf(d.name), category: d.cat, qty: d.qty,
        unit: d.unit, price: price, date: date, store: st.n, brand: '', notes: '', receiptId: null, createdAt: iso, updatedAt: iso });
      t += Math.max(1, Math.round(d.every * (0.8 + rnd() * 0.4)));
    }
  });
  return out;
}
async function loadDemo() {
  const ok = await confirmBox('Caricare i dati demo?', '<p>Verranno aggiunti circa 6 mesi di acquisti di esempio. Eventuali dati demo già presenti saranno sostituiti. I tuoi dati non vengono toccati.</p>', 'Carica');
  if (!ok) return;
  const demo = buildDemo();
  const ops = [];
  state.purchases.forEach(p => { if (String(p.id).startsWith('demo-')) ops.push({ store: 'purchases', del: p.id }); });
  demo.forEach(p => ops.push({ store: 'purchases', put: p }));
  try { await dbWrite(ops); await reloadState(); }
  catch (e) { console.error(e); toast('Impossibile caricare i dati demo', { kind: 'error' }); try { await reloadState(); } catch (x) { console.error(x); } renderAll(); return; }
  renderAll();
  toast('Caricati ' + demo.length + ' acquisti demo');
}

/* ===================== ELIMINA TUTTO ===================== */
async function wipeAll() {
  const ok1 = await confirmBox('Eliminare tutti i dati?', '<p>Verranno eliminati definitivamente acquisti, lista e impostazioni salvati su questo telefono.</p>', 'Continua', true);
  if (!ok1) return;
  const r = await openModal({
    title: 'Conferma finale',
    body: '<p>Per confermare scrivi <strong>ELIMINA</strong>.</p><label class="field"><input name="confirm" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>',
    okLabel: 'Elimina tutto',
    danger: true,
    validate: box => { const e = box.querySelector('[name="confirm"]'); return e && e.value.trim() === 'ELIMINA' ? null : 'Scrivi ELIMINA per confermare'; },
    collect: () => true,
    onOpen: box => { const e = box.querySelector('[name="confirm"]'); if (e) e.focus(); }
  });
  if (!r.ok) return;
  try { await dbWrite(STORES.map(s => ({ store: s, clear: true }))); }
  catch (e) { console.error(e); toast('Impossibile eliminare i dati', { kind: 'error' }); return; }
  state.purchases = []; state.listItems = []; state.synonyms = []; state.settings = {};
  ui.bannerDismissed = false; ui.listFilter = 'all';
  resetHistoryFilters();
  resetRegForm();
  renderAll();
  toast('Tutti i dati sono stati eliminati');
}

/* ===================== IMPOSTAZIONI ===================== */
function renderBanner() {
  const b = $('backupBanner');
  if (!b) return;
  const days = Number(getSetting('backupReminderDays', 7));
  const last = getSetting('lastBackupAt', null);
  let due = false, txt = '';
  if (days > 0 && state.purchases.length > 0 && !ui.bannerDismissed) {
    const t = last ? new Date(last).getTime() : NaN;
    if (!last || isNaN(t)) { due = true; txt = 'Non hai ancora fatto un backup dei tuoi dati.'; }
    else {
      const el = Math.floor((Date.now() - t) / 86400000);
      if (el >= days) { due = true; txt = 'Ultimo backup: ' + el + (el === 1 ? ' giorno fa.' : ' giorni fa.'); }
    }
  }
  setText('backupBannerText', txt);
  b.hidden = !due;
}
function updateInstallUi() {
  const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const btn = $('btnInstall');
  const help = $('installHelp');
  if (btn) btn.hidden = !deferredInstall || standalone;
  if (help) help.hidden = !!deferredInstall || standalone;
}
async function updateStorageInfo() {
  try {
    const btn = $('btnPersist');
    if (navigator.storage && navigator.storage.persisted) {
      const p = await navigator.storage.persisted();
      setText('storageState', p ? 'Archiviazione persistente: attiva' : 'Archiviazione persistente: non attiva');
      if (btn) btn.hidden = !!p;
    } else {
      setText('storageState', 'Archiviazione persistente: non supportata');
      if (btn) btn.hidden = true;
    }
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      setText('storageUsage', 'Spazio usato: ' + fmtBytes(e.usage || 0) + (e.quota ? ' di ' + fmtBytes(e.quota) : ''));
    }
  } catch (e) { console.error(e); }
}
function renderImpostazioni() {
  const last = getSetting('lastBackupAt', null);
  setText('lastBackupText', 'Ultimo backup: ' + (last && fmtDateTime(last) ? fmtDateTime(last) : 'mai'));
  setText('appVersion', String(VERSION));
  const sel = $('backupDays');
  if (sel) sel.value = String(Number(getSetting('backupReminderDays', 7)));
  updateInstallUi();
  updateStorageInfo();
}

/* ===================== RENDER ===================== */
function renderAll() {
  [renderDatalists, renderRecent, refreshRegHints, renderLista, renderStorico, renderImpostazioni, renderBanner].forEach(fn => {
    try { fn(); } catch (e) { console.error(e); }
  });
}

/* ===================== INIZIALIZZAZIONE ===================== */
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstall = e;
  updateInstallUi();
});
window.addEventListener('appinstalled', () => { deferredInstall = null; updateInstallUi(); });

function fillSelect(id, html, value) {
  const s = $(id);
  if (!s) return;
  s.innerHTML = html;
  if (value !== undefined) s.value = value;
}
function bindEvents() {
  on('formRegistra', 'submit', e => safe(onRegSubmit(e)));
  ['input', 'change'].forEach(evt => {
    on('f-product', evt, () => { maybePrefill(); refreshRegHints(); });
    on('f-qty', evt, refreshRegHints);
    on('f-unit', evt, refreshRegHints);
    on('f-price', evt, refreshRegHints);
  });
  on('recentList', 'click', onPurchaseListClick);
  on('historyList', 'click', onPurchaseListClick);

  on('manualForm', 'submit', e => safe(addManual(e)));
  on('listFilter', 'click', e => {
    const b = e.target.closest ? e.target.closest('[data-filter]') : null;
    if (!b) return;
    ui.listFilter = b.getAttribute('data-filter') === 'buy' ? 'buy' : 'all';
    renderLista();
  });
  on('btnShare', 'click', shareList);
  on('btnClearChecked', 'click', () => safe(clearChecked()));
  const lc = $('listContainer');
  if (lc) {
    lc.addEventListener('change', e => {
      const t = e.target;
      if (t && t.matches && t.matches('input[data-act="check"]')) {
        const row = t.closest('[data-id]');
        if (row) safe(toggleCheck(row.getAttribute('data-id'), t.checked));
      }
    });
    lc.addEventListener('click', e => {
      const b = e.target.closest ? e.target.closest('button[data-act]') : null;
      if (!b) return;
      const row = b.closest('[data-id]');
      if (!row) return;
      const id = row.getAttribute('data-id');
      const act = b.getAttribute('data-act');
      if (act === 'save') safe(saveFromList(id));
      else if (act === 'delmanual') safe(deleteManual(id));
    });
  }

  ['h-search', 'h-cat', 'h-store', 'h-from', 'h-to'].forEach(id => {
    on(id, 'input', () => { ui.storicoLimit = 100; renderStorico(); });
    on(id, 'change', () => { ui.storicoLimit = 100; renderStorico(); });
  });
  on('h-reset', 'click', resetHistoryFilters);

  on('btnExport', 'click', () => safe(exportBackup()));
  on('bannerExport', 'click', () => safe(exportBackup()));
  on('bannerClose', 'click', () => { ui.bannerDismissed = true; renderBanner(); });
  on('btnImport', 'click', () => { const f = $('importFile'); if (f) f.click(); });
  on('importFile', 'change', e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) safe(handleImportFile(f));
  });
  on('btnCsv', 'click', exportCsv);
  on('backupDays', 'change', e => safe(setSetting('backupReminderDays', Number(e.target.value))));
  on('btnPersist', 'click', () => {
    safe((async () => {
      if (!navigator.storage || !navigator.storage.persist) { toast('Archiviazione persistente non supportata', { kind: 'error' }); return; }
      const ok = await navigator.storage.persist();
      toast(ok ? 'Archiviazione persistente attivata' : 'Richiesta non accettata dal browser');
      updateStorageInfo();
    })());
  });
  on('btnInstall', 'click', () => {
    safe((async () => {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      try { await deferredInstall.userChoice; } catch (e) { console.error(e); }
      deferredInstall = null;
      updateInstallUi();
    })());
  });
  on('btnDemo', 'click', () => safe(loadDemo()));
  on('btnWipe', 'click', () => safe(wipeAll()));
}
async function init() {
  const catHtml = optionsHtml(CATEGORIES, DEFAULT_CATEGORY);
  fillSelect('f-category', catHtml, DEFAULT_CATEGORY);
  fillSelect('manualCat', catHtml, DEFAULT_CATEGORY);
  fillSelect('f-unit', optionsHtml(UNITS, 'pz'), 'pz');
  fillSelect('h-cat', '<option value="">Tutte</option>' + optionsHtml(CATEGORIES, ''), '');
  setVal('f-date', todayStr());
  setVal('f-qty', '1');
  bindEvents();
  try {
    await reloadState();
  } catch (e) {
    console.error(e);
  }
  renderAll();
}
function start() { init().catch(e => console.error(e)); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
