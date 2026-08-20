// api/parsear-dictado.js — interpreta el texto dictado por voz (ya transcrito por
// el navegador) y extrae monto, concepto, categoría y fecha.

const { callClaude, extractJSON, sendJSON } = require('./_claude');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Método no permitido' });
  try {
    const { texto, fechaHoy } = req.body || {};
    if (!texto) return sendJSON(res, 400, { error: 'Falta "texto"' });
    const hoy = /^\d{4}-\d{2}-\d{2}$/.test(fechaHoy || '') ? fechaHoy : new Date().toISOString().slice(0, 10);

    const text = await callClaude({
      maxTokens: 300,
      system: 'Interpretas dictados por voz de gastos personales en español (México) para una app de finanzas. Respondes ÚNICAMENTE JSON válido, sin texto adicional.',
      messages: [{
        role: 'user',
        content: `Hoy es ${hoy}. El usuario dictó: "${texto}"\nExtrae el gasto y devuelve exactamente este JSON:\n{"monto": <número, sin símbolo de moneda>, "concepto": "<en qué gastó, breve>", "categoria": "<categoría ESPECÍFICA en 1-3 palabras, en español, p. ej. Gasolina, Súper/Despensa, Comidas fuera, Streaming, Gimnasio, Renta/Hipoteca, Luz, Seguro auto>", "fecha": "<YYYY-MM-DD; si no mencionó fecha usa ${hoy}; si dijo 'ayer' u otra relativa, calcúlala respecto a hoy>"}\nIMPORTANTE: "categoria" debe ser específica (como las del ejemplo), NUNCA el nombre de un grupo amplio como "Transporte", "Alimentación" o "Servicios".`,
      }],
    });

    const data = extractJSON(text);
    sendJSON(res, 200, {
      monto: typeof data.monto === 'number' ? data.monto : (parseFloat(data.monto) || null),
      concepto: data.concepto || null,
      categoria: data.categoria || null,
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(data.fecha || '') ? data.fecha : hoy,
    });
  } catch (err) {
    sendJSON(res, err.status || 500, { error: err.message || String(err) });
  }
};
