// api/_claude.js — helper compartido para llamar a la API de Claude desde las
// funciones serverless. No usa dependencias externas (solo fetch nativo de Node).

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

async function callClaude({ system, messages, maxTokens = 500 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error('Falta configurar ANTHROPIC_API_KEY en las variables de entorno del hosting.');
    err.status = 500;
    throw err;
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Claude API respondió ${res.status}: ${text.slice(0, 300)}`);
    err.status = 502;
    throw err;
  }
  const data = await res.json();
  const text = (data.content || []).map((b) => b.text || '').join('').trim();
  return text;
}

// Extrae el primer bloque JSON de un texto (Claude a veces agrega texto alrededor
// aunque se le pida "solo JSON").
function extractJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No se encontró JSON en la respuesta: ' + text.slice(0, 200));
  return JSON.parse(match[0]);
}

function sendJSON(res, status, obj) {
  res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(obj));
}

module.exports = { callClaude, extractJSON, sendJSON, MODEL };
