// screens/inicio.js — captura de gastos (voz, foto, manual) + listado del mes.

(function () {
  let root;
  let editingId = null;
  let recognition = null;
  let listening = false;
  let pendingTicketId = null; // id de gasto cuya foto se está adjuntando
  let msiEnabled = false;
  let importItems = []; // renglones detectados en la última captura importada, pendientes de revisión

  function newId() { return Date.now() + Math.random(); }

  function template() {
    return `
      <div class="section-label">Registrar</div>
      <div class="capture-row">
        <button class="capbtn" id="voiceBtn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
          Dictar
        </button>
        <button class="capbtn" id="photoBtn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          Foto ticket
        </button>
        <button class="capbtn" id="importBtn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8M8 16h5"/><path d="M8 8h.01"/></svg>
          Importar captura
        </button>
        <input type="file" id="fileInput" class="hidden-file" accept="image/*" capture="environment">
        <input type="file" id="importFileInput" class="hidden-file" accept="image/*">
      </div>
      <div class="status" id="status"></div>

      <button class="toggle-manual" id="toggleManual">o captúralo a mano →</button>
      <form class="manual" id="manualForm">
        <div id="editingNotice" style="display:none; font-size:11px; color: var(--gold); font-family:'IBM Plex Mono',monospace; text-transform:uppercase; letter-spacing:1px;">Editando gasto — <a href="#" id="cancelEdit" style="color:var(--red);">cancelar</a></div>
        <div class="field"><label id="mMontoLabel">Monto</label><input type="number" step="0.01" id="mMonto" placeholder="0.00" inputmode="decimal"></div>
        <div class="field"><label>Concepto</label><input type="text" id="mConcepto" placeholder="¿En qué gastaste?"></div>
        <div class="field"><label>Categoría específica <span style="text-transform:none;letter-spacing:0;">(se sugiere sola, edítala si quieres)</span></label>
          <input type="text" id="mCategoria" autocomplete="off" placeholder="p. ej. Gasolina, Vuelo, Gimnasio…">
          <div class="suggestions" id="categoriaSuggestions"></div>
        </div>
        <div class="field"><label>Fecha</label><input type="date" id="mFecha"></div>
        <div class="field"><label>Medio de pago</label>
          <select id="mMedioPago"><option value="banco">Banco (tarjeta/transferencia)</option><option value="efectivo">Efectivo</option></select>
        </div>
        <div class="field checkbox-field"><label><input type="checkbox" id="mRecurrente"> Es un gasto fijo (se repite cada mes)</label></div>
        <div class="field checkbox-field"><label><input type="checkbox" id="mMSI"> Es una compra a meses sin intereses (MSI)</label></div>
        <div class="field" id="msiFields" style="display:none;">
          <label>Número de meses</label>
          <input type="number" id="mMSIMeses" min="2" step="1" placeholder="ej. 12">
        </div>
        <button type="submit" class="save-btn" id="saveBtn">Guardar gasto</button>
      </form>

      <div id="importPanel"></div>

      <div class="section-label" style="margin-top:22px;">Mes</div>
      <div class="month-nav">
        <button id="prevMonth" class="navbtn">‹</button>
        <span class="month-label" id="monthLabel"></span>
        <button id="nextMonth" class="navbtn">›</button>
      </div>

      <input type="text" id="searchInput" class="search-input" placeholder="Buscar por concepto o categoría…">

      <div id="lineItems"></div>
      <div class="total-row"><span>GASTOS</span><span id="totalAmt">$0.00</span></div>
    `;
  }

  function setStatus(msg, kind) {
    const el = document.getElementById('status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function resetForm() {
    document.getElementById('mMonto').value = '';
    document.getElementById('mConcepto').value = '';
    document.getElementById('mCategoria').value = '';
    document.getElementById('mFecha').value = Dates.todayISO();
    document.getElementById('categoriaSuggestions').classList.remove('open');
    document.getElementById('mRecurrente').checked = false;
    document.getElementById('mMSI').checked = false;
    document.getElementById('mMSIMeses').value = '';
    document.getElementById('msiFields').style.display = 'none';
    document.getElementById('mMontoLabel').textContent = 'Monto';
    document.getElementById('mMedioPago').value = 'banco';
    pendingTicketId = null;
  }

  function exitEditMode() {
    editingId = null;
    document.getElementById('editingNotice').style.display = 'none';
    document.getElementById('saveBtn').textContent = 'Guardar gasto';
  }

  function enterEditMode(id) {
    const exp = App.expenses.find((x) => x.id === id);
    if (!exp) return;
    editingId = id;
    document.getElementById('manualForm').classList.add('open');
    document.getElementById('mMonto').value = exp.monto;
    document.getElementById('mConcepto').value = exp.concepto;
    document.getElementById('mCategoria').value = exp.categoria;
    document.getElementById('mFecha').value = exp.fecha;
    document.getElementById('mMedioPago').value = exp.medioPago === 'efectivo' ? 'efectivo' : 'banco';
    document.getElementById('mRecurrente').checked = false;
    document.getElementById('mMSI').checked = false;
    document.getElementById('msiFields').style.display = 'none';
    document.getElementById('mMontoLabel').textContent = 'Monto';
    document.getElementById('editingNotice').style.display = 'block';
    document.getElementById('saveBtn').textContent = 'Guardar cambios';
    document.getElementById('manualForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function refineGroupInBackground(id, categoria) {
    if (Categories.quickGroup(categoria)) return;
    AI.inferGroup(categoria).then(async (g) => {
      const exp = App.expenses.find((x) => x.id === id);
      if (exp && g && g !== exp.grupo) {
        exp.grupo = g;
        await DB.Store.put('expenses', exp);
        renderList();
      }
    }).catch(() => {});
  }

  async function addExpense(exp) {
    const id = exp.id || newId();
    const clean = {
      id,
      monto: Number(exp.monto) || 0,
      concepto: exp.concepto || 'Gasto sin descripción',
      categoria: exp.categoria || 'Otros',
      grupo: exp.grupo || 'Otros',
      fecha: Dates.isValidDate(exp.fecha) ? exp.fecha : Dates.todayISO(),
      recurrenteId: exp.recurrenteId || null,
      msiGroupId: exp.msiGroupId || null,
      hasFoto: exp.hasFoto || false,
      medioPago: exp.medioPago === 'efectivo' ? 'efectivo' : 'banco',
    };
    App.expenses.unshift(clean);
    await DB.Store.put('expenses', clean);
    return id;
  }

  async function saveMSI(base, totalMonto, meses) {
    const msiGroupId = newId();
    const perMonthRaw = totalMonto / meses;
    const perMonth = Math.round(perMonthRaw * 100) / 100;
    let acumulado = 0;
    for (let i = 0; i < meses; i++) {
      const fecha = Dates.monthsLater(base.fecha, i);
      let monto = perMonth;
      if (i === meses - 1) monto = Math.round((totalMonto - acumulado) * 100) / 100; // ajusta redondeo en la última
      acumulado += monto;
      await addExpense({
        ...base,
        monto,
        concepto: `${base.concepto} (MSI ${i + 1}/${meses})`,
        fecha,
        msiGroupId,
      });
    }
  }

  function renderSuggestions(list, onPick) {
    const box = document.getElementById('categoriaSuggestions');
    if (!list.length) { box.classList.remove('open'); box.innerHTML = ''; return; }
    box.innerHTML = list.map((c) => `<div data-val="${c}">${c}</div>`).join('');
    box.classList.add('open');
    box.querySelectorAll('div').forEach((d) => {
      d.onclick = () => { onPick(d.dataset.val); box.classList.remove('open'); };
    });
  }

  function wireForm() {
    const mCategoria = document.getElementById('mCategoria');
    const mConcepto = document.getElementById('mConcepto');

    mConcepto.addEventListener('input', () => {
      if (mCategoria.dataset.editedByUser) return;
      const guess = Categories.localGuessCategoria(mConcepto.value);
      if (guess) mCategoria.value = guess;
    });
    mCategoria.addEventListener('input', () => {
      mCategoria.dataset.editedByUser = mCategoria.value ? '1' : '';
      renderSuggestions(Categories.suggestCategorias(mCategoria.value), (val) => {
        mCategoria.value = val;
        mCategoria.dataset.editedByUser = '1';
      });
    });
    mCategoria.addEventListener('focus', () => {
      renderSuggestions(Categories.suggestCategorias(mCategoria.value), (val) => {
        mCategoria.value = val;
        mCategoria.dataset.editedByUser = '1';
      });
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.field')) document.getElementById('categoriaSuggestions').classList.remove('open');
    });

    document.getElementById('mMSI').addEventListener('change', (e) => {
      msiEnabled = e.target.checked;
      document.getElementById('msiFields').style.display = msiEnabled ? 'flex' : 'none';
      document.getElementById('mMontoLabel').textContent = msiEnabled ? 'Monto total de la compra' : 'Monto';
      if (msiEnabled) document.getElementById('mRecurrente').checked = false;
    });
    document.getElementById('mRecurrente').addEventListener('change', (e) => {
      if (e.target.checked) {
        document.getElementById('mMSI').checked = false;
        msiEnabled = false;
        document.getElementById('msiFields').style.display = 'none';
        document.getElementById('mMontoLabel').textContent = 'Monto';
      }
    });

    document.getElementById('toggleManual').onclick = () => {
      document.getElementById('manualForm').classList.toggle('open');
    };
    document.getElementById('cancelEdit').onclick = (ev) => { ev.preventDefault(); exitEditMode(); resetForm(); };

    document.getElementById('manualForm').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const montoRaw = document.getElementById('mMonto').value;
        const monto = parseFloat(montoRaw);
        if (!montoRaw || isNaN(monto) || monto <= 0) { setStatus('Ingresa un monto válido antes de guardar.', 'err'); return; }
        const categoria = mCategoria.value.trim() || 'Otros';
        const grupo = Categories.quickGroup(categoria) || 'Otros';
        const concepto = mConcepto.value || 'Gasto sin descripción';
        const fecha = document.getElementById('mFecha').value || Dates.todayISO();
        const medioPago = document.getElementById('mMedioPago').value === 'efectivo' ? 'efectivo' : 'banco';

        if (editingId) {
          const exp = App.expenses.find((x) => x.id === editingId);
          if (exp) {
            exp.monto = monto; exp.concepto = concepto; exp.categoria = categoria; exp.grupo = grupo; exp.fecha = fecha; exp.medioPago = medioPago;
            await DB.Store.put('expenses', exp);
            refineGroupInBackground(editingId, categoria);
          }
          exitEditMode();
          resetForm();
          renderList();
          setStatus('Cambios guardados ✓', 'ok');
          return;
        }

        if (document.getElementById('mMSI').checked) {
          const meses = parseInt(document.getElementById('mMSIMeses').value, 10);
          if (!meses || meses < 2) { setStatus('Indica en cuántos meses (mínimo 2) es la compra MSI.', 'err'); return; }
          await saveMSI({ concepto, categoria, grupo, fecha, medioPago }, monto, meses);
          refineGroupInBackground(newId(), categoria); // por si la categoría es nueva
          resetForm();
          renderList();
          setStatus(`Compra MSI guardada en ${meses} mensualidades ✓`, 'ok');
          return;
        }

        if (document.getElementById('mRecurrente').checked) {
          const template = { id: newId(), monto, concepto, categoria, grupo, medioPago };
          App.templates.push(template);
          await DB.Store.put('templates', template);
          const id = await addExpense({ monto, concepto, categoria, grupo, fecha, medioPago, recurrenteId: template.id });
          if (pendingTicketId) await moveTicket(pendingTicketId, id);
          refineGroupInBackground(id, categoria);
          resetForm();
          renderList();
          setStatus('Gasto fijo guardado, se repetirá cada mes ✓', 'ok');
          return;
        }

        const id = await addExpense({ monto, concepto, categoria, grupo, fecha, medioPago, hasFoto: !!pendingTicketId });
        if (pendingTicketId) await moveTicket(pendingTicketId, id);
        refineGroupInBackground(id, categoria);
        resetForm();
        renderList();
        setStatus('Gasto guardado ✓', 'ok');
      } catch (err) {
        setStatus('Error al guardar: ' + (err && err.message ? err.message : err), 'err');
      }
    };
  }

  async function moveTicket(tempId, realId) {
    const rec = await DB.Store.get('tickets', tempId);
    if (rec) {
      await DB.Store.delete('tickets', tempId);
      await DB.Store.put('tickets', { id: realId, dataUrl: rec.dataUrl });
    }
  }

  // ---- Foto de ticket ----
  function resizeImage(file, maxDim) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => { img.src = reader.result; };
      reader.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function wireCapture() {
    document.getElementById('photoBtn').onclick = () => document.getElementById('fileInput').click();
    document.getElementById('fileInput').onchange = async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      setStatus('Leyendo ticket…');
      document.getElementById('photoBtn').classList.add('busy');
      try {
        const dataUrl = await resizeImage(file, 1024);
        const tempId = newId();
        await DB.Store.put('tickets', { id: tempId, dataUrl });
        pendingTicketId = tempId;
        const info = await AI.leerTicket(dataUrl);
        document.getElementById('manualForm').classList.add('open');
        if (info.monto) document.getElementById('mMonto').value = info.monto;
        if (info.comercio) document.getElementById('mConcepto').value = info.comercio;
        const cat = info.categoria || Categories.localGuessCategoria(info.comercio || '') || '';
        if (cat) { document.getElementById('mCategoria').value = cat; document.getElementById('mCategoria').dataset.editedByUser = '1'; }
        if (info.fecha && Dates.isValidDate(info.fecha)) document.getElementById('mFecha').value = info.fecha;
        setStatus('Ticket leído — revisa los datos y guarda ✓', 'ok');
      } catch (err) {
        document.getElementById('manualForm').classList.add('open');
        setStatus('No se pudo leer el ticket automáticamente. Captúralo a mano (la foto ya quedó guardada).', 'err');
      } finally {
        document.getElementById('photoBtn').classList.remove('busy');
      }
    };
  }

  // ---- Importar captura de pantalla (varios gastos a la vez) ----
  function daysBetween(fechaA, fechaB) {
    const [y1, m1, d1] = fechaA.split('-').map(Number);
    const [y2, m2, d2] = fechaB.split('-').map(Number);
    return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86400000);
  }

  function isDuplicateExpense(item) {
    return App.expenses.some((e) => {
      if (!e || !Dates.isValidDate(e.fecha)) return false;
      if (Math.abs(Number(e.monto) - Number(item.monto)) > 0.01) return false;
      if (Math.abs(daysBetween(e.fecha, item.fecha)) > 1) return false;
      const a = (e.concepto || '').toLowerCase().trim();
      const b = (item.concepto || '').toLowerCase().trim();
      if (!a || !b) return false;
      return a === b || a.includes(b) || b.includes(a);
    });
  }

  // Resuelve la categoría/grupo de cada renglón detectado. Las categorías que ya se
  // conocen (base fija, agregadas por el usuario, o coinciden con un comercio) se
  // resuelven al instante sin red; las genuinamente nuevas se juntan en UNA sola
  // llamada de clasificación por lote en vez de una por renglón.
  async function prepareImportItems(rawItems) {
    const items = rawItems.map((r) => ({
      monto: typeof r.monto === 'number' ? r.monto : (parseFloat(r.monto) || 0),
      fecha: Dates.isValidDate(r.fecha) ? r.fecha : Dates.todayISO(),
      concepto: (r.concepto || '').toString().trim() || 'Gasto sin descripción',
    })).filter((r) => r.monto > 0);

    const nuevas = new Set();
    items.forEach((it) => {
      const guess = Categories.localGuessCategoria(it.concepto);
      it.categoria = guess || it.concepto;
      it.grupo = Categories.quickGroup(it.categoria);
      if (!it.grupo) nuevas.add(it.categoria);
    });

    if (nuevas.size) {
      const mapa = await AI.inferGroupsBatch([...nuevas]);
      items.forEach((it) => { if (!it.grupo) it.grupo = mapa[it.categoria] || 'Otros'; });
    }

    items.forEach((it) => { it.isDup = isDuplicateExpense(it); });
    importItems = items;
  }

  function renderImportPanel() {
    const panel = document.getElementById('importPanel');
    if (!panel) return;
    if (!importItems.length) { panel.innerHTML = ''; return; }
    panel.innerHTML = `
      <div class="section-label" style="margin-top:18px;">Detectado en tu captura (${importItems.length} ${importItems.length === 1 ? 'renglón' : 'renglones'})</div>
      ${importItems.map((it, idx) => `
        <div class="import-row ${it.isDup ? 'dup' : ''}">
          <input type="checkbox" class="importCheck" data-idx="${idx}" ${it.isDup ? '' : 'checked'}>
          <div class="info">${it.concepto}<span class="meta">${Dates.fmtMoney(it.monto)} · ${it.fecha} · ${it.categoria}</span></div>
          ${it.isDup ? '<span class="dup-tag">Ya registrado</span>' : ''}
        </div>
      `).join('')}
      <button class="save-btn gold" id="btnConfirmImport" style="margin-top:10px;">Importar seleccionados</button>
      <button class="toggle-manual" id="btnCancelImport">cancelar</button>
    `;
    document.getElementById('btnCancelImport').onclick = () => { importItems = []; renderImportPanel(); setStatus(''); };
    document.getElementById('btnConfirmImport').onclick = async () => {
      const checks = panel.querySelectorAll('.importCheck');
      const seleccionados = [];
      checks.forEach((c) => { if (c.checked) seleccionados.push(importItems[Number(c.dataset.idx)]); });
      for (const it of seleccionados) {
        await addExpense({ monto: it.monto, concepto: it.concepto, categoria: it.categoria, grupo: it.grupo, fecha: it.fecha, medioPago: 'banco' });
      }
      importItems = [];
      renderImportPanel();
      renderList();
      setStatus(`${seleccionados.length} gasto(s) importado(s) ✓`, 'ok');
    };
  }

  function wireImport() {
    document.getElementById('importBtn').onclick = () => document.getElementById('importFileInput').click();
    document.getElementById('importFileInput').onchange = async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      setStatus('Leyendo captura…');
      document.getElementById('importBtn').classList.add('busy');
      try {
        const dataUrl = await resizeImage(file, 1400);
        const rawItems = await AI.importarCaptura(dataUrl);
        if (!rawItems.length) {
          setStatus('No se detectó ningún gasto en la imagen. Intenta con otra captura.', 'err');
          return;
        }
        await prepareImportItems(rawItems);
        renderImportPanel();
        setStatus(`${importItems.length} gasto(s) detectado(s) — revisa y confirma abajo.`, 'ok');
      } catch (err) {
        setStatus('No se pudo leer la captura: ' + (err && err.message ? err.message : err), 'err');
      } finally {
        document.getElementById('importBtn').classList.remove('busy');
      }
    };
  }

  function wireVoice() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btn = document.getElementById('voiceBtn');
    if (!Recognition) {
      btn.title = 'El dictado por voz no está disponible en este navegador';
      btn.addEventListener('click', () => setStatus('Este navegador no soporta dictado por voz. Usa Chrome en Android o captúralo a mano.', 'err'));
      return;
    }
    recognition = new Recognition();
    recognition.lang = 'es-MX';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => { listening = true; btn.classList.add('listening'); setStatus('Escuchando… di algo como "gasté 250 pesos en gasolina"'); };
    recognition.onend = () => { listening = false; btn.classList.remove('listening'); };
    recognition.onerror = (ev) => { listening = false; btn.classList.remove('listening'); setStatus('No se entendió el dictado (' + ev.error + '). Intenta de nuevo.', 'err'); };
    recognition.onresult = async (ev) => {
      const texto = ev.results[0][0].transcript;
      setStatus('Interpretando: "' + texto + '"…');
      try {
        const info = await AI.parsearDictado(texto, Dates.todayISO());
        document.getElementById('manualForm').classList.add('open');
        if (info.monto) document.getElementById('mMonto').value = info.monto;
        if (info.concepto) document.getElementById('mConcepto').value = info.concepto;
        const cat = info.categoria || Categories.localGuessCategoria(info.concepto || '') || '';
        if (cat) { document.getElementById('mCategoria').value = cat; document.getElementById('mCategoria').dataset.editedByUser = '1'; }
        document.getElementById('mFecha').value = (info.fecha && Dates.isValidDate(info.fecha)) ? info.fecha : Dates.todayISO();
        setStatus('Dictado interpretado — revisa los datos y guarda ✓', 'ok');
      } catch (err) {
        setStatus('Se escuchó: "' + texto + '" pero no se pudo interpretar automáticamente. Complétalo a mano.', 'err');
        document.getElementById('manualForm').classList.add('open');
        document.getElementById('mConcepto').value = texto;
      }
    };

    btn.onclick = () => {
      if (listening) { recognition.stop(); return; }
      try { recognition.start(); } catch (e) { /* ya estaba iniciando */ }
    };
  }

  function wireMonthNav() {
    document.getElementById('prevMonth').onclick = () => { App.currentMonth = Dates.shiftMonth(App.currentMonth, -1); Bus.emit('month-changed'); renderAll(); };
    document.getElementById('nextMonth').onclick = () => { App.currentMonth = Dates.shiftMonth(App.currentMonth, 1); Bus.emit('month-changed'); renderAll(); };
    document.getElementById('searchInput').addEventListener('input', renderList);
  }

  function updateMonthLabel() {
    document.getElementById('monthLabel').textContent = Dates.monthLabel(App.currentMonth);
  }

  function openPhotoModal(id) {
    DB.Store.get('tickets', id).then((rec) => {
      if (rec && rec.dataUrl) {
        document.getElementById('photoModalImg').src = rec.dataUrl;
        document.getElementById('photoModal').classList.add('open');
      } else {
        setStatus('No se encontró la foto de este ticket.', 'err');
      }
    });
  }

  function renderList() {
    const container = document.getElementById('lineItems');
    if (!container) return;
    const query = (document.getElementById('searchInput').value || '').trim().toLowerCase();
    const monthExpenses = App.expenses.filter((e) => {
      if (!e || !Dates.isValidDate(e.fecha) || Dates.monthOf(e.fecha) !== App.currentMonth) return false;
      if (!query) return true;
      return (e.concepto || '').toLowerCase().includes(query) || (e.categoria || '').toLowerCase().includes(query) || (e.grupo || '').toLowerCase().includes(query);
    }).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);

    container.innerHTML = monthExpenses.length ? monthExpenses.map((e) => `
      <div class="line-item">
        <div class="desc">${e.recurrenteId ? '🔁 ' : ''}${e.msiGroupId ? '💳 ' : ''}${e.medioPago === 'efectivo' ? '💵 ' : ''}${e.concepto}<span class="cat">${e.grupo || 'Otros'} → ${e.categoria} · ${e.fecha}</span></div>
        <div class="amt">${Dates.fmtMoney(e.monto)}</div>
        <div class="actions">
          ${e.hasFoto ? `<button class="icon-btn foto" data-id="${e.id}" title="Ver ticket">📷</button>` : ''}
          <button class="icon-btn edit" data-id="${e.id}" title="Editar">✎</button>
          <button class="icon-btn del" data-id="${e.id}" title="Eliminar">✕</button>
        </div>
      </div>
    `).join('') : `<div class="empty">${query ? 'Sin resultados para tu búsqueda.' : 'Aún no hay gastos registrados este mes.'}</div>`;

    const total = monthExpenses.reduce((s, e) => s + Number(e.monto), 0);
    document.getElementById('totalAmt').textContent = Dates.fmtMoney(total);

    container.querySelectorAll('.edit').forEach((b) => { b.onclick = () => enterEditMode(Number(b.dataset.id) || parseFloat(b.dataset.id)); });
    container.querySelectorAll('.foto').forEach((b) => { b.onclick = () => openPhotoModal(parseFloat(b.dataset.id)); });
    container.querySelectorAll('.del').forEach((b) => {
      b.onclick = async () => {
        const id = parseFloat(b.dataset.id);
        const exp = App.expenses.find((x) => x.id === id);
        if (!exp) return;
        App.expenses = App.expenses.filter((x) => x.id !== id);
        await DB.Store.delete('expenses', id);
        if (exp.recurrenteId) {
          const detener = confirm('Este es un gasto fijo. ¿Quieres dejar de repetirlo los próximos meses?');
          if (detener) {
            App.templates = App.templates.filter((t) => t.id !== exp.recurrenteId);
            await DB.Store.delete('templates', exp.recurrenteId);
          }
        } else if (exp.msiGroupId) {
          const futuras = App.expenses.filter((x) => x.msiGroupId === exp.msiGroupId && x.fecha > exp.fecha);
          if (futuras.length && confirm(`Esta cuota es parte de una compra a MSI. ¿Eliminar también las ${futuras.length} cuotas futuras?`)) {
            for (const f of futuras) { App.expenses = App.expenses.filter((x) => x.id !== f.id); await DB.Store.delete('expenses', f.id); }
          }
        }
        renderList();
      };
    });
  }

  function renderAll() {
    updateMonthLabel();
    renderList();
  }

  function mount(container) {
    root = container;
    root.innerHTML = template();
    document.getElementById('mFecha').value = Dates.todayISO();
    wireForm();
    wireCapture();
    wireImport();
    wireVoice();
    wireMonthNav();
    document.getElementById('closePhotoModal').onclick = () => document.getElementById('photoModal').classList.remove('open');
    document.getElementById('photoModal').onclick = (e) => { if (e.target.id === 'photoModal') e.target.classList.remove('open'); };
    renderAll();
  }

  window.ScreenInicio = { mount, render: renderAll };
})();
