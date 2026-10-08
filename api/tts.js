import OpenAI from 'openai';

const allowedVoices = new Set([
  'alloy','ash','ballad','coral','echo','fable','onyx','nova','sage','shimmer','verse','marin','cedar'
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { text = '', voice = 'coral', speed = 1 } = req.body || {};
    const input = String(text).trim();

    if (!input) return res.status(400).json({ error: '음성으로 만들 문장이 없습니다.' });
    if (input.length > 4096) return res.status(400).json({ error: '한 장면 내레이션이 너무 깁니다.' });
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY가 설정되지 않았습니다.' });
    }

    const safeVoice = allowedVoices.has(voice) ? voice : 'coral';
    const safeSpeed = Math.max(0.8, Math.min(1.25, Number(speed) || 1));

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const audio = await client.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice: safeVoice,
      input,
      instructions: '한국어 제품 설명 영상입니다. 차분하고 또렷하며 자연스럽게 설명하세요. 지나치게 광고처럼 과장하지 말고, 문장 사이를 자연스럽게 쉬어 주세요.',
      response_format: 'mp3',
      speed: safeSpeed
    });

    const buf = Buffer.from(await audio.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'AI 음성 생성 중 오류가 발생했습니다.' });
  }
}
