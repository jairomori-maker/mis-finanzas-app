// screens/ingresos.js — registro de ingresos. El balance del mes vive en Reporte.

(function () {
  function newId() { return Date.now() + Math.random(); }

  function template() {
    return `
      <div class="section-label">Mes</div>
      <div class="month-nav">
        <button id="prevMonthI" class="navbtn">‹</button>
        <span class="month-label" id="monthLabelI"></span>
        <button id="nextMonthI" class="navbtn">›</button>
      </div>

      <button class="toggle-manual" id="toggleIngreso">+ registrar un ingreso →</button>
      <form class="manual" id="ingresoForm">
        <div class="field"><label>Monto del ingreso</label><input type="number" step="0.01" id="iMonto" placeholder="0.00" inputmode="decimal"></div>
        <div class="field"><label>Concepto</label><input type="text" id="iConcepto" placeholder="p. ej. Nómina, Venta, Bono…"></div>
        <div class="field"><label>Banco <span style="text-transform:none;letter-spacing:0;">(opcional, para conciliar por cuenta)</span></label>
          <input type="text" id="iBanco" autocomplete="off" placeholder="p. ej. BBVA, Santander…">
          <div class="suggestions" id="iBancoSuggestions"></div>
        </div>
        <div class="field"><label>Fecha</label><input type="date" id="iFecha"></div>
        <div class="field checkbox-field"><label><input type="checkbox" id="iRecurrente"> Es un ingreso fijo (se repite cada mes)</label></div>
        <button type="submit" class="save-btn green" id="saveIngresoBtn">Guardar ingreso</button>
      </form>

      <div id="incomeItems"></div>
      <div class="total-row"><span>INGRESOS</span><span id="totalIngresosMes" class="amt">$0.00</span></div>
    `;
  }

  function setStatus(msg, kind) {
    // reutiliza el status de la pantalla de inicio si existe, si no, alert simple
    const el = document.getElementById('status');
    if (el) { el.textContent = msg || ''; el.className = 'status' + (kind ? ' ' + kind : ''); }
  }

  async function addIncome(inc) {
    const id = newId();
    const clean = { id, monto: Number(inc.monto) || 0, concepto: inc.concepto || 'Ingreso', fecha: Dates.isValidDate(inc.fecha) ? inc.fecha : Dates.todayISO(), recurrenteId: inc.recurrenteId || null, banco: inc.banco || null };
    App.incomes.unshift(clean);
    await DB.Store.put('incomes', clean);
    return id;
  }

  function wireForm() {
    document.getElementById('toggleIngreso').onclick = () => document.getElementById('ingresoForm').classList.toggle('open');

    const iBanco = document.getElementById('iBanco');
    function renderBankSuggestions() {
      const box = document.getElementById('iBancoSuggestions');
      const list = Banks.suggestBanks(iBanco.value);
      if (!list.length) { box.classList.remove('open'); box.innerHTML = ''; return; }
      box.innerHTML = list.map((c) => `<div data-val="${c}">${c}</div>`).join('');
      box.classList.add('open');
      box.querySelectorAll('div').forEach((d) => { d.onclick = () => { iBanco.value = d.dataset.val; box.classList.remove('open'); }; });
    }
    iBanco.addEventListener('input', renderBankSuggestions);
    iBanco.addEventListener('focus', renderBankSuggestions);
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.field')) document.getElementById('iBancoSuggestions').classList.remove('open');
    });

    document.getElementById('ingresoForm').onsubmit = async (e) => {
      e.preventDefault();
      const montoRaw = document.getElementById('iMonto').value;
      const monto = parseFloat(montoRaw);
      if (!montoRaw || isNaN(monto) || monto <= 0) { alert('Ingresa un monto válido para el ingreso.'); return; }
      const concepto = document.getElementById('iConcepto').value || 'Ingreso';
      const fecha = document.getElementById('iFecha').value || Dates.todayISO();
      const banco = iBanco.value.trim() || null;
      if (banco) await Banks.registerBank(banco);
      if (document.getElementById('iRecurrente').checked) {
        const t = { id: newId(), monto, concepto, banco };
        App.incomeTemplates.push(t);
        await DB.Store.put('incomeTemplates', t);
        await addIncome({ monto, concepto, fecha, recurrenteId: t.id, banco });
      } else {
        await addIncome({ monto, concepto, fecha, banco });
      }
      document.getElementById('iMonto').value = '';
      document.getElementById('iConcepto').value = '';
      document.getElementById('iFecha').value = Dates.todayISO();
      document.getElementById('iRecurrente').checked = false;
      iBanco.value = '';
      render();
    };
  }

  function wireMonthNav() {
    document.getElementById('prevMonthI').onclick = () => { App.currentMonth = Dates.shiftMonth(App.currentMonth, -1); Bus.emit('month-changed'); render(); };
    document.getElementById('nextMonthI').onclick = () => { App.currentMonth = Dates.shiftMonth(App.currentMonth, 1); Bus.emit('month-changed'); render(); };
  }

  function render() {
    document.getElementById('monthLabelI').textContent = Dates.monthLabel(App.currentMonth);

    const monthIncomes = App.incomes.filter((i) => i && Dates.isValidDate(i.fecha) && Dates.monthOf(i.fecha) === App.currentMonth)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    const container = document.getElementById('incomeItems');
    // Cada renglón: fecha, concepto y banco. Al tocarlo se abre el detalle para editarlo.
    container.innerHTML = monthIncomes.length ? monthIncomes.map((i) => `
      <div class="line-item tappable" data-id="${i.id}">
        <div class="desc"><span class="dt">${PayFields.esc(i.fecha)}</span>${i.recurrenteId ? '🔁 ' : ''}${PayFields.esc(i.concepto)}${i.banco ? `<span class="cat">${PayFields.esc(i.banco)}</span>` : ''}</div>
        <div class="amt">${Dates.fmtMoney(i.monto)}</div>
        <div class="actions"><button class="icon-btn del" data-id="${i.id}" title="Eliminar">✕</button></div>
      </div>
    `).join('') : '<div class="empty">Sin ingresos este mes.</div>';

    container.querySelectorAll('.line-item.tappable').forEach((row) => {
      row.onclick = (ev) => {
        if (ev.target.closest('button')) return;
        Detalle.open('ingreso', parseFloat(row.dataset.id));
      };
    });
    container.querySelectorAll('.del').forEach((b) => {
      b.onclick = async () => {
        const id = parseFloat(b.dataset.id);
        const inc = App.incomes.find((x) => x.id === id);
        App.incomes = App.incomes.filter((x) => x.id !== id);
        await DB.Store.delete('incomes', id);
        if (inc && inc.recurrenteId) {
          const detener = confirm('Este es un ingreso fijo. ¿Quieres dejar de repetirlo los próximos meses?');
          if (detener) {
            App.incomeTemplates = App.incomeTemplates.filter((t) => t.id !== inc.recurrenteId);
            await DB.Store.delete('incomeTemplates', inc.recurrenteId);
          }
        }
        render();
      };
    });

    const totalIngresos = monthIncomes.reduce((s, i) => s + Number(i.monto), 0);
    document.getElementById('totalIngresosMes').textContent = Dates.fmtMoney(totalIngresos);
  }

  function mount(container) {
    container.innerHTML = template();
    document.getElementById('iFecha').value = Dates.todayISO();
    wireForm();
    wireMonthNav();
    render();
  }

  window.ScreenIngresos = { mount, render };
})();
