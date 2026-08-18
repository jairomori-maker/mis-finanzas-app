// screens/reporte.js — reporte mensual por grupo, expandible por categoría, con presupuestos.

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
      <div id="reportBody"></div>
    `;
  }

  function wireMonthNav() {
    document.getElementById('prevMonthR').onclick = () => { App.currentMonth = Dates.shiftMonth(App.currentMonth, -1); Bus.emit('month-changed'); render(); };
    document.getElementById('nextMonthR').onclick = () => { App.currentMonth = Dates.shiftMonth(App.currentMonth, 1); Bus.emit('month-changed'); render(); };
  }

  function render() {
    document.getElementById('monthLabelR').textContent = Dates.monthLabel(App.currentMonth);
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
    if (!rows.length) {
      body.innerHTML = '<div class="empty">Sin gastos este mes todavía.</div>';
      return;
    }

    body.innerHTML = rows.map(([grupo, amt]) => {
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
        render();
      };
    });
  }

  function mount(container) {
    container.innerHTML = template();
    wireMonthNav();
    render();
  }

  window.ScreenReporte = { mount, render };
})();
