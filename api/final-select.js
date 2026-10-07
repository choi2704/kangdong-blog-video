import OpenAI from 'openai';

function safeJson(text){
  const cleaned=String(text||'').replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim();
  return JSON.parse(cleaned);
}
function clamp(n,a,b){return Math.max(a,Math.min(b,n));}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  try{
    if(!process.env.OPENAI_API_KEY)return res.status(500).json({error:'OPENAI_API_KEY가 없습니다.'});
    const {title='',target=18,evaluations=[]}=req.body||{};
    const list=(Array.isArray(evaluations)?evaluations:[]).filter(v=>Number.isFinite(Number(v.index)));
    if(!list.length)return res.status(400).json({error:'사진 평가 결과가 없습니다.'});

    const wanted=clamp(Number(target)||18,10,20);
    const lines=list.map(v=>`사진 ${v.index} | ${v.score}점 | ${v.role||'-'} | 제외 ${v.exclude?'Y':'N'} | ${v.description||'-'} | ${v.reason||'-'}`).join('\n');

    const prompt=`유튜브 영상 사진 최종 선택입니다.
제목: ${title}

아래 사진 평가를 보고 약 ${wanted}장을 고르세요.
- 제품 전체/현장 소개 3~5장
- 구조/부품 근접 6~10장
- 설치/사용 상태 2~4장
- 비슷한 구도는 중복 제거
- 로고/아이콘/캡처/텍스트 이미지는 제외
- 원래 사진 번호 유지
- JSON만 출력

평가:
${lines}

형식:
{"selected":[{"index":1,"score":95,"role":"오프닝 전체 모습","reason":"전체 제품이 한눈에 보임"}]}`;

    const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const response=await client.responses.create({
      model:process.env.OPENAI_MODEL||'gpt-6-luna',
      input:prompt
    });
    const parsed=safeJson(response.output_text||'{}');

    const valid=new Set(list.map(v=>Number(v.index)));
    const used=new Set();
    let selected=(Array.isArray(parsed.selected)?parsed.selected:[]).map(v=>({
      index:Number(v.index),
      score:clamp(Number(v.score)||0,0,100),
      role:String(v.role||'대표 사진'),
      reason:String(v.reason||'영상 구성에 적합')
    })).filter(v=>valid.has(v.index)&&!used.has(v.index)&&used.add(v.index)).slice(0,20);

    if(selected.length<10){
      const fallback=list.filter(v=>!v.exclude).sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0));
      for(const v of fallback){
        const idx=Number(v.index);
        if(used.has(idx))continue;
        selected.push({index:idx,score:Number(v.score)||0,role:v.role||'대표 사진',reason:v.reason||'활용도 점수가 높음'});
        used.add(idx);
        if(selected.length>=wanted)break;
      }
    }
    selected.sort((a,b)=>a.index-b.index);
    return res.status(200).json({ok:true,selected});
  }catch(e){
    return res.status(500).json({error:e?.message||'최종 사진 선택 오류'});
  }
}
