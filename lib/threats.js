'use strict';
/**
 * Орієнтовні треки БпЛА (шахедів) на основі текстів публічних Telegram-каналів.
 * Це НЕ радар: координати — це центри населених пунктів/областей, названих у тексті.
 */

const W = '[а-яіїєґ]*';
// [regex-основа (~ = закінчення), lat, lon, назва]
const PLACES = [
  ['київ~|києв~|київщин~', 50.45, 30.52, 'Київ'],
  ['харків~|харков~|харківщин~', 49.99, 36.23, 'Харків'],
  ['дніпр~|дніпропетровщин~', 48.46, 35.05, 'Дніпро'],
  ['одес~|одещин~', 46.48, 30.72, 'Одеса'],
  ['львів~|львов~|львівщин~', 49.84, 24.03, 'Львів'],
  ['запоріж~|запорізьк~', 47.84, 35.14, 'Запоріжжя'],
  ['миколаїв~|миколаєв~|миколаївщин~', 46.97, 32.0, 'Миколаїв'],
  ['херсон~|херсонщин~', 46.64, 32.62, 'Херсон'],
  ['полтав~|полтавщин~', 49.59, 34.55, 'Полтава'],
  ['суми|сум(?:ах|ам|ами)|сумщин~|сумськ~', 50.91, 34.8, 'Суми'],
  ['чернігів~|чернігов~|чернігівщин~', 51.49, 31.29, 'Чернігів'],
  ['житомир~|житомирщин~', 50.25, 28.66, 'Житомир'],
  ['вінниц~|вінниччин~', 49.23, 28.47, 'Вінниця'],
  ['черкас~|черкащин~', 49.44, 32.06, 'Черкаси'],
  ['кропивницьк~|кіровоград~', 48.51, 32.26, 'Кропивницький'],
  ['рівн~|рівненщин~', 50.62, 26.25, 'Рівне'],
  ['луцьк~|волин~', 50.75, 25.34, 'Луцьк'],
  ['тернопіл~|тернопільщин~', 49.55, 25.59, 'Тернопіль'],
  ['хмельницьк~|хмельниччин~', 49.42, 26.98, 'Хмельницький'],
  ['івано-франківськ~|франківськ~|прикарпат~', 48.92, 24.71, 'Івано-Франківськ'],
  ['ужгород~|закарпат~', 48.62, 22.29, 'Ужгород'],
  ['чернівц~|буковин~', 48.29, 25.94, 'Чернівці'],
  ['краматорськ~', 48.72, 37.56, 'Краматорськ'],
  ["слов['’]янськ~", 48.85, 37.6, "Слов'янськ"],
  ['покровськ~', 48.28, 37.18, 'Покровськ'],
  ["куп['’]янськ~", 49.71, 37.62, "Куп'янськ"],
  ['ізюм~', 49.21, 37.26, 'Ізюм'],
  ['лозов~', 48.89, 36.32, 'Лозова'],
  ['павлоград~', 48.53, 35.87, 'Павлоград'],
  ['кривий\\s+ріг|кривого\\s+рог~|кривому\\s+розі|криворіж~', 47.91, 33.39, 'Кривий Ріг'],
  ['нікопол~', 47.57, 34.4, 'Нікополь'],
  ['вознесенськ~', 47.56, 31.33, 'Вознесенськ'],
  ['умань~|умані', 48.75, 30.22, 'Умань'],
  ['біл(?:а|ої|ій|у)\\s+церкв~', 49.8, 30.12, 'Біла Церква'],
  ['бровар~', 50.51, 30.79, 'Бровари'],
  ['бориспіл~', 50.35, 30.95, 'Бориспіль'],
  ['ніжин~', 51.05, 31.89, 'Ніжин'],
  ['прилук~', 50.59, 32.39, 'Прилуки'],
  ['конотоп~', 51.24, 33.2, 'Конотоп'],
  ['шостк~', 51.87, 33.48, 'Шостка'],
  ['охтирк~', 50.31, 34.9, 'Охтирка'],
  ['лебедин~', 50.57, 34.49, 'Лебедин'],
  ['гадяч~', 50.37, 34.0, 'Гадяч'],
  ['кременчу~', 49.07, 33.42, 'Кременчук'],
  ['миргород~', 49.97, 33.61, 'Миргород'],
  ['мелітопол~', 46.85, 35.37, 'Мелітополь'],
  ['бердянськ~', 46.76, 36.79, 'Бердянськ'],
  ['маріупол~', 47.1, 37.54, 'Маріуполь'],
  ['каховк~', 46.81, 33.49, 'Каховка'],
  ['ізмаїл~', 45.35, 28.84, 'Ізмаїл'],
  ['чорноморськ~', 46.3, 30.65, 'Чорноморськ'],
  ['фастів~|фастов~', 50.08, 29.92, 'Фастів'],
  ["кам['’]янськ~", 48.51, 34.6, "Кам'янське"],
  ['вишгород~', 50.58, 30.47, 'Вишгород'],
  ['краснопіл~', 50.77, 35.28, 'Краснопілля'],
  // звідки зазвичай заходять
  ['курськ~|курщин~', 51.73, 36.19, 'Курськ'],
  ['брянськ~|брянщин~', 53.24, 34.36, 'Брянськ'],
  ['бєлгород~|бєлгородщин~', 50.6, 36.59, 'Бєлгород'],
  ['міллеров~', 48.92, 40.4, 'Міллерово'],
  ['приморськ-ахтарськ~', 46.04, 38.17, 'Приморсько-Ахтарськ'],
  ['чауд~', 45.0, 35.8, 'Чауда'],
  ['крим~|кримськ~', 45.3, 34.4, 'Крим'],
  ['білорус~|білорусі', 52.5, 28.5, 'Білорусь'],
];

const INDEX = PLACES.map(([src, lat, lon, name]) => ({
  re: new RegExp(`(?<![а-яіїєґ'’])(?:${src.replace(/~/g, W)})(?![а-яіїєґ])`, 'giu'),
  lat, lon, name,
}));

const COMPASS = [
  ['північн\\S*\\s*-?\\s*схід\\S*', 45], ['південн\\S*\\s*-?\\s*схід\\S*', 135],
  ['південн\\S*\\s*-?\\s*захід\\S*', 225], ['північн\\S*\\s*-?\\s*захід\\S*', 315],
  ['північ\\S*|півночі', 0], ['схід\\S*|сходу', 90], ['південь|півдня|південн\\S*', 180], ['захід\\S*|заходу', 270],
].map(([s, b]) => [new RegExp(`(?<![а-яіїєґ])(?:${s})`, 'iu'), b]);

const DRONE_RE = /шахед|шахід|shahed|гер[а-яі]нь|бпла|дрон|мопед|безпілот|ударн\S*\s+бп/iu;
const NUM_WORDS = { один: 1, одна: 1, два: 2, дві: 2, три: 3, чотири: 4, "п'ять": 5, шість: 6, сім: 7, вісім: 8, "дев'ять": 9, десять: 10 };

const norm = (s) => s.replace(/[ʼ’`´]/g, "'").toLowerCase();

function findPlaces(t) {
  const hits = [];
  for (const p of INDEX) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(t))) hits.push({ name: p.name, lat: p.lat, lon: p.lon, idx: m.index, end: m.index + m[0].length, word: m[0] });
  }
  hits.sort((a, b) => a.idx - b.idx || b.end - a.end);
  const out = [];
  for (const h of hits) if (!out.length || h.idx >= out[out.length - 1].end) out.push(h);
  return out;
}

function roleOf(t, p) {
  const before = t.slice(Math.max(0, p.idx - 30), p.idx);
  if (/(?:^|[\s(,;])(?:з|із|зі|від)\s+(?:боку\s+|напрямку\s+)?$/u.test(before)) return 'origin';
  if (/(?:курсом|курс|напрямку|напрямок|прямує|прямують|летить|летять|рухається|рухаються|в сторону|у бік)\s*(?:на\s+)?$/u.test(before)) return 'target';
  if (/(?:^|[\s(,;→>-])на\s+$/u.test(before)) return /щині$|щині/u.test(p.word) ? 'position' : 'target';
  if (/(?:→|->|—>|=>)\s*$/u.test(before)) return 'target';
  return 'position';
}

function findCount(t) {
  let m = t.match(/(\d{1,3})\s*(?:[xх×]|шт\.?)?\s*(?:шахед|шахід|бпла|дрон|гер[а-яі]нь|ударн|ціл|мопед|безпілот)/u);
  if (m) return +m[1];
  m = t.match(/(?:груп\S*|зліт\S*)\s+(?:з\s+)?(\d{1,3})\b/u) || t.match(/(?:^|[\s(~])(\d{1,3})\s*[xх×](?![а-яіїєґ])/u);
  if (m) return +m[1];
  m = t.match(new RegExp(`(?<![а-яіїєґ'])(${Object.keys(NUM_WORDS).join('|')})\\s+(?:шахед|бпла|дрон|ударн|ціл|мопед)`, 'u'));
  return m ? NUM_WORDS[m[1]] : null;
}

function compassFrom(t) {
  // "з півночі", "з північного сходу" -> звідки летить
  const m = t.match(/(?:з|із|зі)\s+(?:боку\s+)?(північн\S*\s*-?\s*(?:схід|захід)\S*|південн\S*\s*-?\s*(?:схід|захід)\S*|півночі|півдня|сходу|заходу)/u);
  if (!m) return null;
  for (const [re, b] of COMPASS) if (re.test(m[1])) return b;
  return null;
}

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;
function bearing(a, b) {
  const f1 = toRad(a.lat), f2 = toRad(b.lat), dl = toRad(b.lon - a.lon);
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
function destPoint(p, brg, km) {
  const R = 6371, d = km / R, b = toRad(brg), f1 = toRad(p.lat), l1 = toRad(p.lon);
  const f2 = Math.asin(Math.sin(f1) * Math.cos(d) + Math.cos(f1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(f1), Math.cos(d) - Math.sin(f1) * Math.sin(f2));
  return { lat: toDeg(f2), lon: toDeg(l2) };
}

/** Один рядок/повідомлення -> 0..1 орієнтовний трек */
function parseLine(raw) {
  const t = norm(raw);
  if (!DRONE_RE.test(t) || /відбій/u.test(t)) return null;
  const places = findPlaces(t).map((p) => ({ ...p, role: roleOf(t, p) }));
  const origin = places.find((p) => p.role === 'origin') || null;
  const targets = places.filter((p) => p.role === 'target');
  const position = places.find((p) => p.role === 'position') || null;
  const target = targets[0] || null;
  const compass = compassFrom(t);
  const count = findCount(t);
  if (!origin && !target && !position) return null;

  let at, from = null, heading = null, confidence;
  if (position) { at = position; confidence = target ? 'high' : 'medium'; }
  else if (origin && target) { at = { lat: (origin.lat + target.lat) / 2, lon: (origin.lon + target.lon) / 2, name: '' }; confidence = 'medium'; }
  else if (target && compass !== null) { const p = destPoint(target, compass, 70); at = { ...p, name: '' }; confidence = 'low'; }
  else if (target) { at = target; confidence = 'low'; }
  else { at = origin; confidence = 'low'; }

  if (target && (at.lat !== target.lat || at.lon !== target.lon)) heading = bearing(at, target);
  else if (origin && (at.lat !== origin.lat || at.lon !== origin.lon)) { heading = bearing(origin, at); from = origin; }
  else if (compass !== null) heading = (compass + 180) % 360;
  if (origin && !from && position) from = origin;

  const pt = (p) => (p ? { lat: +p.lat.toFixed(4), lon: +p.lon.toFixed(4), name: p.name || '' } : null);
  return {
    count: count ?? 1, countKnown: count !== null,
    at: pt(at), target: pt(target), origin: pt(from || origin),
    extraTargets: targets.slice(1).map(pt),
    heading: heading === null ? null : Math.round(heading), confidence,
  };
}

function parseMessage(text, meta = {}) {
  const lines = String(text || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
  // рядки-продовження ("курсом на Конотоп") приклеюємо до попереднього пункту
  const groups = [];
  for (const l of lines) {
    const startsItem = DRONE_RE.test(norm(l)) || /^[\p{Extended_Pictographic}\d•*#–—-]/u.test(l);
    if (startsItem || !groups.length) groups.push(l); else groups[groups.length - 1] += ' ' + l;
  }
  const parts = groups.filter((g) => DRONE_RE.test(norm(g)));
  const out = [];
  parts.forEach((l, i) => {
    const ev = parseLine(l);
    if (ev) out.push({ id: `${meta.source}:${meta.msgId}:${i}`, ts: meta.ts, source: meta.source, link: meta.link, text: l.slice(0, 300), ...ev });
  });
  return out;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function htmlToText(h) {
  return h.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') { const c = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(c) ? String.fromCodePoint(c) : m; }
      return ENT[e.toLowerCase()] ?? m;
    });
}

function parseChannelHtml(html, channel) {
  const msgs = [];
  for (const chunk of html.split('tgme_widget_message_wrap').slice(1)) {
    const post = chunk.match(/data-post="([^"]+)"/);
    const body = chunk.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const time = chunk.match(/<time[^>]*datetime="([^"]+)"/);
    if (!post || !body || !time) continue;
    const ts = Date.parse(time[1]);
    if (!Number.isFinite(ts)) continue;
    msgs.push({ msgId: post[1].split('/')[1], ts, text: htmlToText(body[1]), link: `https://t.me/${post[1]}`, source: channel });
  }
  return msgs;
}

async function fetchChannel(channel, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const r = await fetchImpl(`https://t.me/s/${encodeURIComponent(channel)}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; MapaUA/1.0)', 'accept-language': 'uk' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseChannelHtml(await r.text(), channel);
}

async function collectThreats({ channels, ttlMin = 40, now = Date.now(), fetchImpl } = {}) {
  const results = await Promise.allSettled(channels.map((c) => fetchChannel(c, { fetchImpl })));
  const sources = [], events = [];
  results.forEach((res, i) => {
    if (res.status !== 'fulfilled') { sources.push({ channel: channels[i], ok: false, error: String(res.reason?.message || res.reason) }); return; }
    sources.push({ channel: channels[i], ok: true, messages: res.value.length });
    for (const m of res.value) {
      if (now - m.ts > ttlMin * 60000 || m.ts > now + 5 * 60000) continue;
      events.push(...parseMessage(m.text, m));
    }
  });
  // злиття дублікатів з різних каналів (той самий маршрут) — лишаємо найновіший
  events.sort((a, b) => b.ts - a.ts);
  const seen = new Map();
  for (const e of events) {
    const key = [e.at?.name || `${e.at?.lat},${e.at?.lon}`, e.target?.name || '', e.origin?.name || ''].join('|');
    const prev = seen.get(key);
    if (prev) { if (!prev.sources.includes(e.source)) prev.sources.push(e.source); continue; }
    seen.set(key, { ...e, sources: [e.source] });
  }
  return { updated: now, tracks: [...seen.values()], sources };
}

module.exports = { parseLine, parseMessage, parseChannelHtml, fetchChannel, collectThreats, bearing, destPoint };
