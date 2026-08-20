// router.js — cambia entre las pantallas (tabs) sin recargar la página.

const SCREENS = {
  inicio: window.ScreenInicio,
  ingresos: window.ScreenIngresos,
  reporte: window.ScreenReporte,
  conciliacion: window.ScreenConciliacion,
  ajustes: window.ScreenAjustes,
};

let currentScreen = 'inicio';
let mounted = {};

function goToScreen(name) {
  if (!SCREENS[name]) return;
  currentScreen = name;
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  document.querySelectorAll('nav.bottom-nav button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.screen === name);
  });
  if (!mounted[name]) {
    SCREENS[name].mount(document.getElementById('screen-' + name));
    mounted[name] = true;
  } else if (SCREENS[name].render) {
    SCREENS[name].render();
  }
  window.scrollTo(0, 0);
}

function renderCurrentScreen() {
  if (mounted[currentScreen] && SCREENS[currentScreen].render) {
    SCREENS[currentScreen].render();
  } else if (!mounted[currentScreen]) {
    SCREENS[currentScreen].mount(document.getElementById('screen-' + currentScreen));
    mounted[currentScreen] = true;
  }
}

function initRouter() {
  document.querySelectorAll('nav.bottom-nav button').forEach((btn) => {
    btn.addEventListener('click', () => goToScreen(btn.dataset.screen));
  });
  goToScreen('inicio');
  Bus.on('data-changed', renderCurrentScreen);
}

window.initRouter = initRouter;
window.goToScreen = goToScreen;
