# Mis Finanzas

App de finanzas personales — PWA local (sin backend de base de datos) con captura de gastos e ingresos por voz, foto de ticket o manual, reportes mensuales por categoría, gastos fijos/MSI y conciliación bancaria.

## Desarrollo local

```bash
npm install -g vercel
vercel dev
```

Configura la variable de entorno `ANTHROPIC_API_KEY` (tu propia API key de Anthropic) antes de correr `vercel dev` o en el dashboard de Vercel para producción — nunca se expone al navegador, solo la usan las funciones serverless en `api/`.

## Despliegue

Conectado a este repositorio de GitHub — cada push a `main` dispara un despliegue automático en Vercel.

## Estructura

- `index.html`, `css/`, `js/` — la app (PWA vanilla, sin build step).
- `api/` — funciones serverless que llaman a la API de Claude (leer ticket, parsear dictado, inferir categoría).
- `manifest.json`, `sw.js` — PWA instalable con soporte offline.

## Datos

Todos los datos (gastos, ingresos, fotos de tickets) se guardan localmente en el dispositivo del usuario (IndexedDB). No hay cuenta ni base de datos remota.
