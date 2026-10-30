// screens/inicio.js — captura de gastos (voz, foto, manual) + listado del mes.

(function () {
  let root;
  const $ = (id) => document.getElementById(id);
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
        <div class="field"><label id="mMontoLabel">Monto</label><input type="number" step="0.01" id="mMonto" placeholder="0.00" inputmode="decimal"></div>
        <div class="field"><label>Concepto</label><input type="text" id="mConcepto" placeholder="¿En qué gastaste?"></div>
        <div class="field"><label>Categoría específica <span style="text-transform:none;letter-spacing:0;">(se sugiere sola, edítala si quieres)</span></label>
          <input type="text" id="mCategoria" autocomplete="off" placeholder="p. ej. Gasolina, Vuelo, Gimnasio…">
          <div class="suggestions" id="categoriaSuggestions"></div>
        </div>
        <div class="field"><label>Fecha</label><input type="date" id="mFecha"></div>
        <div class="field"><label>Medio de pago</label>
          <select id="mMedioPago">
            <option value="banco">Banco (débito/transferencia)</option>
            <option value="tarjeta_credito">Tarjeta de crédito</option>
            <option value="efectivo">Efectivo</option>
          </select>
        </div>
        <div class="field" id="mBancoField">
          <label>Banco <span style="text-transform:none;letter-spacing:0;">(opcional, para conciliar)</span></label>
          <input type="text" id="mBanco" autocomplete="off" placeholder="p. ej. BBVA, Santander…">
          <div class="suggestions" id="bancoSuggestions"></div>
        </div>
        <div class="field" id="mTarjetaField" style="display:none;">
          <label>Tarjeta de crédito</label>
          <select id="mTarjeta"></select>
          <button type="button" class="toggle-manual" id="mNuevaTarjetaBtn" style="text-align:left; padding-left:0;">+ agregar una tarjeta nueva →</button>
          <div id="mNuevaTarjetaFields" style="display:none;" class="inline-add-form">
            <input type="text" id="mNuevaTarjetaNombre" placeholder="Nombre de la tarjeta (ej. Principal)">
            <div class="subfield">
              <input type="text" id="mNuevaTarjetaBanco" autocomplete="off" placeholder="¿De qué banco se paga?">
              <div class="suggestions" id="nuevaTarjetaBancoSuggestions"></div>
            </div>
            <input type="number" id="mNuevaTarjetaDiaCorte" min="1" max="31" placeholder="Día de corte (opcional, ej. 20)">
            <button type="button" class="save-btn" id="mNuevaTarjetaGuardar" style="padding:8px;">Guardar tarjeta</button>
          </div>
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

      <input type="text" id="searchInput" class="search-input" placeholder="Buscar: concepto, banco, tarjeta, monto…">

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
    document.getElementById('mBanco').value = '';
    document.getElementById('mTarjeta').value = '';
    document.getElementById('mNuevaTarjetaFields').style.display = 'none';
    toggleMedioPagoFields();
    pendingTicketId = null;
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

  function toggleMedioPagoFields() {
    const val = document.getElementById('mMedioPago').value;
    document.getElementById('mBancoField').style.display = val === 'banco' ? 'flex' : 'none';
    document.getElementById('mTarjetaField').style.display = val === 'tarjeta_credito' ? 'flex' : 'none';
    if (val === 'tarjeta_credito') populateTarjetaSelect();
  }

  function populateTarjetaSelect(selectedId) {
    const sel = document.getElementById('mTarjeta');
    if (!App.tarjetas.length) {
      sel.innerHTML = '<option value="">— agrega una tarjeta primero —</option>';
      return;
    }
    // opción vacía primero: la tarjeta SIEMPRE se elige a mano, nunca se autoselecciona
    sel.innerHTML = '<option value="">— elige una tarjeta —</option>' + App.tarjetas.map((t) => `<option value="${t.id}">${PayFields.esc(t.nombre)}</option>`).join('');
    sel.value = selectedId ? String(selectedId) : '';
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
      medioPago: exp.medioPago === 'tarjeta_credito' ? 'tarjeta_credito' : (exp.medioPago === 'efectivo' ? 'efectivo' : 'banco'),
      banco: exp.banco || null,
      tarjetaId: exp.tarjetaId || null,
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

  function renderSuggestions(containerId, list, onPick) {
    const box = document.getElementById(containerId);
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
      renderSuggestions('categoriaSuggestions', Categories.suggestCategorias(mCategoria.value), (val) => {
        mCategoria.value = val;
        mCategoria.dataset.editedByUser = '1';
      });
    });
    mCategoria.addEventListener('focus', () => {
      renderSuggestions('categoriaSuggestions', Categories.suggestCategorias(mCategoria.value), (val) => {
        mCategoria.value = val;
        mCategoria.dataset.editedByUser = '1';
      });
    });

    const mBanco = document.getElementById('mBanco');
    mBanco.addEventListener('input', () => {
      renderSuggestions('bancoSuggestions', Banks.suggestBanks(mBanco.value), (val) => { mBanco.value = val; });
    });
    mBanco.addEventListener('focus', () => {
      renderSuggestions('bancoSuggestions', Banks.suggestBanks(mBanco.value), (val) => { mBanco.value = val; });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.field')) {
        document.querySelectorAll('.suggestions.open').forEach((el) => el.classList.remove('open'));
      }
    });

    document.getElementById('mMedioPago').addEventListener('change', toggleMedioPagoFields);
    document.getElementById('mNuevaTarjetaBtn').onclick = () => {
      const box = document.getElementById('mNuevaTarjetaFields');
      box.style.display = box.style.display === 'none' ? 'flex' : 'none';
    };
    const mNuevaTarjetaBanco = document.getElementById('mNuevaTarjetaBanco');
    mNuevaTarjetaBanco.addEventListener('input', () => {
      renderSuggestions('nuevaTarjetaBancoSuggestions', Banks.suggestBanks(mNuevaTarjetaBanco.value), (val) => { mNuevaTarjetaBanco.value = val; });
    });
    document.getElementById('mNuevaTarjetaGuardar').onclick = async () => {
      const nombre = document.getElementById('mNuevaTarjetaNombre').value.trim();
      if (!nombre) { setStatus('Ponle un nombre a la tarjeta antes de guardar.', 'err'); return; }
      const t = await Tarjetas.addTarjeta(nombre, mNuevaTarjetaBanco.value.trim(), document.getElementById('mNuevaTarjetaDiaCorte').value);
      document.getElementById('mNuevaTarjetaNombre').value = '';
      mNuevaTarjetaBanco.value = '';
      document.getElementById('mNuevaTarjetaDiaCorte').value = '';
      document.getElementById('mNuevaTarjetaFields').style.display = 'none';
      populateTarjetaSelect(t.id);
      setStatus('Tarjeta guardada ✓', 'ok');
    };

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
        const medioPagoRaw = document.getElementById('mMedioPago').value;
        const medioPago = medioPagoRaw === 'tarjeta_credito' ? 'tarjeta_credito' : (medioPagoRaw === 'efectivo' ? 'efectivo' : 'banco');
        let banco = null;
        let tarjetaId = null;
        if (medioPago === 'banco') {
          banco = document.getElementById('mBanco').value.trim() || null;
          if (banco) await Banks.registerBank(banco);
        } else if (medioPago === 'tarjeta_credito') {
          const tSel = document.getElementById('mTarjeta').value;
          if (!tSel) { setStatus('Selecciona con qué tarjeta pagaste (o agrega una nueva primero).', 'err'); return; }
          tarjetaId = parseFloat(tSel);
        }

        if (document.getElementById('mMSI').checked) {
          const meses = parseInt(document.getElementById('mMSIMeses').value, 10);
          if (!meses || meses < 2) { setStatus('Indica en cuántos meses (mínimo 2) es la compra MSI.', 'err'); return; }
          await saveMSI({ concepto, categoria, grupo, fecha, medioPago, banco, tarjetaId }, monto, meses);
          refineGroupInBackground(newId(), categoria); // por si la categoría es nueva
          resetForm();
          renderList();
          setStatus(`Compra MSI guardada en ${meses} mensualidades ✓`, 'ok');
          return;
        }

        if (document.getElementById('mRecurrente').checked) {
          const template = { id: newId(), monto, concepto, categoria, grupo, medioPago, banco, tarjetaId };
          App.templates.push(template);
          await DB.Store.put('templates', template);
          const id = await addExpense({ monto, concepto, categoria, grupo, fecha, medioPago, banco, tarjetaId, recurrenteId: template.id });
          if (pendingTicketId) await moveTicket(pendingTicketId, id);
          refineGroupInBackground(id, categoria);
          resetForm();
          renderList();
          setStatus('Gasto fijo guardado, se repetirá cada mes ✓', 'ok');
          return;
        }

        const id = await addExpense({ monto, concepto, categoria, grupo, fecha, medioPago, banco, tarjetaId, hasFoto: !!pendingTicketId });
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

  // ---- Importar captura de pantalla (varios movimientos a la vez) ----
  // Flujo: (1) "Importar captura" pregunta qué contiene la imagen (gastos o ingresos) y
  // a qué banco/tarjeta pertenecen; (2) se elige la imagen; (3) se revisan los renglones
  // detectados, cada uno editable antes de guardar; (4) se confirman los seleccionados.
  let importSetup = { tipo: 'gasto', medioPago: 'banco', banco: null, tarjetaId: null };

  function daysBetween(fechaA, fechaB) {
    const [y1, m1, d1] = fechaA.split('-').map(Number);
    const [y2, m2, d2] = fechaB.split('-').map(Number);
    return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86400000);
  }

  // Un renglón es "probable duplicado" si ya hay un gasto/ingreso del mismo tipo con el
  // mismo monto, fecha a ±1 día y concepto parecido.
  function isDuplicateItem(item) {
    const lista = item.tipo === 'ingreso' ? App.incomes : App.expenses;
    return lista.some((e) => {
      if (!e || !Dates.isValidDate(e.fecha)) return false;
      if (Math.abs(Number(e.monto) - Number(item.monto)) > 0.01) return false;
      if (!Dates.isValidDate(item.fecha) || Math.abs(daysBetween(e.fecha, item.fecha)) > 1) return false;
      const a = (e.concepto || '').toLowerCase().trim();
      const b = (item.concepto || '').toLowerCase().trim();
      if (!a || !b) return false;
      return a === b || a.includes(b) || b.includes(a);
    });
  }

  function pagoLabel(it) {
    if (it.tipo === 'ingreso') return it.banco || 'sin banco';
    if (it.medioPago === 'tarjeta_credito') return Tarjetas.tarjetaNombre(it.tarjetaId) || 'sin tarjeta';
    if (it.medioPago === 'efectivo') return 'Efectivo';
    return it.banco || 'sin banco';
  }

  function itemMeta(it) {
    return `${Dates.fmtMoney(it.monto)} · ${it.fecha} · ${it.tipo === 'ingreso' ? 'Ingreso' : it.categoria} · ${pagoLabel(it)}`;
  }

  // Categoría/grupo de cada gasto detectado: lo que ya se conoce se resuelve al instante
  // (sin red); las categorías genuinamente nuevas se clasifican DESPUÉS, en una sola
  // llamada por lote, al confirmar (así también cubre las que el usuario edite a mano).
  function prepareImportItems(rawItems) {
    const s = importSetup;
    const items = rawItems.map((r) => ({
      tipo: s.tipo,
      monto: typeof r.monto === 'number' ? r.monto : (parseFloat(r.monto) || 0),
      fecha: Dates.isValidDate(r.fecha) ? r.fecha : Dates.todayISO(),
      concepto: (r.concepto || '').toString().trim() || (s.tipo === 'ingreso' ? 'Ingreso' : 'Gasto sin descripción'),
      medioPago: s.tipo === 'ingreso' ? null : s.medioPago,
      banco: (s.tipo === 'ingreso' || s.medioPago === 'banco') ? s.banco : null,
      tarjetaId: (s.tipo === 'gasto' && s.medioPago === 'tarjeta_credito') ? s.tarjetaId : null,
      categoria: null,
      grupo: null,
      open: false,
    })).filter((r) => r.monto > 0);

    items.forEach((it) => {
      if (it.tipo === 'gasto') {
        it.categoria = Categories.localGuessCategoria(it.concepto) || it.concepto;
        it.grupo = Categories.quickGroup(it.categoria);
      }
      it.isDup = isDuplicateItem(it);
    });
    importItems = items;
  }

  function renderImportSetup() {
    const panel = $('importPanel');
    panel.innerHTML = `
      <div class="section-label" style="margin-top:18px;">Importar captura</div>
      <div class="hint" style="margin-bottom:10px;">Dime a qué cuenta o tarjeta pertenecen los movimientos de la imagen. Se aplicará a todos y después podrás ajustar renglón por renglón antes de guardar.</div>
      <div class="import-setup">
        <div class="field"><label>¿Qué contiene la imagen?</label>
          <select id="impTipo">
            <option value="gasto">Gastos</option>
            <option value="ingreso">Ingresos</option>
          </select>
        </div>
        <div id="impPay"></div>
        <button class="save-btn gold" id="impChoose">Elegir imagen</button>
        <button class="toggle-manual" id="impCancel">cancelar</button>
      </div>
    `;
    $('impTipo').value = importSetup.tipo;
    let tipoActual = importSetup.tipo;

    const mountPay = () => {
      const opts = { soloBanco: tipoActual === 'ingreso', newCard: true };
      $('impPay').innerHTML = PayFields.html('imp', opts);
      PayFields.wire('imp', opts);
      PayFields.set('imp', importSetup, opts);
    };
    mountPay();

    $('impTipo').onchange = () => {
      // conserva lo ya capturado antes de redibujar los campos según el tipo
      const prev = PayFields.get('imp', { soloBanco: tipoActual === 'ingreso' });
      if (tipoActual === 'ingreso') importSetup.banco = prev.banco;
      else Object.assign(importSetup, prev);
      tipoActual = $('impTipo').value;
      importSetup.tipo = tipoActual;
      if (tipoActual === 'gasto' && !importSetup.medioPago) importSetup.medioPago = 'banco';
      mountPay();
    };

    $('impCancel').onclick = () => { importItems = []; panel.innerHTML = ''; setStatus(''); };
    $('impChoose').onclick = () => {
      const tipo = $('impTipo').value;
      const pay = PayFields.get('imp', { soloBanco: tipo === 'ingreso' });
      if (tipo === 'gasto' && pay.medioPago === 'tarjeta_credito' && !pay.tarjetaId) {
        setStatus('Elige con qué tarjeta se pagaron estos gastos (o agrega una nueva).', 'err');
        return;
      }
      setStatus('');
      importSetup = { tipo, medioPago: pay.medioPago || 'banco', banco: pay.banco, tarjetaId: pay.tarjetaId };
      $('importFileInput').click();
    };
  }

  function rowHTML(idx) {
    const it = importItems[idx];
    return `
      <div class="import-row ${it.isDup ? 'dup' : ''}" id="impRow${idx}">
        <input type="checkbox" class="importCheck" data-idx="${idx}" ${it.isDup ? '' : 'checked'}>
        <div class="info"><span class="titulo">${PayFields.esc(it.concepto)}</span><span class="meta">${PayFields.esc(itemMeta(it))}</span></div>
        <span class="dup-tag" style="${it.isDup ? '' : 'display:none;'}">Ya registrado</span>
        <button type="button" class="icon-btn" data-edit="${idx}" title="Editar este renglón">✎</button>
      </div>
      ${it.open ? editorHTML(idx) : ''}
    `;
  }

  function editorHTML(idx) {
    const it = importItems[idx];
    const p = 'r' + idx;
    const ingreso = it.tipo === 'ingreso';
    return `
      <div class="import-edit" id="impEdit${idx}">
        <div class="field"><label>Tipo</label>
          <select id="${p}Tipo"><option value="gasto">Gasto</option><option value="ingreso">Ingreso</option></select>
        </div>
        <div class="field"><label>Fecha</label><input type="date" id="${p}Fecha"></div>
        <div class="field"><label>Concepto</label><input type="text" id="${p}Concepto"></div>
        ${PayFields.html(p, { soloBanco: ingreso })}
        <div class="field"><label>Monto</label><input type="number" step="0.01" inputmode="decimal" id="${p}Monto"></div>
        ${ingreso ? '' : `<div class="field"><label>Categoría específica</label>
          <input type="text" id="${p}Cat" autocomplete="off">
          <div class="suggestions" id="${p}CatSug"></div></div>`}
      </div>
    `;
  }

  function refreshSummary(idx) {
    const it = importItems[idx];
    const row = $('impRow' + idx);
    if (!row) return;
    it.isDup = isDuplicateItem(it);
    row.querySelector('.titulo').textContent = it.concepto;
    row.querySelector('.meta').textContent = itemMeta(it);
    row.classList.toggle('dup', it.isDup);
    row.querySelector('.dup-tag').style.display = it.isDup ? '' : 'none';
  }

  function wireRowEditor(idx) {
    const it = importItems[idx];
    const p = 'r' + idx;
    const ingreso = it.tipo === 'ingreso';
    const opts = { soloBanco: ingreso, onChange: (v) => {
      if (!ingreso) it.medioPago = v.medioPago;
      it.banco = v.banco;
      it.tarjetaId = v.tarjetaId;
      refreshSummary(idx);
    } };

    $(p + 'Tipo').value = it.tipo;
    $(p + 'Fecha').value = it.fecha;
    $(p + 'Concepto').value = it.concepto;
    $(p + 'Monto').value = it.monto;
    PayFields.wire(p, opts);
    PayFields.set(p, it, opts);

    $(p + 'Tipo').onchange = () => {
      const nuevo = $(p + 'Tipo').value;
      if (nuevo === it.tipo) return;
      it.tipo = nuevo;
      if (nuevo === 'ingreso') {
        it.medioPago = null; it.tarjetaId = null; it.categoria = null; it.grupo = null;
      } else {
        it.medioPago = 'banco';
        it.categoria = Categories.localGuessCategoria(it.concepto) || it.concepto;
        it.grupo = Categories.quickGroup(it.categoria);
      }
      it.isDup = isDuplicateItem(it);
      renderRow(idx);
    };
    $(p + 'Fecha').addEventListener('input', () => { if (Dates.isValidDate($(p + 'Fecha').value)) { it.fecha = $(p + 'Fecha').value; refreshSummary(idx); } });
    $(p + 'Concepto').addEventListener('input', () => { it.concepto = $(p + 'Concepto').value.trim() || it.concepto; refreshSummary(idx); });
    $(p + 'Monto').addEventListener('input', () => { it.monto = parseFloat($(p + 'Monto').value) || 0; refreshSummary(idx); });
    if (!ingreso) {
      const cat = $(p + 'Cat');
      cat.value = it.categoria || '';
      const showCats = () => PayFields.renderSuggestions(p + 'CatSug', Categories.suggestCategorias(cat.value), (v) => {
        cat.value = v; it.categoria = v; it.grupo = Categories.quickGroup(v); refreshSummary(idx);
      });
      cat.addEventListener('input', () => {
        it.categoria = cat.value.trim() || 'Otros';
        it.grupo = Categories.quickGroup(it.categoria); // si es nueva, se clasifica al confirmar
        refreshSummary(idx);
        showCats();
      });
      cat.addEventListener('focus', showCats);
    }
  }

  function renderRow(idx) {
    const wrap = $('impItem' + idx);
    if (!wrap) return;
    const checked = wrap.querySelector('.importCheck') ? wrap.querySelector('.importCheck').checked : !importItems[idx].isDup;
    wrap.innerHTML = rowHTML(idx);
    wrap.querySelector('.importCheck').checked = checked;
    bindRow(idx);
  }

  function bindRow(idx) {
    const wrap = $('impItem' + idx);
    wrap.querySelector('[data-edit]').onclick = () => { importItems[idx].open = !importItems[idx].open; renderRow(idx); };
    if (importItems[idx].open) wireRowEditor(idx);
  }

  function renderImportReview() {
    const panel = $('importPanel');
    if (!importItems.length) { panel.innerHTML = ''; return; }
    const s = importSetup;
    const base = s.tipo === 'ingreso' ? `Ingresos${s.banco ? ' · ' + s.banco : ''}`
      : (s.medioPago === 'tarjeta_credito' ? `Gastos · tarjeta ${Tarjetas.tarjetaNombre(s.tarjetaId) || ''}`
        : (s.medioPago === 'efectivo' ? 'Gastos · efectivo' : `Gastos · banco${s.banco ? ' ' + s.banco : ''}`));
    panel.innerHTML = `
      <div class="section-label" style="margin-top:18px;">Detectado en tu captura (${importItems.length} ${importItems.length === 1 ? 'renglón' : 'renglones'})</div>
      <div class="import-summary">Se aplicó a todos: ${PayFields.esc(base)}. Toca ✎ en un renglón para cambiar fecha, concepto, monto, categoría, banco o tarjeta antes de guardar.</div>
      ${importItems.map((_, idx) => `<div class="import-item" id="impItem${idx}">${rowHTML(idx)}</div>`).join('')}
      <button class="save-btn gold" id="btnConfirmImport" style="margin-top:10px; width:100%;">Importar seleccionados</button>
      <button class="toggle-manual" id="btnCancelImport">cancelar</button>
    `;
    importItems.forEach((_, idx) => bindRow(idx));
    $('btnCancelImport').onclick = () => { importItems = []; renderImportReview(); setStatus(''); };
    $('btnConfirmImport').onclick = confirmImport;
  }

  async function addIncomeRecord(it) {
    const rec = { id: newId(), monto: Number(it.monto) || 0, concepto: it.concepto || 'Ingreso', fecha: it.fecha, recurrenteId: null, banco: it.banco || null };
    App.incomes.unshift(rec);
    await DB.Store.put('incomes', rec);
  }

  function flagRow(idx, msg) {
    importItems[idx].open = true;
    renderRow(idx);
    setStatus(msg, 'err');
    const el = $('impItem' + idx);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function confirmImport() {
    const panel = $('importPanel');
    const sel = [];
    panel.querySelectorAll('.importCheck').forEach((c) => { if (c.checked) sel.push(Number(c.dataset.idx)); });
    if (!sel.length) { setStatus('No seleccionaste ningún renglón para importar.', 'err'); return; }

    for (const idx of sel) {
      const it = importItems[idx];
      if (!(it.monto > 0)) { flagRow(idx, `Revisa el monto de "${it.concepto}".`); return; }
      if (!Dates.isValidDate(it.fecha)) { flagRow(idx, `Revisa la fecha de "${it.concepto}".`); return; }
      if (it.tipo === 'gasto' && it.medioPago === 'tarjeta_credito' && !it.tarjetaId) { flagRow(idx, `Elige la tarjeta de "${it.concepto}".`); return; }
    }

    const btn = $('btnConfirmImport');
    btn.disabled = true;
    try {
      // categorías genuinamente nuevas de los gastos seleccionados: UNA sola llamada por lote
      const nuevas = new Set();
      sel.forEach((idx) => {
        const it = importItems[idx];
        if (it.tipo !== 'gasto') return;
        it.categoria = (it.categoria || '').trim() || 'Otros';
        if (!it.grupo) it.grupo = Categories.quickGroup(it.categoria);
        if (!it.grupo) nuevas.add(it.categoria);
      });
      if (nuevas.size) {
        const mapa = await AI.inferGroupsBatch([...nuevas]);
        sel.forEach((idx) => { const it = importItems[idx]; if (it.tipo === 'gasto' && !it.grupo) it.grupo = mapa[it.categoria] || 'Otros'; });
      }

      let gastos = 0, ingresos = 0;
      for (const idx of sel) {
        const it = importItems[idx];
        if (it.banco) await Banks.registerBank(it.banco);
        if (it.tipo === 'ingreso') { await addIncomeRecord(it); ingresos++; }
        else {
          await addExpense({ monto: it.monto, concepto: it.concepto, categoria: it.categoria, grupo: it.grupo, fecha: it.fecha, medioPago: it.medioPago, banco: it.banco, tarjetaId: it.tarjetaId });
          gastos++;
        }
      }
      importItems = [];
      renderImportReview();
      renderList();
      const partes = [];
      if (gastos) partes.push(`${gastos} gasto(s)`);
      if (ingresos) partes.push(`${ingresos} ingreso(s)`);
      setStatus(`${partes.join(' y ')} importado(s) ✓`, 'ok');
    } catch (err) {
      btn.disabled = false;
      setStatus('No se pudo guardar la importación: ' + (err && err.message ? err.message : err), 'err');
    }
  }

  function wireImport() {
    $('importBtn').onclick = () => {
      if (importItems.length && !confirm('Tienes una importación sin guardar. ¿Descartarla y empezar otra?')) return;
      importItems = [];
      importSetup.tarjetaId = null; // la tarjeta siempre se elige a mano, nunca se hereda
      renderImportSetup();
      $('importPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    $('importFileInput').onchange = async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      setStatus('Leyendo captura…');
      $('importBtn').classList.add('busy');
      try {
        const dataUrl = await resizeImage(file, 1400);
        const rawItems = await AI.importarCaptura(dataUrl, importSetup.tipo);
        if (!rawItems.length) {
          setStatus(`No se detectó ningún ${importSetup.tipo === 'ingreso' ? 'ingreso' : 'gasto'} en la imagen. Intenta con otra captura.`, 'err');
          return;
        }
        prepareImportItems(rawItems);
        renderImportReview();
        setStatus(`${importItems.length} renglón(es) detectado(s) — revisa, edita lo que haga falta y confirma abajo.`, 'ok');
      } catch (err) {
        setStatus('No se pudo leer la captura: ' + (err && err.message ? err.message : err), 'err');
      } finally {
        $('importBtn').classList.remove('busy');
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

  // ¿El gasto coincide con lo que escribió el usuario en el buscador? Busca en concepto,
  // categoría, grupo, banco, tarjeta (nombre y banco desde el que se paga), medio de pago
  // y monto (con o sin comas/signo $, coincidencia parcial).
  function expenseMatches(e, query) {
    if (!query) return true;
    const tarjeta = e.medioPago === 'tarjeta_credito' ? App.tarjetas.find((t) => t.id === e.tarjetaId) : null;
    const medio = e.medioPago === 'efectivo' ? 'efectivo' : (e.medioPago === 'tarjeta_credito' ? 'tarjeta de crédito' : 'banco');
    const text = [e.concepto, e.categoria, e.grupo, e.banco, tarjeta && tarjeta.nombre, tarjeta && tarjeta.bancoPago, medio]
      .map((x) => (x || '').toString().toLowerCase()).join(' | ');
    if (text.includes(query)) return true;
    const num = query.replace(/[$,\s]/g, '');
    if (num && /^\d*\.?\d+$|^\d+\.$/.test(num)) return Number(e.monto).toFixed(2).includes(num);
    return false;
  }

  function renderList() {
    const container = document.getElementById('lineItems');
    if (!container) return;
    const query = (document.getElementById('searchInput').value || '').trim().toLowerCase();
    const monthExpenses = App.expenses.filter((e) => {
      if (!e || !Dates.isValidDate(e.fecha) || Dates.monthOf(e.fecha) !== App.currentMonth) return false;
      return expenseMatches(e, query);
    }).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);

    // Cada renglón: fecha, concepto y luego banco/tarjeta · grupo → categoría.
    container.innerHTML = monthExpenses.length ? monthExpenses.map((e) => {
      const pago = e.medioPago === 'tarjeta_credito' ? (Tarjetas.tarjetaNombre(e.tarjetaId) || 'tarjeta')
        : (e.medioPago === 'efectivo' ? 'Efectivo' : (e.banco || ''));
      const sub = [pago, `${e.grupo || 'Otros'} → ${e.categoria}`].filter(Boolean).join(' · ');
      return `
      <div class="line-item tappable" data-id="${e.id}">
        <div class="desc"><span class="dt">${PayFields.esc(e.fecha)}</span>${e.recurrenteId ? '🔁 ' : ''}${e.msiGroupId ? '💳 ' : ''}${e.medioPago === 'efectivo' ? '💵 ' : ''}${PayFields.esc(e.concepto)}<span class="cat">${PayFields.esc(sub)}</span></div>
        <div class="amt">${Dates.fmtMoney(e.monto)}</div>
        <div class="actions">
          ${e.hasFoto ? `<button class="icon-btn foto" data-id="${e.id}" title="Ver ticket">📷</button>` : ''}
          <button class="icon-btn del" data-id="${e.id}" title="Eliminar">✕</button>
        </div>
      </div>`;
    }).join('') : `<div class="empty">${query ? 'Sin resultados para tu búsqueda.' : 'Aún no hay gastos registrados este mes.'}</div>`;

    const total = monthExpenses.reduce((s, e) => s + Number(e.monto), 0);
    document.getElementById('totalAmt').textContent = Dates.fmtMoney(total);

    container.querySelectorAll('.line-item.tappable').forEach((row) => {
      row.onclick = (ev) => {
        if (ev.target.closest('button')) return; // los botones tienen su propia acción
        Detalle.open('gasto', parseFloat(row.dataset.id));
      };
    });
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
    toggleMedioPagoFields();
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
