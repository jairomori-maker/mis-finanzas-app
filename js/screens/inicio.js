// screens/inicio.js — pantalla principal: captura de gastos (voz/foto/manual) + lista del mes.

(function () {
  let root;
  let editingId = null;
  let currentPhoto = null; // dataURL de la foto del ticket en captura/edición
  let recognizing = false;

  function template() {
    return `
      <div class="capture-card">
        <div class="capture-buttons">
          <button id="btnVoz" type="button" class="capture-btn voice">🎙️ Dictar</button>
          <button id="btnFoto" type="button" class="capture-btn photo">📷 Foto de ticket</button>
          <input type="file" id="inputFoto" accept="image/*" capture="environment" style="display:none">
        </div>
        <div id="captureStatus" class="capture-status"></div>
        <form id="formGasto" class="form-gasto">
          <input type="hidden" id="mEditId" value="">
          <div class="row">
            <label>Monto</label>
            <input type="number" id="mMonto" step="0.01" min="0" inputmode="decimal" required>
          </div>
          <div class="row">
            <label>Concepto</label>
            <input type="text" id="mConcepto" required>
          </div>
          <div class="row">
            <label>Categoría</label>
            <input type="text" id="mCategoria" autocomplete="off" required>
            <div id="sugerenciasCategoria" class="suggestions"></div>
          </div>
          <div class="row">
            <label>Fecha</label>
            <input type="date" id="mFecha" required>
          </div>
          <div class="row">
            <label>Medio de pago</label>
            <select id="mMedioPago">
              <option value="banco">Banco/Tarjeta</option>
              <option value="efectivo">Efectivo</option>
            </select>
          </div>
          <div class="row checkbox-row">
            <label><input type="checkbox" id="mRecurrente"> Gasto fijo/recurrente (se repite cada mes)</label>
          </div>
          <div class="row checkbox-row">
            <label><input type="checkbox" id="mMsi"> Meses sin intereses (MSI)</label>
          </div>
          <div id="msiFields" class="msi-fields hidden">
            <div class="row">
              <label>Número de meses</label>
              <input type="number" id="mMsiMeses" min="2" max="60" value="3">
            </div>
          </div>
          <div id="fotoPreviewWrap" class="foto-preview-wrap hidden">
            <img id="fotoPreview" class="foto-preview" alt="Ticket">
            <button type="button" id="quitarFoto" class="link-btn">Quitar foto</button>
          </div>
          <div class="row actions">
            <button type="submit" id="btnGuardar" class="primary-btn">Guardar gasto</button>
            <button type="button" id="btnCancelarEdicion" class="secondary-btn hidden">Cancelar edición</button>
          </div>
        </form>
      </div>

      <div class="month-nav">
        <button id="mesAnterior" type="button">‹</button>
        <span id="mesLabel"></span>
        <button id="mesSiguiente" type="button">›</button>
      </div>

      <div class="list-controls">
        <input type="text" id="buscarGasto" placeholder="Buscar...">
        <select id="ordenGasto">
          <option value="fecha-desc">Más recientes primero</option>
          <option value="fecha-asc">Más antiguos primero</option>
          <option value="monto-desc">Mayor monto</option>
          <option value="monto-asc">Menor monto</option>
        </select>
      </div>

      <div id="listaGastos" class="line-items"></div>

      <div id="photoModal" class="photo-modal">
        <span id="closePhotoModal" class="photo-modal-close">&times;</span>
        <img id="photoModalImg" class="photo-modal-img">
      </div>
    `;
  }

  function setStatus(msg, kind) {
    const el = document.getElementById('captureStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'capture-status' + (kind ? ' ' + kind : '');
  }

  function resetForm() {
    editingId = null;
    currentPhoto = null;
    document.getElementById('mEditId').value = '';
    document.getElementById('formGasto').reset();
    document.getElementById('mFecha').value = Dates.todayISO();
    document.getElementById('mMedioPago').value = 'banco';
    document.getElementById('msiFields').classList.add('hidden');
    document.getElementById('fotoPreviewWrap').classList.add('hidden');
    document.getElementById('btnCancelarEdicion').classList.add('hidden');
    document.getElementById('btnGuardar').textContent = 'Guardar gasto';
    document.getElementById('sugerenciasCategoria').innerHTML = '';
    setStatus('');
  }

  function enterEditMode(gasto) {
    editingId = gasto.id;
    currentPhoto = gasto.foto || null;
    document.getElementById('mEditId').value = gasto.id;
    document.getElementById('mMonto').value = gasto.monto;
    document.getElementById('mConcepto').value = gasto.concepto;
    document.getElementById('mCategoria').value = gasto.categoria;
    document.getElementById('mFecha').value = gasto.fecha;
    document.getElementById('mMedioPago').value = gasto.medioPago === 'efectivo' ? 'efectivo' : 'banco';
    document.getElementById('mRecurrente').checked = !!gasto.recurrenteId;
    document.getElementById('mMsi').checked = !!gasto.msiId;
    document.getElementById('msiFields').classList.toggle('hidden', !gasto.msiId);
    if (currentPhoto) {
      document.getElementById('fotoPreview').src = currentPhoto;
      document.getElementById('fotoPreviewWrap').classList.remove('hidden');
    } else {
      document.getElementById('fotoPreviewWrap').classList.add('hidden');
    }
    document.getElementById('btnCancelarEdicion').classList.remove('hidden');
    document.getElementById('btnGuardar').textContent = 'Guardar cambios';
    window.scrollTo(0, 0);
  }

  function exitEditMode() {
    resetForm();
  }

  // Infiere el grupo en segundo plano (sin bloquear el guardado) y actualiza el
  // registro ya guardado cuando la IA responde.
  async function refineGroupInBackground(gastoId, categoria) {
    try {
      const grupo = await AI.inferGroup(categoria);
      const gasto = App.expenses.find((e) => e.id === gastoId);
      if (gasto && grupo) {
        gasto.grupo = grupo;
        await DB.Store.put('expenses', gasto);
        Bus.emit('data-changed');
      }
    } catch (e) {
      console.error('No se pudo refinar el grupo en segundo plano', e);
    }
  }

  async function addExpense(data) {
    const grupoRapido = Categories.quickGroup(data.categoria) || 'Otros';
    const gasto = {
      id: editingId || (Date.now() + Math.random()),
      monto: data.monto,
      concepto: data.concepto,
      categoria: data.categoria,
      grupo: grupoRapido,
      fecha: data.fecha,
      medioPago: data.medioPago,
      foto: currentPhoto || undefined,
    };
    if (data.recurrente) gasto.recurrenteId = gasto.recurrenteId || gasto.id;
    if (editingId) {
      const idx = App.expenses.findIndex((e) => e.id === editingId);
      if (idx >= 0) App.expenses[idx] = gasto;
    } else {
      App.expenses.unshift(gasto);
    }
    await DB.Store.put('expenses', gasto);

    if (data.recurrente && !editingId) {
      const tpl = { id: gasto.recurrenteId, concepto: gasto.concepto, categoria: gasto.categoria, grupo: gasto.grupo, monto: gasto.monto, medioPago: gasto.medioPago };
      App.templates.push(tpl);
      await DB.Store.put('templates', tpl);
    }

    if (!Categories.quickGroup(data.categoria)) {
      refineGroupInBackground(gasto.id, data.categoria);
    }

    if (data.msi) {
      await saveMSI(gasto, data.msiMeses);
    }

    Bus.emit('data-changed');
    return gasto;
  }

  async function saveMSI(gastoBase, meses) {
    const msiId = 'msi-' + Date.now();
    gastoBase.msiId = msiId;
    await DB.Store.put('expenses', gastoBase);
    const montoMensual = gastoBase.monto;
    for (let i = 1; i < meses; i++) {
      const fecha = Dates.monthsLater(gastoBase.fecha, i);
      const cuota = {
        id: Date.now() + Math.random() + i,
        monto: montoMensual,
        concepto: gastoBase.concepto + ` (MSI ${i + 1}/${meses})`,
        categoria: gastoBase.categoria,
        grupo: gastoBase.grupo,
        fecha,
        medioPago: gastoBase.medioPago,
        msiId,
      };
      App.expenses.push(cuota);
      await DB.Store.put('expenses', cuota);
    }
  }

  function renderSuggestions(query) {
    const box = document.getElementById('sugerenciasCategoria');
    const suggestions = Categories.suggestCategorias(query);
    if (!query || suggestions.length === 0) {
      box.innerHTML = '';
      return;
    }
    box.innerHTML = suggestions.map((s) => `<div class="suggestion-item" data-value="${s}">${s}</div>`).join('');
    box.querySelectorAll('.suggestion-item').forEach((item) => {
      item.addEventListener('click', () => {
        document.getElementById('mCategoria').value = item.dataset.value;
        box.innerHTML = '';
      });
    });
  }

  function wireForm() {
    const form = document.getElementById('formGasto');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const monto = parseFloat(document.getElementById('mMonto').value);
      const concepto = document.getElementById('mConcepto').value.trim();
      const categoria = document.getElementById('mCategoria').value.trim();
      const fecha = document.getElementById('mFecha').value;
      const medioPago = document.getElementById('mMedioPago').value;
      const recurrente = document.getElementById('mRecurrente').checked;
      const msi = document.getElementById('mMsi').checked;
      const msiMeses = parseInt(document.getElementById('mMsiMeses').value, 10) || 3;
      if (!monto || !concepto || !categoria || !fecha) return;
      await addExpense({ monto, concepto, categoria, fecha, medioPago, recurrente, msi, msiMeses });
      resetForm();
      setStatus('Gasto guardado ✔', 'ok');
    });

    document.getElementById('mCategoria').addEventListener('input', (e) => renderSuggestions(e.target.value));
    document.getElementById('mMsi').addEventListener('change', (e) => {
      document.getElementById('msiFields').classList.toggle('hidden', !e.target.checked);
    });
    document.getElementById('btnCancelarEdicion').addEventListener('click', exitEditMode);
    document.getElementById('quitarFoto').addEventListener('click', () => {
      currentPhoto = null;
      document.getElementById('fotoPreviewWrap').classList.add('hidden');
    });
  }

  function moveTicket(dataUrl) {
    currentPhoto = dataUrl;
    document.getElementById('fotoPreview').src = dataUrl;
    document.getElementById('fotoPreviewWrap').classList.remove('hidden');
  }

  function resizeImage(file, maxDim, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > height && width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function wireCapture() {
    const inputFoto = document.getElementById('inputFoto');
    document.getElementById('btnFoto').addEventListener('click', () => inputFoto.click());
    inputFoto.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      inputFoto.value = '';
      setStatus('Leyendo ticket...', 'loading');
      try {
        const dataUrl = await resizeImage(file, 1024, 0.82);
        moveTicket(dataUrl);
        const datos = await AI.leerTicket(dataUrl);
        if (datos.monto) document.getElementById('mMonto').value = datos.monto;
        if (datos.comercio) document.getElementById('mConcepto').value = datos.comercio;
        if (datos.categoria) document.getElementById('mCategoria').value = datos.categoria;
        if (datos.fecha && Dates.isValidDate(datos.fecha)) document.getElementById('mFecha').value = datos.fecha;
        setStatus('Ticket leído — revisa los datos antes de guardar ✔', 'ok');
      } catch (err) {
        console.error(err);
        setStatus('No se pudo leer el ticket automáticamente, captura los datos a mano.', 'error');
      }
    });
  }

  function wireVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btn = document.getElementById('btnVoz');
    if (!SpeechRecognition) {
      btn.disabled = true;
      btn.title = 'Tu navegador no soporta dictado por voz';
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-MX';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => { recognizing = true; setStatus('Escuchando...', 'loading'); };
    recognition.onerror = (e) => { recognizing = false; setStatus('No se entendió el dictado, intenta de nuevo.', 'error'); console.error(e); };
    recognition.onend = () => { recognizing = false; };
    recognition.onresult = async (e) => {
      const texto = e.results[0][0].transcript;
      setStatus('Interpretando: "' + texto + '"...', 'loading');
      try {
        const datos = await AI.parsearDictado(texto, Dates.todayISO());
        if (datos.monto) document.getElementById('mMonto').value = datos.monto;
        if (datos.concepto) document.getElementById('mConcepto').value = datos.concepto;
        if (datos.categoria) document.getElementById('mCategoria').value = datos.categoria;
        if (datos.fecha && Dates.isValidDate(datos.fecha)) document.getElementById('mFecha').value = datos.fecha;
        setStatus('Dictado interpretado — revisa los datos antes de guardar ✔', 'ok');
      } catch (err) {
        console.error(err);
        setStatus('No se pudo interpretar el dictado, captura los datos a mano.', 'error');
      }
    };

    btn.addEventListener('click', () => {
      if (recognizing) { recognition.stop(); return; }
      try { recognition.start(); } catch (e) { console.error(e); }
    });
  }

  function wireMonthNav() {
    document.getElementById('mesAnterior').addEventListener('click', () => {
      App.currentMonth = Dates.shiftMonth(App.currentMonth, -1);
      updateMonthLabel();
      renderList();
    });
    document.getElementById('mesSiguiente').addEventListener('click', () => {
      App.currentMonth = Dates.shiftMonth(App.currentMonth, 1);
      updateMonthLabel();
      renderList();
    });
  }

  function updateMonthLabel() {
    const label = document.getElementById('mesLabel');
    if (label) label.textContent = Dates.monthLabel(App.currentMonth);
  }

  function openPhotoModal(src) {
    document.getElementById('photoModalImg').src = src;
    document.getElementById('photoModal').classList.add('open');
  }

  function renderList() {
    const cont = document.getElementById('listaGastos');
    if (!cont) return;
    const query = (document.getElementById('buscarGasto').value || '').trim().toLowerCase();
    const orden = document.getElementById('ordenGasto').value;

    let items = App.expenses.filter((e) => Dates.monthOf(e.fecha) === App.currentMonth);
    if (query) {
      items = items.filter((e) =>
        (e.concepto || '').toLowerCase().includes(query) ||
        (e.categoria || '').toLowerCase().includes(query) ||
        (e.grupo || '').toLowerCase().includes(query)
      );
    }
    items.sort((a, b) => {
      if (orden === 'fecha-asc') return a.fecha.localeCompare(b.fecha);
      if (orden === 'monto-desc') return b.monto - a.monto;
      if (orden === 'monto-asc') return a.monto - b.monto;
      return b.fecha.localeCompare(a.fecha);
    });

    if (items.length === 0) {
      cont.innerHTML = '<p class="empty-msg">No hay gastos este mes.</p>';
      return;
    }

    cont.innerHTML = items.map((e) => {
      const icons = [
        e.recurrenteId ? '🔁' : '',
        e.msiId ? '💳' : '',
        e.medioPago === 'efectivo' ? '💵' : '',
      ].filter(Boolean).join(' ');
      const foto = e.foto ? `<span class="line-photo" data-id="${e.id}">📷</span>` : '';
      return `
        <div class="line-item" data-id="${e.id}">
          <div class="line-main">
            <span class="line-concepto">${e.concepto}</span>
            <span class="line-monto">${Dates.fmtMoney(e.monto)}</span>
          </div>
          <div class="line-sub">
            <span class="line-categoria">${e.categoria} · ${e.grupo}</span>
            <span class="line-icons">${icons} ${foto}</span>
          </div>
          <div class="line-fecha">${e.fecha}</div>
          <div class="line-actions">
            <button type="button" class="line-edit" data-id="${e.id}">✏️</button>
            <button type="button" class="line-delete" data-id="${e.id}">🗑️</button>
          </div>
        </div>
      `;
    }).join('');

    cont.querySelectorAll('.line-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const gasto = App.expenses.find((e) => e.id == btn.dataset.id);
        if (gasto) enterEditMode(gasto);
      });
    });
    cont.querySelectorAll('.line-photo').forEach((el) => {
      el.addEventListener('click', () => {
        const gasto = App.expenses.find((e) => e.id == el.dataset.id);
        if (gasto && gasto.foto) openPhotoModal(gasto.foto);
      });
    });
    cont.querySelectorAll('.line-delete').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const gasto = App.expenses.find((e) => e.id == id);
        if (!gasto) return;
        let confirmMsg = '¿Eliminar este gasto?';
        let deleteScope = 'one';
        if (gasto.recurrenteId) {
          confirmMsg = '¿Eliminar solo este mes, o cancelar el gasto fijo para siempre?\n\nAceptar = solo este mes\nCancelar = no eliminar';
        } else if (gasto.msiId) {
          confirmMsg = '¿Eliminar solo esta cuota, o todas las cuotas de este MSI?\n\nAceptar = solo esta cuota\nCancelar = no eliminar';
        }
        if (!confirm(confirmMsg)) return;
        if (gasto.recurrenteId) {
          const eliminarTodas = confirm('¿También cancelar el gasto fijo para que no se repita en meses futuros?');
          if (eliminarTodas) {
            App.templates = App.templates.filter((t) => t.id !== gasto.recurrenteId);
            await DB.Store.delete('templates', gasto.recurrenteId);
          }
        } else if (gasto.msiId) {
          const eliminarTodas = confirm('¿Eliminar todas las cuotas restantes de este MSI?');
          if (eliminarTodas) {
            const relacionados = App.expenses.filter((e) => e.msiId === gasto.msiId);
            for (const r of relacionados) {
              await DB.Store.delete('expenses', r.id);
            }
            App.expenses = App.expenses.filter((e) => e.msiId !== gasto.msiId);
            Bus.emit('data-changed');
            return;
          }
        }
        await DB.Store.delete('expenses', gasto.id);
        App.expenses = App.expenses.filter((e) => e.id !== gasto.id);
        Bus.emit('data-changed');
      });
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
    wireVoice();
    wireMonthNav();
    document.getElementById('closePhotoModal').onclick = () => document.getElementById('photoModal').classList.remove('open');
    document.getElementById('photoModal').onclick = (e) => { if (e.target.id === 'photoModal') e.target.classList.remove('open'); };
    renderAll();
  }

  window.ScreenInicio = { mount, render: renderAll };
})();
