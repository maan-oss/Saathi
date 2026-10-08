// Runs before the first paint, so the app never flashes the old Classic look. Same rules as applyTheme and skyPhase in app.js:
// the saved light/dark choice wins, otherwise the phone's dark mode, and the sky follows the time of day.
(function () {
  var root = document.documentElement;
  try {
    var t = localStorage.getItem('saathi.theme');
    if (t === 'light' || t === 'dark') root.dataset.theme = t;
    var h = new Date().getHours();
    var dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.sky = dark || (t !== 'light' && (h >= 20 || h < 5)) ? 'night' : h < 8 ? 'dawn' : h < 17 ? 'day' : 'sunset';
  } catch (e) { root.dataset.sky = 'day'; }
})();
