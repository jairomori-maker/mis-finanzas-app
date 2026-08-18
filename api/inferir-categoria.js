// api/inferir-categoria.js — infiere a qué grupo (nivel 1) pertenece una categoría
// específica nueva que el usuario escribió y que no está en la base fija.

const { callClaude, extractJSON, sendJSON } = require('./_claude');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Método no permitido' });
  try {
    const { categoria, grupos } = req.body || {};
    if (!categoria) return sendJSON(res, 400, { error: 'Falta "categoria"' });
    const listaGrupos = Array.isArray(grupos) && grupos.length ? grupos : [
      'Vivienda', 'Servicios', 'Alimentación', 'Transporte', 'Salud y cuidado personal',
      'Familia', 'Ocio y viajes', 'Suscripciones', 'Ropa', 'Seguros',
      'Finanzas y créditos', 'Impuestos', 'Trabajo/Negocio', 'Otros',
    ];
    const text = await callClaude({
      maxTokens: 100,
      system: 'Clasificas categorías de gastos personales en un grupo fijo. Respondes ÚNICAMENTE JSON válido, sin texto adicional.',
      messages: [{
        role: 'user',
        content: `Categoría de gasto: "${categoria}".\n¿A cuál de estos grupos pertenece? ${listaGrupos.join(', ')}.\nResponde exactamente: {"grupo": "<uno de la lista>"}`,
      }],
    });
    let grupo = 'Otros';
    try {
      const parsed = extractJSON(text);
      if (parsed.grupo && listaGrupos.includes(parsed.grupo)) grupo = parsed.grupo;
    } catch (e) {
      const match = listaGrupos.find((g) => text.toLowerCase().includes(g.toLowerCase()));
      if (match) grupo = match;
    }
    sendJSON(res, 200, { grupo });
  } catch (err) {
    sendJSON(res, err.status || 500, { error: err.message || String(err) });
  }
};
