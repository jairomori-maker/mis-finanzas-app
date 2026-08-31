// tarjetas.js — catálogo de tarjetas de crédito (cada una ligada al banco desde el que se
// paga) y pagos de tarjeta (el movimiento real que sí resta del saldo bancario, distinto
// del gasto original que se hizo con la tarjeta).

(function () {
  function newId() { return Date.now() + Math.random(); }

  async function addTarjeta(nombre, bancoPago) {
    const rec = { id: newId(), nombre: (nombre || '').trim() || 'Tarjeta', bancoPago: (bancoPago || '').trim() };
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

  function tarjetaNombre(id) {
    const t = App.tarjetas.find((x) => x.id === id);
    return t ? t.nombre : null;
  }

  window.Tarjetas = { addTarjeta, updateTarjetaBanco, addPagoTarjeta, pendienteTarjeta, tarjetaNombre };
})();
