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

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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
    const origin = originFromReq(req);

    // 60장을 한 번에 보내지 않고 15장씩 병렬 분석해서 속도와 안정성을 잡습니다.
    const groups = chunks(all, 15);

    const batchResults = await Promise.all(groups.map(async (group, batchNo) => {
      const prompt = `당신은 강동자바라 유튜브 롱폼 영상의 사진 편집자입니다.
블로그 글과 아래 사진들을 보고, 각 사진의 영상 활용도를 평가하세요.

목적:
- 약 5분 제품 설명형 영상에 쓸 대표 사진을 고르기
- 비슷한 사진은 대표 1~2장만 남기기
- 전체 제품 모습, 설치 모습, 구조 설명에 좋은 근접 사진, 디테일 사진을 골고루 남기기
- 로고, 아이콘, 스티커, 캡처화면, 글자만 있는 이미지, 너무 흐린 사진, 거의 똑같은 중복 사진은 낮게 평가하기
- 사진에 보이지 않는 사실을 추측하지 않기

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

        // Our proxy already handles Naver referer/image headers.
        // Using our public Vercel URL gives the model a stable image URL.
        const proxied = origin
          ? `${origin}/api/image?url=${encodeURIComponent(img.url)}`
          : img.url;

        content.push({ type: 'input_image', image_url: proxied, detail: 'low' });
      }

      const response = await client.responses.create({
        model,
        input: [{ role: 'user', content }]
      });

      const parsed = safeJson(response.output_text || '{}');
      return Array.isArray(parsed.photos) ? parsed.photos : [];
    }));

    const evaluated = batchResults
      .flat()
      .map(v => ({
        index: Number(v?.index),
        score: clamp(Number(v?.score) || 0, 0, 100),
        role: String(v?.role || ''),
        reason: String(v?.reason || ''),
        description: String(v?.description || ''),
        exclude: !!v?.exclude
      }))
      .filter(v => Number.isFinite(v.index));

    // 마지막은 사진 설명/점수만 보고 전체 60장 중 역할이 겹치지 않게 10~20장으로 정리합니다.
    const candidateText = evaluated
      .sort((a, b) => a.index - b.index)
      .map(v =>
        `사진 ${v.index} | 점수 ${v.score} | 역할 ${v.role || '-'} | 제외 ${v.exclude ? 'Y' : 'N'} | 설명 ${v.description || '-'} | 이유 ${v.reason || '-'}`
      )
      .join('\n');

    const finalPrompt = `당신은 유튜브 영상 사진 셀렉터입니다.
아래는 사진을 실제로 본 1차 평가 결과입니다.
약 5분 제품 설명 영상에 사용할 사진을 정확히 ${wanted}장 안팎으로 골라주세요.

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
      "reason": "제품 전체 형태와 돌출 구조가 한눈에 보여 오프닝에 적합"
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

    const validIndices = new Set(all.map(v => v.index));
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

    // 모델 응답이 너무 적으면 1차 점수 상위 사진으로 안전하게 채웁니다.
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
      analyzed: all.length,
      selected,
      summary: String(finalParsed.summary || ''),
      batches: groups.length
    });

  } catch (e) {
    return res.status(500).json({ error: e?.message || 'AI 사진 자동선택 중 오류가 발생했습니다.' });
  }
}
