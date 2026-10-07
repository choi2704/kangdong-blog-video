import OpenAI from 'openai';

function safeJson(text) {
  const cleaned = String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

function originFromReq(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { title = '', text = '', images = [], minutes = 5 } = req.body || {};
    if (!text || text.trim().length < 50) return res.status(400).json({ error: '블로그 본문이 너무 짧습니다.' });
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'Vercel 환경변수 OPENAI_API_KEY가 설정되지 않았습니다.' });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || 'gpt-6-luna';
    const origin = originFromReq(req);

    const selected = (Array.isArray(images) ? images : [])
      .map((v, i) => {
        if (typeof v === 'string') return { index: i + 1, url: v };
        return { index: Number(v?.index) || i + 1, url: String(v?.url || '') };
      })
      .filter(v => /^https?:\/\//.test(v.url))
      .slice(0, 20);

    const imageSummary = selected.length
      ? selected.map(v => `사진 ${v.index}: ${v.url}`).join('\n')
      : '(사용 가능한 사진 없음)';

    const prompt = `당신은 강동자바라의 유튜브 롱폼 영상 기획자입니다.
아래 네이버 블로그 글과 제공된 사진만 근거로 영상을 기획하세요.

중요 원칙:
- 블로그에 없는 제품 사양, 현장 사실, 가격, 하중, 인증, 성능을 지어내지 마세요.
- 사진을 직접 보고 장면 내용과 가장 잘 맞는 사진 번호를 선택하세요.
- 같은 사진을 여러 장면에 반복 배치하지 말고, 필요할 때만 재사용하세요.
- 사진이 장면과 맞지 않으면 image_indices를 빈 배열로 두세요.
- 내레이션에서는 "블로그 글에서 확인되지 않습니다"라는 문장을 반복하지 마세요. 확인 불가 정보는 facts_not_confirmed에 모으고, 안전상 꼭 필요한 경우에만 자연스럽게 한 번 언급하세요.
- 영상은 설명형이지만 너무 딱딱하지 않게, 실제 제작업체가 현장을 보여주며 설명하는 자연스러운 한국어 구어체로 작성하세요.
- 장면마다 1~3장의 사진을 배치할 수 있습니다.

목표 영상 길이: 약 ${minutes}분
브랜드: 강동자바라
문의번호: 1577-6084

블로그 제목:
${title}

블로그 본문:
${text.slice(0, 28000)}

사진 번호와 원본 URL:
${imageSummary}

반드시 아래 JSON만 출력하세요. 마크다운 코드블록은 쓰지 마세요.
{
  "youtube_title": "검색과 클릭을 고려한 제목 1개",
  "thumbnail_text": "썸네일 짧은 문구 2줄 이내",
  "hook": "영상 첫 15초 내레이션",
  "narration": "전체 내레이션 대본",
  "scenes": [
    {
      "scene": 1,
      "seconds": 15,
      "image_indices": [1,2],
      "image_reason": "왜 이 사진이 이 장면에 맞는지 한 문장",
      "caption": "화면 자막",
      "narration": "이 장면 내레이션"
    }
  ],
  "description": "유튜브 설명란",
  "hashtags": ["#강동자바라"],
  "facts_not_confirmed": ["확인 불가 정보"]
}`;

    const content = [{ type: 'input_text', text: prompt }];

    for (const img of selected) {
      content.push({ type: 'input_text', text: `아래 이미지는 사진 ${img.index}입니다.` });
      const proxied = origin ? `${origin}/api/image?url=${encodeURIComponent(img.url)}` : img.url;
      content.push({ type: 'input_image', image_url: proxied, detail: 'low' });
    }

    const response = await client.responses.create({
      model,
      input: [{ role: 'user', content }]
    });

    const out = safeJson(response.output_text || '{}');
    res.status(200).json({ ok: true, model, result: out, images_used: selected.length });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'AI 대본 생성 중 오류가 발생했습니다.' });
  }
}
