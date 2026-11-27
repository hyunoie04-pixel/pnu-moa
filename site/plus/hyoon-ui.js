/* =====================================================================
   효온 UI 개편 1차 (로컬 시안) — 규칙은 preview/DESIGN.md
   - 휴대폰: 아래 내비(내게 맞는·전체·달력·저장·더보기) + 더보기 시트, 첫 방문 맞춤 설정 접기
   - 공통: 마감 배지에 실제 날짜 붙이기
   ===================================================================== */
(function(){
'use strict';
const W=window,HP=W.HP||{};
const MQ=matchMedia('(max-width:720px)');
const h=s=>esc(s);

/* ---------- 마감 배지: "D-3" → "D-3 · 12.1" ---------- */
const _dd=W.ddayBadge;
if(typeof _dd==='function'){
 W.ddayBadge=function(a,forceEnded){
  const out=_dd(a,forceEnded);
  if(forceEnded||!a||!a.end||typeof dleft!=='function')return out;
  const d=dleft(a);if(d===null||d<0)return out;
  const md=(+String(a.end).slice(5,7))+'.'+(+String(a.end).slice(8,10));
  return out.replace(/<\/span>$/,`<small class="dday-date">· ${md}</small></span>`);
 };
}

/* ---------- 아래 내비 ---------- */
const I={
 mine:'<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
 all:'<path d="M4 6h16M4 12h16M4 18h10"/>',
 calendar:'<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
 saved:'<path d="M6.5 4h11v16l-5.5-4-5.5 4z"/>',
 more:'<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>'
};
const MAIN=[['mine','내게 맞는'],['all','전체'],['calendar','달력'],['saved','저장'],['more','더보기']];
const MORE_ALL=[['weekly','효온 주간','이번 주 마감 공고 정리'],['promo','홍보 게시판','동아리·학회·교내 행사'],['teams','팀원 모집','공모전 팀 만들기·찾기'],['me','마이페이지','내 일정·포트폴리오·팀'],['fit','내 맞춤 설정','단과대·학과·학년 바꾸기'],['feedback','의견 보내기','틀린 정보·바라는 기능'],['ig','효온 인스타그램','매주 마감 카드뉴스']];
const MORE=MORE_ALL.filter(m=>m[0]!=='teams'||(HP.flags&&HP.flags.teams!==false));
const svg=k=>`<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${I[k]}</svg>`;
function buildNav(){
 if(document.getElementById('hp-bnav'))return;
 const nav=document.createElement('nav');nav.id='hp-bnav';nav.className='hp-bnav';nav.setAttribute('aria-label','주요 메뉴');
 nav.innerHTML=MAIN.map(([k,l])=>`<button type="button" data-go="${k}"${k==='more'?' aria-haspopup="dialog"':''}>${svg(k)}<span>${l}</span>${k==='saved'?'<em class="hp-bnav-n" hidden></em>':''}</button>`).join('');
 document.body.appendChild(nav);
 nav.addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(!b)return;const k=b.dataset.go;
  if(k==='more')return openMore();
  if(location.hash==='#'+k||(k==='mine'&&!location.hash))W.scrollTo({top:0,behavior:'smooth'});else location.hash=k;
 });
 syncNav();
}
function openMore(){
 const u=HP.db&&HP.db.me&&HP.db.me();
 const d=document.createElement('dialog');d.className='hp-sheet';d.setAttribute('aria-label','더보기');
 d.innerHTML=`<div class="hp-sheet-in"><div class="hp-sheet-grip" aria-hidden="true"></div><h2>더보기</h2><ul>${MORE.map(([k,l,s])=>`<li><button type="button" data-more="${k}"><b>${l}</b><span>${k==='me'&&!u?'로그인하고 내 일정·포트폴리오 모으기':s}</span></button></li>`).join('')}</ul><button type="button" class="btn-outline hp-sheet-close" data-close>닫기</button></div>`;
 document.body.appendChild(d);d.showModal();
 d.addEventListener('click',e=>{
  if(e.target===d||e.target.closest('[data-close]'))return d.close();
  const b=e.target.closest('[data-more]');if(!b)return;const k=b.dataset.more;d.close();
  if(k==='ig'){try{W.track&&W.track('outbound',{notice_title:'instagram @hyon.kr',sub:null,tab:'more'})}catch{}W.open('https://www.instagram.com/hyon.kr/','_blank','noopener');return}
  if(k==='me'&&!u&&HP.openLogin){HP.openLogin();return}
  if(k==='fit'){fitOpen=true;location.hash='mine';setTimeout(()=>{syncFit();const p=document.getElementById('fit-panel');if(p){const sum=document.getElementById('fit-summary-wrap');if(sum&&!sum.hidden){const e2=document.getElementById('fit-edit');if(e2)e2.click()}p.scrollIntoView({behavior:'smooth',block:'start'});const c=document.getElementById('college');if(c&&!c.closest('[hidden]'))setTimeout(()=>c.focus({preventScroll:true}),350)}},60);return}
  location.hash=k;
 });
 d.addEventListener('close',()=>d.remove());
 const ttl=d.querySelector('h2');ttl.tabIndex=-1;ttl.style.outline='none';ttl.focus();
}
function curTab(){
 const hh=decodeURIComponent(location.hash.slice(1));
 if(!hh)return 'mine';
 if(typeof TABS!=='undefined'&&TABS.includes(hh))return hh;
 if(typeof A!=='undefined'&&A.some(a=>a.id===hh))return 'detail';
 return hh;
}
function syncNav(){
 const t=curTab();
 document.body.classList.toggle('hp-on-detail',t==='detail');
 const nav=document.getElementById('hp-bnav');if(!nav)return;
 const main=MAIN.map(x=>x[0]);
 nav.querySelectorAll('[data-go]').forEach(b=>{const on=b.dataset.go===t||(b.dataset.go==='more'&&!main.includes(t)&&t!=='detail');b.classList.toggle('on',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
 const sb=document.getElementById('saved-badge'),n=nav.querySelector('.hp-bnav-n');
 if(sb&&n){n.hidden=sb.hidden||!+sb.textContent;n.textContent=sb.textContent}
}
addEventListener('hashchange',syncNav);

/* ---------- 첫 방문 맞춤 설정: 휴대폰에서는 접어 두고 공고를 먼저 ---------- */
let fitOpen=false;
function syncFit(){
 const p=document.getElementById('fit-panel'),sum=document.getElementById('fit-summary-wrap');if(!p)return;
 if(!p.querySelector('.hp-fit-cta')){
  p.insertAdjacentHTML('afterbegin',`<div class="hp-fit-cta"><div><b>단과대·학년을 고르면</b><span>지금 지원할 수 있는 공고만 골라 드려요</span></div><button type="button" class="hp-fit-open">맞춤 설정</button></div>`);
  p.querySelector('.hp-fit-open').onclick=()=>{fitOpen=true;syncFit();const c=document.getElementById('college');if(c)c.focus()};
 }
 const notSet=!!(sum&&sum.hidden);
 p.classList.toggle('hp-fit-collapsed',MQ.matches&&notSet&&!fitOpen);
}
function watchFit(){
 const sum=document.getElementById('fit-summary-wrap');
 if(sum)new MutationObserver(()=>{if(!sum.hidden)fitOpen=false;syncFit()}).observe(sum,{attributes:true,attributeFilter:['hidden']});
 const form=document.getElementById('form');if(form)form.addEventListener('submit',()=>{fitOpen=false;setTimeout(syncFit,0)});
 MQ.addEventListener?MQ.addEventListener('change',syncFit):MQ.addListener(syncFit);
 syncFit();
}

/* ---------- 저장 개수 등 원본이 바꾸는 값 따라가기 ---------- */
function watchSaved(){const sb=document.getElementById('saved-badge');if(sb)new MutationObserver(syncNav).observe(sb,{attributes:true,childList:true,characterData:true,subtree:true})}

function start(){buildNav();watchFit();watchSaved();syncNav()}
if(HP.on)HP.on('ready',start);else if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
HP.on&&HP.on('route',syncNav);
})();

/* 탭을 바꾸면 새 탭의 맨 위에서 시작 (공고 상세에서 목록으로 돌아올 때는 보던 자리 유지) */
(function(){
 const W=window;
 const tabOf=()=>{const h=decodeURIComponent(location.hash.slice(1));return h===''?'mine':h};
 const isTab=h=>typeof TABS!=='undefined'&&TABS.includes(h);
 let prev=tabOf();
 W.addEventListener('hashchange',()=>{const cur=tabOf();
  if(cur!==prev&&isTab(cur)&&isTab(prev))setTimeout(()=>W.scrollTo({top:0,left:0,behavior:'instant'}),0);
  prev=cur});
})();
