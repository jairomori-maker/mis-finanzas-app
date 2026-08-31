// state.js — estado compartido en memoria + utilidades de fecha + carga inicial.

// IMPORTANTE: todas las fechas de la app son "fecha calendario local" del usuario,
// NUNCA se usa toISOString()/UTC para esto — un gasto hecho a las 9pm en México
// (UTC-6) no debe fecharse ya "mañana" solo porque en UTC ya cambió el día.
function toLocalISODate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function todayISO() { return toLocalISODate(new Date()); }
function isValidDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
function monthOf(fecha) { return fecha.slice(0, 7); }

function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
}
function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function monthsLater(dateStr, n) {
  const [y, m, day] = dateStr.split('-').map(Number);
  const d = new Date(y, m - 1, 1); // se ancla al día 1 para que meses con menos días no "desborden"
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return toLocalISODate(d);
}
function fmtMoney(n) {
  const v = Number(n) || 0;
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---- Bus de eventos muy simple para que las pantallas se re-rendericen ----
const listeners = {};
function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); }
function emit(evt) { (listeners[evt] || []).forEach((fn) => fn()); }

const App = {
  currentMonth: todayISO().slice(0, 7),
  expenses: [],
  incomes: [],
  templates: [],
  incomeTemplates: [],
  budgets: {},
  saldos: [],
  retiros: [],
  overrides: {}, // "YYYY-MM|categoria" -> monto editado a mano en la Proyección de Reporte
  tarjetas: [],
  pagosTarjeta: [],
};

async function loadBudgets() {
  const rows = await DB.Store.getAll('budgets');
  App.budgets = {};
  rows.forEach((r) => { App.budgets[r.grupo] = r.monto; });
}
async function saveBudget(grupo, monto) {
  if (monto > 0) {
    App.budgets[grupo] = monto;
    await DB.Store.put('budgets', { grupo, monto });
  } else {
    delete App.budgets[grupo];
    await DB.Store.delete('budgets', grupo);
  }
}

async function generateRecurringExpenses() {
  const thisMonth = todayISO().slice(0, 7);
  let added = false;
  for (const t of App.templates) {
    const exists = App.expenses.some((e) => e.recurrenteId === t.id && isValidDate(e.fecha) && monthOf(e.fecha) === thisMonth);
    if (!exists) {
      App.expenses.unshift({
        id: Date.now() + Math.random(),
        monto: Number(t.monto) || 0,
        concepto: t.concepto,
        categoria: t.categoria,
        grupo: t.grupo,
        fecha: todayISO(),
        recurrenteId: t.id,
        medioPago: t.medioPago === 'tarjeta_credito' ? 'tarjeta_credito' : (t.medioPago === 'efectivo' ? 'efectivo' : 'banco'),
        banco: t.banco || null,
        tarjetaId: t.tarjetaId || null,
      });
      added = true;
    }
  }
  if (added) await DB.Store.bulkPut('expenses', App.expenses);
}

async function generateRecurringIncomes() {
  const thisMonth = todayISO().slice(0, 7);
  let added = false;
  for (const t of App.incomeTemplates) {
    const exists = App.incomes.some((i) => i.recurrenteId === t.id && isValidDate(i.fecha) && monthOf(i.fecha) === thisMonth);
    if (!exists) {
      App.incomes.unshift({ id: Date.now() + Math.random(), monto: Number(t.monto) || 0, concepto: t.concepto, fecha: todayISO(), recurrenteId: t.id, banco: t.banco || null });
      added = true;
    }
  }
  if (added) await DB.Store.bulkPut('incomes', App.incomes);
}

async function loadOverrides() {
  const rows = await DB.Store.getAll('projectionOverrides');
  App.overrides = {};
  rows.forEach((r) => { App.overrides[r.id] = r.monto; });
}
async function saveProjectionOverride(mes, categoria, monto) {
  const id = mes + '|' + categoria;
  App.overrides[id] = monto;
  await DB.Store.put('projectionOverrides', { id, mes, categoria, monto });
}
async function clearProjectionOverride(mes, categoria) {
  const id = mes + '|' + categoria;
  delete App.overrides[id];
  await DB.Store.delete('projectionOverrides', id);
}

// Los saldos/retiros guardados antes de la funcionalidad de bancos no tienen campo
// `banco`. Se les asigna el primer banco del catálogo (o "Principal" si no hay ninguno)
// para no perder el historial de conciliación ya construido.
async function migrateBankField() {
  const existing = App.saldos.some((s) => s.banco) || App.retiros.some((r) => r.banco);
  const defaultBank = Banks.allBankNames()[0] || 'Principal';
  let changed = false;
  for (const s of App.saldos) {
    if (!s.banco) { s.banco = defaultBank; changed = true; await DB.Store.put('saldos', s); }
  }
  for (const r of App.retiros) {
    if (!r.banco) { r.banco = defaultBank; changed = true; await DB.Store.put('retiros', r); }
  }
  if (changed && !existing) await Banks.registerBank(defaultBank);
}

async function loadAll() {
  await DB.openDB();
  await Categories.loadCustomCategories();
  await Banks.loadBankCatalog();
  App.expenses = (await DB.Store.getAll('expenses')).filter((e) => e && isValidDate(e.fecha));
  App.incomes = (await DB.Store.getAll('incomes')).filter((i) => i && isValidDate(i.fecha));
  App.templates = await DB.Store.getAll('templates');
  App.incomeTemplates = await DB.Store.getAll('incomeTemplates');
  App.saldos = (await DB.Store.getAll('saldos')).filter((s) => s && isValidDate(s.fecha));
  App.retiros = (await DB.Store.getAll('retiros')).filter((r) => r && isValidDate(r.fecha));
  App.tarjetas = await DB.Store.getAll('tarjetas');
  App.pagosTarjeta = (await DB.Store.getAll('pagosTarjeta')).filter((p) => p && isValidDate(p.fecha));
  await migrateBankField();
  await loadBudgets();
  await loadOverrides();
  await generateRecurringExpenses();
  await generateRecurringIncomes();
  emit('data-changed');
}

window.Dates = { todayISO, isValidDate, monthOf, monthLabel, shiftMonth, monthsLater, fmtMoney };
window.Bus = { on, emit };
window.App = App;
window.loadAll = loadAll;
window.saveBudget = saveBudget;
window.saveProjectionOverride = saveProjectionOverride;
window.clearProjectionOverride = clearProjectionOverride;
