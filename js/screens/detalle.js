// screens/detalle.js — pantalla de detalle/edición de un gasto o un ingreso.
// Se abre al tocar un renglón de la lista; al guardar (o cancelar) se regresa a la
// lista exactamente donde estaba (mismo mes, misma búsqueda, mismo scroll). El botón
// "atrás" del celular también regresa a la lista en vez de salirse de la app.

(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => PayFields.esc(s);

  let isOpen = false;
  let pushed = false;
  let savedScroll = 0;
  let toastTimer = null;

  function toast(msg) {
    let el = $('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function showView(innerHTML) {
    savedScroll = window.scrollY || 0;
    $('detailView').innerHTML = innerHTML;
    document.body.classList.add('detail-open');
    isOpen = true;
    try { history.pushState({ detalle: true }, ''); pushed = true; } catch (e) { pushed = false; }
    window.scrollTo(0, 0);
  }

  function hide() {
    if (!isOpen) return;
    isOpen = false;
    document.body.classList.remove('detail-open');
    $('detailView').innerHTML = '';
    Bus.emit('data-changed'); // re-renderiza la pantalla actual con los cambios
    requestAnimationFrame(() => window.scrollTo(0, savedScroll));
  }

  function requestClose() {
    if (pushed) { pushed = false; history.back(); } // el popstate llama a hide()
    else hide();
  }

  window.addEventListener('popstate', () => { pushed = false; hide(); });

  function openTicketPhoto(id) {
    DB.Store.get('tickets', id).then((rec) => {
      if (rec && rec.dataUrl) {
        $('photoModalImg').src = rec.dataUrl;
        $('photoModal').classList.add('open');
      } else {
        toast('No se encontró la foto de este ticket.');
      }
    });
  }

  function head(titulo) {
    return `
      <div class="detail-head">
        <button type="button" class="navbtn" id="detBack" title="Volver">‹</button>
        <div class="detail-title">${titulo}</div>
      </div>`;
  }

  // ---------- Gasto ----------
  function openGasto(id) {
    const exp = App.expenses.find((x) => x.id === id);
    if (!exp) return;
    const originalCat = exp.categoria || '';
    const notas = [];
    if (exp.recurrenteId) notas.push('🔁 Gasto fijo: los cambios aplican solo a este mes; lo que se repite cada mes no cambia.');
    if (exp.msiGroupId) notas.push('💳 Cuota de una compra a MSI: los cambios aplican solo a esta cuota.');

    showView(`
      ${head('Detalle del gasto')}
      <form class="detail-form" id="detForm">
        <div class="field"><label>Fecha</label><input type="date" id="detFecha"></div>
        <div class="field"><label>Concepto</label><input type="text" id="detConcepto"></div>
        ${PayFields.html('det', { newCard: true })}
        <div class="field"><label>Monto</label><input type="number" step="0.01" id="detMonto" inputmode="decimal"></div>
        <div class="field"><label>Categoría específica</label>
          <input type="text" id="detCategoria" autocomplete="off" placeholder="p. ej. Gasolina, Vuelo, Gimnasio…">
          <div class="suggestions" id="detCatSug"></div>
        </div>
        ${exp.hasFoto ? '<button type="button" class="toggle-manual" id="detFoto" style="text-align:left; padding-left:0;">📷 Ver foto del ticket</button>' : ''}
        ${notas.map((n) => `<div class="hint">${n}</div>`).join('')}
        <div class="status err" id="detStatus"></div>
        <button type="submit" class="save-btn" id="detSave">Guardar cambios</button>
        <button type="button" class="toggle-manual" id="detCancel">cancelar</button>
      </form>
    `);

    $('detFecha').value = exp.fecha;
    $('detConcepto').value = exp.concepto || '';
    $('detMonto').value = exp.monto;
    $('detCategoria').value = exp.categoria || '';
    PayFields.wire('det', { newCard: true });
    PayFields.set('det', exp);

    const cat = $('detCategoria');
    const showCats = () => PayFields.renderSuggestions('detCatSug', Categories.suggestCategorias(cat.value), (v) => { cat.value = v; });
    cat.addEventListener('input', showCats);
    cat.addEventListener('focus', showCats);

    $('detBack').onclick = requestClose;
    $('detCancel').onclick = requestClose;
    if (exp.hasFoto) $('detFoto').onclick = () => openTicketPhoto(exp.id);

    $('detForm').onsubmit = async (e) => {
      e.preventDefault();
      const err = (m) => { $('detStatus').textContent = m; };
      try {
        const monto = parseFloat($('detMonto').value);
        if (!$('detMonto').value || isNaN(monto) || monto <= 0) { err('Ingresa un monto válido.'); return; }
        const fecha = $('detFecha').value;
        if (!Dates.isValidDate(fecha)) { err('Elige una fecha válida.'); return; }
        const pay = PayFields.get('det');
        if (pay.medioPago === 'tarjeta_credito' && !pay.tarjetaId) { err('Elige con qué tarjeta se pagó (o agrega una nueva).'); return; }

        const categoria = cat.value.trim() || 'Otros';
        const categoriaCambio = categoria.toLowerCase() !== originalCat.toLowerCase();
        exp.fecha = fecha;
        exp.concepto = $('detConcepto').value.trim() || 'Gasto sin descripción';
        exp.monto = monto;
        exp.categoria = categoria;
        if (categoriaCambio || !exp.grupo) exp.grupo = Categories.quickGroup(categoria) || 'Otros';
        exp.medioPago = pay.medioPago;
        exp.banco = pay.banco;
        exp.tarjetaId = pay.tarjetaId;
        if (pay.banco) await Banks.registerBank(pay.banco);
        await DB.Store.put('expenses', exp);

        // Categoría nueva que la app aún no conoce: se clasifica en segundo plano.
        if (categoriaCambio && !Categories.quickGroup(categoria)) {
          AI.inferGroup(categoria).then(async (g) => {
            if (g && g !== exp.grupo) { exp.grupo = g; await DB.Store.put('expenses', exp); Bus.emit('data-changed'); }
          }).catch(() => {});
        }

        toast(Dates.monthOf(fecha) !== App.currentMonth
          ? `Guardado ✓ — ahora aparece en ${Dates.monthLabel(Dates.monthOf(fecha))}`
          : 'Cambios guardados ✓');
        requestClose();
      } catch (ex) {
        err('Error al guardar: ' + (ex && ex.message ? ex.message : ex));
      }
    };
  }

  // ---------- Ingreso ----------
  function openIngreso(id) {
    const inc = App.incomes.find((x) => x.id === id);
    if (!inc) return;
    showView(`
      ${head('Detalle del ingreso')}
      <form class="detail-form" id="detForm">
        <div class="field"><label>Fecha</label><input type="date" id="detFecha"></div>
        <div class="field"><label>Concepto</label><input type="text" id="detConcepto"></div>
        ${PayFields.html('det', { soloBanco: true })}
        <div class="field"><label>Monto</label><input type="number" step="0.01" id="detMonto" inputmode="decimal"></div>
        ${inc.recurrenteId ? '<div class="hint">🔁 Ingreso fijo: los cambios aplican solo a este mes; lo que se repite cada mes no cambia.</div>' : ''}
        <div class="status err" id="detStatus"></div>
        <button type="submit" class="save-btn green" id="detSave">Guardar cambios</button>
        <button type="button" class="toggle-manual" id="detCancel">cancelar</button>
      </form>
    `);

    $('detFecha').value = inc.fecha;
    $('detConcepto').value = inc.concepto || '';
    $('detMonto').value = inc.monto;
    PayFields.wire('det', { soloBanco: true });
    PayFields.set('det', { banco: inc.banco }, { soloBanco: true });

    $('detBack').onclick = requestClose;
    $('detCancel').onclick = requestClose;

    $('detForm').onsubmit = async (e) => {
      e.preventDefault();
      const err = (m) => { $('detStatus').textContent = m; };
      try {
        const monto = parseFloat($('detMonto').value);
        if (!$('detMonto').value || isNaN(monto) || monto <= 0) { err('Ingresa un monto válido.'); return; }
        const fecha = $('detFecha').value;
        if (!Dates.isValidDate(fecha)) { err('Elige una fecha válida.'); return; }
        const pay = PayFields.get('det', { soloBanco: true });

        inc.fecha = fecha;
        inc.concepto = $('detConcepto').value.trim() || 'Ingreso';
        inc.monto = monto;
        inc.banco = pay.banco;
        if (pay.banco) await Banks.registerBank(pay.banco);
        await DB.Store.put('incomes', inc);

        toast(Dates.monthOf(fecha) !== App.currentMonth
          ? `Guardado ✓ — ahora aparece en ${Dates.monthLabel(Dates.monthOf(fecha))}`
          : 'Cambios guardados ✓');
        requestClose();
      } catch (ex) {
        err('Error al guardar: ' + (ex && ex.message ? ex.message : ex));
      }
    };
  }

  function open(tipo, id) {
    if (isOpen) return;
    if (tipo === 'ingreso') openIngreso(id); else openGasto(id);
  }

  window.Detalle = { open };
})();
