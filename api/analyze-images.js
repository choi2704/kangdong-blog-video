import OpenAI from 'openai';

function safeJson(text) {
  const cleaned=String(text||'').replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim();
  return JSON.parse(cleaned);
}
function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
function allowedHost(host=''){
  const h=host.toLowerCase();
  return h==='pstatic.net'||h.endsWith('.pstatic.net')||h==='naver.net'||h.endsWith('.naver.net')||h==='naver.com'||h.endsWith('.naver.com');
}
function normalize(raw=''){
  let s=String(raw).trim().replace(/&amp;/g,'&');
  if(s.startsWith('//'))s='https:'+s;
  if(s.startsWith('http://'))s='https://'+s.slice(7);
  const u=new URL(s);
  if(u.protocol!=='https:'||!allowedHost(u.hostname))throw new Error('허용되지 않은 이미지 주소');
  if(u.hostname.includes('mblogthumb-phinf.pstatic.net'))u.searchParams.set('type','w400');
  return u.toString();
}
async function fetchDataUrl(raw){
  const url=normalize(raw);
  const referers=['https://m.blog.naver.com/','https://blog.naver.com/'];
  for(const referer of referers){
    try{
      const r=await fetch(url,{redirect:'follow',headers:{
        'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142 Safari/537.36',
        'accept':'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'referer':referer
      }});
      if(!r.ok)continue;
      const ct=(r.headers.get('content-type')||'').toLowerCase();
      if(!ct.startsWith('image/'))continue;
      const buf=Buffer.from(await r.arrayBuffer());
      if(!buf.length||buf.length>5*1024*1024)continue;
      const mime=ct.includes('png')?'image/png':ct.includes('webp')?'image/webp':'image/jpeg';
      return `data:${mime};base64,${buf.toString('base64')}`;
    }catch{}
  }
  return null;
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  try{
    if(!process.env.OPENAI_API_KEY)return res.status(500).json({error:'OPENAI_API_KEY가 없습니다.'});
    const {title='',text='',images=[]}=req.body||{};
    const list=(Array.isArray(images)?images:[]).slice(0,8);
    if(!list.length)return res.status(400).json({error:'사진이 없습니다.'});

    const prepared=(await Promise.all(list.map(async(v,i)=>{
      const index=Number(v?.index)||i+1;
      const dataUrl=await fetchDataUrl(String(v?.url||''));
      return dataUrl?{index,dataUrl}:null;
    }))).filter(Boolean);

    if(!prepared.length)return res.status(422).json({error:'이 묶음의 사진을 불러오지 못했습니다.'});

    const prompt=`강동자바라 유튜브 롱폼 영상용 사진 평가입니다.
블로그 제목: ${title}
본문 일부: ${String(text).slice(0,4500)}

사진별로 영상 활용도를 평가하세요.
- 전체 제품 모습, 설치 모습, 구조/부품 근접 사진은 높게 평가
- 거의 같은 중복 사진, 로고, 아이콘, 캡처, 글자 위주, 흐린 사진은 낮게 평가
- 사진에 실제로 보이는 것만 설명
- JSON만 출력

형식:
{"photos":[{"index":1,"score":90,"role":"완성 제품 전체","reason":"전체 구조가 잘 보임","description":"사진에 보이는 내용","exclude":false}]}`;

    const content=[{type:'input_text',text:prompt}];
    for(const p of prepared){
      content.push({type:'input_text',text:`다음은 사진 ${p.index}`});
      content.push({type:'input_image',image_url:p.dataUrl,detail:'low'});
    }

    const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const response=await client.responses.create({
      model:process.env.OPENAI_MODEL||'gpt-6-luna',
      input:[{role:'user',content}]
    });
    const parsed=safeJson(response.output_text||'{}');
    const photos=(Array.isArray(parsed.photos)?parsed.photos:[]).map(v=>({
      index:Number(v.index),
      score:clamp(Number(v.score)||0,0,100),
      role:String(v.role||''),
      reason:String(v.reason||''),
      description:String(v.description||''),
      exclude:!!v.exclude
    })).filter(v=>Number.isFinite(v.index));
    return res.status(200).json({ok:true,photos});
  }catch(e){
    return res.status(500).json({error:e?.message||'사진 묶음 분석 오류'});
  }
}
