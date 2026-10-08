import OpenAI from 'openai';

function safeJson(text) {
  const cleaned = String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

function distributeImages(scenes, images) {
  const ids = (images || []).map((x, i) => Number(x?.index) || i + 1).filter(Boolean);
  if (!ids.length) return scenes.map(s => ({ ...s, image_indices: [] }));

  const n = scenes.length;
  return scenes.map((s, i) => {
    const start = Math.floor(i * ids.length / n);
    let end = Math.floor((i + 1) * ids.length / n);
    if (end <= start) end = Math.min(ids.length, start + 1);
    const slice = ids.slice(start, end).slice(0, 3);
    return { ...s, image_indices: slice.length ? slice : [ids[i % ids.length]] };
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { title = '', text = '', images = [], minutes = 5 } = req.body || {};
    if (!text || text.trim().length < 50) {
      return res.status(400).json({ error: '블로그 본문이 너무 짧습니다.' });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Vercel 환경변수 OPENAI_API_KEY가 설정되지 않았습니다.' });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || 'gpt-6-luna';
    const sceneCount = minutes <= 1 ? 7 : minutes <= 3 ? 8 : minutes >= 7 ? 12 : 9;
    const lengthGuide = minutes <= 1
      ? '전체 내레이션은 약 55~70초 분량으로 아주 간결하게 작성하세요. 장면당 1~2문장, 전체 7장면 안팎으로 구성하세요.'
      : `전체 내레이션은 약 ${minutes}분 분량으로 작성하세요.`;
    const selectedIds = (images || []).map(x => x.index).join(', ') || '(사진 없음)';

    const prompt = `당신은 강동자바라 유튜브 롱폼 영상 기획자입니다.
아래 블로그 글만 근거로 ${minutes}분 안팎의 한국어 영상 초안을 만드세요.

중요:
- 블로그에 없는 제품 사양, 가격, 안전기준, 성능을 지어내지 마세요.
- ${lengthGuide}
- 1분 영상일 때는 서론을 길게 쓰지 말고 첫 5초 안에 핵심을 말하세요.
- "블로그 글에서 확인되지 않습니다" 같은 문장을 영상 대본 안에서 반복하지 말고, 꼭 필요한 경우만 자연스럽게 표현하세요.
- 시청자가 듣기 편한 짧은 구어체 문장으로 작성하세요.
- 사진은 사용자가 직접 고른 상태입니다. 장면별 사진 번호는 서버가 블로그 사진 순서대로 자동 배치하므로 JSON에는 넣지 마세요.
- 내레이션에는 괄호, 마크다운 기호, 이모지를 넣지 마세요.
- 각 장면 subtitles는 화면에 순서대로 보여줄 1~3개의 짧은 자막입니다.
- 마지막 장면은 문의 안내로 마무리하세요.
- AI 음성을 사용하므로 설명란 끝에 "※ 이 영상의 내레이션에는 AI 음성이 사용되었습니다." 문구를 포함하세요.

브랜드: 강동자바라
문의번호: 1577-6084
목표 장면 수: ${sceneCount}
선택 사진 번호: ${selectedIds}

블로그 제목:
${title}

블로그 본문:
${text.slice(0, 28000)}

반드시 JSON만 출력:
{
  "youtube_title": "유튜브 제목",
  "thumbnail_text": "썸네일 2줄 이내",
  "hook": "첫 15초 대사",
  "narration": "전체 대본",
  "scenes": [
    {
      "scene": 1,
      "caption": "화면 제목",
      "narration": "이 장면에서 실제로 읽을 내레이션",
      "subtitles": ["짧은 자막 1", "짧은 자막 2"]
    }
  ],
  "description": "유튜브 설명란",
  "hashtags": ["#강동자바라"],
  "facts_not_confirmed": ["확인 필요 정보"]
}`;

    const response = await client.responses.create({
      model,
      input: [{ role: 'user', content: prompt }]
    });

    const result = safeJson(response.output_text || '{}');
    result.scenes = distributeImages(Array.isArray(result.scenes) ? result.scenes : [], images);

    return res.status(200).json({
      ok: true,
      model,
      images_used: (images || []).length,
      result
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'AI 대본 생성 중 오류가 발생했습니다.' });
  }
}
