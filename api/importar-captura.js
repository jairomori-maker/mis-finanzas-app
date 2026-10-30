// api/importar-captura.js — lee una captura de pantalla (dataURL) que puede traer
// varios gastos a la vez (p. ej. historial de viajes de Uber/Didi, historial de
// pedidos, un estado de cuenta) y regresa la lista de renglones detectados.
//
// A propósito NO se le pide a la visión que adivine la categoría de cada renglón:
// eso se resuelve del lado del cliente (local primero, y solo se llama a
// /api/inferir-categoria en modo lote para las categorías genuinamente nuevas),
// para mantener esta llamada barata y consistente con el resto de la app.

const { callClaude, extractJSON, sendJSON } = require('./_claude');

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Método no permitido' });
  try {
    const { imagen, tipo } = req.body || {};
    const esIngreso = tipo === 'ingreso';
    const parsed = parseDataUrl(imagen);
    if (!parsed) return sendJSON(res, 400, { error: 'Falta "imagen" en formato dataURL válido' });

    const hoy = new Date().toISOString().slice(0, 10);
    const text = await callClaude({
      maxTokens: 2000,
      system: esIngreso
        ? 'Extraes listas de ingresos (depósitos, abonos, nómina, transferencias recibidas, ventas) de capturas de pantalla o estados de cuenta para una app de finanzas personales en México. Respondes ÚNICAMENTE JSON válido, sin texto adicional ni markdown.'
        : 'Extraes listas de gastos de capturas de pantalla (p. ej. historial de viajes de Uber/Didi, historial de pedidos, estados de cuenta) para una app de finanzas personales en México. Respondes ÚNICAMENTE JSON válido, sin texto adicional ni markdown.',
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: parsed.mediaType, data: parsed.base64 } },
          {
            type: 'text',
            text: esIngreso
              ? `Esta imagen es una captura de pantalla que puede contener uno o varios INGRESOS (depósitos, abonos, nómina, transferencias recibidas). Extrae CADA ingreso que aparezca por separado e ignora los cargos o gastos. Por compatibilidad la lista se llama "gastos" aunque aquí contenga ingresos. Devuelve exactamente este JSON:\n{"gastos": [{"monto": <número recibido, sin símbolo de moneda>, "fecha": "<YYYY-MM-DD si aparece o se puede inferir, si no null>", "concepto": "<descripción corta, p. ej. quién o qué lo originó>"}]}\nSi una fecha solo trae día y mes (sin año), infiere el año usando ${hoy} como referencia de hoy (asume el año más reciente que tenga sentido, sin pasarte de hoy salvo que el mes/día ya haya ocurrido este año). Si el monto o la fecha de un renglón no son legibles, omite ese renglón por completo (no inventes datos). Si no se detecta ningún ingreso, regresa {"gastos": []}.`
              : `Esta imagen es una captura de pantalla que puede contener uno o varios gastos (p. ej. una lista de viajes, pedidos o transacciones). Extrae CADA gasto que aparezca por separado. Devuelve exactamente este JSON:\n{"gastos": [{"monto": <número pagado, sin símbolo de moneda>, "fecha": "<YYYY-MM-DD si aparece o se puede inferir, si no null>", "concepto": "<descripción corta, p. ej. nombre del comercio, viaje o destino>"}]}\nSi solo hay un gasto, regresa un arreglo con un solo elemento. Si una fecha solo trae día y mes (sin año), infiere el año usando ${hoy} como referencia de hoy (asume el año más reciente que tenga sentido, sin pasarte de hoy salvo que el mes/día ya haya ocurrido este año). Si el monto o la fecha de un renglón no son legibles, omite ese renglón por completo (no inventes datos). Si no se detecta ningún gasto, regresa {"gastos": []}.`,
          },
        ],
      }],
    });

    const data = extractJSON(text);
    const gastos = (Array.isArray(data.gastos) ? data.gastos : [])
      .map((g) => ({
        monto: typeof g.monto === 'number' ? g.monto : (parseFloat(g.monto) || null),
        fecha: g.fecha || null,
        concepto: g.concepto || null,
      }))
      .filter((g) => g.monto && g.monto > 0 && g.concepto);

    sendJSON(res, 200, { gastos });
  } catch (err) {
    sendJSON(res, err.status || 500, { error: err.message || String(err) });
  }
};
