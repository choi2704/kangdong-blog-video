import OpenAI from 'openai';

const allowedVoices = new Set([
  'alloy','ash','ballad','coral','echo','fable','onyx','nova','sage','shimmer','verse','marin','cedar'
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { text = '', voice = 'marin', speed = 0.97, style = 'natural' } = req.body || {};
    const input = String(text).trim();

    if (!input) return res.status(400).json({ error: '음성으로 만들 문장이 없습니다.' });
    if (input.length > 4096) return res.status(400).json({ error: '한 장면 내레이션이 너무 깁니다.' });
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY가 설정되지 않았습니다.' });
    }

    const safeVoice = allowedVoices.has(voice) ? voice : 'marin';
    const safeSpeed = Math.max(0.82, Math.min(1.18, Number(speed) || 0.97));

    const styleInstructions = {
      natural: '실제 사람이 옆에서 설명하듯 자연스럽고 편안한 한국어로 읽어 주세요. 문장 끝을 매번 똑같이 내리지 말고 자연스러운 억양 변화를 주세요. 쉼표와 마침표에서는 짧게 호흡하고, 제품명과 숫자는 또렷하게 말하세요. 광고 성우처럼 과장하지 말고 대화하듯 설명하세요.',
      warm: '따뜻하고 친근한 한국어 설명 톤으로 읽어 주세요. 듣는 사람에게 직접 설명하듯 자연스럽게 말하고, 문장 사이에 짧은 호흡을 주세요. 과장된 광고 톤은 피하세요.',
      calm: '차분하고 신뢰감 있는 한국어 설명 톤으로 읽어 주세요. 속도는 안정적으로 유지하되 기계적으로 들리지 않도록 자연스러운 억양과 호흡을 넣어 주세요.',
      lively: '밝고 경쾌하지만 과장되지 않은 한국어 설명 톤으로 읽어 주세요. 핵심 단어는 살짝 강조하고 문장 연결은 자연스럽게 해 주세요.'
    };
    const instructions = styleInstructions[style] || styleInstructions.natural;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const audio = await client.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice: safeVoice,
      input,
      instructions,
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
