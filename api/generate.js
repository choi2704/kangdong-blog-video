import OpenAI from 'openai';

function safeJson(text) {
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(cleaned);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const { title='', text='', images=[], minutes=5 } = req.body || {};
    if (!text || text.trim().length < 50) {
      return res.status(400).json({ error: '블로그 본문이 너무 짧습니다.' });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Vercel 환경변수 OPENAI_API_KEY가 설정되지 않았습니다.' });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || 'gpt-6-luna';
    const imageList = (images || []).slice(0, 30).map((u, i) => `${i+1}. ${u}`).join('\n');

    const prompt = `당신은 강동자바라의 유튜브 영상 편집 기획자입니다.\n\n아래 네이버 블로그 글만 근거로 유튜브 롱폼 초안을 만드세요. 글에 없는 제품 사양, 현장 사실, 가격, 성능을 지어내면 안 됩니다. 정보가 부족하면 일반화하지 말고 \"블로그 글에서 확인되지 않음\"이라고 판단하세요.\n\n목표 영상 길이: 약 ${minutes}분\n톤: 현장 경험이 느껴지는 친절한 설명, 과장 광고 금지, 한국어 자연스러운 구어체\n브랜드: 강동자바라\n\n블로그 제목:\n${title}\n\n블로그 본문:\n${text.slice(0, 28000)}\n\n사용 가능한 이미지 URL 목록:\n${imageList || '(이미지 없음)'}\n\n반드시 아래 JSON만 출력하세요. 마크다운 코드블록은 쓰지 마세요.\n{
  "youtube_title": "검색과 클릭을 고려한 제목 1개",
  "thumbnail_text": "썸네일 짧은 문구 2줄 이내",
  "hook": "영상 첫 15초 내레이션",
  "narration": "전체 내레이션 대본",
  "scenes": [
    {"scene":1,"seconds":15,"image_index":1,"caption":"화면 자막","narration":"이 장면 내레이션"}
  ],
  "description": "유튜브 설명란",
  "hashtags": ["#강동자바라"],
  "facts_not_confirmed": ["블로그 글에서 확인되지 않아 영상에 넣지 않은 정보"]
}`;

    const response = await client.responses.create({
      model,
      input: [{ role: 'user', content: prompt }]
    });

    const out = safeJson(response.output_text || '{}');
    res.status(200).json({ ok: true, model, result: out });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'AI 대본 생성 중 오류가 발생했습니다.' });
  }
}
