import * as cheerio from 'cheerio';

function parseNaverUrl(input) {
  const u = new URL(input);
  const m = u.pathname.match(/^\/([^/]+)\/(\d+)/);
  if (!m) throw new Error('네이버 블로그 글 주소 형식이 아닙니다.');
  return { blogId: m[1], logNo: m[2] };
}

function cleanText(s='') {
  return s.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function absoluteNaverImage(src='') {
  if (!src) return '';
  if (src.startsWith('//')) return 'https:' + src;
  return src;
}

async function fetchHtml(url) {
  const r = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142 Safari/537.36',
      'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8'
    },
    redirect: 'follow'
  });
  if (!r.ok) throw new Error(`네이버 응답 오류: ${r.status}`);
  return await r.text();
}

function parseContent(html) {
  const $ = cheerio.load(html);
  const title = cleanText(
    $('.se-title-text').first().text() ||
    $('.pcol1 .se_textarea').first().text() ||
    $('meta[property="og:title"]').attr('content') ||
    $('title').text()
  );

  const container = $('.se-main-container').first().length
    ? $('.se-main-container').first()
    : ($('#postViewArea').first().length ? $('#postViewArea').first() : $('body'));

  // Remove non-content UI elements.
  container.find('script,style,button,svg,noscript').remove();
  const text = cleanText(container.text());

  const seen = new Set();
  const images = [];
  container.find('img').each((_, el) => {
    const src = absoluteNaverImage(
      $(el).attr('data-lazy-src') ||
      $(el).attr('data-src') ||
      $(el).attr('src') || ''
    );
    if (!src || seen.has(src)) return;
    if (/icon|profile|emoji|sticker|static|banner/i.test(src)) return;
    seen.add(src);
    images.push(src);
  });

  return { title, text, images: images.slice(0, 40) };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: '블로그 URL이 필요합니다.' });
    const { blogId, logNo } = parseNaverUrl(url);

    const candidates = [
      `https://m.blog.naver.com/${blogId}/${logNo}`,
      `https://blog.naver.com/PostView.naver?blogId=${encodeURIComponent(blogId)}&logNo=${encodeURIComponent(logNo)}&redirect=Dlog&widgetTypeCall=true&directAccess=false`
    ];

    let best = null;
    const errors = [];
    for (const target of candidates) {
      try {
        const html = await fetchHtml(target);
        const parsed = parseContent(html);
        if (!best || parsed.text.length > best.text.length) best = parsed;
        if (parsed.text.length > 300) break;
      } catch (e) {
        errors.push(String(e?.message || e));
      }
    }

    if (!best || best.text.length < 80) {
      return res.status(422).json({
        error: '네이버가 자동 수집을 막았습니다. 아래 수동 입력란에 본문을 붙여넣으면 계속 진행할 수 있습니다.',
        details: errors
      });
    }

    res.status(200).json({
      ok: true,
      blogId,
      logNo,
      title: best.title,
      text: best.text.slice(0, 30000),
      images: best.images
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || '추출 중 오류가 발생했습니다.' });
  }
}
