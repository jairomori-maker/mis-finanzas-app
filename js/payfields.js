// payfields.js — bloque reutilizable "medio de pago + banco / tarjeta" para las pantallas
// nuevas (detalle de gasto/ingreso, importación de capturas). Cada instancia usa un
// prefijo `p` para que los ids no choquen entre sí. El formulario manual de Inicio
// conserva su propio bloque (no se toca para no arriesgar regresiones).

(function () {
  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Caja de sugerencias (autocompletado) genérica.
  function renderSuggestions(containerId, list, onPick) {
    const box = $(containerId);
    if (!box) return;
    if (!list.length) { box.classList.remove('open'); box.innerHTML = ''; return; }
    box.innerHTML = list.map((c) => `<div data-val="${esc(c)}">${esc(c)}</div>`).join('');
    box.classList.add('open');
    box.querySelectorAll('div').forEach((d) => {
      d.onclick = () => { onPick(d.dataset.val); box.classList.remove('open'); };
    });
  }

  let outsideHandlerSet = false;
  function ensureOutsideHandler() {
    if (outsideHandlerSet) return;
    outsideHandlerSet = true;
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.field') && !e.target.closest('.subfield')) {
        document.querySelectorAll('.suggestions.open').forEach((el) => el.classList.remove('open'));
      }
    });
  }

  // opts.soloBanco: solo el campo de banco (ingresos). opts.newCard: permite crear una
  // tarjeta nueva en el momento.
  function html(p, opts) {
    opts = opts || {};
    const medio = opts.soloBanco ? '' : `
      <div class="field"><label>Medio de pago</label>
        <select id="${p}MedioPago">
          <option value="banco">Banco (débito/transferencia)</option>
          <option value="tarjeta_credito">Tarjeta de crédito</option>
          <option value="efectivo">Efectivo</option>
        </select>
      </div>`;
    const banco = `
      <div class="field" id="${p}BancoField">
        <label>Banco <span style="text-transform:none;letter-spacing:0;">(opcional, para conciliar)</span></label>
        <input type="text" id="${p}Banco" autocomplete="off" placeholder="p. ej. BBVA, Santander…">
        <div class="suggestions" id="${p}BancoSug"></div>
      </div>`;
    const nueva = opts.newCard ? `
          <button type="button" class="toggle-manual" id="${p}NuevaBtn" style="text-align:left; padding-left:0;">+ agregar una tarjeta nueva →</button>
          <div id="${p}NuevaBox" style="display:none;" class="inline-add-form">
            <input type="text" id="${p}NuevaNombre" placeholder="Nombre de la tarjeta (ej. Principal)">
            <div class="subfield">
              <input type="text" id="${p}NuevaBanco" autocomplete="off" placeholder="¿De qué banco se paga?">
              <div class="suggestions" id="${p}NuevaBancoSug"></div>
            </div>
            <input type="number" id="${p}NuevaDia" min="1" max="31" placeholder="Día de corte (opcional, ej. 20)">
            <button type="button" class="save-btn" id="${p}NuevaGuardar" style="padding:8px;">Guardar tarjeta</button>
          </div>` : '';
    const tarjeta = opts.soloBanco ? '' : `
      <div class="field" id="${p}TarjetaField" style="display:none;">
        <label>Tarjeta de crédito</label>
        <select id="${p}Tarjeta"></select>${nueva}
      </div>`;
    return medio + banco + tarjeta;
  }

  function populateTarjetas(p, selectedId) {
    const sel = $(p + 'Tarjeta');
    if (!sel) return;
    if (!App.tarjetas.length) {
      sel.innerHTML = '<option value="">— agrega una tarjeta primero —</option>';
      return;
    }
    sel.innerHTML = '<option value="">— elige una tarjeta —</option>' +
      App.tarjetas.map((t) => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('');
    sel.value = selectedId ? String(selectedId) : '';
  }

  function toggle(p, opts) {
    if (opts && opts.soloBanco) { $(p + 'BancoField').style.display = 'flex'; return; }
    const medio = $(p + 'MedioPago').value;
    $(p + 'BancoField').style.display = medio === 'banco' ? 'flex' : 'none';
    $(p + 'TarjetaField').style.display = medio === 'tarjeta_credito' ? 'flex' : 'none';
  }

  function get(p, opts) {
    const bancoVal = ($(p + 'Banco').value || '').trim() || null;
    if (opts && opts.soloBanco) return { medioPago: null, banco: bancoVal, tarjetaId: null };
    const medioPago = $(p + 'MedioPago').value;
    return {
      medioPago,
      banco: medioPago === 'banco' ? bancoVal : null,
      tarjetaId: medioPago === 'tarjeta_credito' ? (parseFloat($(p + 'Tarjeta').value) || null) : null,
    };
  }

  // Asigna valores sin disparar onChange.
  function set(p, val, opts) {
    val = val || {};
    $(p + 'Banco').value = val.banco || '';
    if (!(opts && opts.soloBanco)) {
      $(p + 'MedioPago').value = val.medioPago === 'tarjeta_credito' ? 'tarjeta_credito' : (val.medioPago === 'efectivo' ? 'efectivo' : 'banco');
      populateTarjetas(p, val.tarjetaId);
    }
    toggle(p, opts);
  }

  function wire(p, opts) {
    opts = opts || {};
    ensureOutsideHandler();
    const fire = () => { if (opts.onChange) opts.onChange(get(p, opts)); };
    const banco = $(p + 'Banco');
    const showBancos = () => renderSuggestions(p + 'BancoSug', Banks.suggestBanks(banco.value), (v) => { banco.value = v; fire(); });
    banco.addEventListener('input', () => { showBancos(); fire(); });
    banco.addEventListener('focus', showBancos);

    if (!opts.soloBanco) {
      $(p + 'MedioPago').addEventListener('change', () => { toggle(p, opts); fire(); });
      $(p + 'Tarjeta').addEventListener('change', fire);
      populateTarjetas(p);
      if (opts.newCard) {
        $(p + 'NuevaBtn').onclick = () => {
          const box = $(p + 'NuevaBox');
          box.style.display = box.style.display === 'none' ? 'flex' : 'none';
        };
        const nb = $(p + 'NuevaBanco');
        nb.addEventListener('input', () => renderSuggestions(p + 'NuevaBancoSug', Banks.suggestBanks(nb.value), (v) => { nb.value = v; }));
        $(p + 'NuevaGuardar').onclick = async () => {
          const nombre = $(p + 'NuevaNombre').value.trim();
          if (!nombre) { $(p + 'NuevaNombre').focus(); return; }
          const t = await Tarjetas.addTarjeta(nombre, nb.value.trim(), $(p + 'NuevaDia').value);
          $(p + 'NuevaNombre').value = ''; nb.value = ''; $(p + 'NuevaDia').value = '';
          $(p + 'NuevaBox').style.display = 'none';
          populateTarjetas(p, t.id);
          fire();
        };
      }
    }
    toggle(p, opts);
  }

  window.PayFields = { html, wire, get, set, populateTarjetas, renderSuggestions, esc };
})();
