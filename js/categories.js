// categories.js — categorías de dos niveles: Grupo (fijo) y Categoría específica (libre).

const GRUPOS_FIJOS = [
  'Vivienda', 'Servicios', 'Alimentación', 'Transporte', 'Salud y cuidado personal',
  'Familia', 'Ocio y viajes', 'Suscripciones', 'Ropa', 'Seguros',
  'Finanzas y créditos', 'Impuestos', 'Trabajo/Negocio', 'Otros',
];

// Base fija de categorías específicas -> grupo. El usuario puede escribir cualquier
// categoría nueva; si no está aquí (ni en las agregadas por el usuario), se infiere
// el grupo con IA (ver js/ai.js) y se guarda para la próxima vez.
const BASE_CATEGORIES = {
  'renta/hipoteca': 'Vivienda', 'mantenimiento del hogar': 'Vivienda', 'muebles y equipamiento': 'Vivienda',
  'luz': 'Servicios', 'agua': 'Servicios', 'gas': 'Servicios', 'internet': 'Servicios', 'limpieza': 'Servicios',
  'súper/despensa': 'Alimentación', 'super': 'Alimentación', 'despensa': 'Alimentación', 'comidas fuera': 'Alimentación', 'agua para beber': 'Alimentación',
  'gasolina': 'Transporte', 'transporte público': 'Transporte', 'mantenimiento de auto': 'Transporte',
  'consultas médicas': 'Salud y cuidado personal', 'gimnasio': 'Salud y cuidado personal', 'corte/estética': 'Salud y cuidado personal',
  'apoyo a padres': 'Familia', 'gastos de hijos': 'Familia', 'regalos y detalles': 'Familia',
  'salidas': 'Ocio y viajes', 'viajes': 'Ocio y viajes',
  'streaming': 'Suscripciones', 'membresías y software': 'Suscripciones',
  'ropa': 'Ropa',
  'seguro auto': 'Seguros', 'seguro vida': 'Seguros', 'seguro médico': 'Seguros',
  'créditos': 'Finanzas y créditos', 'msi': 'Finanzas y créditos', 'autofinanciamiento': 'Finanzas y créditos',
  'impuestos': 'Impuestos',
  'nómina/empleados': 'Trabajo/Negocio', 'gastos de negocio': 'Trabajo/Negocio',
};

// Comercios/palabras clave comunes -> categoría (resuelve al instante, sin red).
const MERCHANT_KEYWORDS = {
  'home depot': 'mantenimiento del hogar', 'office depot': 'mantenimiento del hogar',
  'walmart': 'súper/despensa', 'costco': 'súper/despensa', 'soriana': 'súper/despensa',
  'chedraui': 'súper/despensa', 'oxxo': 'súper/despensa', '7 eleven': 'súper/despensa',
  'uber eats': 'comidas fuera', 'rappi': 'comidas fuera', 'starbucks': 'comidas fuera',
  'mcdonalds': 'comidas fuera', 'restaurante': 'comidas fuera',
  'uber': 'transporte público', 'didi': 'transporte público', 'cabify': 'transporte público',
  'pemex': 'gasolina', 'gasolinera': 'gasolina',
  'cfe': 'luz', 'telmex': 'internet', 'totalplay': 'internet', 'izzi': 'internet', 'megacable': 'internet',
  'netflix': 'streaming', 'spotify': 'streaming', 'hbo': 'streaming', 'disney': 'streaming', 'amazon prime': 'streaming',
  'smart fit': 'gimnasio', 'sports world': 'gimnasio',
  'farmacia': 'consultas médicas', 'doctor': 'consultas médicas', 'hospital': 'consultas médicas',
};

function capitalize(s) {
  return (s || '').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Mapa de categorías personalizadas agregadas por el usuario (categoría -> grupo),
// cargado desde IndexedDB al arrancar la app y mantenido en memoria.
let customCategoryMap = {};

async function loadCustomCategories() {
  const rows = await DB.Store.getAll('categoryMap');
  customCategoryMap = {};
  rows.forEach((r) => { customCategoryMap[r.categoria] = r.grupo; });
}

async function saveCustomCategory(categoria, grupo) {
  const key = (categoria || '').trim().toLowerCase();
  if (!key || !grupo) return;
  customCategoryMap[key] = grupo;
  await DB.Store.put('categoryMap', { categoria: key, grupo });
}

function allCategoryLabels() {
  return [...new Set([...Object.keys(BASE_CATEGORIES), ...Object.keys(customCategoryMap)])];
}

// Resuelve el grupo de forma instantánea (sin red) contra la base fija + agregadas.
function quickGroup(categoria) {
  const key = (categoria || '').trim().toLowerCase();
  return BASE_CATEGORIES[key] || customCategoryMap[key] || null;
}

// Sugiere una categoría específica a partir del concepto (comercio o palabra clave).
function localGuessCategoria(concepto) {
  const key = (concepto || '').trim().toLowerCase();
  if (!key) return null;
  const merchant = Object.keys(MERCHANT_KEYWORDS).find((m) => key.includes(m));
  if (merchant) return capitalize(MERCHANT_KEYWORDS[merchant]);
  const labels = allCategoryLabels();
  const catMatch = labels.find((c) => key.includes(c) || c.includes(key));
  if (catMatch) return capitalize(catMatch);
  return null;
}

function suggestCategorias(query) {
  const key = (query || '').trim().toLowerCase();
  const labels = allCategoryLabels();
  if (!key) return labels.slice(0, 8).map(capitalize);
  return labels.filter((c) => c.includes(key)).slice(0, 8).map(capitalize);
}

window.Categories = {
  GRUPOS_FIJOS, BASE_CATEGORIES, MERCHANT_KEYWORDS,
  capitalize, loadCustomCategories, saveCustomCategory,
  quickGroup, localGuessCategoria, suggestCategorias, allCategoryLabels,
  getCustomMap: () => customCategoryMap,
};
