function isAllowedHost(host = '') {
  const h = host.toLowerCase();
  return h === 'naver.com' || h.endsWith('.naver.com') ||
         h === 'naver.net' || h.endsWith('.naver.net') ||
         h === 'pstatic.net' || h.endsWith('.pstatic.net');
}

export default async function handler(req, res) {
  try {
    const raw = Array.isArray(req.query?.url) ? req.query.url[0] : req.query?.url;
    if (!raw) return res.status(400).send('missing url');

    let u;
    try { u = new URL(raw); } catch { return res.status(400).send('bad url'); }
    if (u.protocol !== 'https:' || !isAllowedHost(u.hostname)) return res.status(403).send('blocked host');

    const r = await fetch(u.toString(), {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142 Safari/537.36',
        'referer': 'https://blog.naver.com/',
        'accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });

    if (!r.ok) return res.status(r.status).send('image fetch failed');
    const ct = r.headers.get('content-type') || 'image/jpeg';
    if (!ct.startsWith('image/')) return res.status(415).send('not image');

    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 12 * 1024 * 1024) return res.status(413).send('image too large');

    res.setHeader('content-type', ct);
    res.setHeader('cache-control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).send(e?.message || 'proxy error');
  }
}
