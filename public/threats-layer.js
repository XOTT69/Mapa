/* Шар «Шахеди (орієнтовно)» + нормальні підкладки карти. Потрібен глобальний Leaflet (L).
   Використання:  const t = ThreatsLayer.init(map);  // map — ваш L.map
   Дані: GET /api/threats кожні 20 с. Це орієнтовна візуалізація за текстами каналів, не радар. */
(function () {
  'use strict';
  var POLL_MS = 20000, TTL_MS = 40 * 60 * 1000;

  var css = '' +
    '.thr-mk{position:relative;width:34px;height:34px;pointer-events:auto}' +
    '.thr-mk svg{width:34px;height:34px;filter:drop-shadow(0 0 4px rgba(255,60,60,.8));transform:rotate(var(--rot,0deg))}' +
    '.thr-mk svg path{fill:#ff4d4d;stroke:#fff;stroke-width:1.2}' +
    '.thr-mk.low svg path{fill:#ff9a3c}' +
    '.thr-mk .pulse{position:absolute;inset:3px;border-radius:50%;border:2px solid rgba(255,77,77,.7);animation:thrp 1.8s ease-out infinite}' +
    '.thr-mk b{position:absolute;right:-8px;top:-8px;min-width:18px;height:18px;padding:0 4px;box-sizing:border-box;border-radius:9px;' +
    'background:#111;color:#fff;font:700 11px/18px system-ui,sans-serif;text-align:center;border:1px solid #ff4d4d}' +
    '@keyframes thrp{0%{transform:scale(.6);opacity:1}100%{transform:scale(1.6);opacity:0}}' +
    '.thr-line{animation:thrd 1.1s linear infinite}' +
    '@keyframes thrd{to{stroke-dashoffset:-22}}' +
    '.thr-chip{background:rgba(17,20,24,.88);color:#fff;padding:6px 10px;border-radius:10px;font:600 12px/1.3 system-ui,sans-serif;max-width:220px}' +
    '.thr-chip small{display:block;font-weight:400;opacity:.7}' +
    '.thr-pop a{color:#7fb7ff}';

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }

  function addBaseLayers(map) {
    var carto = function (style) {
      return L.tileLayer('https://{s}.basemaps.cartocdn.com/' + style + '/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd', maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
      });
    };
    var bases = {
      'Темна': carto('dark_all'),
      'Світла': carto('rastertiles/voyager'),
      'OpenStreetMap': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
      }),
      'Без підкладки': L.layerGroup()
    };
    bases['Темна'].addTo(map);
    return bases;
  }

  function trackIcon(t) {
    var rot = t.heading == null ? 0 : t.heading;
    var html = '<div class="thr-mk ' + (t.confidence === 'low' ? 'low' : '') + '" style="--rot:' + rot + 'deg">' +
      '<span class="pulse"></span>' +
      '<svg viewBox="0 0 24 24"><path d="M12 2 L20 21 L12 16.5 L4 21 Z"/></svg>' +
      (t.countKnown || t.count > 1 ? '<b>' + (t.countKnown ? t.count : '?') + '</b>' : '<b>?</b>') + '</div>';
    return L.divIcon({ html: html, className: '', iconSize: [34, 34], iconAnchor: [17, 17] });
  }

  function popup(t) {
    var box = el('div', { 'class': 'thr-pop' });
    var mins = Math.max(0, Math.round((Date.now() - t.ts) / 60000));
    box.appendChild(el('b', null, (t.countKnown ? t.count + ' ' : 'Невідома к-ть · ') + 'БпЛА'));
    var route = [t.origin && t.origin.name, t.at && t.at.name, t.target && t.target.name].filter(Boolean);
    box.appendChild(el('div', null, route.join(' → ')));
    box.appendChild(el('div', null, mins + ' хв тому · точність: ' + ({ high: 'вища', medium: 'середня', low: 'низька' }[t.confidence] || '—')));
    box.appendChild(el('div', { style: 'opacity:.8;margin-top:4px' }, t.text));
    if (/^https:\/\/t\.me\//.test(t.link || '')) {
      var a = el('a', { href: t.link, target: '_blank', rel: 'noopener noreferrer' }, 'Джерело: ' + t.source);
      box.appendChild(a);
    }
    return box;
  }

  function init(map, opts) {
    opts = opts || {};
    var style = el('style', null, css); document.head.appendChild(style);

    var bases = opts.baseLayers === false ? null : addBaseLayers(map);
    var group = L.layerGroup().addTo(map);
    if (bases) L.control.layers(bases, { 'Шахеди (орієнтовно)': group }, { position: 'topright', collapsed: true }).addTo(map);

    var chip = L.control({ position: 'bottomleft' });
    var chipBox;
    chip.onAdd = function () { chipBox = el('div', { 'class': 'thr-chip' }, 'Шахеди: завантаження…'); return chipBox; };
    chip.addTo(map);

    function render(data) {
      group.clearLayers();
      var now = Date.now(), total = 0, unknown = false, shown = 0;
      (data.tracks || []).forEach(function (t) {
        var age = now - t.ts;
        if (age > TTL_MS || !t.at) return;
        shown++;
        total += t.count; if (!t.countKnown) unknown = true;
        var fade = Math.max(0.35, 1 - (age / TTL_MS) * 0.65);
        var at = [t.at.lat, t.at.lon];
        if (t.origin && t.at && t.origin.name !== t.at.name) {
          L.polyline([[t.origin.lat, t.origin.lon], at], { color: '#ff4d4d', weight: 2, opacity: 0.25 * fade, interactive: false }).addTo(group);
        }
        if (t.target) {
          var tg = [t.target.lat, t.target.lon];
          L.polyline([at, tg], { color: '#ff4d4d', weight: 3, opacity: fade, dashArray: '8 14', className: 'thr-line', interactive: false }).addTo(group);
          L.circleMarker(tg, { radius: 6, color: '#ff4d4d', weight: 2, fill: false, opacity: fade, interactive: false }).addTo(group);
        }
        L.marker(at, { icon: trackIcon(t), opacity: fade, keyboard: false })
          .bindPopup(function () { return popup(t); }).addTo(group);
      });
      if (chipBox) {
        chipBox.textContent = shown ? '🛵 ~' + total + (unknown ? '+' : '') + ' БпЛА · ' + shown + ' напр.' : 'Шахедів у каналах не видно';
        chipBox.appendChild(el('small', null, 'орієнтовно, за повідомленнями каналів' + (data.error ? ' · ' + data.error : '')));
      }
    }

    var timer = null, busy = false;
    function load() {
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      fetch('/api/threats', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(render)
        .catch(function () { if (chipBox) chipBox.textContent = 'Шахеди: немає даних'; })
        .then(function () { busy = false; });
    }
    function start() { load(); timer = setInterval(load, POLL_MS); }
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') load(); });
    start();

    return { reload: load, group: group, stop: function () { clearInterval(timer); } };
  }

  window.ThreatsLayer = { init: init };
})();
