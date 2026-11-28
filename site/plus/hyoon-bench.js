/* =====================================================================
   효온 벤치마킹 2차 반영 (로컬 시안) — docs/벤치마킹-2차-2026-11-27.md
   1 카드 하단 "저장 · 조회" 한 줄   2 홈 "부산대 이번 주 인기" 레일   3 상세 "관련 공고"
   4 상세 상단 요약 바(주최·마감·시상/혜택·대상) + 시상·혜택 칩   5 전체 탭 필터(바텀시트, 선택 기억)
   6 AD(광고) 표시는 promo.js   9 "이 공고를 저장한 부산대 학생" 분포(저장해야 보임, 5명 미만은 합침)
   12 문의처 표시.   (7 검색 단축키 · 8 알림 · 10 상세 탭은 이번에 제외)
   ※ 저장·조회 수와 분포는 시안용 예시 수치예요. 실서비스에서는 notice_stats RPC(docs/supabase-bench.sql)가 채워요.
   ===================================================================== */
(function(){
'use strict';
const W=window,HP=W.HP;if(!HP)return;
const h=s=>esc(s);
const T=fn=>{try{return fn()}catch(e){console.warn('[bench]',e);return undefined}};

/* ---------- 예시 수치 (공고 키로 항상 같은 값) ---------- */
function hash(s){let x=2166136261;for(let i=0;i<s.length;i++){x^=s.charCodeAt(i);x=Math.imul(x,16777619)}return x>>>0}
function statsOf(a){
 const k=noticeKey(a)||a.id,x=hash(k);
 const inside=a.origin&&a.origin.label==='교내';
 const view=Math.round((40+(x%360))*(inside?1.35:1));
 const save=Math.max(0,Math.round(view*(0.04+((x>>5)%9)/100)));
 return {view,save,score:save*3+view/10};
}
const SHOW_MIN=5;                 // 저장 5 미만이면 숫자를 숨김
const fmt=n=>n>=1000?(n/1000).toFixed(1).replace(/\.0$/,'')+'천':String(n);

/* ---------- 1) 카드 하단 한 줄 ---------- */
const _card=W.card;
if(typeof _card==='function'){
 W.card=function(a,why,inRail,popMeta){
  const html=_card.apply(this,arguments);
  if(!HP.flags.demoStats)return html;   /* 저장·조회 수는 실제 집계가 연결되기 전까지 운영에서 숨김 */
  const st=statsOf(a);
  const bits=[];
  if(st.save>=SHOW_MIN)bits.push(`저장 ${fmt(st.save)}`);
  bits.push(`조회 ${fmt(st.view)}`);
  const meta=`<span class="hp-cmeta">${bits.join(' · ')}</span>`;
  return html.replace(/(<span class="targets">[^<]*<\/span>)(<\/div><\/a>)/,`$1${meta}$2`);
 };
}

/* ---------- 2) 홈: 부산대 이번 주 인기 ----------
   운영(demoStats 꺼짐): 서버 함수 weekly_popular(최근 7일 본 사람·저장·원문 이동, 2명 미만 제외)로 실제 순위.
   시안(demoStats 켜짐): 예시 수치. */
const POP_KEY='hyp-weekly-pop',POP_TTL=10*60*1000;
let POP=null,popBusy=false;
function popCached(){try{const c=JSON.parse(sessionStorage.getItem(POP_KEY)||'null');if(c&&Date.now()-c.at<POP_TTL&&Array.isArray(c.rows))return c.rows}catch(e){}return null}
async function loadWeeklyPop(){
 if(POP||popBusy)return;
 const c=popCached();if(c){POP=c;return}
 const cfg=W.HYOON_SB;if(!cfg)return;
 popBusy=true;
 try{
  const r=await fetch(cfg.url+'/rest/v1/rpc/weekly_popular',{method:'POST',headers:{apikey:cfg.key,'Content-Type':'application/json'},body:JSON.stringify({p_days:7,p_limit:20,p_min:2})});
  if(!r.ok)return;
  const d=await r.json();if(!Array.isArray(d))return;
  POP=d.filter(x=>x&&typeof x.notice_key==='string').map(x=>({k:x.notice_key,v:+x.viewers||0,s:+x.savers||0,o:+x.outbound||0}));
  try{sessionStorage.setItem(POP_KEY,JSON.stringify({at:Date.now(),rows:POP}))}catch(e){}
  if(typeof W.renderMine==='function')W.renderMine();
 }catch(e){}finally{popBusy=false}
}
function realPopItems(){
 if(!POP)return [];
 const byKey=new Map();A.filter(active).forEach(a=>{const k=noticeKey(a);if(k&&!byKey.has(k))byKey.set(k,a);if(a.link&&!byKey.has(a.link))byKey.set(a.link,a)});
 const seen=new Set(),out=[];
 POP.forEach(p=>{const a=byKey.get(p.k);if(a&&!seen.has(a.id)){seen.add(a.id);out.push(a)}});
 return out.slice(0,12);
}
const _renderMine=W.renderMine;
W.renderMine=function(){
 _renderMine.apply(this,arguments);
 T(()=>{
  const out=document.getElementById('mine-out');if(!out||out.querySelector('#rail-weekly'))return;
  if(!HP.flags.demoStats){
   if(!POP){loadWeeklyPop();return}
   const items=realPopItems();if(items.length<3)return;   /* 실제 기록이 적으면 레일을 숨긴다 */
   const inside=items.filter(a=>a.origin&&a.origin.label==='교내').length;
   const html=railSection('부산대 이번 주 인기',`최근 7일 본 사람·저장·원문 이동 기준${inside?' · 교내 공고 '+inside+'건 포함':''}`,items,false,'','rail-weekly','',false);
   if(html)out.insertAdjacentHTML('afterbegin',html);
   if(typeof observeReveals==='function')observeReveals();
   return;
  }
  const items=A.filter(active).map(a=>({a,s:statsOf(a)})).sort((x,y)=>y.s.score-x.s.score).slice(0,12).map(x=>x.a);
  if(items.length<4)return;
  const inside=items.filter(a=>a.origin&&a.origin.label==='교내').length;
  const html=railSection('부산대 이번 주 인기',`저장·조회 기준 · 교내 공고 ${inside}건 포함 · 시안 예시 수치`,items,false,'','rail-weekly','',false);
  if(html)out.insertAdjacentHTML('afterbegin',html);
  if(typeof observeReveals==='function')observeReveals();
 });
};

/* ---------- 시상·혜택 요약(본문에서 뽑기) ---------- */
function awards(a){
 const t=[a.benefit,a.title].join(' ').replace(/\s+/g,' ');const out=[];
 const money='([\\d,.]+\\s*(?:억|천만|백만|만)?\\s*원)';
 let m=t.match(new RegExp('총\\s*상금\\s*(?:규모\\s*)?'+money));if(m)out.push(['총 상금',m[1].replace(/\s+/g,'')]);
 m=t.match(new RegExp('(?:대상|1등|최우수상?)\\s*(?:[:：(]\\s*)?(?:1[건팀명]\\s*)?'+money));if(m)out.push(['1등 상금',m[1].replace(/\s+/g,'')]);
 m=t.match(new RegExp('(월\\s*(?:최대\\s*)?[\\d,.]+\\s*만\\s*원)'));if(m)out.push(['월 지급',m[1].replace(/\s+/g,'')]);
 m=t.match(new RegExp('(?:장학금|지원금|활동비|수당)\\s*(?:[:：]\\s*)?(?:1인\\s*)?'+money));if(m&&out.length<3)out.push([/장학/.test(m[0])?'장학금':'지원금',m[1].replace(/\s+/g,'')]);
 const perks=[...new Set((t.match(/채용\s*(?:우대|가산점|서류\s*(?:전형\s*)?면제)|입사\s*가산점|인턴십?\s*(?:기회|연계)|해외\s*연수|수료증|인증서|학점\s*인정|비교과\s*마일리지|자원봉사시간|교육비\s*무료|참가비\s*무료/g)||[]).map(x=>x.replace(/\s+/g,' ')))].slice(0,3);
 if(perks.length)out.push(['특전·혜택',perks.join(' · ')]);
 return out.slice(0,4);
}

/* ---------- 필터(5) ---------- */
const FKEY='hp-filters';
const BEN={'상금·시상':/상금|시상|대상|최우수|우수상|장려/,'장학금·지원금':/장학|지원금|생활비|등록금/,'수당·급여':/수당|급여|월\s*\d|활동비|인건비/,'수료증·인증':/수료증|인증서|마일리지|학점/,'채용·인턴 연계':/채용|인턴|서류\s*(?:전형\s*)?면제|가산점/,'무료':/무료|전액\s*(?:지원|무료)/};
const GROUPS=[
 {k:'due',name:'마감',opts:[['0','오늘'],['3','3일 이내'],['7','7일 이내'],['14','14일 이내']],one:true},
 {k:'grade',name:'학년',opts:[['1','1학년'],['2','2학년'],['3','3학년'],['4','4학년']]},
 {k:'course',name:'과정',opts:[['학부','학부'],['대학원','대학원']]},
 {k:'ben',name:'혜택',opts:Object.keys(BEN).map(x=>[x,x])},
 {k:'poster',name:'포스터',opts:[['1','포스터 있는 공고만']],one:true}
];
function loadF(){try{const o=JSON.parse(localStorage.getItem(FKEY)||'{}');return typeof o==='object'&&o?o:{}}catch{return {}}}
function saveF(f){try{localStorage.setItem(FKEY,JSON.stringify(f))}catch{}}
let F=loadF();
const nActive=()=>GROUPS.reduce((n,g)=>n+((F[g.k]||[]).length?1:0),0);
function pass(a,f){
 const d=f.due&&f.due[0];if(d!=null&&d!==''){const l=dleft(a);if(l===null||l<0||l>+d)return false}
 if((f.grade||[]).length){if(a.grades&&!f.grade.some(g=>a.grades.includes(+g)))return false}
 if((f.course||[]).length){if(a.course!=='전체'&&!f.course.includes(a.course))return false}
 if((f.ben||[]).length){const t=[a.benefit,a.title].join(' ');if(!f.ben.some(b=>BEN[b].test(t)))return false}
 if(f.poster&&f.poster[0]&&!(a.posters&&a.posters.length))return false;
 return true;
}
let baseList=[];
const noticeOfLi=li=>{const c=li.querySelector('a.card');const id=c&&(c.getAttribute('href')||'').slice(1);return id?A.find(x=>x.id===id):null};
const _renderAll=W.renderAll;
W.renderAll=function(){
 _renderAll.apply(this,arguments);
 T(()=>{
  const grid=document.getElementById('all-grid');if(!grid)return;
  baseList=[...grid.querySelectorAll('.card-item')].map(li=>({li,a:noticeOfLi(li)})).filter(x=>x.a);
  let shown=baseList.length;
  if(nActive()){baseList.forEach(({li,a})=>{if(!pass(a,F)){li.remove();shown--}})}
  const cnt=document.getElementById('all-count');
  if(cnt&&nActive())cnt.textContent=cnt.textContent.replace(/\s*\d+건.*$/,'')+` ${shown}건 · 필터 ${nActive()}개 적용 중`;
  if(nActive()&&!shown)grid.innerHTML=`<li class="empty"><p>필터에 맞는 공고가 없어요</p><button type="button" class="btn-outline" data-hp-fclear>필터 모두 지우기</button></li>`;
  paintFilterBtn();
 });
};
function ensureFilterBtn(){
 const bar=document.querySelector('#all .origin-bar');if(!bar||bar.querySelector('.hp-filter-btn'))return;
 bar.insertAdjacentHTML('beforeend','<button type="button" class="hp-filter-btn" data-hp-filter aria-haspopup="dialog">필터<b class="hp-filter-n" hidden></b></button>');
}
function paintFilterBtn(){
 ensureFilterBtn();const b=document.querySelector('.hp-filter-btn .hp-filter-n');if(!b)return;
 const n=nActive();b.hidden=!n;b.textContent=n;
}
function openFilter(){
 const draft=JSON.parse(JSON.stringify(F));
 const d=document.createElement('dialog');d.className='hp-sheet hp-fsheet';d.setAttribute('aria-label','필터');
 const cnt=()=>baseList.filter(x=>pass(x.a,draft)).length;
 const draw=()=>{
  d.innerHTML=`<div class="hp-sheet-in"><div class="hp-sheet-grip" aria-hidden="true"></div><h2>필터</h2>
  ${GROUPS.map(g=>`<fieldset class="hp-fgroup"><legend>${g.name}${g.one?'':' <small>(여러 개 선택)</small>'}</legend><div class="hp-chips">${g.opts.map(([v,l])=>`<label class="hp-chip"><input type="checkbox" data-g="${g.k}" value="${h(v)}"${(draft[g.k]||[]).includes(v)?' checked':''}><span>${h(l)}</span></label>`).join('')}</div></fieldset>`).join('')}
  <div class="hp-fact"><button type="button" class="btn-outline" data-fclear>초기화</button><button type="button" class="btn-fill" data-fgo>결과 ${cnt()}건 보기</button></div>
  <p class="hp-fine">선택한 필터는 이 브라우저에 기억돼요. 학년·과정·혜택은 공고 본문에서 뽑은 값이라 원문과 다를 수 있어요.</p></div>`;
 };
 draw();document.body.appendChild(d);d.showModal();
 d.addEventListener('change',e=>{const i=e.target.closest('input[data-g]');if(!i)return;const g=GROUPS.find(x=>x.k===i.dataset.g),cur=draft[g.k]||[];
  draft[g.k]=i.checked?(g.one?[i.value]:[...cur,i.value]):cur.filter(v=>v!==i.value);if(!draft[g.k].length)delete draft[g.k];
  d.querySelector('[data-fgo]').textContent=`결과 ${cnt()}건 보기`;
  if(g.one&&i.checked)d.querySelectorAll(`input[data-g=${g.k}]`).forEach(o=>{if(o!==i)o.checked=false})});
 d.addEventListener('click',e=>{
  if(e.target===d)return d.close();
  if(e.target.closest('[data-fclear]')){Object.keys(draft).forEach(k=>delete draft[k]);draw();return}
  if(e.target.closest('[data-fgo]')){F=draft;saveF(F);d.close();W.renderAll();HP.log&&HP.log('filter',{tab:'all',extra:{filters:Object.keys(F)}});}
 });
 d.addEventListener('close',()=>d.remove());
 const t=d.querySelector('h2');t.tabIndex=-1;t.style.outline='none';t.focus();
}
document.addEventListener('click',e=>{
 if(e.target.closest('[data-hp-filter]')){openFilter();return}
 if(e.target.closest('[data-hp-fclear]')){F={};saveF(F);W.renderAll()}
});

/* ---------- 상세: 요약 바 · 시상 칩 · 문의 · 관련 공고 · 저장 학생 분포 ---------- */
const COLLEGE_W=[['공과대학',35],['자연과학대학',9.5],['경제통상대학',8.7],['인문대학',8.1],['경영대학',7.7],['생명자원과학대학',5.9],['사범대학',5.8],['정보의생명공학대학',5.8],['사회과학대학',4.9],['나노과학기술대학',2.4],['그 밖의 단과대',6]];
const GRADE_W=[['1학년',15],['2학년',25],['3학년',30],['4학년',25],['대학원·5학년+',5]];
function dist(a,W_,n,seedTag){
 const x=hash((noticeKey(a)||a.id)+seedTag);
 const w=W_.map(([k,v],i)=>[k,v*(0.55+(((x>>(i*2))&63)/100))]);const tot=w.reduce((s,y)=>s+y[1],0);
 let rows=w.map(([k,v])=>[k,Math.round(n*v/tot)]);
 const small=rows.filter(r=>r[1]<SHOW_MIN),big=rows.filter(r=>r[1]>=SHOW_MIN);
 const rest=small.reduce((s,r)=>s+r[1],0);
 big.sort((p,q)=>q[1]-p[1]);
 if(rest>0)big.push(['그 외 (5명 미만 집단 합계)',rest]);
 return big;
}
function summaryBar(a){
 const pr=awards(a);const aw=pr.length?pr.map(([k,v])=>`${k} ${v}`).slice(0,2).join(' · '):(a.benefit||'').replace(/\s+/g,' ').slice(0,38)||'원문 확인';
 const inside=a.origin&&a.origin.label==='교내';
 const d=a.end?`${HP.ddayText(a.end)} · ${HP.fmtDate(a.end)}`:'마감일 미확인';
 const tg=(a.target||'').replace(/\s+/g,' ').slice(0,40)||'전체 대상';
 return `<div class="hp-summary" role="group" aria-label="공고 요약">
  <div><span>주최</span><b>${h(a.org||'원문 확인')}${a.origin&&a.origin.label?`<span class="hp-origin" title="자동으로 분류한 결과라 틀릴 수 있어요">${h(a.origin.label)}</span>`:''}</b></div>
  <div><span>마감</span><b>${h(d)}</b></div>
  <div><span>시상·혜택</span><b>${h(aw)}</b></div></div>
  ${pr.length>2?`<div class="hp-awards">${pr.map(([k,v])=>`<span class="hp-aw"><em>${h(k)}</em>${h(v)}</span>`).join('')}</div>`:''}
  <p class="hp-ask"><b>문의</b> ${inside?`교내 공고 · 담당 부서 ${h(a.org||'')} · `:''}${a.link?`<a href="${h(a.link)}" target="_blank" rel="noopener noreferrer" data-hp-ask>원문 페이지의 담당자·연락처 보기</a>`:'원문에서 담당자를 확인해 주세요'}</p>`;
}
function related(a){
 const base=A.filter(x=>x.id!==a.id&&active(x));
 const sc=x=>(x.sub===a.sub?3:0)+(x.org&&x.org===a.org?3:0)+((x.origin&&a.origin&&x.origin.label===a.origin.label)?1:0)+(x.course===a.course?.5:0);
 return base.map(x=>[x,sc(x)]).filter(p=>p[1]>=3).sort((p,q)=>q[1]-p[1]||cmpEnd(p[0],q[0])).slice(0,4).map(p=>p[0]);
}
function statsBox(a){
 const st=statsOf(a),saved=isSaved(a.id);
 if(st.save<10)return `<div class="hp-detail-box hp-stat"><p><b>이 공고를 저장한 부산대 학생</b></p><p class="hp-sub">아직 모이는 중이에요. 10명이 넘으면 단과대·학년 분포를 보여 드려요.</p></div>`;
 if(!saved)return `<div class="hp-detail-box hp-stat locked"><p><b>이 공고를 저장한 부산대 학생 ${st.save}명</b></p><p class="hp-sub">저장하면 어느 단과대·학년이 많이 저장했는지 볼 수 있어요.</p><button type="button" class="btn-outline" data-hp-statsave>저장하고 보기</button></div>`;
 const bar=rows=>rows.map(([k,n])=>`<li><span>${h(k)}</span><i style="--w:${Math.round(100*n/st.save)}%"></i><b>${Math.round(100*n/st.save)}%</b></li>`).join('');
 return `<div class="hp-detail-box hp-stat"><p><b>이 공고를 저장한 부산대 학생 ${st.save}명</b> <span class="hp-ex">시안 예시</span></p>
  <h5>단과대</h5><ul class="hp-bars">${bar(dist(a,COLLEGE_W,st.save,'c'))}</ul><h5>학년</h5><ul class="hp-bars">${bar(dist(a,GRADE_W,st.save,'g'))}</ul>
  <p class="hp-fine">이용 기록 분석에 동의한 학생의 기록만 모으고, ${SHOW_MIN}명 미만 집단은 합쳐서 보여 드려요.</p></div>`;
}
function decorate(a){
 const dc=document.getElementById('dc');if(!dc||!a)return;
 dc.querySelectorAll('.hp-bench').forEach(x=>x.remove());
 const main=dc.querySelector('.dmain'),side=dc.querySelector('.dside');
 if(main){
  const s=document.createElement('div');s.className='hp-bench hp-summary-wrap';s.innerHTML=summaryBar(a);main.insertBefore(s,main.firstChild);
  const rel=related(a);
  if(rel.length){const r=document.createElement('section');r.className='hp-bench hp-related';r.innerHTML=`<h3>이 공고도 보기</h3><ul class="rail" tabindex="0" aria-label="관련 공고">${rel.map(x=>W.card(x,undefined,true)).join('')}</ul>`;main.appendChild(r)}
 }
 if(side){
  if(HP.flags.demoStats){const box=document.createElement('div');box.className='hp-bench';box.innerHTML=statsBox(a);side.insertBefore(box,side.querySelector('.report'))}
  if(a.posters&&a.posters[0]&&!side.querySelector('.hp-sidepost')){side.insertAdjacentHTML('afterbegin',`<a class="hp-bench hp-sidepost" href="${h(a.posters[0])}" target="_blank" rel="noopener noreferrer" aria-label="포스터 원본 크게 보기"><img src="${h(a.posters[0])}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>`)}
 }
}
/* 정보 칸 정리: 빈 칸("원문 확인 필요")은 한 줄로 합치고, 길이가 긴 칸은 넓게, 요약 바와 겹치는 "주최 구분"은 숨김 */
function compact(){
 const dc=document.getElementById('dc');if(!dc)return;
 const grid=dc.querySelector('.info-grid');if(!grid)return;
 const miss=[];
 grid.querySelectorAll('.info-cell').forEach(c=>{
  const dt=(c.querySelector('dt')||{}).textContent||'',dd=c.querySelector('dd'),txt=((dd&&dd.textContent)||'').trim();
  if(dt.trim()==='주최 구분'){c.classList.add('hp-hide');return}
  if(txt.length<16&&/^(원문 ?(확인|참조)( ?필요)?|원문·첨부 참조|-|)$/.test(txt)){c.classList.add('hp-hide');miss.push(dt.trim());return}
  if(txt.length>30)c.classList.add('wide');
 });
 /* 짝이 없는 칸은 한 줄로 늘려서 회색 빈칸이 남지 않게 */
 let pend=null;
 [...grid.querySelectorAll('.info-cell:not(.hp-hide)')].forEach(c=>{
  if(c.classList.contains('wide')){if(pend){pend.classList.add('wide');pend=null}}
  else if(pend)pend=null;else pend=c;
 });
 if(pend)pend.classList.add('wide');
 dc.querySelectorAll('.hp-missing').forEach(x=>x.remove());
 if(miss.length)grid.insertAdjacentHTML('afterend','<p class="hp-missing">원문에서 확인해 주세요: '+miss.join(' · ')+'</p>');
}
HP.on('detail',a=>T(()=>{decorate(a);compact()}));
HP.on('saved',()=>T(()=>{const a=HP.findNotice(decodeURIComponent(location.hash.slice(1)));if(a)decorate(a)}));
document.addEventListener('click',e=>{
 if(e.target.closest('[data-hp-statsave]')){const b=document.querySelector('#dc .bm-toggle');if(b)b.click();return}
 if(e.target.closest('[data-hp-ask]')){const a=HP.findNotice(decodeURIComponent(location.hash.slice(1)));HP.log&&a&&HP.log('outbound',{notice_key:noticeKey(a),tab:'detail',method:'ask'})}
});

HP.on('ready',()=>T(()=>{paintFilterBtn();if(typeof renderAll==='function')W.renderAll()}));
})();
