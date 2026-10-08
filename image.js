function allowedHost(host = '') {
  const h = host.toLowerCase();
  return h === 'pstatic.net' || h.endsWith('.pstatic.net') ||
         h === 'naver.net' || h.endsWith('.naver.net') ||
         h === 'naver.com' || h.endsWith('.naver.com');
}

function normalize(raw='') {
  let s = String(raw).trim().replace(/&amp;/g,'&');
  if (s.startsWith('//')) s = 'https:' + s;
  if (s.startsWith('http://')) s = 'https://' + s.slice(7);
  return s;
}

async function tryFetch(url, referer) {
  return await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142 Safari/537.36',
      'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8',
      'accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'referer': referer
    }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('GET only');

  try {
    const raw = Array.isArray(req.query?.url) ? req.query.url[0] : req.query?.url;
    if (!raw) return res.status(400).send('missing url');

    const normalized = normalize(raw);
    let u;
    try { u = new URL(normalized); } catch { return res.status(400).send('bad url'); }

    if (u.protocol !== 'https:' || !allowedHost(u.hostname)) return res.status(403).send('blocked host');

    if (u.hostname.includes('mblogthumb-phinf.pstatic.net') && !u.searchParams.has('type')) {
      u.searchParams.set('type', 'w1200');
    }

    let r = null;
    let lastStatus = 0;
    for (const ref of ['https://m.blog.naver.com/','https://blog.naver.com/','https://www.naver.com/']) {
      try {
        const candidate = await tryFetch(u.toString(), ref);
        lastStatus = candidate.status;
        if (candidate.ok) { r = candidate; break; }
      } catch {}
    }

    if (!r) return res.status(lastStatus || 502).send('image fetch failed');

    const ct = r.headers.get('content-type') || 'image/jpeg';
    if (!ct.toLowerCase().startsWith('image/')) return res.status(415).send('not image');

    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) return res.status(502).send('empty image');
    if (buf.length > 20 * 1024 * 1024) return res.status(413).send('image too large');

    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(500).send(e?.message || 'proxy error');
  }
}
