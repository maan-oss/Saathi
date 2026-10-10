// Anonymous counts for the service pages: one view, and each tap into the app. Same rules as the home page:
// no cookie, no id. The server keeps daily totals only and ignores bots. A failed send is silently dropped.
(function () {
  'use strict';
  function count(event) {
    try {
      var src = new URLSearchParams(location.search).get('utm_source') || '';
      fetch('/app/api/event', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-saathi': '1' },
        body: JSON.stringify({ event: event, source: src.slice(0, 40) }),
        keepalive: true
      }).catch(function () {});
    } catch (e) { /* counts are optional */ }
  }
  count('landing_view');
  var links = document.querySelectorAll('[data-app]');
  for (var i = 0; i < links.length; i++) links[i].addEventListener('click', function () { count('app_open'); });
})();
