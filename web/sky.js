// Picks the sky before the first paint, with the same colours the app uses: by the time of day, or dark when the phone is in dark mode.
(function () {
  try {
    var h = new Date().getHours(), dark = matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.sky = dark || h >= 20 || h < 5 ? 'night' : h < 8 ? 'dawn' : h < 17 ? 'day' : 'sunset';
  } catch (e) { document.documentElement.dataset.sky = 'day'; }
})();
