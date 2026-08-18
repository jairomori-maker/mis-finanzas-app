// db.js — capa de persistencia local con IndexedDB (sin dependencias externas).
// Todo el dinero de la app vive únicamente en este dispositivo.

const DB_NAME = 'finanzas-personales';
const DB_VERSION = 1;

const STORES = {
  expenses: 'id',
  incomes: 'id',
  templates: 'id',
  incomeTemplates: 'id',
  budgets: 'grupo',
  saldos: 'id',
  retiros: 'id',
  tickets: 'id',
  categoryMap: 'categoria',
  meta: 'key',
};

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      Object.entries(STORES).forEach(([name, keyPath]) => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath });
        }
      });
      // índices útiles
      const tx = req.transaction;
      const expenseStore = tx.objectStore('expenses');
      if (!expenseStore.indexNames.contains('fecha')) expenseStore.createIndex('fecha', 'fecha');
      const incomeStore = tx.objectStore('incomes');
      if (!incomeStore.indexNames.contains('fecha')) incomeStore.createIndex('fecha', 'fecha');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

const Store = {
  async getAll(storeName) {
    const store = await tx(storeName);
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },
  async get(storeName, key) {
    const store = await tx(storeName);
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },
  async put(storeName, value) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  async bulkPut(storeName, values) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      values.forEach((v) => store.put(v));
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
    });
  },
  async delete(storeName, key) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
  async clear(storeName) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
};

window.DB = { openDB, Store, STORES };
