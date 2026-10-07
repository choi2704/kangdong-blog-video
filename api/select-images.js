import OpenAI from 'openai';

function safeJson(text) {
  const cleaned = String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function allowedHost(host = '') {
  const h = host.toLowerCase();
  return h === 'pstatic.net' || h.endsWith('.pstatic.net') ||
         h === 'naver.net' || h.endsWith('.naver.net') ||
         h === 'naver.com' || h.endsWith('.naver.com');
}

function normalizeImageUrl(raw = '') {
  let s = String(raw).trim().replace(/&amp;/g, '&');
  if (s.startsWith('//')) s = 'https:' + s;
  if (s.startsWith('http://')) s = 'https://' + s.slice(7);

  const u = new URL(s);
  if (u.protocol !== 'https:' || !allowedHost(u.hostname)) {
    throw new Error('허용되지 않은 이미지 주소');
  }

  // Reduce size for AI vision and make Naver thumbnail delivery more stable.
  if (u.hostname.includes('mblogthumb-phinf.pstatic.net')) {
    u.searchParams.set('type', 'w500');
  }
  return u.toString();
}

async function fetchImageBuffer(url) {
  const referers = [
    'https://m.blog.naver.com/',
    'https://blog.naver.com/',
    'https://www.naver.com/'
  ];

  let lastStatus = 0;
  for (const referer of referers) {
    try {
      const r = await fetch(url, {
        redirect: 'follow',
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142 Safari/537.36',
          'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8',
          'accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'referer': referer
        }
      });

      lastStatus = r.status;
      if (!r.ok) continue;

      const ct = (r.headers.get('content-type') || '').toLowerCase();
      if (!ct.startsWith('image/')) continue;

      const ab = await r.arrayBuffer();
      const buf = Buffer.from(ab);
      if (!buf.length) continue;
      if (buf.length > 6 * 1024 * 1024) continue;

      // Keep only common image MIME types for Responses image input.
      const mime =
        ct.includes('png') ? 'image/png' :
        ct.includes('webp') ? 'image/webp' :
        ct.includes('gif') ? 'image/gif' :
        'image/jpeg';

      return { buf, mime };
    } catch {}
  }

  throw new Error(`이미지 다운로드 실패 (${lastStatus || 'network'})`);
}

async function toDataUrl(rawUrl) {
  const url = normalizeImageUrl(rawUrl);
  const { buf, mime } = await fetchImageBuffer(url);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { title = '', text = '', images = [], target = 18 } = req.body || {};

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Vercel 환경변수 OPENAI_API_KEY가 설정되지 않았습니다.' });
    }

    const all = (Array.isArray(images) ? images : [])
      .map((v, i) => ({
        index: Number(v?.index) || i + 1,
        url: String(v?.url || '')
      }))
      .filter(v => /^https?:\/\//.test(v.url))
      .slice(0, 60);

    if (!all.length) return res.status(400).json({ error: '분석할 사진이 없습니다.' });

    const wanted = clamp(Number(target) || 18, 10, 20);
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || 'gpt-6-luna';

    // 1) First download every image ourselves.
    // This avoids OpenAI trying to download a Vercel/Naver URL and failing with 404.
    const prepared = [];
    const skipped = [];

    // Limit concurrency so Vercel/Naver are not hit too aggressively.
    for (const group of chunks(all, 6)) {
      const results = await Promise.all(group.map(async img => {
        try {
          const dataUrl = await toDataUrl(img.url);
          return { ...img, dataUrl };
        } catch (e) {
          return { ...img, error: String(e?.message || e) };
        }
      }));

      for (const r of results) {
        if (r.dataUrl) prepared.push(r);
        else skipped.push({ index: r.index, reason: r.error || '다운로드 실패' });
      }
    }

    if (prepared.length < 3) {
      return res.status(422).json({
        error: 'AI가 분석할 수 있는 사진을 충분히 불러오지 못했습니다.',
        downloaded: prepared.length,
        skipped
      });
    }

    // Analyze in small batches so a single bad image cannot break all 60.
    const groups = chunks(prepared, 10);

    const batchResults = [];
    for (let batchNo = 0; batchNo < groups.length; batchNo++) {
      const group = groups[batchNo];

      const prompt = `당신은 강동자바라 유튜브 롱폼 영상의 사진 편집자입니다.
블로그 글과 아래 사진들을 보고 각 사진의 영상 활용도를 평가하세요.

목적:
- 약 5분 제품 설명형 영상에 쓸 대표 사진을 고르기
- 비슷한 사진은 대표 1~2장만 남기기
- 전체 제품 모습, 설치 모습, 구조 설명에 좋은 근접 사진, 디테일 사진을 골고루 남기기
- 로고, 아이콘, 스티커, 캡처화면, 글자만 있는 이미지, 너무 흐린 사진, 거의 똑같은 중복 사진은 낮게 평가
- 사진에 보이지 않는 사실은 추측하지 않기

블로그 제목:
${title}

본문 일부:
${String(text).slice(0, 7000)}

이번 묶음: ${batchNo + 1}/${groups.length}
사진 번호: ${group.map(v => v.index).join(', ')}

반드시 JSON만 출력:
{
  "photos": [
    {
      "index": 1,
      "score": 92,
      "role": "완성 제품 전체",
      "reason": "제품 전체 구조가 한눈에 보임",
      "description": "사진에 실제로 보이는 내용 한 문장",
      "exclude": false
    }
  ]
}`;

      const content = [{ type: 'input_text', text: prompt }];

      for (const img of group) {
        content.push({ type: 'input_text', text: `다음 이미지는 사진 ${img.index}입니다.` });
        content.push({
          type: 'input_image',
          image_url: img.dataUrl,
          detail: 'low'
        });
      }

      try {
        const response = await client.responses.create({
          model,
          input: [{ role: 'user', content }]
        });

        const parsed = safeJson(response.output_text || '{}');
        if (Array.isArray(parsed.photos)) batchResults.push(...parsed.photos);
      } catch (e) {
        // If a whole batch fails, continue with the next batch instead of killing all 60.
        skipped.push({
          index: group.map(v => v.index).join(','),
          reason: `AI 묶음 분석 실패: ${String(e?.message || e)}`
        });
      }
    }

    const evaluated = batchResults
      .map(v => ({
        index: Number(v?.index),
        score: clamp(Number(v?.score) || 0, 0, 100),
        role: String(v?.role || ''),
        reason: String(v?.reason || ''),
        description: String(v?.description || ''),
        exclude: !!v?.exclude
      }))
      .filter(v => Number.isFinite(v.index));

    if (!evaluated.length) {
      return res.status(422).json({
        error: '사진 다운로드는 됐지만 AI 사진 분석 결과를 만들지 못했습니다.',
        downloaded: prepared.length,
        skipped
      });
    }

    // Final diversity selection using text-only summary of already-viewed images.
    const candidateText = evaluated
      .sort((a, b) => a.index - b.index)
      .map(v =>
        `사진 ${v.index} | 점수 ${v.score} | 역할 ${v.role || '-'} | 제외 ${v.exclude ? 'Y' : 'N'} | 설명 ${v.description || '-'} | 이유 ${v.reason || '-'}`
      )
      .join('\n');

    const finalPrompt = `당신은 유튜브 영상 사진 셀렉터입니다.
아래는 사진을 실제로 본 1차 평가 결과입니다.
약 5분 제품 설명 영상에 사용할 사진을 ${wanted}장 안팎으로 골라주세요.

선택 원칙:
- 전체 제품/현장 소개 사진 3~5장
- 구조나 부품 설명 근접 사진 6~10장
- 실제 설치/사용 상태 사진 2~4장
- 비슷한 구도는 과감히 제외
- 로고/아이콘/캡처/텍스트 이미지 제외
- 점수가 높아도 같은 역할 사진이 너무 많으면 일부 제외
- 영상 흐름에 필요한 다양성을 우선
- 원래 사진 번호를 그대로 사용

블로그 제목:
${title}

1차 평가:
${candidateText}

반드시 JSON만 출력:
{
  "selected": [
    {
      "index": 1,
      "score": 95,
      "role": "오프닝 전체 모습",
      "reason": "제품 전체 형태가 한눈에 보여 오프닝에 적합"
    }
  ],
  "summary": "선택 기준 한 문장"
}`;

    const finalResponse = await client.responses.create({
      model,
      input: finalPrompt
    });

    const finalParsed = safeJson(finalResponse.output_text || '{}');
    let selected = Array.isArray(finalParsed.selected) ? finalParsed.selected : [];

    const validIndices = new Set(prepared.map(v => v.index));
    const used = new Set();

    selected = selected
      .map(v => ({
        index: Number(v?.index),
        score: clamp(Number(v?.score) || 0, 0, 100),
        role: String(v?.role || '대표 사진'),
        reason: String(v?.reason || '영상 구성에 적합한 대표 사진')
      }))
      .filter(v => validIndices.has(v.index) && !used.has(v.index) && used.add(v.index))
      .slice(0, 20);

    // Safe fallback if the final text selection returns too few items.
    if (selected.length < 10) {
      const fallback = evaluated
        .filter(v => !v.exclude && validIndices.has(v.index))
        .sort((a, b) => b.score - a.score);

      for (const v of fallback) {
        if (used.has(v.index)) continue;
        selected.push({
          index: v.index,
          score: v.score,
          role: v.role || '대표 사진',
          reason: v.reason || '사진 활용도 점수가 높아 추가 선택'
        });
        used.add(v.index);
        if (selected.length >= wanted) break;
      }
    }

    selected.sort((a, b) => a.index - b.index);

    return res.status(200).json({
      ok: true,
      model,
      requested: all.length,
      downloaded: prepared.length,
      skipped,
      selected,
      summary: String(finalParsed.summary || ''),
      batches: groups.length
    });

  } catch (e) {
    return res.status(500).json({
      error: e?.message || 'AI 사진 자동선택 중 오류가 발생했습니다.'
    });
  }
}
