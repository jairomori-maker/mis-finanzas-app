// tarjetas.js — catálogo de tarjetas de crédito (cada una ligada al banco desde el que se
// paga, con un día de corte opcional) y pagos de tarjeta (el movimiento real que sí resta
// del saldo bancario, distinto del gasto original que se hizo con la tarjeta).

(function () {
  function newId() { return Date.now() + Math.random(); }

  // ---- Fechas locales (mismo criterio que state.js: nunca toISOString/UTC) ----
  function toLocalISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function clampDay(year, month, day) { // month es 0-indexado
    const lastDay = new Date(year, month + 1, 0).getDate();
    return Math.min(day, lastDay);
  }

  // Fecha de cierre (YYYY-MM-DD) del corte al que pertenece "fecha", dado el día de corte
  // de la tarjeta. Un gasto hecho EN el día de corte todavía cuenta para ese corte; un
  // gasto hecho un día después ya cae en el corte del mes siguiente.
  function corteQueContiene(diaCorte, fecha) {
    if (!diaCorte) return null;
    const [y, m, d] = fecha.split('-').map(Number);
    let year = y;
    let month = m - 1; // 0-indexado
    const diaEsteMes = clampDay(year, month, diaCorte);
    if (d > diaEsteMes) {
      month += 1;
      if (month > 11) { month = 0; year += 1; }
    }
    const dia = clampDay(year, month, diaCorte);
    return toLocalISO(new Date(year, month, dia));
  }

  function mesAnterior(fechaISO) {
    const [y, m, d] = fechaISO.split('-').map(Number);
    let year = y, month = m - 2; // -1 para 0-indexar, -1 más para el mes anterior
    if (month < 0) { month = 11; year -= 1; }
    const dia = clampDay(year, month, d);
    return toLocalISO(new Date(year, month, dia));
  }

  async function addTarjeta(nombre, bancoPago, diaCorte) {
    const dc = parseInt(diaCorte, 10);
    const rec = { id: newId(), nombre: (nombre || '').trim() || 'Tarjeta', bancoPago: (bancoPago || '').trim(), diaCorte: (dc >= 1 && dc <= 31) ? dc : null };
    App.tarjetas.push(rec);
    await DB.Store.put('tarjetas', rec);
    if (rec.bancoPago) await Banks.registerBank(rec.bancoPago);
    return rec;
  }

  async function updateTarjetaBanco(id, bancoPago) {
    const t = App.tarjetas.find((x) => x.id === id);
    if (!t) return;
    t.bancoPago = (bancoPago || '').trim();
    await DB.Store.put('tarjetas', t);
    if (t.bancoPago) await Banks.registerBank(t.bancoPago);
  }

  async function updateTarjetaDiaCorte(id, diaCorte) {
    const t = App.tarjetas.find((x) => x.id === id);
    if (!t) return;
    const dc = parseInt(diaCorte, 10);
    t.diaCorte = (dc >= 1 && dc <= 31) ? dc : null;
    await DB.Store.put('tarjetas', t);
  }

  async function addPagoTarjeta(tarjetaId, monto, fecha, banco) {
    const rec = { id: newId(), tarjetaId, monto: Number(monto) || 0, fecha, banco: (banco || '').trim() };
    App.pagosTarjeta.push(rec);
    await DB.Store.put('pagosTarjeta', rec);
    if (rec.banco) await Banks.registerBank(rec.banco);
    return rec;
  }

  // Pendiente de pagar de una tarjeta: gastos hechos con ella desde el último pago
  // registrado (o desde siempre si nunca se ha pagado). No incluye los pagos parciales
  // como "resueltos" — simplemente resta desde la fecha del último pago hacia adelante.
  function pendienteTarjeta(tarjetaId) {
    const pagos = App.pagosTarjeta.filter((p) => p.tarjetaId === tarjetaId).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const ultimoPago = pagos.length ? pagos[pagos.length - 1].fecha : null;
    return App.expenses
      .filter((e) => e && e.medioPago === 'tarjeta_credito' && e.tarjetaId === tarjetaId && Dates.isValidDate(e.fecha) && (!ultimoPago || e.fecha > ultimoPago))
      .reduce((s, e) => s + Number(e.monto), 0);
  }

  // Desglosa lo pendiente de una tarjeta (con día de corte configurado) en tres partes:
  //  - vencidoSinPagar: de un corte que ya cerró antes de este ciclo y sigue sin pagarse
  //  - enCorteActual: gastos que van a entrar al corte que está por cerrar
  //  - enProximoCorte: gastos que ya cayeron después del cierre actual (ciclo siguiente)
  // Devuelve null si la tarjeta no tiene día de corte configurado.
  function resumenCorte(tarjetaId) {
    const t = App.tarjetas.find((x) => x.id === tarjetaId);
    if (!t || !t.diaCorte) return null;
    const cierreActual = corteQueContiene(t.diaCorte, Dates.todayISO());
    const cierreAnterior = mesAnterior(cierreActual);

    const pagos = App.pagosTarjeta.filter((p) => p.tarjetaId === tarjetaId).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const ultimoPago = pagos.length ? pagos[pagos.length - 1].fecha : null;

    const gastosPendientes = App.expenses.filter((e) => e && e.medioPago === 'tarjeta_credito' && e.tarjetaId === tarjetaId && Dates.isValidDate(e.fecha) && (!ultimoPago || e.fecha > ultimoPago));

    const vencidoSinPagar = gastosPendientes.filter((e) => e.fecha <= cierreAnterior).reduce((s, e) => s + Number(e.monto), 0);
    const enCorteActual = gastosPendientes.filter((e) => e.fecha > cierreAnterior && e.fecha <= cierreActual).reduce((s, e) => s + Number(e.monto), 0);
    const enProximoCorte = gastosPendientes.filter((e) => e.fecha > cierreActual).reduce((s, e) => s + Number(e.monto), 0);

    return { cierreActual, cierreAnterior, vencidoSinPagar, enCorteActual, enProximoCorte };
  }

  function tarjetaNombre(id) {
    const t = App.tarjetas.find((x) => x.id === id);
    return t ? t.nombre : null;
  }

  window.Tarjetas = {
    addTarjeta, updateTarjetaBanco, updateTarjetaDiaCorte, addPagoTarjeta,
    pendienteTarjeta, resumenCorte, tarjetaNombre, corteQueContiene,
  };
})();
