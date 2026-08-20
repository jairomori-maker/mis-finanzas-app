// screens/ajustes.js — presupuestos por grupo, categorías personalizadas y respaldo de datos.

(function () {
  function template() {
    return `
      <div class="section-label">Presupuestos por grupo</div>
      <div class="hint">Límite mensual opcional por grupo. Se muestra en el Reporte con una alerta si te pasas.</div>
      <form class="manual open" id="budgetsForm"></form>

      <div class="section-label" style="margin-top:26px;">Categorías agregadas por ti</div>
      <div class="hint">Categorías nuevas que has usado y el grupo que la IA (o tú) les asignó. Puedes corregir el grupo si no quedó bien.</div>
      <div id="customCatsList"></div>

      <div class="section-label" style="margin-top:26px;">Respaldo de tus datos</div>
      <div class="hint">Todo se guarda solo en este dispositivo. Si cambias de celular o desinstalas la app, se pierde — exporta un respaldo de vez en cuando.</div>
      <button class="action-btn" id="exportBtn">⬇ Exportar copia de seguridad</button>
      <button class="toggle-manual" id="toggleImport">o importar una copia de seguridad →</button>
      <input type="file" id="importFile" accept="application/json" class="hidden-file">
      <div class="status" id="ajustesStatus"></div>

      <div class="section-label" style="margin-top:26px;">Acerca de</div>
      <div class="hint">Mis Finanzas — app de finanzas personales. Tus datos viven únicamente en este dispositivo; no se envían a ningún servidor, salvo el texto/foto que envías a IA para ayudarte a capturar un gasto (ver README del proyecto).</div>
    `;
  }

  function setStatus(msg, kind) {
    const el = document.getElementById('ajustesStatus');
    if (el) { el.textContent = msg || ''; el.className = 'status' + (kind ? ' ' + kind : ''); }
  }

  function renderBudgetsForm() {
    const form = document.getElementById('budgetsForm');
    form.innerHTML = Categories.GRUPOS_FIJOS.filter((g) => g !== 'Otros').map((g) => `
      <div class="field budget-row">
        <label>${g}</label>
        <input type="number" step="0.01" class="budgetInput" data-grupo="${g}" value="${App.budgets[g] || ''}" placeholder="Sin límite">
      </div>
    `).join('') + '<button type="submit" class="save-btn">Guardar presupuestos</button>';

    form.onsubmit = async (e) => {
      e.preventDefault();
      const inputs = form.querySelectorAll('.budgetInput');
      for (const input of inputs) {
        const v = parseFloat(input.value);
        await saveBudget(input.dataset.grupo, v > 0 ? v : 0);
      }
      setStatus('Presupuestos guardados ✓', 'ok');
    };
  }

  function renderCustomCats() {
    const map = Categories.getCustomMap();
    const container = document.getElementById('customCatsList');
    const entries = Object.entries(map);
    if (!entries.length) { container.innerHTML = '<div class="empty">Todavía no has agregado categorías nuevas — aparecerán aquí en cuanto captures un gasto con una categoría que no esté en la lista base.</div>'; return; }
    container.innerHTML = entries.map(([cat, grupo]) => `
      <div class="line-item">
        <div class="desc">${Categories.capitalize(cat)}<span class="cat">Grupo actual: ${grupo}</span></div>
        <div class="actions">
          <select class="catGroupSelect" data-cat="${cat}">
            ${Categories.GRUPOS_FIJOS.map((g) => `<option value="${g}" ${g === grupo ? 'selected' : ''}>${g}</option>`).join('')}
          </select>
        </div>
      </div>
    `).join('');
    container.querySelectorAll('.catGroupSelect').forEach((sel) => {
      sel.onchange = async () => {
        await Categories.saveCustomCategory(sel.dataset.cat, sel.value);
        // actualiza gastos existentes con esa categoría para reflejar el nuevo grupo
        const affected = App.expenses.filter((e) => (e.categoria || '').trim().toLowerCase() === sel.dataset.cat);
        for (const e of affected) { e.grupo = sel.value; await DB.Store.put('expenses', e); }
        setStatus('Categoría actualizada ✓', 'ok');
        renderCustomCats();
      };
    });
  }

  async function exportData() {
    const [expenses, incomes, templates, incomeTemplates, budgets, saldos, retiros, tickets, categoryMap] = await Promise.all([
      DB.Store.getAll('expenses'), DB.Store.getAll('incomes'), DB.Store.getAll('templates'),
      DB.Store.getAll('incomeTemplates'), DB.Store.getAll('budgets'), DB.Store.getAll('saldos'),
      DB.Store.getAll('retiros'), DB.Store.getAll('tickets'), DB.Store.getAll('categoryMap'),
    ]);
    const payload = { version: 1, exportedAt: new Date().toISOString(), expenses, incomes, templates, incomeTemplates, budgets, saldos, retiros, tickets, categoryMap };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mis-finanzas-respaldo-${Dates.todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function importData(file) {
    const text = await file.text();
    const payload = JSON.parse(text);
    if (!payload || payload.version !== 1) throw new Error('Archivo de respaldo no reconocido');
    const stores = ['expenses', 'incomes', 'templates', 'incomeTemplates', 'budgets', 'saldos', 'retiros', 'tickets', 'categoryMap'];
    for (const s of stores) {
      if (Array.isArray(payload[s]) && payload[s].length) await DB.Store.bulkPut(s, payload[s]);
    }
    await loadAll();
  }

  function wireBackup() {
    document.getElementById('exportBtn').onclick = () => exportData().then(() => setStatus('Respaldo descargado ✓', 'ok'));
    document.getElementById('toggleImport').onclick = () => document.getElementById('importFile').click();
    document.getElementById('importFile').onchange = async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (!confirm('Importar combinará este respaldo con los datos que ya tienes en el dispositivo (no borra nada). ¿Continuar?')) return;
      try {
        await importData(file);
        setStatus('Respaldo importado ✓', 'ok');
        renderAll();
      } catch (err) {
        setStatus('No se pudo importar: ' + (err && err.message ? err.message : err), 'err');
      }
    };
  }

  function renderAll() {
    renderBudgetsForm();
    renderCustomCats();
  }

  function mount(container) {
    container.innerHTML = template();
    wireBackup();
    renderAll();
  }

  window.ScreenAjustes = { mount, render: renderAll };
})();
