// Spesa Smart - IndexedDB layer (Promise-based)
const DB_NAME = 'spesaSmart';
const DB_VERSION = 1;

let _dbPromise = null;

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Errore IndexedDB'));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Transazione abortita'));
    tx.onerror = () => reject(tx.error || new Error('Errore transazione'));
  });
}

export async function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      // purchases
      if (!db.objectStoreNames.contains('purchases')) {
        const store = db.createObjectStore('purchases', { keyPath: 'id' });
        store.createIndex('productKey', 'productKey', { unique: false });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('store', 'store', { unique: false });
        store.createIndex('receiptId', 'receiptId', { unique: false });
      }

      // products
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'key' });
      }

      // shoppingList
      if (!db.objectStoreNames.contains('shoppingList')) {
        db.createObjectStore('shoppingList', { keyPath: 'id' });
      }

      // settings
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Impossibile aprire il database'));
  });

  return _dbPromise;
}

export async function withTx(storeNames, mode, fn) {
  const db = await openDB();
  const tx = db.transaction(storeNames, mode);
  const stores = {};
  for (const name of (Array.isArray(storeNames) ? storeNames : [storeNames])) {
    stores[name] = tx.objectStore(name);
  }
  const result = await fn(stores, tx);
  await txDone(tx);
  return result;
}

export async function getAll(storeName) {
  return withTx(storeName, 'readonly', async (s) => reqToPromise(s[storeName].getAll()));
}

export async function get(storeName, key) {
  return withTx(storeName, 'readonly', async (s) => reqToPromise(s[storeName].get(key)));
}

export async function put(storeName, value) {
  return withTx(storeName, 'readwrite', async (s) => reqToPromise(s[storeName].put(value)));
}

export async function bulkPut(storeName, values) {
  return withTx(storeName, 'readwrite', async (s) => {
    for (const v of values) s[storeName].put(v);
    return true;
  });
}

export async function del(storeName, key) {
  return withTx(storeName, 'readwrite', async (s) => reqToPromise(s[storeName].delete(key)));
}

export async function clear(storeName) {
  return withTx(storeName, 'readwrite', async (s) => reqToPromise(s[storeName].clear()));
}

export async function getByIndex(storeName, indexName, query) {
  return withTx(storeName, 'readonly', async (s) => reqToPromise(s[storeName].index(indexName).getAll(query)));
}

export async function getAllKeys(storeName) {
  return withTx(storeName, 'readonly', async (s) => reqToPromise(s[storeName].getAllKeys()));
}

export async function count(storeName) {
  return withTx(storeName, 'readonly', async (s) => reqToPromise(s[storeName].count()));
}

export async function exportAll() {
  return withTx(['purchases','products','shoppingList','settings'], 'readonly', async (s) => {
    const [purchases, products, shoppingList, settings] = await Promise.all([
      reqToPromise(s.purchases.getAll()),
      reqToPromise(s.products.getAll()),
      reqToPromise(s.shoppingList.getAll()),
      reqToPromise(s.settings.getAll())
    ]);
    return { purchases, products, shoppingList, settings };
  });
}

export async function importAllReplace(data) {
  return withTx(['purchases','products','shoppingList','settings'], 'readwrite', async (s) => {
    await Promise.all([
      reqToPromise(s.purchases.clear()),
      reqToPromise(s.products.clear()),
      reqToPromise(s.shoppingList.clear()),
      reqToPromise(s.settings.clear())
    ]);

    for (const p of (data.purchases || [])) s.purchases.put(p);
    for (const p of (data.products || [])) s.products.put(p);
    for (const it of (data.shoppingList || [])) s.shoppingList.put(it);
    for (const st of (data.settings || [])) s.settings.put(st);

    return true;
  });
}

export async function importAllMerge(data) {
  return withTx(['purchases','products','shoppingList','settings'], 'readwrite', async (s) => {
    const skipped = { purchases:0, products:0, shoppingList:0, settings:0 };
    const imported = { purchases:0, products:0, shoppingList:0, settings:0 };

    async function mergeOne(store, keyPath, item, bucket) {
      const key = item[keyPath];
      const existing = await reqToPromise(store.get(key));
      if (existing) { skipped[bucket]++; return; }
      store.put(item);
      imported[bucket]++;
    }

    for (const p of (data.purchases || [])) await mergeOne(s.purchases, 'id', p, 'purchases');
    for (const p of (data.products || [])) await mergeOne(s.products, 'key', p, 'products');
    for (const it of (data.shoppingList || [])) await mergeOne(s.shoppingList, 'id', it, 'shoppingList');
    for (const st of (data.settings || [])) await mergeOne(s.settings, 'key', st, 'settings');

    return { imported, skipped };
  });
}

export const DB_META = { DB_NAME, DB_VERSION };
