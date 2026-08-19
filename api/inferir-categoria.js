// api/inferir-categoria.js — infiere a qué grupo (nivel 1) pertenece una categoría
// específica nueva que el usuario escribió y que no está en la base fija.
//
// Soporta dos modos:
//  - Individual (body: {categoria}) — el flujo original, usado al capturar un gasto
//    con una categoría nueva.
//  - Lote (body: {categorias: [...]}) — clasifica varias categorías nuevas en UNA
//    sola llamada a Claude. Se usa al importar varios gastos de una captura de
//    pantalla, donde puede haber varias categorías nuevas de golpe.

const { callClaude, extractJSON, sendJSON } = require('./_claude');

const GRUPOS_DEFAULT = [
  'Vivienda', 'Servicios', 'Alimentación', 'Transporte', 'Salud y cuidado personal',
  'Familia', 'Ocio y viajes', 'Suscripciones', 'Ropa', 'Seguros',
  'Finanzas y créditos', 'Impuestos', 'Trabajo/Negocio', 'Otros',
];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Método no permitido' });
  try {
    const { categoria, categorias, grupos } = req.body || {};
    const listaGrupos = Array.isArray(grupos) && grupos.length ? grupos : GRUPOS_DEFAULT;

    if (Array.isArray(categorias) && categorias.length) {
      const lista = [...new Set(categorias.filter(Boolean))].slice(0, 40);
      if (!lista.length) return sendJSON(res, 400, { error: 'Falta "categorias"' });
      const text = await callClaude({
        maxTokens: 800,
        system: 'Clasificas categorías de gastos personales, cada una en un grupo fijo. Respondes ÚNICAMENTE JSON válido, sin texto adicional.',
        messages: [{
          role: 'user',
          content: `Categorías de gasto a clasificar: ${JSON.stringify(lista)}.\nGrupos posibles: ${listaGrupos.join(', ')}.\nResponde exactamente: {"resultados": {"<categoria>": "<uno de los grupos>", ...}} incluyendo TODAS las categorías de la lista, una por una.`,
        }],
      });
      let resultados = {};
      try {
        const parsed = extractJSON(text);
        if (parsed.resultados && typeof parsed.resultados === 'object') resultados = parsed.resultados;
      } catch (e) {
        // se resuelve abajo con el fallback "Otros" por categoría
      }
      const out = {};
      lista.forEach((cat) => { out[cat] = listaGrupos.includes(resultados[cat]) ? resultados[cat] : 'Otros'; });
      return sendJSON(res, 200, { resultados: out });
    }

    if (!categoria) return sendJSON(res, 400, { error: 'Falta "categoria" o "categorias"' });
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
