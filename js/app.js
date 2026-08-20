// app.js — arranque de la aplicación.

window.addEventListener('error', (ev) => {
  console.error('Error global:', ev.error || ev.message);
});
window.addEventListener('unhandledrejection', (ev) => {
  console.error('Promesa rechazada sin capturar:', ev.reason);
});

document.getElementById('topbarSub').textContent = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

// ---- Banner "instalar app" (Android/Chrome) ----
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('installBanner').classList.add('show');
});
document.getElementById('installBanner').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById('installBanner').classList.remove('show');
});
window.addEventListener('appinstalled', () => {
  document.getElementById('installBanner').classList.remove('show');
});

// ---- Service worker (funcionamiento offline) ----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.error('No se pudo registrar el service worker', e));
  });
}

// ---- Arranque ----
(async function boot() {
  try {
    await loadAll();
  } catch (e) {
    console.error('Error cargando datos locales', e);
  }
  initRouter();
})();
