// screens/reporte.js — balance/proyección del mes + reporte por grupo, expandible por
// categoría, con presupuestos.
//
// Arriba del desglose por grupo (que ya existía) se agregó:
//  - Para el mes actual o un mes pasado: "Balance del mes" (Ingresos/Gastos/Balance reales),
//    lo mismo que antes se mostraba en la pantalla Ingresos.
//  - Para un mes futuro (hasta diciembre del año en curso): "Proyección", con Ingresos
//    (fijos), Recurrentes, MSI ya calendarizados y "Otros estimados" (promedio de los
//    gastos que no son recurrentes ni MSI, por categoría específica, editable a mano).

(function () {
  let expandedGroups = new Set();

  function template() {
    return `
      <div class="section-label">Mes</div>
      <div class="month-nav">
        <button id="prevMonthR" class="navbtn">‹</button>
        <span class="month-label" id="monthLabelR"></span>
        <button id="nextMonthR" class="navbtn">›</button>
      </div>
      <div id="topSection"></div>
      <div id="reportBody"></div>
    `;
  }

  function wireMonthNav() {
    document.getElementById('prevMonthR').onclick = () => { App.currentMonth = Dates.shiftMonth(App.currentMonth, -1); Bus.emit('month-changed'); render(); };
    const nextBtn = document.getElementById('nextMonthR');
    if (!nextBtn.disabled) {
      nextBtn.onclick = () => { App.currentMonth = Dates.shiftMonth(App.currentMonth, 1); Bus.emit('month-changed'); render(); };
    }
  }

  function isFutureMonth(m) { return m > Dates.todayISO().slice(0, 7); }
  function isBeyondProjectionYear(m) { return m.slice(0, 4) > Dates.todayISO().slice(0, 4); }

  // Promedio histórico por categoría (excluye recurrentes y MSI, que ya se calendarizan
  // aparte) considerando los meses ya transcurridos anteriores a "beforeMonth".
  function categoryAverages(beforeMonth) {
    const hoyMes = Dates.todayISO().slice(0, 7);
    const data = {};
    App.expenses.forEach((e) => {
      if (!e || !Dates.isValidDate(e.fecha) || e.recurrenteId || e.msiGroupId) return;
      const m = Dates.monthOf(e.fecha);
      if (m >= beforeMonth || m > hoyMes) return;
      data[e.categoria] = data[e.categoria] || { sum: 0, months: new Set() };
      data[e.categoria].sum += Number(e.monto);
      data[e.categoria].months.add(m);
    });
    const out = {};
    Object.entries(data).forEach(([cat, d]) => { out[cat] = { avg: d.sum / d.months.size, months: d.months.size }; });
    return out;
  }

  function activeRecurrentesTotal() { return App.templates.reduce((s, t) => s + Number(t.monto), 0); }
  function activeIngresosFijosTotal() { return App.incomeTemplates.reduce((s, t) => s + Number(t.monto), 0); }
  function msiTotalForMonth(m) { return App.expenses.filter((e) => e && e.msiGroupId && Dates.isValidDate(e.fecha) && Dates.monthOf(e.fecha) === m).reduce((s, e) => s + Number(e.monto), 0); }

  function renderBalanceReal(m) {
    const monthExpenses = App.expenses.filter((e) => e && Dates.isValidDate(e.fecha) && Dates.monthOf(e.fecha) === m);
    const monthIncomes = App.incomes.filter((i) => i && Dates.isValidDate(i.fecha) && Dates.monthOf(i.fecha) === m);
    const gastos = monthExpenses.reduce((s, e) => s + Number(e.monto), 0);
    const ingresos = monthIncomes.reduce((s, i) => s + Number(i.monto), 0);
    const balance = ingresos - gastos;
    return `
      <div class="card" id="balanceRow">
        <div class="total-row" style="margin-top:0; padding-top:0; border-top:none;"><span>Ingresos</span><span class="amt">${Dates.fmtMoney(ingresos)}</span></div>
        <div class="total-row"><span>Gastos</span><span class="amt">${Dates.fmtMoney(gastos)}</span></div>
        <div class="total-row ${balance < 0 ? 'negative' : 'positive'}"><span>Balance</span><span class="amt">${Dates.fmtMoney(balance)}</span></div>
      </div>
    `;
  }

  function renderProyeccion(m) {
    const avgs = categoryAverages(m);
    const recurrentes = activeRecurrentesTotal();
    const msi = msiTotalForMonth(m);
    const ingresos = activeIngresosFijosTotal();
    let otrosTotal = 0;
    const rows = Object.entries(avgs).map(([cat, d]) => {
      const key = m + '|' + cat;
      const overridden = App.overrides.hasOwnProperty(key);
      const val = overridden ? Number(App.overrides[key]) : d.avg;
      otrosTotal += val;
      return { cat, val, months: d.months, overridden };
    }).sort((a, b) => b.val - a.val);
    const balanceProy = ingresos - recurrentes - msi - otrosTotal;

    return `
      <div class="card">
        <div class="section-label" style="margin:0 0 8px;">Proyección</div>
        <div class="total-row" style="margin-top:0; padding-top:0; border-top:none;"><span>Ingresos</span><span class="amt">${Dates.fmtMoney(ingresos)}</span></div>
        <div class="total-row"><span>Recurrentes</span><span class="amt">${Dates.fmtMoney(-recurrentes)}</span></div>
        <div class="total-row"><span>MSI</span><span class="amt">${Dates.fmtMoney(-msi)}</span></div>
        <div class="total-row"><span>Otros estimados</span><span class="amt">${Dates.fmtMoney(-otrosTotal)}</span></div>
        <div class="total-row ${balanceProy < 0 ? 'negative' : 'positive'}"><span>Balance proyectado</span><span class="amt">${Dates.fmtMoney(balanceProy)}</span></div>
      </div>

      <div class="section-label">Promedios otros estimados</div>
      ${rows.length ? rows.map((r) => `
        <div class="proj-item ${r.overridden ? 'edited' : ''}">
          <div class="lbl">${Categories.capitalize(r.cat)}<span class="sub-txt">promedio de ${r.months} mes${r.months > 1 ? 'es' : ''}${r.months < 3 ? ' (aún afinando)' : ''}${r.overridden ? ' · <span class="edited-tag">editado a mano</span>' : ''}</span></div>
          <input type="number" step="0.01" class="projInput" data-cat="${r.cat}" value="${r.val.toFixed(2)}">
          ${r.overridden ? `<span class="reset-link" data-reset="${r.cat}">restablecer</span>` : ''}
        </div>
      `).join('') : '<div class="empty">Aún no hay suficiente historial para estimar — captura algunos gastos y vuelve aquí.</div>'}
      <div class="hint" style="margin-top:10px;">Al llegar ${Dates.monthLabel(m)}, esta sección se reemplaza automáticamente por el balance real del mes.</div>
    `;
  }

  function wireTopSection(m) {
    if (!isFutureMonth(m) || isBeyondProjectionYear(m)) return;
    document.querySelectorAll('.projInput').forEach((inp) => {
      inp.onchange = async () => {
        const v = parseFloat(inp.value);
        if (!isNaN(v)) await saveProjectionOverride(m, inp.dataset.cat, v);
        render();
      };
    });
    document.querySelectorAll('.reset-link').forEach((a) => {
      a.onclick = async () => { await clearProjectionOverride(m, a.dataset.reset); render(); };
    });
  }

  function renderTop() {
    const m = App.currentMonth;
    const top = document.getElementById('topSection');
    const nextBtn = document.getElementById('nextMonthR');
    const beyond = isFutureMonth(m) && isBeyondProjectionYear(m);
    nextBtn.disabled = beyond;
    if (!isFutureMonth(m)) {
      top.innerHTML = renderBalanceReal(m);
    } else if (beyond) {
      top.innerHTML = `<div class="section-label">Proyección</div><div class="empty">La proyección solo llega hasta diciembre de ${m.slice(0, 4) <= Dates.todayISO().slice(0, 4) ? Dates.todayISO().slice(0, 4) : Dates.todayISO().slice(0, 4)}.</div>`;
    } else {
      top.innerHTML = renderProyeccion(m);
    }
    wireTopSection(m);
  }

  function renderBreakdown() {
    const monthExpenses = App.expenses.filter((e) => e && Dates.isValidDate(e.fecha) && Dates.monthOf(e.fecha) === App.currentMonth);
    const byGroup = {};
    const byGroupCat = {};
    monthExpenses.forEach((e) => {
      const g = e.grupo || 'Otros';
      const c = e.categoria || 'Otros';
      byGroup[g] = (byGroup[g] || 0) + Number(e.monto);
      byGroupCat[g] = byGroupCat[g] || {};
      byGroupCat[g][c] = (byGroupCat[g][c] || 0) + Number(e.monto);
    });
    const total = Object.values(byGroup).reduce((a, b) => a + b, 0) || 1;
    const rows = Object.entries(byGroup).sort((a, b) => b[1] - a[1]);

    const body = document.getElementById('reportBody');
    if (isFutureMonth(App.currentMonth)) {
      // en meses futuros no hay desglose real todavía (nada capturado aún)
      body.innerHTML = '';
      return;
    }
    body.innerHTML = '<div class="section-label" style="margin-top:22px;">Desglose por grupo</div>';
    if (!rows.length) {
      body.innerHTML += '<div class="empty">Sin gastos este mes todavía.</div>';
      return;
    }

    body.innerHTML += rows.map(([grupo, amt]) => {
      const isOpen = expandedGroups.has(grupo);
      const cats = Object.entries(byGroupCat[grupo]).sort((a, b) => b[1] - a[1]);
      const subrows = cats.map(([cat, catAmt]) => `<div class="subcat-item"><span>${cat}</span><span>${Dates.fmtMoney(catAmt)}</span></div>`).join('');
      const budget = App.budgets[grupo];
      const overBudget = budget && amt > budget;
      const pct = Math.min((amt / total) * 100, 100).toFixed(1);
      return `
        <div class="bar-row" data-grupo="${grupo}">
          <div class="label"><span>${isOpen ? '▾' : '▸'} ${grupo}</span><span>${Dates.fmtMoney(amt)}${budget ? ' / ' + Dates.fmtMoney(budget) : ''}</span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%; ${overBudget ? 'background:var(--red);' : ''}"></div></div>
          ${overBudget ? `<span class="bar-warning">⚠ excede el presupuesto por ${Dates.fmtMoney(amt - budget)}</span>` : ''}
        </div>
        ${isOpen ? `<div class="subcats">${subrows}</div>` : ''}
      `;
    }).join('');

    body.querySelectorAll('.bar-row').forEach((row) => {
      row.onclick = () => {
        const g = row.dataset.grupo;
        if (expandedGroups.has(g)) expandedGroups.delete(g); else expandedGroups.add(g);
        renderBreakdown();
      };
    });
  }

  function render() {
    document.getElementById('monthLabelR').textContent = Dates.monthLabel(App.currentMonth);
    renderTop();
    renderBreakdown();
    wireMonthNav();
  }

  function mount(container) {
    container.innerHTML = template();
    render();
  }

  window.ScreenReporte = { mount, render };
})();
