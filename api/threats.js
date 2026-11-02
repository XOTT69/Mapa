// GET /api/threats -> { updated, tracks: [...], sources: [...] }
// Env: THREAT_CHANNELS="chan1,chan2,..." (імена публічних TG-каналів без @), THREAT_TTL_MIN (за замовч. 40)
import { collectThreats } from '../lib/threats.js';

const clean = (s) => s.trim().replace(/^https?:\/\/t\.me\/(?:s\/)?/i, '').replace(/^@/, '').split(/[/?#]/)[0];

export default async function handler(req, res) {
  const channels = (process.env.THREAT_CHANNELS || '').split(',').map(clean).filter(Boolean).slice(0, 25);
  const send = (code, body) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    res.end(JSON.stringify(body));
  };
  if (!channels.length) return send(200, { updated: Date.now(), tracks: [], sources: [], error: 'THREAT_CHANNELS не задано' });
  try {
    const ttl = Math.min(180, Math.max(5, Number(process.env.THREAT_TTL_MIN) || 40));
    send(200, await collectThreats({ channels, ttlMin: ttl }));
  } catch (e) {
    send(502, { updated: Date.now(), tracks: [], sources: [], error: 'Не вдалося отримати дані каналів' });
  }
}
