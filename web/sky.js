// Runs before the first paint, so the app never flashes the old Classic look. Same rule as applyTheme and skyPhase in app.js:
// one default look, the dusk sky (blue to orange), whatever the phone's dark mode or the time of day.
// Only an explicit Dark choice in Settings gives the night sky.
(function () {
  var root = document.documentElement;
  try {
    var t = localStorage.getItem('saathi.theme');
    if (t === 'light' || t === 'dark') root.dataset.theme = t;
    root.dataset.sky = t === 'dark' ? 'night' : 'sunset';
  } catch (e) { root.dataset.sky = 'sunset'; }
  // If the app script never runs (a failed download), show the page anyway after 8 s rather than a blank sky.
  setTimeout(function () { var a = document.getElementById('app'); if (a && !a.dataset.hk) a.dataset.hk = 'fallback'; }, 8000);
})();
