// GET /api/threats -> { updated, tracks: [...], sources: [...] }
// Орієнтовні маршрути БпЛА за текстами публічних TG-каналів. Не радар.
// Env (необов'язково): THREAT_CHANNELS="chan1,chan2" (інакше — додаткові канали з lib/channel-sources.js), THREAT_TTL_MIN (5..180, за замовч. 40)
import { collectThreats } from '../lib/threats.js';
import { CHANNEL_SOURCES } from '../lib/channel-sources.js';

const clean = (s) => s.trim().replace(/^https?:\/\/t\.me\/(?:s\/)?/i, '').replace(/^@/, '').split(/[/?#]/)[0];
let cache = null, cachedAt = 0, pending = null;

export default async function handler(req, res) {
  const send = (code, body, fresh) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (fresh) res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=20, stale-while-revalidate=15');
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'GET') return send(405, { error: 'Method not allowed' });
  const fromEnv = (process.env.THREAT_CHANNELS || '').split(',').map(clean).filter(Boolean);
  const channels = (fromEnv.length ? fromEnv : CHANNEL_SOURCES.filter((c) => !c.official).map((c) => c.id)).slice(0, 25);
  const ttlMin = Math.min(180, Math.max(5, Number(process.env.THREAT_TTL_MIN) || 40));
  if (cache && Date.now() - cachedAt < 20000) return send(200, cache, true);
  if (!pending) pending = collectThreats({ channels, ttlMin }).then((d) => { cache = d; cachedAt = Date.now(); return d; }).finally(() => { pending = null; });
  try {
    send(200, await pending, true);
  } catch {
    if (cache) return send(200, { ...cache, stale: true });
    send(502, { updated: Date.now(), tracks: [], sources: [], error: 'Не вдалося отримати дані каналів' });
  }
}
