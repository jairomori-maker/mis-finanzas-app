// ai.js — llamadas al backend serverless (api/*.js) que a su vez llaman a la API de
// Claude. La app nunca guarda ni usa una API key en el navegador: eso vive únicamente
// del lado del servidor (ver README.md, sección "Configurar la API key").

// Infiere el grupo (nivel 1) para una categoría específica nueva que no está en la
// base fija ni en las agregadas por el usuario. Se ejecuta en segundo plano, sin
// bloquear el guardado del gasto (que mientras tanto queda en "Otros").
async function inferGroup(categoria) {
  const quick = Categories.quickGroup(categoria);
  if (quick) return quick;
  try {
    const res = await fetch('/api/inferir-categoria', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoria, grupos: Categories.GRUPOS_FIJOS }),
    });
    if (!res.ok) throw new Error('respuesta no OK');
    const data = await res.json();
    const grupo = Categories.GRUPOS_FIJOS.includes(data.grupo) ? data.grupo : 'Otros';
    await Categories.saveCustomCategory(categoria, grupo);
    return grupo;
  } catch (e) {
    console.error('No se pudo inferir el grupo con IA', e);
    return 'Otros';
  }
}

// Envía la foto de un ticket (dataURL) al backend, que usa visión de Claude para
// extraer monto, comercio/concepto, categoría sugerida y fecha (si es legible).
async function leerTicket(dataUrl) {
  const res = await fetch('/api/leer-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imagen: dataUrl }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('No se pudo leer el ticket: ' + (text || res.status));
  }
  return res.json(); // { monto, comercio, categoria, fecha }
}

// Envía el texto dictado por voz para que la IA extraiga monto, concepto,
// categoría sugerida y fecha (si se mencionó; si no, se asume hoy).
async function parsearDictado(texto, fechaHoy) {
  const res = await fetch('/api/parsear-dictado', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto, fechaHoy }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('No se pudo interpretar el dictado: ' + (text || res.status));
  }
  return res.json(); // { monto, concepto, categoria, fecha }
}

// Envía una captura de pantalla (dataURL) que puede contener varios gastos (p. ej.
// historial de viajes de Uber, historial de pedidos) y regresa un arreglo de
// renglones { monto, fecha, concepto }. La categoría/grupo de cada renglón se
// resuelve después, del lado del cliente (ver inicio.js), para no depender de que
// la visión adivine categorías específicas por renglón.
async function importarCaptura(dataUrl, tipo) {
  const res = await fetch('/api/importar-captura', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imagen: dataUrl, tipo: tipo === 'ingreso' ? 'ingreso' : 'gasto' }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('No se pudo leer la captura: ' + (text || res.status));
  }
  const data = await res.json();
  return Array.isArray(data.gastos) ? data.gastos : [];
}

// Clasifica en UNA sola llamada varias categorías específicas nuevas (no resueltas
// localmente) a su grupo fijo. Usado por la importación de capturas, para no hacer
// una llamada de IA por cada renglón detectado. Devuelve { categoria: grupo, ... }
// y además guarda cada resultado en el mapa local (categoryMap) para la próxima vez.
async function inferGroupsBatch(categorias) {
  const lista = [...new Set((categorias || []).filter(Boolean))];
  if (!lista.length) return {};
  try {
    const res = await fetch('/api/inferir-categoria', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categorias: lista, grupos: Categories.GRUPOS_FIJOS }),
    });
    if (!res.ok) throw new Error('respuesta no OK');
    const data = await res.json();
    const resultados = data.resultados || {};
    const mapa = {};
    for (const cat of lista) {
      const grupo = Categories.GRUPOS_FIJOS.includes(resultados[cat]) ? resultados[cat] : 'Otros';
      mapa[cat] = grupo;
      await Categories.saveCustomCategory(cat, grupo);
    }
    return mapa;
  } catch (e) {
    console.error('No se pudo inferir grupos en lote con IA', e);
    const mapa = {};
    lista.forEach((c) => { mapa[c] = 'Otros'; });
    return mapa;
  }
}

window.AI = { inferGroup, leerTicket, parsearDictado, importarCaptura, inferGroupsBatch };
