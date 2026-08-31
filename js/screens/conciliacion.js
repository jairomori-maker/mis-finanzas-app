// screens/conciliacion.js — tarjetas de crédito, pagos de tarjeta, saldos bancarios por
// corte (uno por banco), retiros de efectivo y conciliación por banco.
//
// Los gastos con medioPago='tarjeta_credito' NO se restan del saldo bancario aquí — solo
// se restan los "pagos de tarjeta" (cuando de verdad se paga el corte), que es lo que
// realmente sale del banco.

(function () {
  let selectedReconBank = null;

  function newId() { return Date.now() + Math.random(); }
  function inRange(fecha, desde, hasta) { return fecha > desde && fecha <= hasta; }

  function template() {
    return `
      <div class="section-label">Mis tarjetas de crédito</div>
      <div class="hint">Da de alta cada tarjeta una vez, ligada al banco desde el que la pagas. Si le agregas su día de corte, la app te dice qué gastos ya quedaron en el corte que está por cerrar y cuáles ya cayeron en el siguiente ciclo.</div>
      <button class="toggle-manual" id="toggleTarjeta">+ agregar una tarjeta →</button>
      <form class="manual" id="tarjetaForm">
        <div class="field"><label>Nombre de la tarjeta</label><input type="text" id="tNombre" placeholder="p. ej. Principal, Gastos domiciliados"></div>
        <div class="field"><label>¿De qué banco se paga?</label>
          <input type="text" id="tBanco" autocomplete="off" placeholder="p. ej. BBVA, Santander…">
          <div class="suggestions" id="tBancoSuggestions"></div>
        </div>
        <div class="field"><label>Día de corte <span style="text-transform:none;letter-spacing:0;">(opcional, ej. 20)</span></label>
          <input type="number" id="tDiaCorte" min="1" max="31" placeholder="1-31">
        </div>
        <button type="submit" class="save-btn gold" id="saveTarjetaBtn">Guardar tarjeta</button>
      </form>
      <div id="tarjetaItems"></div>

      <div class="section-label" style="margin-top:22px;">Pago de tarjeta</div>
      <div class="hint">Cuando pagas el corte de una tarjeta, ese es el movimiento que sí resta de tu saldo bancario — los gastos hechos con tarjeta no se restan solos hasta que registras aquí el pago.</div>
      <button class="toggle-manual" id="togglePago">+ registrar un pago de tarjeta →</button>
      <form class="manual" id="pagoForm">
        <div class="field"><label>Tarjeta</label><select id="pTarjeta"></select></div>
        <div class="field"><label>Monto pagado</label><input type="number" step="0.01" id="pMonto" placeholder="0.00" inputmode="decimal"></div>
        <div class="field"><label>Fecha del pago</label><input type="date" id="pFecha"></div>
        <div class="field"><label>Banco de origen</label>
          <input type="text" id="pBanco" autocomplete="off" placeholder="se autocompleta con el banco de la tarjeta">
          <div class="suggestions" id="pBancoSuggestions"></div>
        </div>
        <button type="submit" class="save-btn gold" id="savePagoBtn">Guardar pago</button>
      </form>
      <div id="pagoItems"></div>

      <div class="section-label" style="margin-top:22px;">Saldos por corte</div>
      <div class="hint">Registra tu saldo bancario en cada corte de quincena, indicando de qué banco es.</div>
      <button class="toggle-manual" id="toggleSaldo">+ registrar saldo de quincena →</button>
      <form class="manual" id="saldoForm">
        <div class="field"><label>Banco</label>
          <input type="text" id="sBanco" autocomplete="off" placeholder="p. ej. BBVA, Santander…">
          <div class="suggestions" id="sBancoSuggestions"></div>
        </div>
        <div class="field"><label>Fecha del corte</label><input type="date" id="sFecha"></div>
        <div class="field"><label>Saldo en banco</label><input type="number" step="0.01" id="sMonto" placeholder="0.00" inputmode="decimal"></div>
        <button type="submit" class="save-btn gold" id="saveSaldoBtn">Guardar saldo</button>
      </form>
      <div id="saldoItems"></div>

      <div class="section-label" style="margin-top:22px;">Retiros de efectivo</div>
      <div class="hint">Un retiro es una transferencia banco → efectivo, no es un gasto. Cuando gastes ese efectivo, captúralo como gasto normal con "medio de pago: Efectivo" en la pantalla de Inicio.</div>
      <button class="toggle-manual" id="toggleRetiro">+ registrar un retiro →</button>
      <form class="manual" id="retiroForm">
        <div class="field"><label>Banco de origen</label>
          <input type="text" id="rBanco" autocomplete="off" placeholder="p. ej. BBVA, Santander…">
          <div class="suggestions" id="rBancoSuggestions"></div>
        </div>
        <div class="field"><label>Monto retirado</label><input type="number" step="0.01" id="rMonto" placeholder="0.00" inputmode="decimal"></div>
        <div class="field"><label>Fecha</label><input type="date" id="rFecha"></div>
        <button type="submit" class="save-btn gold" id="saveRetiroBtn">Guardar retiro</button>
      </form>
      <div id="retiroItems"></div>

      <div class="section-label" style="margin-top:22px;">Conciliación entre cortes</div>
      <div class="hint">La conciliación es por banco: cada uno tiene su propia línea de tiempo de cortes. Los gastos e ingresos sin banco asignado no se cuentan aquí — asígnales un banco para que la conciliación cuadre.</div>
      <div class="field" id="reconBankField"><label>Banco</label><select id="reconBankSelect"></select></div>
      <div id="reconciliation"></div>
    `;
  }

  // ---- Sugerencias de banco reutilizables para cualquier input de la pantalla ----
  function wireBankSuggestions(inputId, boxId, onPickExtra) {
    const input = document.getElementById(inputId);
    function show() {
      const box = document.getElementById(boxId);
      const list = Banks.suggestBanks(input.value);
      if (!list.length) { box.classList.remove('open'); box.innerHTML = ''; return; }
      box.innerHTML = list.map((c) => `<div data-val="${c}">${c}</div>`).join('');
      box.classList.add('open');
      box.querySelectorAll('div').forEach((d) => {
        d.onclick = () => { input.value = d.dataset.val; box.classList.remove('open'); if (onPickExtra) onPickExtra(); };
      });
    }
    input.addEventListener('input', show);
    input.addEventListener('focus', show);
  }

  function populateTarjetaSelect(selectEl, selectedId) {
    if (!App.tarjetas.length) { selectEl.innerHTML = '<option value="">— agrega una tarjeta primero —</option>'; return; }
    selectEl.innerHTML = App.tarjetas.map((t) => `<option value="${t.id}">${t.nombre}</option>`).join('');
    if (selectedId) selectEl.value = selectedId;
  }

  // ---- Tarjetas ----
  function renderTarjetas() {
    const container = document.getElementById('tarjetaItems');
    if (!App.tarjetas.length) { container.innerHTML = '<div class="empty">Aún no has dado de alta ninguna tarjeta.</div>'; return; }
    container.innerHTML = App.tarjetas.map((t) => {
      const resumen = t.diaCorte ? Tarjetas.resumenCorte(t.id) : null;
      const desglose = resumen ? `
        <div class="recon-detail"><span>En el corte que cierra el ${resumen.cierreActual}</span><span>${Dates.fmtMoney(resumen.enCorteActual)}</span></div>
        <div class="recon-detail"><span>Ya en el siguiente corte</span><span>${Dates.fmtMoney(resumen.enProximoCorte)}</span></div>
        ${resumen.vencidoSinPagar > 0.01 ? `<div class="recon-detail" style="color:var(--red);"><span>De un corte ya cerrado, sin pagar</span><span>${Dates.fmtMoney(resumen.vencidoSinPagar)}</span></div>` : ''}
      ` : '';
      return `
        <div class="recon-row">
          <div class="recon-header"><span>${t.nombre}</span><span>${Dates.fmtMoney(Tarjetas.pendienteTarjeta(t.id))} pendiente</span></div>
          <div class="recon-detail"><span>Se paga desde</span><span>${t.bancoPago || 'sin banco asignado'}</span></div>
          <div class="recon-detail"><span>Día de corte</span><span>${t.diaCorte ? 'día ' + t.diaCorte : 'sin configurar'}</span></div>
          ${desglose}
          <div style="display:flex; gap:14px; margin-top:8px; font-family:'IBM Plex Mono',monospace; font-size:11px; text-transform:uppercase; letter-spacing:.5px;">
            <a href="#" class="edit-tarjeta" data-id="${t.id}" style="color:var(--ink-soft);">editar</a>
            <a href="#" class="del-tarjeta" data-id="${t.id}" style="color:var(--red);">eliminar</a>
          </div>
        </div>
      `;
    }).join('');
    container.querySelectorAll('.edit-tarjeta').forEach((a) => {
      a.onclick = async (ev) => {
        ev.preventDefault();
        const id = parseFloat(a.dataset.id);
        const t = App.tarjetas.find((x) => x.id === id);
        if (!t) return;
        const nuevoBanco = prompt('¿Desde qué banco se paga esta tarjeta?', t.bancoPago || '');
        if (nuevoBanco !== null) await Tarjetas.updateTarjetaBanco(id, nuevoBanco);
        const nuevoCorte = prompt('¿Qué día del mes es el corte de esta tarjeta? (1-31, déjalo vacío si no lo sabes)', t.diaCorte || '');
        if (nuevoCorte !== null) await Tarjetas.updateTarjetaDiaCorte(id, nuevoCorte);
        renderAll();
      };
    });
    container.querySelectorAll('.del-tarjeta').forEach((a) => {
      a.onclick = async (ev) => {
        ev.preventDefault();
        const id = parseFloat(a.dataset.id);
        if (!confirm('¿Eliminar esta tarjeta? Los gastos y pagos ya registrados con ella no se borran, solo dejará de aparecer en la lista.')) return;
        App.tarjetas = App.tarjetas.filter((x) => x.id !== id);
        await DB.Store.delete('tarjetas', id);
        renderAll();
      };
    });
  }

  // ---- Pagos de tarjeta ----
  function renderPagos() {
    const container = document.getElementById('pagoItems');
    const ordered = [...App.pagosTarjeta].sort((a, b) => b.fecha.localeCompare(a.fecha));
    container.innerHTML = ordered.length ? ordered.map((p) => {
      const nombre = Tarjetas.tarjetaNombre(p.tarjetaId) || 'Tarjeta eliminada';
      return `
      <div class="line-item">
        <div class="desc">Pago: ${nombre}<span class="cat">${p.fecha} · desde ${p.banco || 'banco sin especificar'}</span></div>
        <div class="amt">${Dates.fmtMoney(p.monto)}</div>
        <div class="actions"><button class="icon-btn del" data-id="${p.id}" title="Eliminar">✕</button></div>
      </div>`;
    }).join('') : '<div class="empty">Aún no hay pagos de tarjeta registrados.</div>';
    container.querySelectorAll('.del').forEach((b) => {
      b.onclick = async () => {
        const id = parseFloat(b.dataset.id);
        App.pagosTarjeta = App.pagosTarjeta.filter((p) => p.id !== id);
        await DB.Store.delete('pagosTarjeta', id);
        renderAll();
      };
    });
  }

  // ---- Saldos ----
  function renderSaldos() {
    const container = document.getElementById('saldoItems');
    const ordered = [...App.saldos].sort((a, b) => b.fecha.localeCompare(a.fecha));
    container.innerHTML = ordered.length ? ordered.map((s) => `
      <div class="line-item">
        <div class="desc">Saldo bancario<span class="cat">${s.fecha} · ${s.banco || 'sin banco'}</span></div>
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

  // ---- Retiros ----
  function renderRetiros() {
    const container = document.getElementById('retiroItems');
    const ordered = [...App.retiros].sort((a, b) => b.fecha.localeCompare(a.fecha));
    container.innerHTML = ordered.length ? ordered.map((r) => `
      <div class="line-item">
        <div class="desc">Retiro de efectivo<span class="cat">${r.fecha} · ${r.banco || 'sin banco'}</span></div>
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

  // ---- Conciliación (por banco) ----
  function bankNamesWithSaldos() {
    return [...new Set(App.saldos.map((s) => s.banco).filter(Boolean))];
  }

  function renderReconBankSelector() {
    const sel = document.getElementById('reconBankSelect');
    const banks = bankNamesWithSaldos();
    if (!banks.length) { sel.innerHTML = '<option value="">—</option>'; selectedReconBank = null; return; }
    if (!selectedReconBank || !banks.includes(selectedReconBank)) selectedReconBank = banks[0];
    sel.innerHTML = banks.map((b) => `<option value="${b}" ${b === selectedReconBank ? 'selected' : ''}>${b}</option>`).join('');
    sel.onchange = () => { selectedReconBank = sel.value; renderReconciliation(); };
  }

  function renderReconciliation() {
    const container = document.getElementById('reconciliation');
    if (!selectedReconBank) { container.innerHTML = '<div class="empty">Registra al menos un saldo con su banco para ver la conciliación.</div>'; return; }
    const ordered = [...App.saldos].filter((s) => s.banco === selectedReconBank).sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (ordered.length < 2) {
      container.innerHTML = '<div class="empty">Registra al menos dos cortes de saldo de este banco para calcular la conciliación.</div>';
      return;
    }
    const periods = [];
    for (let i = 1; i < ordered.length; i++) periods.push([ordered[i - 1], ordered[i]]);

    container.innerHTML = periods.slice().reverse().map(([ini, fin]) => {
      const cambioReal = fin.saldo - ini.saldo;
      const ingresosPeriodo = App.incomes.filter((x) => x && Dates.isValidDate(x.fecha) && inRange(x.fecha, ini.fecha, fin.fecha) && x.banco === selectedReconBank).reduce((s, x) => s + Number(x.monto), 0);
      const gastosBancoPeriodo = App.expenses.filter((x) => x && Dates.isValidDate(x.fecha) && inRange(x.fecha, ini.fecha, fin.fecha) && x.medioPago === 'banco' && x.banco === selectedReconBank).reduce((s, x) => s + Number(x.monto), 0);
      const retirosPeriodo = App.retiros.filter((r) => r && Dates.isValidDate(r.fecha) && inRange(r.fecha, ini.fecha, fin.fecha) && r.banco === selectedReconBank).reduce((s, r) => s + Number(r.monto), 0);
      const pagosPeriodo = App.pagosTarjeta.filter((p) => p && Dates.isValidDate(p.fecha) && inRange(p.fecha, ini.fecha, fin.fecha) && p.banco === selectedReconBank).reduce((s, p) => s + Number(p.monto), 0);
      const cambioEsperado = ingresosPeriodo - gastosBancoPeriodo - retirosPeriodo - pagosPeriodo;
      const diferencia = cambioReal - cambioEsperado;
      const cls = Math.abs(diferencia) < 0.01 ? 'zero' : (diferencia > 0 ? 'positive' : 'negative');
      const diffText = Math.abs(diferencia) < 0.01
        ? '✓ Todo cuadra con lo registrado'
        : diferencia > 0
          ? `🔍 ${Dates.fmtMoney(diferencia)} sin identificar — parece que hubo ingresos que no capturaste (o no les asignaste este banco)`
          : `🔍 ${Dates.fmtMoney(Math.abs(diferencia))} sin identificar — parece que hubo gastos, retiros o pagos de tarjeta que no capturaste (o no les asignaste este banco)`;
      return `
        <div class="recon-row">
          <div class="recon-header"><span>${ini.fecha} → ${fin.fecha}</span><span>${Dates.fmtMoney(cambioReal)}</span></div>
          <div class="recon-detail"><span>Saldo inicial</span><span>${Dates.fmtMoney(ini.saldo)}</span></div>
          <div class="recon-detail"><span>Saldo final</span><span>${Dates.fmtMoney(fin.saldo)}</span></div>
          <div class="recon-detail"><span>Ingresos registrados</span><span>${Dates.fmtMoney(ingresosPeriodo)}</span></div>
          <div class="recon-detail"><span>Gastos con banco (débito/transferencia)</span><span>${Dates.fmtMoney(gastosBancoPeriodo)}</span></div>
          <div class="recon-detail"><span>Retiros de efectivo</span><span>${Dates.fmtMoney(retirosPeriodo)}</span></div>
          <div class="recon-detail"><span>Pagos de tarjeta</span><span>${Dates.fmtMoney(pagosPeriodo)}</span></div>
          <div class="recon-detail"><span>Cambio esperado</span><span>${Dates.fmtMoney(cambioEsperado)}</span></div>
          <div class="recon-diff ${cls}">${diffText}</div>
        </div>
      `;
    }).join('');
  }

  function renderAll() {
    renderTarjetas();
    renderPagos();
    renderSaldos();
    renderRetiros();
    renderReconBankSelector();
    renderReconciliation();
  }

  function wireForms() {
    // Tarjetas
    document.getElementById('toggleTarjeta').onclick = () => document.getElementById('tarjetaForm').classList.toggle('open');
    wireBankSuggestions('tBanco', 'tBancoSuggestions');
    document.getElementById('tarjetaForm').onsubmit = async (e) => {
      e.preventDefault();
      const nombre = document.getElementById('tNombre').value.trim();
      if (!nombre) { alert('Ponle un nombre a la tarjeta.'); return; }
      await Tarjetas.addTarjeta(nombre, document.getElementById('tBanco').value.trim(), document.getElementById('tDiaCorte').value);
      document.getElementById('tNombre').value = '';
      document.getElementById('tBanco').value = '';
      document.getElementById('tDiaCorte').value = '';
      renderAll();
    };

    // Pago de tarjeta
    document.getElementById('togglePago').onclick = () => {
      document.getElementById('pagoForm').classList.toggle('open');
      populateTarjetaSelect(document.getElementById('pTarjeta'));
    };
    document.getElementById('pTarjeta').addEventListener('change', () => {
      const t = App.tarjetas.find((x) => x.id === parseFloat(document.getElementById('pTarjeta').value));
      const pBanco = document.getElementById('pBanco');
      if (t && t.bancoPago && !pBanco.value) pBanco.value = t.bancoPago;
    });
    wireBankSuggestions('pBanco', 'pBancoSuggestions');
    document.getElementById('pagoForm').onsubmit = async (e) => {
      e.preventDefault();
      const tarjetaId = parseFloat(document.getElementById('pTarjeta').value);
      if (!tarjetaId) { alert('Selecciona una tarjeta (agrega una primero si no tienes ninguna).'); return; }
      const montoRaw = document.getElementById('pMonto').value;
      const monto = parseFloat(montoRaw);
      if (!montoRaw || isNaN(monto) || monto <= 0) { alert('Ingresa un monto válido.'); return; }
      const fecha = document.getElementById('pFecha').value || Dates.todayISO();
      const banco = document.getElementById('pBanco').value.trim();
      await Tarjetas.addPagoTarjeta(tarjetaId, monto, fecha, banco);
      document.getElementById('pMonto').value = '';
      document.getElementById('pFecha').value = Dates.todayISO();
      document.getElementById('pBanco').value = '';
      renderAll();
    };

    // Saldos
    wireBankSuggestions('sBanco', 'sBancoSuggestions');
    document.getElementById('toggleSaldo').onclick = () => document.getElementById('saldoForm').classList.toggle('open');
    document.getElementById('saldoForm').onsubmit = async (e) => {
      e.preventDefault();
      const montoRaw = document.getElementById('sMonto').value;
      const monto = parseFloat(montoRaw);
      if (!montoRaw || isNaN(monto)) { alert('Ingresa un saldo válido.'); return; }
      const banco = document.getElementById('sBanco').value.trim();
      if (!banco) { alert('Indica de qué banco es este saldo.'); return; }
      const fecha = document.getElementById('sFecha').value || Dates.todayISO();
      const rec = { id: newId(), fecha, saldo: monto, banco };
      App.saldos.push(rec);
      await DB.Store.put('saldos', rec);
      await Banks.registerBank(banco);
      document.getElementById('sMonto').value = '';
      document.getElementById('sFecha').value = Dates.todayISO();
      document.getElementById('sBanco').value = '';
      renderAll();
    };

    // Retiros
    wireBankSuggestions('rBanco', 'rBancoSuggestions');
    document.getElementById('toggleRetiro').onclick = () => document.getElementById('retiroForm').classList.toggle('open');
    document.getElementById('retiroForm').onsubmit = async (e) => {
      e.preventDefault();
      const montoRaw = document.getElementById('rMonto').value;
      const monto = parseFloat(montoRaw);
      if (!montoRaw || isNaN(monto) || monto <= 0) { alert('Ingresa un monto válido para el retiro.'); return; }
      const banco = document.getElementById('rBanco').value.trim();
      if (!banco) { alert('Indica de qué banco sale el retiro.'); return; }
      const fecha = document.getElementById('rFecha').value || Dates.todayISO();
      const rec = { id: newId(), fecha, monto, banco };
      App.retiros.push(rec);
      await DB.Store.put('retiros', rec);
      await Banks.registerBank(banco);
      document.getElementById('rMonto').value = '';
      document.getElementById('rFecha').value = Dates.todayISO();
      document.getElementById('rBanco').value = '';
      renderAll();
    };

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.field')) {
        document.querySelectorAll('.suggestions.open').forEach((el) => el.classList.remove('open'));
      }
    });
  }

  function mount(container) {
    container.innerHTML = template();
    document.getElementById('sFecha').value = Dates.todayISO();
    document.getElementById('rFecha').value = Dates.todayISO();
    document.getElementById('pFecha').value = Dates.todayISO();
    populateTarjetaSelect(document.getElementById('pTarjeta'));
    wireForms();
    renderAll();
  }

  window.ScreenConciliacion = { mount, render: renderAll };
})();
