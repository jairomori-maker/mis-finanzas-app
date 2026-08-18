// api/leer-ticket.js — lee la foto de un ticket (dataURL) con visión de Claude y
// extrae monto, comercio, categoría sugerida y fecha.

const { callClaude, extractJSON, sendJSON } = require('./_claude');

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Método no permitido' });
  try {
    const { imagen } = req.body || {};
    const parsed = parseDataUrl(imagen);
    if (!parsed) return sendJSON(res, 400, { error: 'Falta "imagen" en formato dataURL válido' });

    const hoy = new Date().toISOString().slice(0, 10);
    const text = await callClaude({
      maxTokens: 400,
      system: 'Extraes datos de fotos de tickets/recibos de compra para una app de finanzas personales en México. Respondes ÚNICAMENTE JSON válido, sin texto adicional ni markdown.',
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: parsed.mediaType, data: parsed.base64 } },
          {
            type: 'text',
            text: `Lee este ticket/recibo de compra. Devuelve exactamente este JSON (usa null si un dato no es legible):\n{"monto": <número total pagado, sin símbolo de moneda>, "comercio": "<nombre del comercio o concepto corto>", "categoria": "<categoría ESPECÍFICA de gasto en 1-3 palabras, en español, p. ej. Súper/Despensa, Gasolina, Comidas fuera, Streaming, Ropa>", "fecha": "<fecha en formato YYYY-MM-DD si aparece en el ticket, si no null>"}\nIMPORTANTE: "categoria" debe ser específica, NUNCA el nombre de un grupo amplio como "Transporte", "Alimentación" o "Servicios".\nSi no hay fecha visible, usa null (no inventes). Hoy es ${hoy} solo como referencia de contexto, no la uses como fecha del ticket a menos que coincida con lo impreso.`,
          },
        ],
      }],
    });

    const data = extractJSON(text);
    sendJSON(res, 200, {
      monto: typeof data.monto === 'number' ? data.monto : (parseFloat(data.monto) || null),
      comercio: data.comercio || null,
      categoria: data.categoria || null,
      fecha: data.fecha || null,
    });
  } catch (err) {
    sendJSON(res, err.status || 500, { error: err.message || String(err) });
  }
};
