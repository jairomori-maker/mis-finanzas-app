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

window.AI = { inferGroup, leerTicket, parsearDictado };
