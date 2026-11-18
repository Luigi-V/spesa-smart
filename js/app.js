/* Spesa Smart v4 */
const VERSION = 5;

/* parseNumber: unica funzione per parsing numerico */
function parseNumber(str) {
  // v5: supports Italian/EN formats and thousands separators.
  // Examples:
  // "0,5" "0.5" ",5" ".5" -> 0.5
  // "1,49" "1.49" -> 1.49
  // "1.234,56" -> 1234.56
  // "1.234.567" -> 1234567
  // invalid -> NaN
  if (str === null || str === undefined) return NaN;
  let s = String(str).trim();
  if (s === '') return NaN;
  s = s.replace(/\s+/g, '');

  // reject letters
  if (/[a-zA-Z]/.test(s)) return NaN;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    // assume dots are thousands and comma is decimal (it-IT)
    const lastComma = s.lastIndexOf(',');
    const intPart = s.slice(0, lastComma).replace(/\./g, '');
    const decPart = s.slice(lastComma + 1);
    if (decPart === '') return NaN;
    s = intPart + '.' + decPart;
  } else if (hasComma) {
    // comma decimal
    const parts = s.split(',');
    if (parts.length > 2) return NaN;
    const intPart = parts[0];
    const decPart = parts[1] ?? '';
    if (intPart === '' && decPart !== '') s = '0.' + decPart;
    else if (decPart === '') return NaN;
    else s = intPart + '.' + decPart;
  } else if (hasDot) {
    const parts = s.split('.');
    if (parts.length === 2) {
      // decimal dot (en)
      const intPart = parts[0];
      const decPart = parts[1];
      if (intPart === '' && decPart !== '') s = '0.' + decPart;
      else if (decPart === '') return NaN;
      else s = intPart + '.' + decPart;
    } else {
      // multiple dots => thousands separators
      s = parts.join('');
    }
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/* Helpers */
const $ = (sel, root = document) => {
  try {
    if (!root) return null;
    return root.querySelector(sel);
  } catch (_) {
    return null;
  }
};
const $id = (id) => {
  try { return document.getElementById(id); } catch (_) { return null; }
};
function escapeHtml(value) {
  const s = String(value ?? '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function toProductKey(name) {
  return String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function todayLocalYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}
function formatDateIT(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? ''));
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}
function ymdToUTCms(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? ''));
  if (!m) return NaN;
  const y = Number(m[1]), mo = Number(m[2]), da = Number(m[3]);
  return Date.UTC(y, mo - 1, da);
}
function diffDaysUTC(ymdA, ymdB) {
  const a = ymdToUTCms(ymdA);
  const b = ymdToUTCms(ymdB);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  return (b - a) / 86400000;
}
function formatMoneyEUR(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v);
}
function formatNumberInput(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  let s = String(v);
  if (s.includes('e') || s.includes('E')) s = v.toFixed(12).replace(/0+$/,'').replace(/\.$/,'');
  s = s.replace('.', ',');
  return s;
}
function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return NaN;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}
function unitBase(unit) {
  if (unit === 'g' || unit === 'kg') return 'kg';
  if (unit === 'ml' || unit === 'l') return 'l';
  return 'pz';
}
function qtyToBase(qty, unit) {
  const q = Number(qty);
  if (!Number.isFinite(q)) return NaN;
  if (unit === 'g') return q / 1000;
  if (unit === 'ml') return q / 1000;
  return q;
}
function unitLabelBase(unit) {
  const b = unitBase(unit);
  return b;
}
function resetRegisterPrefillTouched() {
  state.ui.registerPrefillTouched = state.ui.registerPrefillTouched || { category:false, unit:false, brand:false };
  state.ui.registerPrefillTouched.category = false;
  state.ui.registerPrefillTouched.unit = false;
  state.ui.registerPrefillTouched.brand = false;
}

function unitPrice(totalPrice, qty, unit) {
  const p = Number(totalPrice);
  const q = Number(qty);
  if (!Number.isFinite(p) || !Number.isFinite(q) || q <= 0) return NaN;
  const qb = qtyToBase(q, unit);
  if (!Number.isFinite(qb) || qb <= 0) return NaN;
  return p / qb;
}
function computePriceBadge(currUnitPrice, avgUnitPrice) {
  const c = Number(currUnitPrice);
  const a = Number(avgUnitPrice);
  if (!Number.isFinite(c) || !Number.isFinite(a) || a <= 0) return null;
  const lo = a * 0.95;
  const hi = a * 1.05;
  if (c < lo) return { label: 'Buon prezzo', cls: 'badge--ok' };
  if (c > hi) return { label: 'Sopra la media', cls: 'badge--danger' };
  return { label: 'In media', cls: 'badge--warn' };
}
function csvEscapeField(v) {
  const s = String(v ?? '');
  const needQuotes = /[;"\n\r]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needQuotes ? `"${escaped}"` : escaped;
}
function computeStoreCheapest(purchases, productKey) {
  const byStore = new Map();
  for (const p of purchases) {
    if (p.productKey !== productKey) continue;
    if (!p.store) continue;
    const up = unitPrice(p.price, p.qty, p.unit);
    if (!Number.isFinite(up)) continue;
    const base = unitBase(p.unit);
    const k = `${p.store}||${base}`;
    const acc = byStore.get(k) || { store: p.store, baseUnit: base, sum: 0, count: 0 };
    acc.sum += up;
    acc.count += 1;
    byStore.set(k, acc);
  }
  let best = null;
  for (const acc of byStore.values()) {
    const avg = acc.sum / acc.count;
    if (!best || avg < best.avg) best = { store: acc.store, baseUnit: acc.baseUnit, avg };
  }
  return best;
}
function computeIntervals(purchases) {
  const byProduct = new Map();
  for (const p of purchases) {
    if (!p.productKey) continue;
    const arr = byProduct.get(p.productKey) || [];
    arr.push(p);
    byProduct.set(p.productKey, arr);
  }
  const today = todayLocalYMD();
  const results = [];
  const insufficient = [];
  for (const [productKey, arr] of byProduct.entries()) {
    const dates = Array.from(new Set(arr.map(x => x.date))).sort();
    const latest = dates[dates.length - 1];
    const first = dates[0];
    const name = arr.slice().sort((a,b)=> (a.date < b.date ? 1 : -1) || (b.createdAt||'').localeCompare(a.createdAt||''))[0].product;
    const category = arr[arr.length - 1].category || 'Altro';
    const avgStore = computeStoreCheapest(arr, productKey);
    if (dates.length < 2) {
      insufficient.push({ productKey, name, category, latestDate: latest, cheapest: avgStore });
      continue;
    }
    const interval = diffDaysUTC(first, latest) / (dates.length - 1); // may be decimal
    const intervalRoundedDays = Math.round(interval);
    const predictedMs = ymdToUTCms(latest) + intervalRoundedDays * 86400000;
    const predicted = utcMsToYmd(predictedMs);
    // v5: compute delta using the same displayed predicted date for coherence
    const delta = Math.round((ymdToUTCms(predicted) - ymdToUTCms(today)) / 86400000);
    let status = 'Ok';
    if (delta < 0) status = 'In ritardo';
    else if (delta <= 3) status = 'A breve';
    results.push({
      productKey, name, category,
      firstDate: first,
      latestDate: latest,
      intervalDays: interval,
      predictedDate: predicted,
      deltaDays: delta,
      status,
      cheapest: avgStore
    });
  }
  return { items: results, insufficient };
}

/* IndexedDB */
const DB_NAME = 'spesaSmartDB';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('purchases')) {
        const os = db.createObjectStore('purchases', { keyPath: 'id' });
        os.createIndex('date', 'date', { unique: false });
        os.createIndex('productKey', 'productKey', { unique: false });
        os.createIndex('store', 'store', { unique: false });
      }
      if (!db.objectStoreNames.contains('listItems')) {
        db.createObjectStore('listItems', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('synonyms')) {
        db.createObjectStore('synonyms', { keyPath: 'alias' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('tx abort'));
    tx.onerror = () => reject(tx.error || new Error('tx error'));
  });
}
async function dbGetAll(db, store) {
  const tx = db.transaction(store, 'readonly');
  const os = tx.objectStore(store);
  const req = os.getAll();
  const out = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  return out;
}
async function dbPut(db, store, value) {
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  await txDone(tx);
}
async function dbDelete(db, store, key) {
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await txDone(tx);
}
async function dbClear(db, store) {
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  await txDone(tx);
}

/* State */
const state = {
  db: null,
  purchases: [],
  listItems: [],
  settings: new Map(),
  synonyms: [],
  ui: {
    listFilter: 'all',
    registerPrefillTouched: {
      category: false,
      unit: false,
      brand: false
    },
    registerLastKnownKey: ''
  }
};

function sortPurchases(arr) {
  return arr.slice().sort((a,b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const ac = a.createdAt || '';
    const bc = b.createdAt || '';
    if (ac !== bc) return bc.localeCompare(ac);
    return String(b.id).localeCompare(String(a.id));
  });
}
function setPurchases(newArr) {
  state.purchases = sortPurchases(newArr);
}
function setListItems(newArr) {
  state.listItems = newArr.slice().sort((a,b)=> String(a.id).localeCompare(String(b.id)));
}
function getSetting(key, fallback) {
  if (state.settings.has(key)) return state.settings.get(key);
  return fallback;
}
async function setSetting(key, value) {
  try {
    await dbPut(state.db, 'settings', { key, value });
    state.settings.set(key, value);
    renderAll();
  } catch (e) {
    console.error(e);
    showToast('Impossibile salvare le impostazioni');
  }
}

function showToast(message, opts = {}) {
  const host = $id('toastHost');
  if (!host) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  const msg = document.createElement('div');
  msg.className = 'toast__msg';
  msg.textContent = String(message);
  const actions = document.createElement('div');
  actions.className = 'toast__actions';
  let timer = null;

  if (opts.actionText && typeof opts.onAction === 'function') {
    const btn = document.createElement('button');
    btn.className = 'toast__btn';
    btn.type = 'button';
    btn.textContent = opts.actionText;
    btn.addEventListener('click', () => {
      try { opts.onAction(); } catch (e) { console.error(e); }
      if (timer) clearTimeout(timer);
      toast.remove();
    }, { passive: true });
    actions.appendChild(btn);
  }
  const close = document.createElement('button');
  close.className = 'toast__btn';
  close.type = 'button';
  close.textContent = 'Ok';
  close.addEventListener('click', () => toast.remove(), { passive: true });
  actions.appendChild(close);

  toast.appendChild(msg);
  toast.appendChild(actions);
  host.appendChild(toast);
  const ms = Number(opts.ms || 5000);
  timer = setTimeout(() => { try { toast.remove(); } catch(_){} }, ms);
}

const modalQueue = [];
let modalOpen = false;

function openModal(config) {
  return new Promise((resolve) => {
    modalQueue.push({ config, resolve });
    pumpModalQueue();
  });
}

function pumpModalQueue() {
  if (modalOpen) return;
  const item = modalQueue.shift();
  if (!item) return;
  modalOpen = true;
  const { config, resolve } = item;

  const host = $id('modalHost');
  const backdrop = $id('modalBackdrop');
  const panel = $id('modalPanel');
  const title = $id('modalTitle');
  const body = $id('modalBody');
  const btnCancel = $id('modalCancelBtn');
  const btnOk = $id('modalOkBtn');
  if (!host || !backdrop || !panel || !title || !body || !btnCancel || !btnOk) {
    modalOpen = false;
    resolve({ ok: false, reason: 'missing modal dom' });
    pumpModalQueue();
    return;
  }

  const closeModal = (result) => {
    host.hidden = true;
    body.innerHTML = '';
    title.textContent = '—';
    btnOk.textContent = 'Conferma';
    btnOk.className = 'btn btn-primary';
    btnOk.disabled = false;
    btnCancel.textContent = 'Annulla';
    btnCancel.disabled = false;
    backdrop.onclick = null;
    btnCancel.onclick = null;
    btnOk.onclick = null;
    host.onkeydown = null;
    modalOpen = false;
    resolve(result);
    pumpModalQueue();
  };

  title.textContent = String(config.title || 'Conferma');
  body.innerHTML = config.bodyHtml || '';
  btnOk.textContent = String(config.okText || 'Conferma');
  btnCancel.textContent = String(config.cancelText || 'Annulla');
  if (config.okClass === 'danger') btnOk.className = 'btn btn-danger';

  const cancel = () => closeModal({ ok: false });
  const ok = () => {
    try {
      if (typeof config.validate === 'function') {
        const msg = config.validate();
        if (msg) {
          showToast(msg);
          return;
        }
      }
      const value = typeof config.getValue === 'function' ? config.getValue() : null;
      closeModal({ ok: true, value });
    } catch (e) {
      console.error(e);
      showToast('Impossibile completare l’operazione');
    }
  };

  backdrop.onclick = cancel;
  btnCancel.onclick = cancel;
  btnOk.onclick = ok;
  host.onkeydown = (e) => {
    if (e.key === 'Escape') cancel();
  };

  host.hidden = false;

  const first = body.querySelector('input,select,textarea,button');
  if (first && first.focus) setTimeout(() => { try { first.focus(); } catch(_){} }, 0);
}

/* App logic */
function getLastPurchaseForKey(productKey) {
  for (const p of state.purchases) if (p.productKey === productKey) return p;
  return null;
}
function getUnitAvgForKey(productKey, baseUnit) {
  let sum = 0, count = 0;
  for (const p of state.purchases) {
    if (p.productKey !== productKey) continue;
    if (unitBase(p.unit) !== baseUnit) continue;
    const up = unitPrice(p.price, p.qty, p.unit);
    if (!Number.isFinite(up)) continue;
    sum += up; count++;
  }
  if (count === 0) return NaN;
  return sum / count;
}

async function ensureAutoListReset(productKey) {
  const autoId = `auto:${productKey}`;
  const item = state.listItems.find(x => x.id === autoId);
  if (!item) return;
  if (!item.hiddenUntilPurchase) return;
  const updated = { ...item, hiddenUntilPurchase: false };
  try {
    await dbPut(state.db, 'listItems', updated);
    setListItems(state.listItems.map(x => x.id === autoId ? updated : x));
  } catch (e) {
    console.error(e);
  }
}

async function addPurchase(purchase) {
  try {
    await dbPut(state.db, 'purchases', purchase);
    setPurchases([purchase, ...state.purchases.filter(p => p.id !== purchase.id)]);
    await ensureAutoListReset(purchase.productKey);
    renderAll();
    return true;
  } catch (e) {
    console.error(e);
    showToast('Impossibile salvare l’acquisto');
    return false;
  }
}

async function deletePurchase(id) {
  const existing = state.purchases.find(p => p.id === id);
  if (!existing) return null;
  try {
    await dbDelete(state.db, 'purchases', id);
    setPurchases(state.purchases.filter(p => p.id !== id));
    renderAll();
    return existing;
  } catch (e) {
    console.error(e);
    showToast('Impossibile eliminare l’acquisto');
    return null;
  }
}

async function restorePurchase(purchase) {
  try {
    await dbPut(state.db, 'purchases', purchase);
    setPurchases([purchase, ...state.purchases.filter(p => p.id !== purchase.id)]);
    renderAll();
    return true;
  } catch (e) {
    console.error(e);
    showToast('Impossibile ripristinare l’acquisto');
    return false;
  }
}

function buildTrashIconSvg() {
  return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h5v2H3V5h5l1-2Zm1 7h2v9h-2v-9Zm4 0h2v9h-2v-9ZM6 8h12l-1 13H7L6 8Z"/></svg>';
}

function updateRegisterUnitPrice() {
  const qtyEl = $id('qtyInput');
  const unitEl = $id('unitSelect');
  const priceEl = $id('priceInput');
  const row = $id('unitPriceRow');
  const txt = $id('unitPriceText');
  if (!qtyEl || !unitEl || !priceEl || !row || !txt) return;

  const qty = parseNumber(qtyEl.value);
  const price = parseNumber(priceEl.value);
  const unit = unitEl.value;
  const up = unitPrice(price, qty, unit);
  if (Number.isFinite(up)) {
    row.hidden = false;
    const base = unitLabelBase(unit);
    txt.textContent = `${formatMoneyEUR(round2(up))}/${base}`;
  } else {
    row.hidden = true;
    txt.textContent = '—';
  }
  updateRegisterBadge();
}

function updateRegisterBadge() {
  const badgeRow = $id('priceBadgeRow');
  const badgeEl = $id('priceBadge');
  const badgeDetails = $id('priceBadgeDetails');
  const prodEl = $id('productInput');
  const qtyEl = $id('qtyInput');
  const unitEl = $id('unitSelect');
  const priceEl = $id('priceInput');
  if (!badgeRow || !badgeEl || !badgeDetails || !prodEl || !qtyEl || !unitEl || !priceEl) return;

  const key = toProductKey(prodEl.value);
  if (!key) {
    badgeRow.hidden = true;
    return;
  }
  const qty = parseNumber(qtyEl.value);
  const price = parseNumber(priceEl.value);
  const unit = unitEl.value;
  const up = unitPrice(price, qty, unit);
  const avg = getUnitAvgForKey(key, unitBase(unit));
  const b = computePriceBadge(up, avg);
  if (!b) {
    badgeRow.hidden = true;
    return;
  }
  badgeRow.hidden = false;
  badgeEl.className = `badge ${b.cls}`;
  badgeEl.textContent = b.label;
  badgeDetails.textContent = `Media: ${formatMoneyEUR(round2(avg))}/${unitBase(unit)}`;
}

function updateRegisterLastPurchase() {
  const prodEl = $id('productInput');
  const currentKey = normalizeProductKey(prodEl ? prodEl.value : '');
  if (state.ui.lastPrefillProductKey !== currentKey) {
    state.ui.lastPrefillProductKey = currentKey;
    resetRegisterPrefillTouched();
  }
  
  const card = $id('lastPurchaseCard');
  const txt = $id('lastPurchaseText');
  if (!prodEl || !card || !txt) return;
  const key = toProductKey(prodEl.value);
  if (!key) {
    card.hidden = true;
    txt.textContent = '';
    return;
  }
  const last = getLastPurchaseForKey(key);
  if (!last) {
    card.hidden = true;
    txt.textContent = '';
    return;
  }
  const up = unitPrice(last.price, last.qty, last.unit);
  const upTxt = Number.isFinite(up) ? `${formatMoneyEUR(round2(up))}/${unitBase(last.unit)}` : '—';
  txt.textContent = `${formatDateIT(last.date)} • ${last.store || '—'} • ${formatMoneyEUR(last.price)} • ${upTxt}`;

  // Prefill (only if user hasn't touched)
  if (state.ui.registerLastKnownKey !== key) {
    const catEl = $id('categorySelect');
    const unitEl = $id('unitSelect');
    const brandEl = $id('brandInput');
    if (catEl && !state.ui.registerPrefillTouched.category) catEl.value = last.category || catEl.value;
    if (unitEl && !state.ui.registerPrefillTouched.unit) unitEl.value = last.unit || unitEl.value;
    if (brandEl && !state.ui.registerPrefillTouched.brand) brandEl.value = last.brand || '';
    state.ui.registerLastKnownKey = key;
    updateRegisterUnitPrice();
  }

  card.hidden = false;
}

function resetRegisterForm() {
  const product = $id('productInput');
  const category = $id('categorySelect');
  const qty = $id('qtyInput');
  const unit = $id('unitSelect');
  const price = $id('priceInput');
  const date = $id('dateInput');
  const store = $id('storeInput');
  const brand = $id('brandInput');
  const notes = $id('notesInput');
  if (product) product.value = '';
  if (category) category.value = 'Altro';
  if (qty) qty.value = '1';
  if (unit) unit.value = 'pz';
  if (price) price.value = '';
  if (date) date.value = todayLocalYMD();
  if (store) store.value = '';
  if (brand) brand.value = '';
  if (notes) notes.value = '';
  state.ui.registerPrefillTouched = { category: false, unit: false, brand: false };
  state.ui.registerLastKnownKey = '';
  const lastCard = $id('lastPurchaseCard');
  const lastTxt = $id('lastPurchaseText');
  if (lastCard) lastCard.hidden = true;
  if (lastTxt) lastTxt.textContent = '';
  const badgeRow = $id('priceBadgeRow');
  if (badgeRow) badgeRow.hidden = true;
  const unitPriceRow = $id('unitPriceRow');
  if (unitPriceRow) unitPriceRow.hidden = true;
  if (product && product.focus) product.focus();
}

function getRegisterFormData() {
  const productEl = $id('productInput');
  const categoryEl = $id('categorySelect');
  const qtyEl = $id('qtyInput');
  const unitEl = $id('unitSelect');
  const priceEl = $id('priceInput');
  const dateEl = $id('dateInput');
  const storeEl = $id('storeInput');
  const brandEl = $id('brandInput');
  const notesEl = $id('notesInput');

  const product = String(productEl?.value ?? '').trim();
  const productKey = toProductKey(product);
  const category = String(categoryEl?.value ?? 'Altro');
  const qty = parseNumber(qtyEl?.value ?? '');
  const unit = String(unitEl?.value ?? 'pz');
  const price = parseNumber(priceEl?.value ?? '');
  const date = String(dateEl?.value ?? '');
  const store = String(storeEl?.value ?? '').trim();
  const brand = String(brandEl?.value ?? '').trim();
  const notes = String(notesEl?.value ?? '').trim();

  return { product, productKey, category, qty, unit, price, date, store, brand, notes };
}

function validatePurchaseFields(d) {
  if (!d.productKey) return 'Inserisci il prodotto';
  if (!Number.isFinite(d.qty) || d.qty <= 0) return 'Quantità non valida';
  if (!Number.isFinite(d.price) || d.price < 0) return 'Prezzo non valido';
  if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(d.date)) return 'Data non valida';
  if (!Number.isFinite(ymdToUTCms(d.date))) return 'Data non valida';
  return null;
}

function makePurchaseId(d) {
  const base = `${d.productKey}|${d.date}|${d.store}|${d.brand}|${d.price}|${d.qty}|${d.unit}|${d.category}|${d.notes}`;
  const hash = typeof crypto !== 'undefined' && crypto.subtle ? null : null;
  // deterministic enough: use stable hash in JS
  let h = 0;
  for (let i=0;i<base.length;i++){
    h = ((h<<5)-h) + base.charCodeAt(i);
    h |= 0;
  }
  return `p:${d.date}:${Math.abs(h)}`;
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const d = getRegisterFormData();
  const err = validatePurchaseFields(d);
  if (err) {
    showToast(err);
    return;
  }
  const nowIso = new Date().toISOString();
  const purchase = {
    id: `p:${Date.now()}:${Math.random().toString(16).slice(2)}`,
    product: d.product,
    productKey: d.productKey,
    category: d.category,
    qty: d.qty,
    unit: d.unit,
    price: round2(d.price),
    date: d.date,
    store: d.store,
    brand: d.brand,
    notes: d.notes,
    receiptId: null,
    createdAt: nowIso,
    updatedAt: nowIso
  };
  const ok = await addPurchase(purchase);
  if (!ok) return;
  showToast('Acquisto salvato');
  resetRegisterForm();
}

function renderRecentPurchases() {
  const host = $id('recentPurchases');
  if (!host) return;
  const recent = state.purchases.slice(0, 8);
  host.innerHTML = '';
  if (recent.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'Nessun acquisto ancora.';
    host.appendChild(empty);
    return;
  }
  for (const p of recent) {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.id = p.id;

    const main = document.createElement('div');
    main.className = 'row__main';
    const title = document.createElement('div');
    title.className = 'row__title';
    title.textContent = p.product;
    const meta = document.createElement('div');
    meta.className = 'row__meta';
    meta.textContent = `${formatDateIT(p.date)} • ${p.store || '—'} • ${formatMoneyEUR(p.price)}`;
    main.appendChild(title);
    main.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'row__actions';
    const del = document.createElement('button');
    del.className = 'icon-btn';
    del.type = 'button';
    del.setAttribute('aria-label', 'Elimina');
    del.innerHTML = buildTrashIconSvg();
    del.addEventListener('click', async () => {
      const body = `<div class="muted">Confermi eliminazione?</div>
        <div class="divider"></div>
        <div><strong>${escapeHtml(p.product)}</strong></div>
        <div class="muted">${escapeHtml(formatDateIT(p.date))} • ${escapeHtml(formatMoneyEUR(p.price))}</div>`;
      const res = await openModal({
        title: 'Elimina acquisto',
        bodyHtml: body,
        okText: 'Elimina',
        okClass: 'danger'
      });
      if (!res.ok) return;
      const deleted = await deletePurchase(p.id);
      if (!deleted) return;
      showToast('Acquisto eliminato', {
        actionText: 'Annulla',
        ms: 5000,
        onAction: () => { restorePurchase(deleted); }
      });
    }, { passive: true });
    actions.appendChild(del);

    row.appendChild(main);
    row.appendChild(actions);
    host.appendChild(row);
  }
}

function renderDatalists() {
  const prodList = $id('productsDatalist');
  const storeList = $id('storesDatalist');
  if (prodList) prodList.innerHTML = '';
  if (storeList) storeList.innerHTML = '';

  const products = new Map();
  const stores = new Set();
  for (const p of state.purchases) {
    if (p.product) products.set(p.productKey, p.product);
    if (p.store) stores.add(p.store);
  }
  if (prodList) {
    for (const name of Array.from(products.values()).sort((a,b)=>a.localeCompare(b,'it'))) {
      const opt = document.createElement('option');
      opt.value = name;
      prodList.appendChild(opt);
    }
  }
  if (storeList) {
    for (const name of Array.from(stores).sort((a,b)=>a.localeCompare(b,'it'))) {
      const opt = document.createElement('option');
      opt.value = name;
      storeList.appendChild(opt);
    }
  }

  const histStore = $id('historyStore');
  if (histStore) {
    const current = histStore.value;
    histStore.innerHTML = '<option value="">Tutti</option>';
    for (const name of Array.from(stores).sort((a,b)=>a.localeCompare(b,'it'))) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      histStore.appendChild(opt);
    }
    histStore.value = current;
  }
}

function listFilterPredicate(item) {
  if (state.ui.listFilter === 'all') return true;
  // needed: in ritardo/a breve + manuali
  if (item.kind === 'manual') return true;
  return item.status === 'In ritardo' || item.status === 'A breve';
}

function computeListView() {
  const { items, insufficient } = computeIntervals(state.purchases);

  // Auto items
  const auto = [];
  for (const it of items) {
    const id = `auto:${it.productKey}`;
    const dbItem = state.listItems.find(x => x.id === id);
    const checked = !!dbItem?.checked;
    const hidden = !!dbItem?.hiddenUntilPurchase;
    auto.push({
      kind: 'auto',
      id,
      productKey: it.productKey,
      name: it.name,
      category: it.category || 'Altro',
      status: it.status,
      latestDate: it.latestDate,
      predictedDate: it.predictedDate,
      deltaDays: it.deltaDays,
      checked,
      hiddenUntilPurchase: hidden,
      cheapest: it.cheapest
    });
  }
  const autoIns = insufficient.map(it => {
    const id = `auto:${it.productKey}`;
    const dbItem = state.listItems.find(x => x.id === id);
    return {
      kind: 'auto-insufficient',
      id,
      productKey: it.productKey,
      name: it.name,
      category: it.category || 'Altro',
      latestDate: it.latestDate,
      checked: !!dbItem?.checked,
      hiddenUntilPurchase: !!dbItem?.hiddenUntilPurchase,
      cheapest: it.cheapest
    };
  });

  // Manual items
  const manual = state.listItems
    .filter(x => !String(x.id).startsWith('auto:'))
    .map(x => ({
      kind: 'manual',
      id: x.id,
      productKey: x.productKey,
      name: x.name,
      category: x.category || 'Altro',
      checked: !!x.checked,
      createdAt: x.createdAt
    }));

  // counts (only autos not hidden)
  let late=0, soon=0, ok=0;
  for (const it of auto) {
    if (it.hiddenUntilPurchase) continue;
    if (it.status === 'In ritardo') late++;
    else if (it.status === 'A breve') soon++;
    else ok++;
  }

  const needed = auto.filter(it => !it.hiddenUntilPurchase).filter(listFilterPredicate);
  const manualVisible = manual.filter(listFilterPredicate);

  const insufficientVisible = autoIns.filter(it => !it.hiddenUntilPurchase).filter(listFilterPredicate);

  return { late, soon, ok, needed, insufficient: insufficientVisible, manual: manualVisible, allAuto: auto, allManual: manual };
}

async function upsertListItem(item, toastMsgOnFail) {
  try {
    await dbPut(state.db, 'listItems', item);
    const existingIdx = state.listItems.findIndex(x => x.id === item.id);
    if (existingIdx >= 0) {
      const arr = state.listItems.slice();
      arr[existingIdx] = item;
      setListItems(arr);
    } else {
      setListItems([...state.listItems, item]);
    }
    renderAll();
    return true;
  } catch (e) {
    console.error(e);
    showToast(toastMsgOnFail || 'Impossibile salvare la voce');
    return false;
  }
}

function renderList() {
  const countLate = $id('countLate');
  const countSoon = $id('countSoon');
  const countOk = $id('countOk');
  const content = $id('listContent');
  if (!content) return;

  const allBtn = $id('listFilterAllBtn');
  const needBtn = $id('listFilterNeededBtn');
  if (allBtn && needBtn) {
    allBtn.setAttribute('aria-pressed', state.ui.listFilter === 'all' ? 'true' : 'false');
    needBtn.setAttribute('aria-pressed', state.ui.listFilter === 'needed' ? 'true' : 'false');
  }

  const view = computeListView();
  if (countLate) countLate.textContent = String(view.late);
  if (countSoon) countSoon.textContent = String(view.soon);
  if (countOk) countOk.textContent = String(view.ok);

  content.innerHTML = '';

  const renderGroup = (title, items) => {
    if (items.length === 0) return;
    const group = document.createElement('div');
    group.className = 'category-group';
    const head = document.createElement('div');
    head.className = 'category-group__head';
    const t = document.createElement('div');
    t.className = 'category-group__title';
    t.textContent = title;
    head.appendChild(t);
    group.appendChild(head);

    const body = document.createElement('div');
    body.className = 'category-group__body';

    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'row';
      row.dataset.id = it.id;

      const main = document.createElement('div');
      main.className = 'row__main';
      const name = document.createElement('div');
      name.className = 'row__title';
      name.textContent = it.name;

      const meta = document.createElement('div');
      meta.className = 'row__meta';

      if (it.kind === 'auto') {
        const delta = Math.round(it.deltaDays);
        const deltaTxt = it.deltaDays < 0 ? `${Math.abs(delta)} gg di ritardo` : `${delta} gg`;
        const cheapest = it.cheapest ? ` • Miglior negozio: ${it.cheapest.store}` : '';
        meta.textContent = `Ultimo: ${formatDateIT(it.latestDate)} • Previsto: ${formatDateIT(it.predictedDate)} • ${deltaTxt}${cheapest}`;
      } else if (it.kind === 'auto-insufficient') {
        meta.textContent = `Ultimo: ${formatDateIT(it.latestDate)} • Dati insufficienti`;
      } else {
        meta.textContent = 'Voce manuale';
      }

      main.appendChild(name);
      main.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'row__actions';

      if (it.kind === 'auto') {
        const pill = document.createElement('span');
        pill.className = 'pill ' + (it.status === 'In ritardo' ? 'pill--danger' : (it.status === 'A breve' ? 'pill--warn' : 'pill--ok'));
        pill.textContent = it.status;
        actions.appendChild(pill);
      }

      const chk = document.createElement('label');
      chk.className = 'checkbox';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!it.checked;
      input.addEventListener('change', async () => {
        const nowIso = new Date().toISOString();
        const record = (state.listItems.find(x => x.id === it.id)) || {
          id: it.id,
          name: it.name,
          productKey: it.productKey,
          category: it.category,
          createdAt: nowIso
        };
        const updated = { ...record, checked: input.checked };
        await upsertListItem(updated, 'Impossibile aggiornare la voce');
      });
      const span = document.createElement('span');
      span.textContent = 'Spuntato';
      chk.appendChild(input);
      chk.appendChild(span);
      actions.appendChild(chk);

      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn btn-primary btn-sm';
      saveBtn.type = 'button';
      saveBtn.textContent = 'Salva';
      saveBtn.addEventListener('click', async () => {
        await openSaveFromListModal(it);
      }, { passive: true });
      actions.appendChild(saveBtn);

      if (it.kind === 'manual') {
        const del = document.createElement('button');
        del.className = 'icon-btn';
        del.type = 'button';
        del.setAttribute('aria-label', 'Elimina voce');
        del.innerHTML = buildTrashIconSvg();
        del.addEventListener('click', async () => {
          const res = await openModal({
            title: 'Elimina voce',
            bodyHtml: `<div><strong>${escapeHtml(it.name)}</strong></div>`,
            okText: 'Elimina',
            okClass: 'danger'
          });
          if (!res.ok) return;
          try {
            await dbDelete(state.db, 'listItems', it.id);
            setListItems(state.listItems.filter(x => x.id !== it.id));
            renderAll();
            showToast('Voce eliminata');
          } catch (e) {
            console.error(e);
            showToast('Impossibile eliminare la voce');
          }
        }, { passive: true });
        actions.appendChild(del);
      }

      row.appendChild(main);
      row.appendChild(actions);
      body.appendChild(row);
    }

    group.appendChild(body);
    content.appendChild(group);
  };

  const byCat = new Map();
  for (const it of view.needed.concat(view.manual)) {
    if (it.kind !== 'auto' && it.kind !== 'manual') continue;
    const cat = it.category || 'Altro';
    const arr = byCat.get(cat) || [];
    arr.push(it);
    byCat.set(cat, arr);
  }
  const cats = Array.from(byCat.keys()).sort((a,b)=>a.localeCompare(b,'it'));
  for (const c of cats) {
    const arr = byCat.get(c) || [];
    renderGroup(c, arr);
  }

  if (view.insufficient.length) {
    renderGroup('Dati insufficienti', view.insufficient);
  }

  if (content.childElementCount === 0) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'Nessuna voce da mostrare.';
    content.appendChild(empty);
  }
}

async function openSaveFromListModal(item) {
  const last = item.kind === 'auto' ? getLastPurchaseForKey(item.productKey) : getLastPurchaseForKey(item.productKey);
  const defaults = {
    product: item.name,
    category: item.category || 'Altro',
    qty: 1,
    unit: 'pz',
    price: 0,
    store: '',
    brand: '',
    notes: ''
  };
  const pre = last ? {
    product: last.product,
    category: last.category || defaults.category,
    qty: last.qty,
    unit: last.unit,
    price: last.price,
    store: last.store || '',
    brand: last.brand || '',
    notes: last.notes || ''
  } : defaults;

  const bodyHtml = `
  <div class="form">
    <div class="form-row">
      <label class="label" for="mProduct">Prodotto<span class="req">*</span></label>
      <input id="mProduct" class="input" type="text" value="${escapeHtml(pre.product)}">
    </div>
    <div class="form-row">
      <label class="label" for="mCategory">Categoria</label>
      <select id="mCategory" class="select">
        ${['Frutta e verdura','Carne e pesce','Latticini','Pane e cereali','Bevande','Surgelati','Dispensa','Casa e pulizia','Igiene personale','Altro'].map(c => `<option ${c===pre.category?'selected':''}>${escapeHtml(c)}</option>`).join('')}
      </select>
    </div>
    <div class="form-grid">
      <div class="form-row">
        <label class="label" for="mQty">Quantità<span class="req">*</span></label>
        <input id="mQty" class="input" type="text" inputmode="decimal" value="${escapeHtml(formatNumberInput(pre.qty))}">
      </div>
      <div class="form-row">
        <label class="label" for="mUnit">Unità</label>
        <select id="mUnit" class="select">
          ${['pz','kg','g','l','ml'].map(u => `<option ${u===pre.unit?'selected':''}>${u}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <label class="label" for="mPrice">Prezzo totale €<span class="req">*</span></label>
        <input id="mPrice" class="input" type="text" inputmode="decimal" value="${escapeHtml(formatNumberInput(pre.price))}">
      </div>
      <div class="form-row">
        <label class="label" for="mDate">Data acquisto<span class="req">*</span></label>
        <input id="mDate" class="input" type="date" value="${escapeHtml(todayLocalYMD())}">
      </div>
    </div>
    <div class="form-row">
      <label class="label" for="mStore">Negozio</label>
      <input id="mStore" class="input" type="text" value="${escapeHtml(pre.store)}">
    </div>
    <div class="form-row">
      <label class="label" for="mBrand">Marca</label>
      <input id="mBrand" class="input" type="text" value="${escapeHtml(pre.brand)}">
    </div>
    <div class="form-row">
      <label class="label" for="mNotes">Note</label>
      <textarea id="mNotes" class="textarea" rows="3">${escapeHtml(pre.notes)}</textarea>
    </div>
  </div>`;

  const validate = () => {
    const product = String($('#mProduct', $id('modalBody'))?.value ?? '').trim();
    const qty = parseNumber($('#mQty', $id('modalBody'))?.value ?? '');
    const price = parseNumber($('#mPrice', $id('modalBody'))?.value ?? '');
    const date = String($('#mDate', $id('modalBody'))?.value ?? '');
    if (!toProductKey(product)) return 'Inserisci il prodotto';
    if (!Number.isFinite(qty) || qty <= 0) return 'Quantità non valida';
    if (!Number.isFinite(price) || price < 0) return 'Prezzo non valido';
    if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(date)) return 'Data non valida';
    if (!Number.isFinite(ymdToUTCms(date))) return 'Data non valida';
    return null;
  };

  const getValue = () => {
    const product = String($('#mProduct', $id('modalBody'))?.value ?? '').trim();
    const productKey = toProductKey(product);
    const category = String($('#mCategory', $id('modalBody'))?.value ?? 'Altro');
    const qty = parseNumber($('#mQty', $id('modalBody'))?.value ?? '');
    const unit = String($('#mUnit', $id('modalBody'))?.value ?? 'pz');
    const price = parseNumber($('#mPrice', $id('modalBody'))?.value ?? '');
    const date = String($('#mDate', $id('modalBody'))?.value ?? '');
    const store = String($('#mStore', $id('modalBody'))?.value ?? '').trim();
    const brand = String($('#mBrand', $id('modalBody'))?.value ?? '').trim();
    const notes = String($('#mNotes', $id('modalBody'))?.value ?? '').trim();
    return { product, productKey, category, qty, unit, price, date, store, brand, notes };
  };

  const res = await openModal({
    title: 'Registra acquisto',
    bodyHtml,
    okText: 'Salva',
    validate,
    getValue
  });
  if (!res.ok) return;

  const d = res.value;
  const nowIso = new Date().toISOString();
  const purchase = {
    id: `p:${Date.now()}:${Math.random().toString(16).slice(2)}`,
    product: d.product,
    productKey: d.productKey,
    category: d.category,
    qty: d.qty,
    unit: d.unit,
    price: round2(d.price),
    date: d.date,
    store: d.store,
    brand: d.brand,
    notes: d.notes,
    receiptId: null,
    createdAt: nowIso,
    updatedAt: nowIso
  };
  const ok = await addPurchase(purchase);
  if (!ok) return;

  // mark list item checked
  const existing = state.listItems.find(x => x.id === item.id) || {
    id: item.id,
    name: item.name,
    productKey: item.productKey,
    category: item.category || 'Altro',
    createdAt: nowIso
  };
  await upsertListItem({ ...existing, checked: true }, 'Impossibile aggiornare la voce');
  showToast('Acquisto salvato');
}

async function addManualItem() {
  const nameEl = $id('manualItemName');
  const catEl = $id('manualItemCategory');
  const name = String(nameEl?.value ?? '').trim();
  const category = String(catEl?.value ?? 'Altro');
  if (!toProductKey(name)) {
    showToast('Inserisci il nome della voce');
    return;
  }
  const nowIso = new Date().toISOString();
  const id = `m:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const item = { id, name, productKey: toProductKey(name), category, checked: false, createdAt: nowIso };
  const ok = await upsertListItem(item, 'Impossibile aggiungere la voce');
  if (!ok) return;
  if (nameEl) nameEl.value = '';
  showToast('Voce aggiunta');
}

async function removeCheckedItems() {
  const toDelete = [];
  const toUpdate = [];
  for (const it of state.listItems) {
    const isAuto = String(it.id).startsWith('auto:');
    if (!it.checked) continue;
    if (isAuto) {
      toUpdate.push({ ...it, hiddenUntilPurchase: true });
    } else {
      toDelete.push(it.id);
    }
  }
  try {
    const tx = state.db.transaction('listItems', 'readwrite');
    const os = tx.objectStore('listItems');
    for (const id of toDelete) os.delete(id);
    for (const it of toUpdate) os.put(it);
    await txDone(tx);
    setListItems(state.listItems.filter(x => !toDelete.includes(x.id)).map(x => {
      const u = toUpdate.find(y => y.id === x.id);
      return u ? u : x;
    }));
    renderAll();
    showToast('Operazione completata');
  } catch (e) {
    console.error(e);
    showToast('Impossibile rimuovere le voci');
  }
}

async function shareList() {
  const view = computeListView();
  const lines = [];
  for (const it of view.needed.concat(view.manual)) {
    if (it.kind === 'auto' && it.hiddenUntilPurchase) continue;
    if (!listFilterPredicate(it)) continue;
    lines.push(`- ${it.name}`);
  }
  const text = lines.length ? `Lista da comprare:\n${lines.join('\n')}` : 'Lista da comprare: (vuota)';
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Lista Spesa', text });
      showToast('Lista condivisa');
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    console.error(e);
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      showToast('Lista copiata negli appunti');
      return;
    }
  } catch (e) {
    console.error(e);
  }
  showToast(text, { ms: 7000 });
}

/* History */
function historyFilters() {
  return {
    q: String($id('historySearch')?.value ?? '').trim().toLowerCase(),
    category: String($id('historyCategory')?.value ?? ''),
    store: String($id('historyStore')?.value ?? ''),
    from: String($id('historyFrom')?.value ?? ''),
    to: String($id('historyTo')?.value ?? '')
  };
}
function applyHistoryFilters(purchases, f) {
  return purchases.filter(p => {
    if (f.q) {
      const hay = `${p.product||''} ${p.brand||''} ${p.notes||''}`.toLowerCase();
      if (!hay.includes(f.q)) return false;
    }
    if (f.category && p.category !== f.category) return false;
    if (f.store && (p.store || '') !== f.store) return false;
    if (f.from && p.date < f.from) return false;
    if (f.to && p.date > f.to) return false;
    return true;
  });
}

async function openEditPurchaseModal(p) {
  const bodyHtml = `
  <div class="form">
    <div class="form-row">
      <label class="label" for="eProduct">Prodotto<span class="req">*</span></label>
      <input id="eProduct" class="input" type="text" value="${escapeHtml(p.product)}">
    </div>
    <div class="form-row">
      <label class="label" for="eCategory">Categoria</label>
      <select id="eCategory" class="select">
        ${['Frutta e verdura','Carne e pesce','Latticini','Pane e cereali','Bevande','Surgelati','Dispensa','Casa e pulizia','Igiene personale','Altro'].map(c => `<option ${c===p.category?'selected':''}>${escapeHtml(c)}</option>`).join('')}
      </select>
    </div>
    <div class="form-grid">
      <div class="form-row">
        <label class="label" for="eQty">Quantità<span class="req">*</span></label>
        <input id="eQty" class="input" type="text" inputmode="decimal" value="${escapeHtml(formatNumberInput(p.qty))}">
      </div>
      <div class="form-row">
        <label class="label" for="eUnit">Unità</label>
        <select id="eUnit" class="select">
          ${['pz','kg','g','l','ml'].map(u => `<option ${u===p.unit?'selected':''}>${u}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <label class="label" for="ePrice">Prezzo totale €<span class="req">*</span></label>
        <input id="ePrice" class="input" type="text" inputmode="decimal" value="${escapeHtml(formatNumberInput(p.price))}">
      </div>
      <div class="form-row">
        <label class="label" for="eDate">Data acquisto<span class="req">*</span></label>
        <input id="eDate" class="input" type="date" value="${escapeHtml(p.date)}">
      </div>
    </div>
    <div class="form-row">
      <label class="label" for="eStore">Negozio</label>
      <input id="eStore" class="input" type="text" value="${escapeHtml(p.store||'')}">
    </div>
    <div class="form-row">
      <label class="label" for="eBrand">Marca</label>
      <input id="eBrand" class="input" type="text" value="${escapeHtml(p.brand||'')}">
    </div>
    <div class="form-row">
      <label class="label" for="eNotes">Note</label>
      <textarea id="eNotes" class="textarea" rows="3">${escapeHtml(p.notes||'')}</textarea>
    </div>
  </div>`;

  const validate = () => {
    const product = String($('#eProduct', $id('modalBody'))?.value ?? '').trim();
    const qty = parseNumber($('#eQty', $id('modalBody'))?.value ?? '');
    const price = parseNumber($('#ePrice', $id('modalBody'))?.value ?? '');
    const date = String($('#eDate', $id('modalBody'))?.value ?? '');
    if (!toProductKey(product)) return 'Inserisci il prodotto';
    if (!Number.isFinite(qty) || qty <= 0) return 'Quantità non valida';
    if (!Number.isFinite(price) || price < 0) return 'Prezzo non valido';
    if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(date)) return 'Data non valida';
    if (!Number.isFinite(ymdToUTCms(date))) return 'Data non valida';
    return null;
  };

  const getValue = () => {
    const product = String($('#eProduct', $id('modalBody'))?.value ?? '').trim();
    const productKey = toProductKey(product);
    const category = String($('#eCategory', $id('modalBody'))?.value ?? 'Altro');
    const qty = parseNumber($('#eQty', $id('modalBody'))?.value ?? '');
    const unit = String($('#eUnit', $id('modalBody'))?.value ?? 'pz');
    const price = parseNumber($('#ePrice', $id('modalBody'))?.value ?? '');
    const date = String($('#eDate', $id('modalBody'))?.value ?? '');
    const store = String($('#eStore', $id('modalBody'))?.value ?? '').trim();
    const brand = String($('#eBrand', $id('modalBody'))?.value ?? '').trim();
    const notes = String($('#eNotes', $id('modalBody'))?.value ?? '').trim();
    return { product, productKey, category, qty, unit, price, date, store, brand, notes };
  };

  const res = await openModal({
    title: 'Modifica acquisto',
    bodyHtml,
    okText: 'Salva',
    validate,
    getValue
  });
  if (!res.ok) return;

  const d = res.value;
  const updated = {
    ...p,
    product: d.product,
    productKey: d.productKey,
    category: d.category,
    qty: d.qty,
    unit: d.unit,
    price: round2(d.price),
    date: d.date,
    store: d.store,
    brand: d.brand,
    notes: d.notes,
    updatedAt: new Date().toISOString()
  };
  try {
    await dbPut(state.db, 'purchases', updated);
    setPurchases([updated, ...state.purchases.filter(x => x.id !== updated.id)]);
    renderAll();
    showToast('Acquisto salvato');
  } catch (e) {
    console.error(e);
    showToast('Impossibile salvare le modifiche');
  }
}

function renderHistory() {
  const host = $id('historyList');
  const countEl = $id('historyCount');
  const totalEl = $id('historyTotal');
  if (!host) return;

  const filtered = applyHistoryFilters(state.purchases, historyFilters());
  host.innerHTML = '';
  let total = 0;
  for (const p of filtered) total += Number(p.price) || 0;

  if (countEl) countEl.textContent = String(filtered.length);
  if (totalEl) totalEl.textContent = formatMoneyEUR(round2(total));

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'Nessun acquisto corrispondente.';
    host.appendChild(empty);
    return;
  }

  for (const p of filtered) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = p.id;

    const title = document.createElement('div');
    title.className = 'row__title';
    title.textContent = p.product;

    const meta = document.createElement('div');
    meta.className = 'row__meta';
    const up = unitPrice(p.price, p.qty, p.unit);
    const upTxt = Number.isFinite(up) ? `${formatMoneyEUR(round2(up))}/${unitBase(p.unit)}` : '—';
    meta.textContent = `${formatDateIT(p.date)} • ${p.store || '—'} • ${formatMoneyEUR(p.price)} • ${upTxt}`;

    const actions = document.createElement('div');
    actions.className = 'form-actions';
    const edit = document.createElement('button');
    edit.className = 'btn btn-ghost';
    edit.type = 'button';
    edit.textContent = 'Modifica';
    edit.addEventListener('click', async () => { await openEditPurchaseModal(p); }, { passive: true });

    const del = document.createElement('button');
    del.className = 'icon-btn';
    del.type = 'button';
    del.setAttribute('aria-label', 'Elimina');
    del.innerHTML = buildTrashIconSvg();
    del.addEventListener('click', async () => {
      const body = `<div class="muted">Confermi eliminazione?</div>
        <div class="divider"></div>
        <div><strong>${escapeHtml(p.product)}</strong></div>
        <div class="muted">${escapeHtml(formatDateIT(p.date))} • ${escapeHtml(formatMoneyEUR(p.price))}</div>`;
      const res = await openModal({
        title: 'Elimina acquisto',
        bodyHtml: body,
        okText: 'Elimina',
        okClass: 'danger'
      });
      if (!res.ok) return;
      const deleted = await deletePurchase(p.id);
      if (!deleted) return;
      showToast('Acquisto eliminato', {
        actionText: 'Annulla',
        ms: 5000,
        onAction: () => { restorePurchase(deleted); }
      });
    }, { passive: true });

    actions.appendChild(edit);
    actions.appendChild(del);

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(actions);
    host.appendChild(card);
  }
}

/* Backup & settings */
function backupObject() {
  return {
    app: 'spesa-smart',
    schema: 1,
    exportedAt: new Date().toISOString(),
    purchases: state.purchases.slice(),
    listItems: state.listItems.slice(),
    settings: Array.from(state.settings.entries()).map(([key,value]) => ({ key, value })),
    synonyms: state.synonyms.slice()
  };
}

function validateBackup(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, reason: 'Formato non valido' };
  if (obj.app !== 'spesa-smart') return { ok: false, reason: 'App non valida' };
  if (obj.schema !== 1) return { ok: false, reason: 'Schema non valido' };
  const arrays = ['purchases','listItems','settings','synonyms'];
  for (const k of arrays) if (!Array.isArray(obj[k])) return { ok:false, reason:`Campo ${k} non valido` };
  return { ok:true };
}

function isValidPurchaseRecord(p) {
  if (!p || typeof p !== 'object') return false;
  const req = ['id','product','productKey','category','qty','unit','price','date','store','brand','notes','receiptId','createdAt','updatedAt'];
  for (const k of req) if (!(k in p)) return false;
  if (!String(p.id)) return false;
  if (!String(p.productKey)) return false;
  if (!Number.isFinite(Number(p.qty))) return false;
  if (!Number.isFinite(Number(p.price))) return false;
  if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(String(p.date))) return false;
  return true;
}
function isValidListItemRecord(x) {
  if (!x || typeof x !== 'object') return false;
  if (!('id' in x)) return false;
  if (!String(x.id)) return false;
  if (String(x.id).startsWith('auto:')) {
    if (!('checked' in x)) return false;
    if (!('hiddenUntilPurchase' in x)) return false;
  } else {
    if (!('name' in x)) return false;
    if (!('productKey' in x)) return false;
    if (!('category' in x)) return false;
    if (!('checked' in x)) return false;
    if (!('createdAt' in x)) return false;
  }
  return true;
}
function isValidSettingRecord(x) {
  return x && typeof x === 'object' && typeof x.key === 'string';
}
function isValidSynRecord(x) {
  return x && typeof x === 'object' && typeof x.alias === 'string';
}

async function exportBackup() {
  // v5: update lastBackupAt only after user actually completes export; AbortError must not change anything.
  const prevSettings = await dbGetAll('settings');
  const prev = (prevSettings || []).find(s => s && s.key === 'lastBackupAt');
  const prevValue = prev ? prev.value : null;

  const nowIso = new Date().toISOString();

  // Prepare settings snapshot with updated lastBackupAt (but do not persist yet)
  const settingsAll = await dbGetAll('settings');
  const settingsOut = (settingsAll || []).filter(r => r && r.key !== 'lastBackupAt');
  settingsOut.push({ key: 'lastBackupAt', value: nowIso });

  const backup = {
    app: 'spesa-smart',
    schema: 1,
    exportedAt: nowIso,
    purchases: await dbGetAll('purchases'),
    listItems: await dbGetAll('listItems'),
    settings: settingsOut,
    synonyms: await dbGetAll('synonyms')
  };
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const fileName = `spesa-smart-backup-${nowIso.slice(0,10)}.json`;

  let exported = false;
  try {
    if (navigator.share && navigator.canShare) {
      const file = new File([blob], fileName, { type: 'application/json' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Backup Spesa Smart' });
        exported = true;
      } else {
        await downloadBlob(blob, fileName);
        exported = true;
      }
    } else {
      await downloadBlob(blob, fileName);
      exported = true;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') {
      exported = false;
    } else {
      try {
        await downloadBlob(blob, fileName);
        exported = true;
      } catch (e2) {
        exported = false;
      }
    }
  }

  if (exported) {
    await dbPut('settings', { key: 'lastBackupAt', value: nowIso });
    await renderAll();
    showToast('Backup esportato');
  } else {
    if (prevValue === null || prevValue === undefined) {
      await dbDelete('settings', 'lastBackupAt');
    } else {
      await dbPut('settings', { key: 'lastBackupAt', value: prevValue });
    }
  }
}

function exportCsv() {
  const header = ['id','prodotto','categoria','quantita','unita','prezzo_totale','data','negozio','marca','note'];
  const lines = [header.map(csvEscapeField).join(';')];
  for (const p of state.purchases.slice().reverse()) {
    const row = [
      p.id,
      p.product,
      p.category,
      formatNumberInput(p.qty),
      p.unit,
      formatNumberInput(p.price),
      p.date,
      p.store,
      p.brand,
      p.notes
    ];
    lines.push(row.map(csvEscapeField).join(';'));
  }
  const bom = '\ufeff';
  const csv = bom + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const ymd = todayLocalYMD();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `spesa-smart-${ymd}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  showToast('CSV esportato');
}

async function importBackupFile(file, mode) {
  let text = '';
  try {
    text = await file.text();
  } catch (e) {
    console.error(e);
    showToast('Impossibile leggere il file');
    return;
  }
  let obj = null;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    showToast('File JSON non valido');
    return;
  }
  const v = validateBackup(obj);
  if (!v.ok) {
    showToast(v.reason);
    return;
  }

  const validPurchases = [];
  let discardedPurchases = 0;
  for (const p of obj.purchases) {
    if (isValidPurchaseRecord(p)) validPurchases.push(p);
    else discardedPurchases++;
  }
  const validListItems = [];
  let discardedList = 0;
  for (const x of obj.listItems) {
    if (isValidListItemRecord(x)) validListItems.push(x);
    else discardedList++;
  }
  const validSettings = [];
  let discardedSettings = 0;
  for (const x of obj.settings) {
    if (isValidSettingRecord(x)) validSettings.push(x);
    else discardedSettings++;
  }
  const validSyn = [];
  let discardedSyn = 0;
  for (const x of obj.synonyms) {
    if (isValidSynRecord(x)) validSyn.push(x);
    else discardedSyn++;
  }

  if (mode === 'replace') {
    const confirm1 = await openModal({
      title: 'Sostituisci dati',
      bodyHtml: '<div class="muted">Questa operazione sostituisce tutti i dati presenti.</div>',
      okText: 'Continua',
      okClass: 'danger'
    });
    if (!confirm1.ok) return;
  }

  try {
    if (mode === 'replace') {
      await dbClear(state.db, 'purchases');
      await dbClear(state.db, 'listItems');
      await dbClear(state.db, 'settings');
      await dbClear(state.db, 'synonyms');
      const tx = state.db.transaction(['purchases','listItems','settings','synonyms'], 'readwrite');
      const osP = tx.objectStore('purchases');
      const osL = tx.objectStore('listItems');
      const osS = tx.objectStore('settings');
      const osY = tx.objectStore('synonyms');
      for (const p of validPurchases) osP.put(p);
      for (const x of validListItems) osL.put(x);
      for (const x of validSettings) osS.put(x);
      for (const x of validSyn) osY.put(x);
      await txDone(tx);
      setPurchases(validPurchases);
      setListItems(validListItems);
      state.settings = new Map(validSettings.map(x => [x.key, x.value]));
      state.synonyms = validSyn.slice();
      renderAll();
      showToast(`Import completato. Acquisti: ${validPurchases.length} (scartati ${discardedPurchases})`);
      return;
    }

    // merge
    const existingP = new Map(state.purchases.map(p => [p.id, p]));
    for (const p of validPurchases) existingP.set(p.id, p);
    const mergedP = Array.from(existingP.values());
    const existingL = new Map(state.listItems.map(x => [x.id, x]));
    for (const x of validListItems) existingL.set(x.id, x);
    const mergedL = Array.from(existingL.values());
    const existingS = new Map(Array.from(state.settings.entries()).map(([k,v]) => [k, v]));
    for (const s of validSettings) existingS.set(s.key, s.value);
    const mergedS = Array.from(existingS.entries()).map(([key,value]) => ({ key, value }));
    const mergedSyn = state.synonyms.slice(); // keep current (synonyms unused)
    for (const x of validSyn) mergedSyn.push(x);

    const tx = state.db.transaction(['purchases','listItems','settings','synonyms'], 'readwrite');
    const osP = tx.objectStore('purchases');
    const osL = tx.objectStore('listItems');
    const osS = tx.objectStore('settings');
    const osY = tx.objectStore('synonyms');
    for (const p of mergedP) osP.put(p);
    for (const x of mergedL) osL.put(x);
    for (const x of mergedS) osS.put(x);
    for (const x of mergedSyn) osY.put(x);
    await txDone(tx);

    setPurchases(mergedP);
    setListItems(mergedL);
    state.settings = new Map(mergedS.map(x => [x.key, x.value]));
    state.synonyms = mergedSyn.slice();
    renderAll();
    showToast(`Import completato. Acquisti: ${validPurchases.length} (scartati ${discardedPurchases})`);
  } catch (e) {
    console.error(e);
    showToast('Impossibile importare il backup');
  }
}

function updateBackupBanner() {
  const banner = $id('backupBanner');
  const textEl = $id('backupBannerText');
  if (!banner || !textEl) return;
  const dismissed = sessionStorage.getItem('backupBannerDismissed') === '1';
  if (dismissed) { banner.hidden = true; return; }

  const days = Number(getSetting('backupReminderDays', 7));
  if (!Number.isFinite(days) || days <= 0) { banner.hidden = true; return; }
  if (state.purchases.length === 0) { banner.hidden = true; return; }

  const last = getSetting('lastBackupAt', null);
  if (!last) {
    textEl.textContent = 'Non risulta alcun backup. Esporta ora.';
    banner.hidden = false;
    return;
  }
  const lastDate = new Date(last);
  if (!Number.isFinite(lastDate.getTime())) {
    textEl.textContent = 'Backup non valido. Esporta ora.';
    banner.hidden = false;
    return;
  }
  const diff = (Date.now() - lastDate.getTime()) / 86400000;
  if (diff >= days) {
    textEl.textContent = `Ultimo backup: ${lastDate.toLocaleDateString('it-IT')}. Esporta ora.`;
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
}

async function wipeAllData() {
  const c1 = await openModal({
    title: 'Elimina tutti i dati',
    bodyHtml: '<div class="muted">Questa operazione elimina tutti i dati dal database.</div>',
    okText: 'Continua',
    okClass: 'danger'
  });
  if (!c1.ok) return;

  let inputEl = null;
  const res = await openModal({
    title: 'Conferma eliminazione',
    bodyHtml: `<div class="muted">Scrivi <strong>ELIMINA</strong> per confermare.</div>
      <div class="form-row" style="margin-top:12px;">
        <input id="wipeConfirmInput" class="input" type="text" inputmode="text" placeholder="ELIMINA">
      </div>`,
    okText: 'Elimina',
    okClass: 'danger',
    validate: () => {
      inputEl = $('#wipeConfirmInput', $id('modalBody'));
      const v = String(inputEl?.value ?? '');
      if (v !== 'ELIMINA') return 'Il testo non corrisponde';
      return null;
    },
    getValue: () => {
      inputEl = $('#wipeConfirmInput', $id('modalBody'));
      return String(inputEl?.value ?? '');
    }
  });
  if (!res.ok) return;

  try {
    await dbClear(state.db, 'purchases');
    await dbClear(state.db, 'listItems');
    await dbClear(state.db, 'settings');
    await dbClear(state.db, 'synonyms');
    setPurchases([]);
    setListItems([]);
    state.settings = new Map();
    state.synonyms = [];
    renderAll();
    showToast('Dati eliminati');
  } catch (e) {
    console.error(e);
    showToast('Impossibile eliminare i dati');
  }
}

/* Demo data */
function deterministicId(prefix, seed) {
  let h = 0;
  for (let i=0;i<seed.length;i++){ h = ((h<<5)-h) + seed.charCodeAt(i); h|=0; }
  return `${prefix}:${Math.abs(h)}`;
}
function addDaysYMD(ymd, days) {
  const ms = ymdToUTCms(ymd);
  const d = new Date(ms + days*86400000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth()+1).padStart(2,'0');
  const da = String(d.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
}

async function loadDemoData() {
  const ok = await confirmModal({
    title: 'Carica dati demo',
    message: 'Verranno inseriti acquisti demo (senza duplicati se già presenti). Confermi?'
  });
  if (!ok) return;

  const products = [
    ['Pasta', 'Alimentari', 'kg'],
    ['Riso', 'Alimentari', 'kg'],
    ['Latte', 'Alimentari', 'l'],
    ['Pane', 'Alimentari', 'pz'],
    ['Uova', 'Alimentari', 'pz'],
    ['Yogurt', 'Alimentari', 'pz'],
    ['Pomodori', 'Ortofrutta', 'kg'],
    ['Mele', 'Ortofrutta', 'kg'],
    ['Banane', 'Ortofrutta', 'kg'],
    ['Insalata', 'Ortofrutta', 'pz'],
    ['Patate', 'Ortofrutta', 'kg'],
    ['Cipolle', 'Ortofrutta', 'kg'],
    ['Pollo', 'Carne', 'kg'],
    ['Manzo', 'Carne', 'kg'],
    ['Prosciutto', 'Salumi', 'kg'],
    ['Tonno', 'Alimentari', 'pz'],
    ['Olio EVO', 'Alimentari', 'l'],
    ['Passata', 'Alimentari', 'pz'],
    ['Caffè', 'Alimentari', 'pz'],
    ['Acqua', 'Bevande', 'l'],
    ['Succo', 'Bevande', 'l'],
    ['Birra', 'Bevande', 'l'],
    ['Detersivo', 'Casa', 'pz'],
    ['Carta igienica', 'Casa', 'pz'],
    ['Sapone', 'Casa', 'pz'],
    ['Shampoo', 'Cura persona', 'pz'],
    ['Dentifricio', 'Cura persona', 'pz'],
    ['Formaggio', 'Latticini', 'kg'],
    ['Burro', 'Latticini', 'pz'],
    ['Gelato', 'Surgelati', 'pz'],
  ];
  const stores = ['Esselunga','Coop','Lidl','Conad','Carrefour'];

  const today = new Date();
  function ymdDaysAgo(days) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0,10);
  }

  const purchases=[];
  for (let pi=0; pi<products.length; pi++) {
    const [name, category, unit] = products[pi];
    const productKey = normalizeProductKey(name);
    for (let i=0;i<6;i++) {
      const daysAgo = 7 + (pi*3 + i*17) % 170;
      const date = ymdDaysAgo(daysAgo);
      const store = stores[(pi+i)%stores.length];
      const qty = unit==='pz' ? 1+((pi+i)%3) : (unit==='l'? 1 : 0.5 + ((pi+i)%5)*0.25);
      const price = unit==='pz' ? 1.2*qty + (pi%5)*0.2 : 2.0*qty + (pi%7)*0.3;
      purchases.push({
        id: `demo-${productKey}-${i}`,
        createdAt: `demo-${productKey}-${i}`,
        date,
        product: name,
        productKey,
        category,
        brand: '',
        store,
        qty: round3(qty),
        unit,
        price: round2(price),
        notes: ''
      });
    }
  }

  for (const p of purchases) {
    await dbPut('purchases', p);
  }

  await rebuildAutoListItemsFromPurchases();
  await renderAll();
  showToast('Dati demo caricati');
}

/* Storage info */
async function updateStorageInfo() {
  const status = $id('storageStatusText');
  const estimate = $id('storageEstimateText');
  if (status) status.textContent = 'Stato: —';
  if (estimate) estimate.textContent = 'Spazio: —';
  try {
    if (navigator.storage && navigator.storage.persisted) {
      const p = await navigator.storage.persisted();
      if (status) status.textContent = `Stato: ${p ? 'persistente' : 'non persistente'}`;
    } else if (status) {
      status.textContent = 'Stato: API non disponibile';
    }
  } catch (e) {
    console.error(e);
  }
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      const used = est.usage || 0;
      const quota = est.quota || 0;
      const fmt = (n) => {
        const v = Number(n);
        if (!Number.isFinite(v)) return '—';
        const mb = v/1024/1024;
        return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(mb) + ' MB';
      };
      if (estimate) estimate.textContent = `Spazio: ${fmt(used)} / ${fmt(quota)}`;
    } else if (estimate) {
      estimate.textContent = 'Spazio: API non disponibile';
    }
  } catch (e) {
    console.error(e);
  }
}

async function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      await navigator.storage.persist();
      await updateStorageInfo();
      showToast('Richiesta inviata');
    } else {
      showToast('API non disponibile');
    }
  } catch (e) {
    console.error(e);
    showToast('Impossibile richiedere');
  }
}

function renderAll() {
  renderDatalists();
  renderRecentPurchases();
  renderList();
  renderHistory();
  updateBackupBanner();
  updateLastBackupText();
  updateStorageInfo();
}

function updateLastBackupText() {
  const el = $id('lastBackupText');
  if (!el) return;
  const last = getSetting('lastBackupAt', null);
  if (!last) { el.textContent = 'Ultimo backup: mai'; return; }
  const d = new Date(last);
  if (!Number.isFinite(d.getTime())) { el.textContent = 'Ultimo backup: non valido'; return; }
  el.textContent = `Ultimo backup: ${d.toLocaleDateString('it-IT')}`;
}

/* Wiring */
async function init() {
  const dateEl = $id('dateInput');
  if (dateEl) dateEl.value = todayLocalYMD();

  try {
    state.db = await openDb();
  } catch (e) {
    console.error(e);
    showToast('Impossibile aprire il database');
    return;
  }

  try {
    const [purchases, listItems, settings, synonyms] = await Promise.all([
      dbGetAll(state.db, 'purchases'),
      dbGetAll(state.db, 'listItems'),
      dbGetAll(state.db, 'settings'),
      dbGetAll(state.db, 'synonyms')
    ]);
    setPurchases(purchases);
    setListItems(listItems);
    state.settings = new Map(settings.map(x => [x.key, x.value]));
    state.synonyms = synonyms.slice();
  } catch (e) {
    console.error(e);
  }

  // defaults
  if (!state.settings.has('backupReminderDays')) {
    state.settings.set('backupReminderDays', 7);
    dbPut(state.db, 'settings', { key: 'backupReminderDays', value: 7 }).catch(() => {});
  }
  if (!state.settings.has('listFilter')) {
    state.settings.set('listFilter', 'all');
    dbPut(state.db, 'settings', { key: 'listFilter', value: 'all' }).catch(() => {});
  }
  state.ui.listFilter = String(getSetting('listFilter', 'all')) === 'needed' ? 'needed' : 'all';

  const form = $id('purchaseForm');
  if (form) form.addEventListener('submit', handleRegisterSubmit);

  const qtyEl = $id('qtyInput');
  const unitEl = $id('unitSelect');
  const priceEl = $id('priceInput');
  const prodEl = $id('productInput');
  if (qtyEl) qtyEl.addEventListener('input', updateRegisterUnitPrice);
  if (unitEl) unitEl.addEventListener('change', () => {
    state.ui.registerPrefillTouched.unit = true;
    updateRegisterUnitPrice();
  });
  if (priceEl) priceEl.addEventListener('input', updateRegisterUnitPrice);
  if (prodEl) prodEl.addEventListener('input', () => {
    updateRegisterLastPurchase();
    updateRegisterUnitPrice();
  });
  const catEl = $id('categorySelect');
  const brandEl = $id('brandInput');
  if (catEl) catEl.addEventListener('change', () => { state.ui.registerPrefillTouched.category = true; });
  if (brandEl) brandEl.addEventListener('input', () => { state.ui.registerPrefillTouched.brand = true; });

  const allBtn = $id('listFilterAllBtn');
  const needBtn = $id('listFilterNeededBtn');
  if (allBtn) allBtn.addEventListener('click', async () => {
    state.ui.listFilter = 'all';
    await setSetting('listFilter', 'all');
  });
  if (needBtn) needBtn.addEventListener('click', async () => {
    state.ui.listFilter = 'needed';
    await setSetting('listFilter', 'needed');
  });

  const addManualBtn = $id('addManualItemBtn');
  if (addManualBtn) addManualBtn.addEventListener('click', addManualItem, { passive: true });

  const shareBtn = $id('shareListBtn');
  if (shareBtn) shareBtn.addEventListener('click', shareList, { passive: true });

  const removeCheckedBtn = $id('removeCheckedBtn');
  if (removeCheckedBtn) removeCheckedBtn.addEventListener('click', removeCheckedItems, { passive: true });

  const resetFiltersBtn = $id('resetHistoryFiltersBtn');
  if (resetFiltersBtn) resetFiltersBtn.addEventListener('click', () => {
    const s = $id('historySearch'); if (s) s.value = '';
    const c = $id('historyCategory'); if (c) c.value = '';
    const st = $id('historyStore'); if (st) st.value = '';
    const f = $id('historyFrom'); if (f) f.value = '';
    const t = $id('historyTo'); if (t) t.value = '';
    renderAll();
  }, { passive: true });

  for (const id of ['historySearch','historyCategory','historyStore','historyFrom','historyTo']) {
    const el = $id(id);
    if (el) el.addEventListener('input', () => renderAll());
    if (el) el.addEventListener('change', () => renderAll());
  }

  const exportBackupBtn = $id('exportBackupBtn');
  if (exportBackupBtn) exportBackupBtn.addEventListener('click', exportBackup, { passive: true });

  const importBtn = $id('importBackupBtn');
  const importInput = $id('importFileInput');
  if (importBtn && importInput) {
    importBtn.addEventListener('click', async () => {
      const body = `
        <div class="form">
          <div class="form-row">
            <label class="label" for="impMode">Modalità</label>
            <select id="impMode" class="select">
              <option value="merge">Unisci</option>
              <option value="replace">Sostituisci</option>
            </select>
          </div>
          <div class="muted">Dopo aver scelto, seleziona il file JSON.</div>
        </div>`;
      const res = await openModal({
        title: 'Importa backup',
        bodyHtml: body,
        okText: 'Scegli file',
        getValue: () => String($('#impMode', $id('modalBody'))?.value ?? 'merge')
      });
      if (!res.ok) return;
      importBtn.dataset.mode = res.value;
      importInput.value = '';
      importInput.click();
    });
    importInput.addEventListener('change', async () => {
      const file = importInput.files && importInput.files[0];
      if (!file) return;
      const mode = importBtn.dataset.mode === 'replace' ? 'replace' : 'merge';
      await importBackupFile(file, mode);
    });
  }

  const exportCsvBtn = $id('exportCsvBtn');
  if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportCsv, { passive: true });

  const backupReminder = $id('backupReminderSelect');
  if (backupReminder) {
    backupReminder.value = String(getSetting('backupReminderDays', 7));
    backupReminder.addEventListener('change', async () => {
      const v = Number(backupReminder.value);
      await setSetting('backupReminderDays', Number.isFinite(v) ? v : 7);
    });
  }

  const bannerExportBtn = $id('backupBannerExportBtn');
  const bannerDismissBtn = $id('backupBannerDismissBtn');
  if (bannerExportBtn) bannerExportBtn.addEventListener('click', exportBackup, { passive: true });
  if (bannerDismissBtn) bannerDismissBtn.addEventListener('click', () => {
    sessionStorage.setItem('backupBannerDismissed', '1');
    updateBackupBanner();
  }, { passive: true });

  const persistBtn = $id('persistStorageBtn');
  if (persistBtn) persistBtn.addEventListener('click', requestPersistentStorage, { passive: true });

  const loadDemoBtn = $id('loadDemoBtn');
  if (loadDemoBtn) loadDemoBtn.addEventListener('click', loadDemoData, { passive: true });

  const wipeBtn = $id('wipeAllBtn');
  if (wipeBtn) wipeBtn.addEventListener('click', wipeAllData, { passive: true });

  renderAll();
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch((e) => { console.error(e); });
});

/* Test surface */
window.__spesaTest = {
  VERSION,
  parseNumber,
  formatNumberInput,
  unitPrice,
  unitBase,
  qtyToBase,
  computePriceBadge,
  computeIntervals,
  computeStoreCheapest,
  formatDateIT,
  escapeHtml,
  csvEscapeField,
  validateBackup,
  isValidPurchaseRecord,
  isValidListItemRecord,
  isValidSettingRecord,
  backupObject,
  diffDaysUTC,
  ymdToUTCms
};
