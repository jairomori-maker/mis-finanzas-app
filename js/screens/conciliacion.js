// screens/conciliacion.js — saldos bancarios por corte, retiros de efectivo y conciliación.

(function () {
  function newId() { return Date.now() + Math.random(); }
  function inRange(fecha, desde, hasta) { return fecha > desde && fecha <= hasta; }

  function template() {
    return `
      <div class="hint">Registra tu saldo bancario en cada corte de quincena. Entre dos cortes, la app compara el cambio real contra lo esperado (ingresos − gastos con banco/tarjeta − retiros de efectivo) y te dice si algo quedó sin capturar.</div>

      <div class="section-label" style="margin-top:18px;">Saldos por corte</div>
      <button class="toggle-manual" id="toggleSaldo">+ registrar saldo de quincena →</button>
      <form class="manual" id="saldoForm">
        <div class="field"><label>Fecha del corte</label><input type="date" id="sFecha"></div>
        <div class="field"><label>Saldo en banco</label><input type="number" step="0.01" id="sMonto" placeholder="0.00" inputmode="decimal"></div>
        <button type="submit" class="save-btn gold" id="saveSaldoBtn">Guardar saldo</button>
      </form>
      <div id="saldoItems"></div>

      <div class="section-label" style="margin-top:22px;">Retiros de efectivo</div>
      <div class="hint">Un retiro es una transferencia banco → efectivo, no es un gasto. Cuando gastes ese efectivo, captúralo como gasto normal con "medio de pago: Efectivo" en la pantalla de Inicio.</div>
      <button class="toggle-manual" id="toggleRetiro">+ registrar un retiro →</button>
      <form class="manual" id="retiroForm">
        <div class="field"><label>Monto retirado</label><input type="number" step="0.01" id="rMonto" placeholder="0.00" inputmode="decimal"></div>
        <div class="field"><label>Fecha</label><input type="date" id="rFecha"></div>
        <button type="submit" class="save-btn gold" id="saveRetiroBtn">Guardar retiro</button>
      </form>
      <div id="retiroItems"></div>

      <div class="section-label" style="margin-top:22px;">Conciliación entre cortes</div>
      <div id="reconciliation"></div>
    `;
  }

  function renderSaldos() {
    const container = document.getElementById('saldoItems');
    const ordered = [...App.saldos].sort((a, b) => b.fecha.localeCompare(a.fecha));
    container.innerHTML = ordered.length ? ordered.map((s) => `
      <div class="line-item">
        <div class="desc">Saldo bancario<span class="cat">${s.fecha}</span></div>
        <div class="amt">${Dates.fmtMoney(s.saldo)}</div>
        <div class="actions"><button class="icon-btn del" data-id="${s.id}" title="Eliminar">✕</button></div>
      </div>
    `).join('') : '<div class="empty">Aún no hay cortes de saldo registrados.</div>';
    container.querySelectorAll('.del').forEach((b) => {
      b.onclick = async () => {
        const id = parseFloat(b.dataset.id);
        App.saldos = App.saldos.filter((s) => s.id !== id);
        await DB.Store.delete('saldos', id);
        renderAll();
      };
    });
  }

  function renderRetiros() {
    const container = document.getElementById('retiroItems');
    const ordered = [...App.retiros].sort((a, b) => b.fecha.localeCompare(a.fecha));
    container.innerHTML = ordered.length ? ordered.map((r) => `
      <div class="line-item">
        <div class="desc">Retiro de efectivo<span class="cat">${r.fecha}</span></div>
        <div class="amt">${Dates.fmtMoney(r.monto)}</div>
        <div class="actions"><button class="icon-btn del" data-id="${r.id}" title="Eliminar">✕</button></div>
      </div>
    `).join('') : '<div class="empty">Aún no hay retiros registrados.</div>';
    container.querySelectorAll('.del').forEach((b) => {
      b.onclick = async () => {
        const id = parseFloat(b.dataset.id);
        App.retiros = App.retiros.filter((r) => r.id !== id);
        await DB.Store.delete('retiros', id);
        renderAll();
      };
    });
  }

  function renderReconciliation() {
    const container = document.getElementById('reconciliation');
    const ordered = [...App.saldos].sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (ordered.length < 2) {
      container.innerHTML = '<div class="empty">Registra al menos dos cortes de saldo para calcular la conciliación.</div>';
      return;
    }
    const periods = [];
    for (let i = 1; i < ordered.length; i++) periods.push([ordered[i - 1], ordered[i]]);

    container.innerHTML = periods.slice().reverse().map(([ini, fin]) => {
      const cambioReal = fin.saldo - ini.saldo;
      const ingresosPeriodo = App.incomes.filter((x) => x && Dates.isValidDate(x.fecha) && inRange(x.fecha, ini.fecha, fin.fecha)).reduce((s, x) => s + Number(x.monto), 0);
      const gastosBancoPeriodo = App.expenses.filter((x) => x && Dates.isValidDate(x.fecha) && inRange(x.fecha, ini.fecha, fin.fecha) && x.medioPago !== 'efectivo').reduce((s, x) => s + Number(x.monto), 0);
      const retirosPeriodo = App.retiros.filter((r) => r && Dates.isValidDate(r.fecha) && inRange(r.fecha, ini.fecha, fin.fecha)).reduce((s, r) => s + Number(r.monto), 0);
      const cambioEsperado = ingresosPeriodo - gastosBancoPeriodo - retirosPeriodo;
      const diferencia = cambioReal - cambioEsperado;
      const cls = Math.abs(diferencia) < 0.01 ? 'zero' : (diferencia > 0 ? 'positive' : 'negative');
      const diffText = Math.abs(diferencia) < 0.01
        ? '✓ Todo cuadra con lo registrado'
        : diferencia > 0
          ? `🔍 ${Dates.fmtMoney(diferencia)} sin identificar — parece que hubo ingresos que no capturaste`
          : `🔍 ${Dates.fmtMoney(Math.abs(diferencia))} sin identificar — parece que hubo gastos con tarjeta/transferencia que no capturaste`;
      return `
        <div class="recon-row">
          <div class="recon-header"><span>${ini.fecha} → ${fin.fecha}</span><span>${Dates.fmtMoney(cambioReal)}</span></div>
          <div class="recon-detail"><span>Saldo inicial</span><span>${Dates.fmtMoney(ini.saldo)}</span></div>
          <div class="recon-detail"><span>Saldo final</span><span>${Dates.fmtMoney(fin.saldo)}</span></div>
          <div class="recon-detail"><span>Ingresos registrados</span><span>${Dates.fmtMoney(ingresosPeriodo)}</span></div>
          <div class="recon-detail"><span>Gastos con banco/tarjeta</span><span>${Dates.fmtMoney(gastosBancoPeriodo)}</span></div>
          <div class="recon-detail"><span>Retiros de efectivo</span><span>${Dates.fmtMoney(retirosPeriodo)}</span></div>
          <div class="recon-detail"><span>Cambio esperado</span><span>${Dates.fmtMoney(cambioEsperado)}</span></div>
          <div class="recon-diff ${cls}">${diffText}</div>
        </div>
      `;
    }).join('');
  }

  function renderAll() {
    renderSaldos();
    renderRetiros();
    renderReconciliation();
  }

  function wireForms() {
    document.getElementById('toggleSaldo').onclick = () => document.getElementById('saldoForm').classList.toggle('open');
    document.getElementById('saldoForm').onsubmit = async (e) => {
      e.preventDefault();
      const montoRaw = document.getElementById('sMonto').value;
      const monto = parseFloat(montoRaw);
      if (!montoRaw || isNaN(monto)) { alert('Ingresa un saldo válido.'); return; }
      const fecha = document.getElementById('sFecha').value || Dates.todayISO();
      const rec = { id: newId(), fecha, saldo: monto };
      App.saldos.push(rec);
      await DB.Store.put('saldos', rec);
      document.getElementById('sMonto').value = '';
      document.getElementById('sFecha').value = Dates.todayISO();
      renderAll();
    };

    document.getElementById('toggleRetiro').onclick = () => document.getElementById('retiroForm').classList.toggle('open');
    document.getElementById('retiroForm').onsubmit = async (e) => {
      e.preventDefault();
      const montoRaw = document.getElementById('rMonto').value;
      const monto = parseFloat(montoRaw);
      if (!montoRaw || isNaN(monto) || monto <= 0) { alert('Ingresa un monto válido para el retiro.'); return; }
      const fecha = document.getElementById('rFecha').value || Dates.todayISO();
      const rec = { id: newId(), fecha, monto };
      App.retiros.push(rec);
      await DB.Store.put('retiros', rec);
      document.getElementById('rMonto').value = '';
      document.getElementById('rFecha').value = Dates.todayISO();
      renderAll();
    };
  }

  function mount(container) {
    container.innerHTML = template();
    document.getElementById('sFecha').value = Dates.todayISO();
    document.getElementById('rFecha').value = Dates.todayISO();
    wireForms();
    renderAll();
  }

  window.ScreenConciliacion = { mount, render: renderAll };
})();
