// banks.js — catálogo de bancos: texto libre, se construye solo la primera vez que se
// usa un nombre nuevo (mismo patrón que las categorías de gasto en categories.js).
// No requiere IA: es solo texto, no necesita inferencia de ningún tipo.

(function () {
  let bankNames = []; // orden de uso más reciente primero

  async function loadBankCatalog() {
    const rows = await DB.Store.getAll('bankCatalog');
    bankNames = rows.map((r) => r.nombre);
  }

  async function registerBank(nombre) {
    const clean = (nombre || '').trim();
    if (!clean) return;
    const exists = bankNames.some((b) => b.toLowerCase() === clean.toLowerCase());
    if (!exists) {
      bankNames.unshift(clean);
      await DB.Store.put('bankCatalog', { nombre: clean });
    }
  }

  function suggestBanks(query) {
    const key = (query || '').trim().toLowerCase();
    if (!key) return bankNames.slice(0, 8);
    return bankNames.filter((b) => b.toLowerCase().includes(key)).slice(0, 8);
  }

  function allBankNames() { return [...bankNames]; }

  window.Banks = { loadBankCatalog, registerBank, suggestBanks, allBankNames };
})();
