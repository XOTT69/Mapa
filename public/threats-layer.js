// Шар «Шахеди (орієнтовно)». Дані: GET /api/threats (тексти публічних TG-каналів).
// Не радар: позиції — центри названих у тексті міст/областей. Стрілка = напрямок, число = к-ть із тексту.
const POLL_MS = 20000, TTL_MS = 40 * 60 * 1000;

const CSS = '' +
  '.thr-mk{position:relative;width:40px;height:40px}' +
  '.thr-mk svg{width:40px;height:40px;filter:drop-shadow(0 0 4px rgba(255,60,60,.8));transform:rotate(var(--rot,0deg))}' +
  '.thr-mk svg path{fill:#ff4d4d;stroke:#fff;stroke-width:1.2}' +
  '.thr-mk.low svg path{fill:#ff9a3c}' +
  '.thr-mk .pulse{position:absolute;inset:3px;border-radius:50%;border:2px solid rgba(255,77,77,.7);animation:thrp 1.8s ease-out infinite}' +
  '.thr-mk b{position:absolute;right:-8px;top:-8px;min-width:18px;height:18px;padding:0 4px;box-sizing:border-box;border-radius:9px;background:#111;color:#fff;font:700 11px/16px system-ui,sans-serif;text-align:center;border:1px solid #ff4d4d}' +
  '@keyframes thrp{0%{transform:scale(.6);opacity:1}100%{transform:scale(1.6);opacity:0}}' +
  '.thr-line{animation:thrd 1.1s linear infinite}' +
  '@keyframes thrd{to{stroke-dashoffset:-22}}' +
  '@media(prefers-reduced-motion:reduce){.thr-line,.thr-mk .pulse{animation:none}}' +
  '.thr-pop{font-size:12px;line-height:1.5;color:#222}.thr-pop a{color:#1a5fb4}';

function el(tag, attrs, text) {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  return n;
}

function icon(t) {
  const rot = t.heading == null ? 0 : t.heading;
  const html = `<div class="thr-mk ${t.confidence === 'low' ? 'low' : ''}" style="--rot:${Number(rot) || 0}deg">` +
    '<span class="pulse"></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 L20 21 L12 16.5 L4 21 Z"/></svg>' +
    `<b>${t.countKnown ? Number(t.count) || 1 : '?'}</b></div>`;
  return L.divIcon({ html, className: '', iconSize: [40, 40], iconAnchor: [20, 20] });
}

function popup(t) {
  const box = el('div', { class: 'thr-pop' });
  const mins = Math.max(0, Math.round((Date.now() - t.ts) / 60000));
  box.appendChild(el('b', null, (t.countKnown ? t.count + ' ' : 'Кількість не вказана · ') + 'БпЛА (орієнтовно)'));
  const route = [t.origin && t.origin.name, t.at && t.at.name, t.target && t.target.name].filter(Boolean);
  if (route.length) box.appendChild(el('div', null, route.join(' → ')));
  box.appendChild(el('div', null, mins + ' хв тому · точність: ' + ({ high: 'вища', medium: 'середня', low: 'низька' }[t.confidence] || '—')));
  box.appendChild(el('div', { style: 'opacity:.8;margin-top:4px' }, t.text));
  if (/^https:\/\/t\.me\//.test(t.link || '')) {
    box.appendChild(el('a', { href: t.link, target: '_blank', rel: 'noopener noreferrer' }, 'Джерело: ' + t.source));
  }
  return box;
}

/** @param map L.map; @param opts {onUpdate({total,unknown,shown,error,stale})} */
export function initThreats(map, opts = {}) {
  document.head.appendChild(el('style', null, CSS));
  // Мапа працює з preferCanvas — для CSS-анімації ліній потрібен окремий SVG-рендерер
  const renderer = L.svg({ padding: 0.5 });
  renderer.addTo(map);
  const group = L.layerGroup().addTo(map);
  const markers = new Map();
  let visible = true, last = null, timer = null, busy = false;

  function render(data) {
    last = data;
    group.clearLayers(); markers.clear();
    const now = Date.now();
    let total = 0, unknown = false, shown = 0;
    const active = [];
    for (const t of data.tracks || []) {
      const age = now - t.ts;
      if (age > TTL_MS || !t.at) continue;
      shown++; active.push(t); total += t.count; if (!t.countKnown) unknown = true;
      const fade = Math.max(0.35, 1 - (age / TTL_MS) * 0.65);
      const at = [t.at.lat, t.at.lon];
      if (t.origin && t.origin.name !== t.at.name) {
        L.polyline([[t.origin.lat, t.origin.lon], at], { renderer, color: '#ff4d4d', weight: 2, opacity: 0.25 * fade, interactive: false }).addTo(group);
      }
      if (t.target) {
        const tg = [t.target.lat, t.target.lon];
        L.polyline([at, tg], { renderer, color: '#ff4d4d', weight: 3, opacity: fade, dashArray: '8 14', className: 'thr-line', interactive: false }).addTo(group);
        L.circleMarker(tg, { renderer, radius: 6, color: '#ff4d4d', weight: 2, fill: false, opacity: fade, interactive: false }).addTo(group);
      }
      const mk = L.marker(at, { icon: icon(t), opacity: fade, keyboard: false }).bindPopup(() => popup(t)).addTo(group);
      markers.set(t.id, mk);
    }
    if (opts.onUpdate) opts.onUpdate({ total, unknown, shown, tracks: active.sort((a, b) => b.ts - a.ts), error: data.error || null, stale: !!data.stale });
  }

  function load() {
    if (busy || !visible || document.visibilityState === 'hidden') return;
    busy = true;
    fetch('/api/threats', { cache: 'no-store' })
      .then((r) => r.json()).then(render)
      .catch(() => { if (opts.onUpdate) opts.onUpdate({ total: 0, unknown: false, shown: 0, tracks: [], error: 'немає даних', stale: true }); })
      .finally(() => { busy = false; });
  }

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
  timer = setInterval(load, POLL_MS);
  load();

  return {
    reload: load,
    setVisible(v) {
      visible = !!v;
      if (visible) { group.addTo(map); load(); } else map.removeLayer(group);
    },
    focus(id) {
      const mk = markers.get(id);
      if (!mk) return false;
      if (!map.hasLayer(group)) group.addTo(map);
      map.flyTo(mk.getLatLng(), Math.max(map.getZoom(), 8), { duration: 0.6 });
      setTimeout(() => mk.openPopup(), 650);
      return true;
    },
    stop() { clearInterval(timer); },
    get last() { return last; },
  };
}
