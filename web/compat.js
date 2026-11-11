/* Compatibility layer for older browsers (floor: Safari 13.1 / iOS 13.4, Chrome 80, Samsung Internet 13, Firefox 75).
   Loads first and is written in plain ES5 so the file itself runs everywhere. Each part does nothing where the
   browser already has the feature.
   1. Element.replaceChildren   Safari 14 and Chrome 86 added it.
   2. :focus-visible            detected here; the CSS keeps a :focus copy under html.no-fv.
   3. :has()                    the CSS reads data-h flags that this file sets (Safari 15.4 and Chrome 105 added :has).
   4. flex gap                  Safari 14.5 and Chrome 84 added it; older browsers get margins between items. */
(function () {
  'use strict';
  var de = document.documentElement;

  // 1. replaceChildren
  if (typeof Element !== 'undefined' && !Element.prototype.replaceChildren) {
    Element.prototype.replaceChildren = function () {
      while (this.firstChild) this.removeChild(this.firstChild);
      this.append.apply(this, arguments);
    };
  }
  if (typeof DocumentFragment !== 'undefined' && !DocumentFragment.prototype.replaceChildren) {
    DocumentFragment.prototype.replaceChildren = Element.prototype.replaceChildren;
  }

  // 2. :focus-visible
  try { document.querySelector(':focus-visible'); } catch (e) { de.classList.add('no-fv'); }

  // 3. :has() flags. Each row: flag name, the element that would be the :has() subject, and the :has() argument.
  //    The CSS reads [data-h~="flag"]; keep this table in step with the flags in web/*.css.
  var HAS = [
    ['kb', '.app', 'textarea:focus'],
    ['empty', '.composer', 'textarea:placeholder-shown'],
    ['recC', '.composer', '#rec:not([hidden])'],
    ['recW', '.composer-wrap', '#rec:not([hidden])'],
    ['dict', '.composer .rec', '#dictLang:not([hidden])'],
    ['hello', '.app', '.hello'],
    ['cardA', '.msg.botrow .bot', '.err,.sheet,.pack,.g-card,.vault'],
    ['cardB', '.msg.botrow .bot', '.sheet,.pack,.g-card,.vault,.err,.tkt,.cost'],
    ['att', '.msg.me .bubble-me', ':scope > .me-att'],
    ['on', '.rm-sw', 'input:checked'],
    ['svg', '.btn', ':scope > svg'],
    ['seg', '.row-i', '.seg']
  ];
  var flagPending = false;
  function syncFlags() {
    flagPending = false;
    var found = [];   // [element, [flag, ...]] pairs
    for (var r = 0; r < HAS.length; r++) {
      var scoped = document.querySelectorAll(HAS[r][1]);
      for (var i = 0; i < scoped.length; i++) {
        if (!scoped[i].querySelector(HAS[r][2])) continue;
        var hit = null;
        for (var f = 0; f < found.length; f++) if (found[f][0] === scoped[i]) hit = found[f];
        if (!hit) { hit = [scoped[i], []]; found.push(hit); }
        hit[1].push(HAS[r][0]);
      }
    }
    var stale = document.querySelectorAll('[data-h]');
    for (var s = 0; s < stale.length; s++) {
      var keep = false;
      for (var k = 0; k < found.length; k++) if (found[k][0] === stale[s]) keep = true;
      if (!keep) stale[s].removeAttribute('data-h');
    }
    for (var h = 0; h < found.length; h++) {
      var value = found[h][1].join(' ');
      if (found[h][0].getAttribute('data-h') !== value) found[h][0].setAttribute('data-h', value);
    }
  }
  function scheduleFlags() {
    if (flagPending) return;
    flagPending = true;
    if (window.requestAnimationFrame) window.requestAnimationFrame(syncFlags);
    else setTimeout(syncFlags, 16);
  }
  function wireFlags() {
    var events = ['input', 'change', 'focusin', 'focusout', 'click', 'keyup'];
    for (var e = 0; e < events.length; e++) document.addEventListener(events[e], scheduleFlags, true);
    if (window.MutationObserver) {
      new MutationObserver(function (muts) {
        for (var m = 0; m < muts.length; m++) if (muts[m].attributeName !== 'data-h') { scheduleFlags(); return; }
      }).observe(document.documentElement, {
        subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'data-tab']
      });
    }
    // Catches value changes made by code (no event fires for them).
    setInterval(syncFlags, 1000);
    syncFlags();
  }

  // 4. flex gap fallback
  // The CSP is style-src 'self', so a <style> element made here would be blocked. The rules go into the
  // first same-origin stylesheet instead: CSSOM insertRule is not blocked. They are inserted at the top of
  // that sheet, so every later rule still wins a tie, as it did when they sat first in the head.
  var fgSheet = null;
  var fgMade = {};
  function fgSheetOf() {
    if (fgSheet) return fgSheet;
    for (var i = 0; i < document.styleSheets.length; i++) {
      try { document.styleSheets[i].cssRules; fgSheet = document.styleSheets[i]; return fgSheet; } catch (e) { /* not readable: try the next */ }
    }
    return null;
  }
  // A gap ignores children that are display:none or out of flow (absolute or fixed), and so must the margin.
  // A selector cannot see those states, so JavaScript sets a margin class on the children that need one and keeps
  // it current. The first in-flow child gets none; each later one gets the margin of the container's gap.
  function fgMarginClass(vertical, px, reverse) {
    var cls = 'fg-m-' + (vertical ? 'v' : 'h') + String(px).replace('.', '_') + (reverse ? 'r' : '');
    if (fgMade[cls]) return cls;
    var sheet = fgSheetOf();
    if (!sheet) return null;   // no stylesheet is readable yet; the load pass retries
    var prop = vertical ? 'margin-top' : (reverse ? 'margin-right' : 'margin-left');
    try {
      sheet.insertRule('html.no-flexgap .' + cls + ' { ' + prop + ': ' + px + 'px; }', 0);
    } catch (e) { return null; }
    fgMade[cls] = true;
    return cls;
  }
  function fgInFlow(el) {
    var cs = window.getComputedStyle(el);
    return cs.display !== 'none' && cs.position !== 'absolute' && cs.position !== 'fixed';
  }
  // Brings one container's children up to date. Classes are written only when they change.
  function fgFixContainer(el) {
    if (!el || el.nodeType !== 1) return;
    var cs = window.getComputedStyle(el);
    var flex = cs.display === 'flex' || cs.display === 'inline-flex';
    var dir = cs.flexDirection || 'row';
    var vertical = dir.indexOf('column') === 0;
    var gap = parseFloat(vertical ? cs.rowGap : cs.columnGap) || 0;
    // A wrapping row gets no fallback: its gap between lines would need each line's start found by layout, and
    // margins move the line breaks, so the pass can oscillate. Its items simply have no gap on old engines.
    var wraps = cs.flexWrap && cs.flexWrap !== 'nowrap';
    var want = (flex && gap && !wraps) ? fgMarginClass(vertical, gap, dir === 'row-reverse') : null;
    var seen = false;
    for (var k = 0; k < el.children.length; k++) {
      var kid = el.children[k];
      var target = null;
      if (want && fgInFlow(kid)) {
        if (seen) target = want;
        seen = true;
      }
      var tokens = (kid.getAttribute('class') || '').split(/\s+/);
      var kept = [];
      var changed = false;
      for (var t = 0; t < tokens.length; t++) {
        if (!tokens[t]) continue;
        if (tokens[t].indexOf('fg-m-') === 0 && tokens[t] !== target) { changed = true; continue; }
        kept.push(tokens[t]);
      }
      if (target && kept.indexOf(target) < 0) { kept.push(target); changed = true; }
      if (changed) kid.setAttribute('class', kept.join(' '));
    }
  }
  function fgSweep(root) {
    if (!root || root.nodeType !== 1) return;
    fgFixContainer(root);
    var all = root.getElementsByTagName('*');
    for (var i = 0; i < all.length; i++) fgFixContainer(all[i]);
  }
  function flexGapWorks() {
    var box = document.createElement('div');
    var a = document.createElement('i');
    var b = document.createElement('i');
    box.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;display:flex;gap:10px;width:200px';
    a.style.cssText = 'display:block;width:10px;height:1px';
    b.style.cssText = 'display:block;width:10px;height:1px';
    box.appendChild(a);
    box.appendChild(b);
    document.body.appendChild(box);
    var gap = b.getBoundingClientRect().left - a.getBoundingClientRect().right;
    document.body.removeChild(box);
    return Math.abs(gap - 10) < 0.5;
  }

  function boot() {
    wireFlags();
    if (flexGapWorks()) return;
    de.classList.add('no-flexgap');
    fgSweep(document.body);
    // Stylesheets can attach after this script runs, and a resize can change wrapping, so run passes on load and resize too.
    window.addEventListener('load', function () { fgSweep(document.body); });
    var queue = [];
    var timer = null;
    function queueWork(kind, node) {
      for (var q = 0; q < queue.length; q++) if (queue[q].kind === kind && queue[q].node === node) return;
      queue.push({ kind: kind, node: node });
      clearTimeout(timer);
      timer = setTimeout(flushWork, 120);
    }
    function flushWork() {
      var batch = queue;
      queue = [];
      timer = null;
      for (var b = 0; b < batch.length; b++) {
        if (batch[b].kind === 'tree') fgSweep(batch[b].node);
        else { fgFixContainer(batch[b].node); fgFixContainer(batch[b].node.parentElement); }
      }
    }
    if (window.MutationObserver) {
      new MutationObserver(function (muts) {
        for (var m = 0; m < muts.length; m++) {
          var mu = muts[m];
          if (mu.type === 'childList') {
            queueWork('node', mu.target);
            for (var n = 0; n < mu.addedNodes.length; n++) {
              if (mu.addedNodes[n].nodeType === 1) queueWork('tree', mu.addedNodes[n]);
            }
          } else {
            queueWork('node', mu.target);
          }
        }
      }).observe(document.body, { childList: true, subtree: true, attributes: true });
    }
    window.addEventListener('resize', function () { queueWork('tree', document.body); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
