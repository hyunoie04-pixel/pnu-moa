/* =====================================================================
   효온 플러스 (로컬 시안) · core
   - 로그인/회원 데이터는 이 브라우저(localStorage 'hyp-db')에만 저장하는 "가짜 백엔드"로 동작한다.
   - 실제 서비스로 옮길 때는 HPDB 의 메서드만 Supabase 호출로 바꾸면 되도록 테이블 구조를 맞춰 두었다
     (docs/supabase-plus-schema.sql 참고).
   - 원본 template.html 의 전역 함수(build, renderMine, renderDetail, track …)를 감싸서 기능을 얹는다.
   ===================================================================== */
(function(){
'use strict';
const W=window;
if(!W.HPQ)W.HPQ={read:()=>[],push(){},clear(){}};   /* 운영에는 preview-guard.js 가 없어 이벤트 큐 자리만 둔다 */
const DB_KEY='hyp-db',ADMIN_KEY='hyp-admin';
const nowISO=()=>new Date().toISOString();
const uid=p=>(p||'id')+'-'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const h=s=>esc(s);

/* ---------- 희망 직무 분류 (공고 매칭 키워드 포함) ---------- */
const JOBS=[
 {id:'dev',name:'개발·소프트웨어',kw:['개발','소프트웨어','SW','코딩','프로그래밍','해커톤','코딩테스트','웹','앱','IT','클라우드','PCC']},
 {id:'data',name:'데이터·AI',kw:['데이터','AI','인공지능','머신러닝','빅데이터','통계','분석','LLM']},
 {id:'rnd',name:'연구개발·이공계',kw:['연구','R&D','실험','공학','기술','연구실','URP','학술']},
 {id:'mfg',name:'생산·품질·설비',kw:['생산','품질','설비','제조','공정','반도체','자동차','조선','기계','소재']},
 {id:'plan',name:'기획·전략·PM',kw:['기획','전략','PM','아이디어','컨설팅','서비스','정책제안']},
 {id:'mkt',name:'마케팅·홍보',kw:['마케팅','홍보','광고','브랜드','서포터즈','SNS','기자단','커뮤니케이터','앰배서더']},
 {id:'design',name:'디자인',kw:['디자인','UX','UI','일러스트','포스터','시각','패키지']},
 {id:'media',name:'미디어·콘텐츠',kw:['영상','콘텐츠','방송','미디어','숏폼','유튜브','사진','웹툰','출판']},
 {id:'biz',name:'경영·인사·회계',kw:['경영','인사','회계','재무','HR','세무','재경']},
 {id:'fin',name:'금융·경제',kw:['금융','증권','은행','보험','투자','경제','한국은행','핀테크']},
 {id:'trade',name:'무역·물류·영업',kw:['무역','물류','수출','KOTRA','유통','영업','해운','항만']},
 {id:'public',name:'공공기관·공기업',kw:['공공기관','공기업','공단','공사','공무원','NCS','행정','정책','청년인턴']},
 {id:'edu',name:'교육·상담',kw:['교육','멘토','멘토링','튜터','교사','강사','상담','학습']},
 {id:'health',name:'의료·간호·보건',kw:['의료','간호','병원','보건','약학','임상','바이오','의생명','헬스케어']},
 {id:'law',name:'법률·인권',kw:['법률','법학','인권','변호사','노무','법무']},
 {id:'global',name:'해외·국제',kw:['해외','국제','교환','글로벌','유학','어학','파견','장학생 선발']},
 {id:'startup',name:'창업',kw:['창업','스타트업','사업화','예비창업','창업장학']},
 {id:'grad',name:'대학원 진학',kw:['대학원','석사','박사','입시설명회','연구원','학술활동']},
 {id:'env',name:'환경·에너지',kw:['환경','에너지','탄소','수소','기후','ESG','친환경']},
 {id:'social',name:'사회공헌·지역',kw:['봉사','사회공헌','NGO','비영리','지역','로컬','청년마을']},
 {id:'culture',name:'문화·예술·관광',kw:['문화','예술','관광','전시','공연','축제','K-콘텐츠']},
 {id:'none',name:'아직 모르겠어요',kw:[]}
];
const JOB_MAX=3;
const jobName=id=>(JOBS.find(j=>j.id===id)||{}).name||id;

/* ---------- 가짜 백엔드 (localStorage) ---------- */
function blank(){return {v:1,users:[],session:null,cal:[],pf:[],teams:[],apps:[],reports:[],seekers:[],invites:[],
 profile_history:[],dislikes:[],reviews:[],notifs:[],seeded:false}}
function load(){try{const d=JSON.parse(localStorage.getItem(DB_KEY)||'null');if(d&&d.v===1)return Object.assign(blank(),d)}catch{}return blank()}
let db=load();
function persist(){try{localStorage.setItem(DB_KEY,JSON.stringify(db))}catch{toast('브라우저 저장 공간이 가득 찼어요.')}}
W.addEventListener('storage',e=>{if(e.key===DB_KEY){db=load();HP.emit('db')}});

function newUser(email,provider){
 return {id:uid('u'),email:email||'',provider,verified:false,pnu_email:'',pnu_verified_at:null,nickname:'',course:'학부',college:'',dept:'',grade:'',jobs:[],subs:[],
  skills:[],bio:'',contact:'',consent:{terms:false,privacy:false,personalize:false,research:false,notify:false,at:null},onboarded:false,created_at:nowISO(),last_login:nowISO()};
}
const HPDB={
 me(){return db.session?db.users.find(u=>u.id===db.session)||null:null},
 user(id){return db.users.find(u=>u.id===id)||null},
 signIn(email,provider){
  email=String(email||'').trim().toLowerCase();
  let u=db.users.find(x=>x.email===email&&x.provider===provider&&!x.demo);
  const isNew=!u;
  if(!u){u=newUser(email,provider);db.users.push(u)}else u.last_login=nowISO();
  db.session=u.id;persist();return {user:u,isNew};
 },
 /* 실제 로그인(Supabase) 계정을 이 브라우저 DB에 올린다. patch.id 는 서버 회원 id */
 adopt(patch){
  let u=db.users.find(x=>x.id===patch.id);const isNew=!u;
  if(!u){u=Object.assign(newUser(patch.email||'',patch.provider||'oauth'),{id:patch.id});db.users.push(u)}
  Object.assign(u,patch,{last_login:nowISO()});
  db.session=u.id;persist();return {user:u,isNew};
 },
 signOut(){db.session=null;persist()},
 updateMe(patch){
  const u=this.me();if(!u)return null;
  /* 소속·학년·희망 직무가 바뀌면 이력을 남긴다 (예측 모델은 "그 행동을 했을 때"의 값이 필요) */
  const F=['course','college','dept','grade','jobs'];
  const snap=o=>JSON.stringify(F.map(k=>o[k]||''));
  const before=snap(u);
  Object.assign(u,patch,{updated_at:nowISO()});
  if(u.onboarded&&snap(u)!==before)db.profile_history.push({id:uid('ph'),uid:u.id,course:u.course,college:u.college,dept:u.dept,grade:u.grade,jobs:(u.jobs||[]).slice(),valid_from:nowISO()});
  persist();return u},
 deleteMe(){
  const u=this.me();if(!u)return;
  const id=u.id;
  db.cal=db.cal.filter(x=>x.uid!==id);db.pf=db.pf.filter(x=>x.uid!==id);
  const myTeams=db.teams.filter(t=>t.leader===id).map(t=>t.id);
  db.teams=db.teams.filter(t=>t.leader!==id);db.apps=db.apps.filter(a=>a.uid!==id&&!myTeams.includes(a.team_id));
  ['profile_history','dislikes','reviews','notifs'].forEach(k=>{db[k]=(db[k]||[]).filter(x=>x.uid!==id)});
  db.seekers=(db.seekers||[]).filter(s=>s.uid!==id);db.invites=(db.invites||[]).filter(x=>x.to!==id&&x.from!==id&&!myTeams.includes(x.team_id));
  db.users=db.users.filter(x=>x.id!==id);db.session=null;persist();
  try{const q=HPQ.read().filter(e=>e.user_id!==id);localStorage.setItem('hyp-events',JSON.stringify(q))}catch{}
  try{const ss=JSON.parse(localStorage.getItem('hyp-sessions')||'[]').map(s=>s.user_id===id?Object.assign({},s,{user_id:null}):s);localStorage.setItem('hyp-sessions',JSON.stringify(ss))}catch{}
 },
 /* 서버 저장을 쓰는 표(팀·지원·초대·팀 구해요)는 서버가 정답이라 통째로 바꾼다 */
 setTable(table,rows){db[table]=rows;persist();HP.emit('db')},
 /* 서버가 보내 준 회원 카드(닉네임·소속 등)를 다른 회원 정보로 합친다. 내 정보는 건드리지 않는다 */
 mergeUsers(cards){
  cards.forEach(c=>{if(db.session&&c.id===db.session)return;
   let u=db.users.find(x=>x.id===c.id);
   if(!u){u={id:c.id,email:'',provider:'oauth',course:'학부',jobs:[],subs:[],consent:{},onboarded:true,created_at:nowISO()};db.users.push(u)}
   Object.assign(u,c)});
  persist()},
 replaceRows(table,uid,rows){db[table]=(db[table]||[]).filter(x=>x.uid!==uid).concat(rows);persist();HP.emit('db')},
 list(table,filter){return db[table].filter(filter||(()=>true))},
 insert(table,row){const r=Object.assign({id:uid(table),created_at:nowISO()},row);db[table].push(r);persist();HP.emit('db');return r},
 update(table,id,patch){const r=db[table].find(x=>x.id===id);if(r){Object.assign(r,patch,{updated_at:nowISO()});persist();HP.emit('db')}return r},
 remove(table,id){db[table]=db[table].filter(x=>x.id!==id);persist();HP.emit('db')},
 raw(){return db},
 reset(){db=blank();persist();HP.emit('db')}
};

/* ---------- 작은 UI 도구 ---------- */
let toastT=null;
function toast(msg){
 let t=document.getElementById('hp-toast');
 if(!t){t=document.createElement('div');t.id='hp-toast';t.className='hp-toast';t.setAttribute('role','status');t.setAttribute('aria-live','polite');document.body.appendChild(t)}
 t.textContent=msg;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),2600);
}
function modal(html,opt){
 opt=opt||{};
 const d=document.createElement('dialog');
 d.className='hp-modal'+(opt.wide?' wide':'');
 d.innerHTML=`<div class="hp-modal-in"><button type="button" class="hp-x" data-close aria-label="닫기">×</button>${html}</div>`;
 document.body.appendChild(d);
 d.addEventListener('click',e=>{if(e.target===d||e.target.closest('[data-close]'))d.close()});
 d.addEventListener('close',()=>{d.remove();if(opt.onClose)opt.onClose()});
 d.showModal();
 const f=d.querySelector('[autofocus]');if(f)f.focus();
 return d;
}
function ddayText(end){
 if(!end)return '마감일 미확인';
 const t=new Date(todayKST()+'T00:00:00Z'),e=new Date(end+'T00:00:00Z');const d=Math.round((e-t)/864e5);
 return d<0?'마감 지남':d===0?'오늘 마감':'D-'+d;
}
function fmtDate(s){if(!s)return '';const m=String(s).match(/(\d{4})-(\d{2})-(\d{2})/);return m?`${+m[2]}.${+m[3]}`:s}

/* ---------- 이벤트 기록 (데이터 수집) ----------
   기존 익명 통계(track)에 로그인 회원 정보와 새 이벤트를 더한다. 시안에서는 서버로 보내지 않고 HPQ(이 브라우저)에 쌓는다. */
function profileSnap(){
 const u=HPDB.me();
 const p=(typeof profile!=='undefined'&&profile)||{};
 const base={course:p.course||null,college:p.college||null,dept:p.dept||null,grade:p.grade||null};
 if(!u)return base;
 const research=!!(u.consent&&u.consent.research);
 return Object.assign(base,{user_id:research?u.id:null,logged_in:true,jobs:research?(u.jobs||[]).join(','):null,verified:u.verified});
}
/* 묶어 보내기: 기록을 모았다가 15건이 되거나 5초가 지나거나 페이지를 떠날 때 한 번에 보낸다.
   실서비스에서는 flushLog()가 Supabase RPC track_batch(p_session, p_events) 한 번을 부른다 (docs/supabase-analytics.sql).
   기기·유입 경로는 세션마다 한 번만 sessions에 남기고, 이벤트에는 세션 코드와 순번(seq)만 붙인다(중복 저장 방지·중복 제거용). */
const SCHEMA_V=2,BATCH_MAX=15,BATCH_MS=5000;
let buf=[],bufT=null,seq=0,sessionSent=false;
try{seq=+sessionStorage.getItem('hyp-seq')||0}catch{}
const isInternal=()=>{try{return localStorage.getItem('hyp-internal')==='1'}catch{return false}};
function sessionRow(){
 let src=null,ref=null;
 try{const q=new URLSearchParams(location.search).get('src')||'';if(/^[a-z0-9_-]{1,30}$/i.test(q))src=q.toLowerCase()}catch{}
 try{if(document.referrer){const r=new URL(document.referrer);if(r.hostname!==location.hostname)ref=r.hostname.slice(0,60)}}catch{}
 const snap=profileSnap();
 return {session_id:typeof SID!=='undefined'?SID:'',visitor_id:typeof VID!=='undefined'?VID:'',started_at:nowISO(),
  device:typeof deviceOf==='function'?deviceOf():null,src,ref,user_id:snap.user_id||null,logged_in:!!snap.logged_in,internal:isInternal()};
}
function flushLog(reason){
 clearTimeout(bufT);bufT=null;
 if(!buf.length)return;
 const batch=buf;buf=[];
 if(!W.HYOON_PREVIEW)return;   /* 운영: 이 브라우저 기록(시안 관리자용)은 남기지 않는다. 익명 통계는 사이트 본체(track)가 서버로 보낸다 */
 const bid=uid('b');
 try{
  if(!sessionSent){
   sessionSent=true;
   let ss=[];try{ss=JSON.parse(localStorage.getItem('hyp-sessions')||'[]')}catch{}
   const r=sessionRow();if(!ss.some(x=>x.session_id===r.session_id)){ss.push(r);if(ss.length>500)ss=ss.slice(-500);localStorage.setItem('hyp-sessions',JSON.stringify(ss))}
  }
  batch.forEach(ev=>{ev.batch_id=bid;HPQ.push(ev)});
  let bs=[];try{bs=JSON.parse(localStorage.getItem('hyp-batches')||'[]')}catch{}
  bs.push({id:bid,at:nowISO(),n:batch.length,reason:reason||'size'});if(bs.length>300)bs=bs.slice(-300);
  localStorage.setItem('hyp-batches',JSON.stringify(bs));
 }catch{}
}
function log(type,extra){
 try{
  if(typeof statsOff==='function'&&statsOff())return;
  if(typeof ids==='function')ids();
  seq++;try{sessionStorage.setItem('hyp-seq',String(seq))}catch{}
  const ev=Object.assign({src_layer:'plus',v:SCHEMA_V,type,created_at:nowISO(),visitor_id:typeof VID!=='undefined'?VID:'',session_id:typeof SID!=='undefined'?SID:'',seq,
   internal:isInternal()||undefined},profileSnap(),extra||{});
  buf.push(ev);
  if(buf.length>=BATCH_MAX)flushLog('size');
  else if(!bufT)bufT=setTimeout(()=>flushLog('timer'),BATCH_MS);
 }catch{}
}
addEventListener('pagehide',()=>flushLog('leave'));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushLog('hidden')});
/* 다른 화면(내 데이터 등)이 기록을 읽기 전에 남은 묶음을 먼저 내보낸다 */
const _hpqRead=HPQ.read;HPQ.read=function(){flushLog('read');return _hpqRead()};
/* 원본 track 대체: 같은 필드에 notice_key·회원 정보를 붙여 기록 */
W.track=function(type,extra){
 extra=Object.assign({},extra||{});
 /* 공고 열람·원문 이동에는 제목 대신 바뀌지 않는 공고 키를 붙인다 (원문 클릭률 = outbound ÷ notice) */
 if(type==='notice'||(type==='outbound'&&extra.tab==='detail')){const hh=decodeURIComponent(location.hash.slice(1));const a=A.find(x=>x.id===hh);if(a){extra.notice_key=noticeKey(a);extra.sub=a.sub}}
 log(type,extra);
};

/* ---------- 관리자 시안에서 고친 공고 반영 ---------- */
function adminState(){try{const s=JSON.parse(localStorage.getItem(ADMIN_KEY)||'null');return s&&typeof s==='object'?s:{rows:{},hidden:{},added:[]}}catch{return {rows:{},hidden:{},added:[]}}}
/* 시트 스냅샷에는 row_key(V열)가 없고 Supabase에는 있으므로, 둘 다에 있는 원문 링크(L열)를 키로 쓴다 */
const rowKey=r=>String(r[11]||r[21]||'').trim();
const _build=W.build;
W.build=function(){
 const st=adminState();
 const base=raw.filter(r=>!r.__hp);
 const keep=raw;
 let next=base.map(r=>{const k=rowKey(r);if(st.hidden&&st.hidden[k])return null;if(st.rows&&st.rows[k]){const o=st.rows[k].slice();o.__hp=1;return o}return r}).filter(Boolean);
 (st.added||[]).forEach(r=>{const o=r.slice();o.__hp=1;if(!(st.hidden&&st.hidden[rowKey(o)]))next.push(o)});
 raw=next;
 try{_build()}finally{raw=keep.filter(r=>!r.__hp)}
 const edited=new Set(Object.keys(st.rows||{}));
 A.forEach(a=>{if(edited.has(a.link)||edited.has(a.row_key))a.hpEdited=true});
};
W.addEventListener('storage',e=>{if(e.key===ADMIN_KEY){build();renderMine();renderAll();HP.emit('notices')}});

/* ---------- 이벤트 버스 ---------- */
const bus={};
const FLAGS=Object.assign({pnu:false,teams:true,promo:true,signals:true,demoStats:true,publicPf:true,portfolio:true,consentKinds:['research','personalize','notify']},W.HYOON_FLAGS||{});   /* 기능 스위치 (plus/hyoon-config.js) */
const HP=W.HP={
 flags:FLAGS,
 pnuOn:!!FLAGS.pnu,
 JOBS,JOB_MAX,jobName,db:HPDB,log,flushLog,toast,modal,ddayText,fmtDate,uid,
 on(ev,fn){(bus[ev]=bus[ev]||[]).push(fn)},
 emit(ev,d){(bus[ev]||[]).forEach(fn=>{try{fn(d)}catch(e){console.error(e)}})},
 requireLogin(reason,then){const u=HPDB.me();if(u&&u.onboarded)return then?then(u):u;openLogin(reason,then);return null},
 findNotice:id=>A.find(a=>a.id===id)||null
};

/* ---------- 헤더: 로그인 버튼 · 팀원 모집 탭 · 마이 ---------- */
function injectChrome(){
 const tabs=document.querySelector('.tabs');
 if(tabs&&!document.getElementById('tab-teams')){
  const b=document.createElement('button');
  b.className='tab';b.type='button';b.id='tab-teams';b.setAttribute('role','tab');b.setAttribute('aria-controls','teams');b.setAttribute('aria-selected','false');
  b.innerHTML='팀원 모집<span class="hp-new">NEW</span>';
  const saved=document.getElementById('tab-saved');if(HP.flags.teams){tabs.insertBefore(b,saved);b.onclick=()=>{location.hash='teams'}}
  const me=document.createElement('button');
  me.className='tab hp-tab-me';me.type='button';me.id='tab-me';me.setAttribute('role','tab');me.setAttribute('aria-controls','me');me.setAttribute('aria-selected','false');me.textContent='마이';me.hidden=true;
  tabs.appendChild(me);
 }
 const right=document.querySelector('.bar-right');
 if(right&&!document.getElementById('hp-auth')){
  const s=document.createElement('div');s.id='hp-auth';s.className='hp-auth';right.insertBefore(s,right.firstChild);
 }
 const main=document.getElementById('main-content'),det=document.getElementById('detail');
 if(main&&!document.getElementById('teams')){
  ['teams','me'].forEach(id=>{const sec=document.createElement('section');sec.id=id;sec.className='panel';sec.setAttribute('role','tabpanel');sec.setAttribute('aria-labelledby','tab-'+id);main.insertBefore(sec,det)});
 }
 if(!TABS.includes('me')){if(HP.flags.teams)TABS.splice(TABS.indexOf('saved'),0,'teams');TABS.push('me');TRACK_TABS.push(...(HP.flags.teams?['teams','me']:['me']))}
 if(W.HYOON_PREVIEW){
 const bar=document.createElement('div');bar.className='hp-preview-bar';
 bar.innerHTML='<b>로컬 시안</b> 실제 사이트와 서버에는 아무것도 저장되지 않아요 · <a href="admin/index.html">관리자 시안 열기</a> · <button type="button" id="hp-reset">시안 데이터 초기화</button>';
 document.body.insertBefore(bar,document.body.firstChild);
 document.getElementById('hp-reset').onclick=()=>{
  if(!confirm('이 브라우저에 저장된 시안 회원·일정·포트폴리오·팀·이벤트 기록을 모두 지울까요?'))return;
  HPDB.reset();HPQ.clear();try{localStorage.removeItem(ADMIN_KEY)}catch{}location.hash='mine';location.reload();
 };
 }
 renderAuth();
}
function renderAuth(){
 const s=document.getElementById('hp-auth');if(!s)return;
 const u=HPDB.me();
 if(!u){s.innerHTML='<button type="button" class="hp-login-btn" id="hp-login">로그인</button>';document.getElementById('hp-login').onclick=()=>openLogin();return}
 const nm=u.nickname||(u.email||'회원').split('@')[0];
 s.innerHTML=`<a class="hp-me-btn" href="#me" aria-label="마이페이지"><span class="hp-av" aria-hidden="true">${h(nm.slice(0,1))}</span><span class="hp-me-name">${h(nm)}</span></a>`;
}
HP.renderAuth=renderAuth;

/* ---------- 로그인 · 가입: 카카오 · 구글 (메일 인증 없이 바로 가입) ----------
   실서비스: supabase.auth.signInWithOAuth({provider:'kakao'|'google'}) → 돌아오면 첫 로그인일 때만 온보딩.
   부산대 인증 마크는 가입 뒤 따로(openPnuVerify). 로그인 메일과 무관. */
const G_SVG='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/></svg>';
const K_SVG='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#000" d="M12 3.5C6.8 3.5 2.6 6.8 2.6 10.9c0 2.6 1.7 4.9 4.3 6.2l-1 3.6c-.1.3.3.6.6.4l4.3-2.8c.4 0 .8.1 1.2.1 5.2 0 9.4-3.3 9.4-7.4S17.2 3.5 12 3.5z"/></svg>';
function openLogin(reason,then){
 const d=modal(`<div class="hp-login">
  <h2>${reason?h(reason):'로그인하고 내 기록을 모아 보세요'}</h2>
  <p class="hp-sub">쓰던 계정으로 바로 시작해요. 메일 인증 없이 가입돼요. 공고 보기는 로그인 없이도 돼요.</p>
  <button type="button" class="hp-oauth kakao" data-p="kakao">${K_SVG}카카오로 계속하기</button>
  <button type="button" class="hp-oauth" data-p="google">${G_SVG}구글로 계속하기</button>
  <form id="hp-sim" class="hp-form hp-sim" novalidate hidden>
   <label for="hp-sim-mail" id="hp-sim-label">시안: 계정 이메일</label>
   <div class="hp-mailrow"><input id="hp-sim-mail" type="email" inputmode="email" autocomplete="email"><button class="btn-fill" type="submit">계속</button></div>
   <p class="hp-hint">시안에서는 실제 카카오·구글 창 대신 이메일만 받아요.</p>
   <p class="hp-err" id="hp-sim-err" role="alert"></p>
  </form>
  <div class="hp-pnu-note"><b>부산대 인증 마크</b><span>가입한 뒤 학교 메일(@pusan.ac.kr)로 코드를 받아 인증하면 달려요. 인증하면 팀원 모집 글을 쓸 수 있고, 지원·후기에 마크가 보여요.</span></div>
  <p class="hp-fine">계속하면 <a href="terms.html" target="_blank">이용약관</a>과 <a href="privacy.html" target="_blank">개인정보처리방침</a>을 확인한 것으로 봐요. 만 14세 이상만 가입할 수 있어요. 효온은 부산대 학생이 운영하는 비공식 서비스예요.</p>
 </div>`);
 /* 켜 둔 로그인 방식만 보여 준다 (설정이 없으면 시안처럼 둘 다) */
 const _prov=W.HYOON_SB&&W.HYOON_SB.providers;
 if(_prov)d.querySelectorAll('[data-p]').forEach(b=>{if(!_prov.includes(b.dataset.p))b.remove()});
 if(!HP.pnuOn){const n=d.querySelector('.hp-pnu-note');if(n)n.remove()}
 const finish=(email,provider)=>{
  const {user,isNew}=HPDB.signIn(email,provider);
  log(isNew?'signup':'login',{method:provider,verified:user.verified});
  d.close();renderAuth();
  if(!user.onboarded)openOnboarding(then);else{syncProfileFromUser(user);toast('로그인했어요');HP.emit('auth');if(then)then(user)}
 };
 let provider='';
 d.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{
  provider=b.dataset.p;
  if(HP.sbAuth){b.disabled=true;b.textContent='이동 중…';HP.sbAuth.signIn(provider);return}
  const f=d.querySelector('#hp-sim');f.hidden=false;
  d.querySelector('#hp-sim-label').textContent=`시안: ${provider==='kakao'?'카카오':'구글'} 계정 이메일`;
  const i=d.querySelector('#hp-sim-mail');i.placeholder=provider==='kakao'?'카카오 계정 이메일':'구글 계정 이메일';i.focus();
 });
 d.querySelector('#hp-sim').onsubmit=e=>{
  e.preventDefault();const em=d.querySelector('#hp-sim-mail').value.trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){d.querySelector('#hp-sim-err').textContent='이메일 형식을 확인해 주세요.';return}
  finish(em,provider);
 };
}
HP.openLogin=openLogin;

/* ---------- 첫 로그인 온보딩: 소속 → 희망 직무 → 관심 분야 → 동의 ---------- */
function openOnboarding(then,editMode){
 const u=HPDB.me();if(!u)return;
 const p=(typeof profile!=='undefined'&&profile)||{};
 const st={course:u.course||p.course||'학부',college:u.college||p.college||'',dept:u.dept||p.dept||'',grade:u.grade||p.grade||'',
  nickname:u.nickname||'',jobs:(u.jobs||[]).slice(),subs:(u.subs&&u.subs.length?u.subs:(p.subs||[])).slice(),consent:Object.assign({},u.consent)};
 let step=editMode?1:0;
 const steps=['소속','희망 직무','관심 분야','동의'];
 const d=modal('<div id="hp-ob"></div>',{wide:true,onClose(){if(!HPDB.me()||!HPDB.me().onboarded){/* 동의 전 이탈: 가입 미완료로 둔다 */}}});
 const box=d.querySelector('#hp-ob');
 const deptOpts=()=>{const c=COLLEGES.find(x=>x.name===st.college);return '<option value="">학과 선택 안 함</option>'+(c?c.depts.map(x=>`<option${x===st.dept?' selected':''}>${h(x)}</option>`).join(''):'')};
 function draw(){
  const head=`<div class="hp-steps" aria-label="가입 단계">${steps.map((s,i)=>`<span class="${i===step?'on':i<step?'done':''}">${i+1}. ${s}</span>`).join('')}</div>`;
  let body='';
  if(step===0)body=`<h2>어디 소속인가요?</h2><p class="hp-sub">내게 맞는 공고를 고르는 기준이에요. 나중에 마이페이지에서 바꿀 수 있어요.</p>
   <div class="hp-grid2">
    <div class="hp-field"><label for="ob-nick">닉네임 <small>(팀원 모집에 보여요)</small></label><input id="ob-nick" maxlength="16" value="${h(st.nickname)}" placeholder="예) 효원곰"></div>
    <div class="hp-field"><label>과정</label><div class="seg"><label><input type="radio" name="ob-course" value="학부"${st.course==='학부'?' checked':''}><span>학부</span></label><label><input type="radio" name="ob-course" value="대학원"${st.course==='대학원'?' checked':''}><span>대학원</span></label></div></div>
    <div class="hp-field"><label for="ob-college">단과대학</label><select id="ob-college"><option value="">단과대학 선택</option>${COLLEGES.map(c=>`<option${c.name===st.college?' selected':''}>${h(c.name)}</option>`).join('')}</select></div>
    <div class="hp-field"><label for="ob-dept">학과·전공</label><select id="ob-dept">${deptOpts()}</select></div>
    <div class="hp-field"><label for="ob-grade">학년</label><select id="ob-grade"><option value="">학년 선택 안 함</option>${(st.course==='학부'?['1','2','3','4','5']:[]).map(g=>`<option value="${g}"${g===st.grade?' selected':''}>${g==='5'?'5학년 이상':g+'학년'}</option>`).join('')}</select></div>
   </div>`;
  if(step===1)body=`<h2>어떤 일을 해 보고 싶나요?</h2><p class="hp-sub">최대 ${JOB_MAX}개까지 골라 주세요. 고른 직무와 관련된 공고를 따로 모아 보여드려요.</p>
   <div class="hp-chips" id="ob-jobs">${JOBS.map(j=>`<label class="hp-chip"><input type="checkbox" value="${j.id}"${st.jobs.includes(j.id)?' checked':''}><span>${h(j.name)}</span></label>`).join('')}</div>
   <p class="hp-count" id="ob-jobcount" aria-live="polite">${st.jobs.length}/${JOB_MAX} 선택</p>`;
  if(step===2)body=`<h2>관심 있는 공고 종류는요?</h2><p class="hp-sub">여러 개 골라도 돼요. 고른 종류가 위로 먼저 보여요.</p>
   <div class="hp-chips" id="ob-subs">${SUBS.map(s=>`<label class="hp-chip"><input type="checkbox" value="${h(s)}"${st.subs.includes(s)?' checked':''}><span>${h(s)}</span></label>`).join('')}</div>`;
  if(step===3)body=`<h2>거의 다 됐어요</h2><p class="hp-sub">필수 항목에 동의해야 가입이 끝나요. 선택 항목은 언제든 마이페이지 > 설정에서 바꿀 수 있어요.</p>
   <div class="hp-consent">
    <label><input type="checkbox" id="c-all"><b>전체 동의</b></label>
    <label><input type="checkbox" data-c="terms"${st.consent.terms?' checked':''}><span><em class="req">필수</em> 이용약관 동의</span></label>
    <label><input type="checkbox" data-c="age14"${st.consent.age14?' checked':''}><span><em class="req">필수</em> 만 14세 이상이에요</span></label>
    <label><input type="checkbox" data-c="privacy"${st.consent.privacy?' checked':''}><span><em class="req">필수</em> 개인정보 수집·이용 동의 <small>가입 때 입력하는 소속·학년·희망 직무 등을 저장해요 · 맞춤 공고 안내와 개인을 알아볼 수 없는 통계 분석에 써요 · 탈퇴 시 바로 삭제</small></span></label>
    <details class="hp-consent-detail"><summary>수집하는 정보와 쓰임 자세히 보기</summary>
     <dl>
      <dt>수집 항목</dt><dd>로그인 계정의 회원 식별값(구글은 이메일·이름, 카카오는 닉네임과 동의한 경우 이메일), 닉네임, 소속(과정·단과대학·학과·학년), 희망 직무, 관심 분야, 동의 기록, 내 일정(담은 공고·지원 상태·메모), 직접 적은 경우의 소개·연락 방법${HP.flags.teams?', (팀원 모집·홍보 요청을 쓰면) 올린 글·지원·초대·신고 내용':''}</dd>
      <dt>이용 목적</dt><dd>회원 확인과 로그인, 내 일정 저장, 소속·희망 직무에 맞는 공고 안내, <b>서비스 개선을 위한 통계 분석</b>(예: 단과대·학년별로 많이 보는 공고). 통계는 <b>개인을 알아볼 수 없게 집계한 형태로만</b> 쓰고, 이름·이메일은 통계에 쓰지 않아요.</dd>
      <dt>보유 기간</dt><dd>탈퇴할 때까지. 탈퇴하면 바로 삭제돼요.</dd>${HP.flags.teams?'<dt>다른 회원에게 보이는 정보</dt><dd>팀원 모집을 쓰면 글과 닉네임·단과대·학과·학년·소개가 로그인한 회원에게 보여요. <b>연락 방법은 합류가 확정된 팀원에게만</b> 보이고, 이메일은 보이지 않아요.</dd>':''}
      <dt>보관 장소</dt><dd>Supabase 데이터베이스(프랑스 파리 서버)</dd>
      <dt>동의하지 않으면</dt><dd>가입만 할 수 없어요. 공고 보기·검색 등 기본 기능은 로그인 없이 계속 쓸 수 있어요.</dd>
     </dl>
     <p><a href="privacy.html" target="_blank" rel="noopener">개인정보처리방침 전문</a> · <a href="terms.html" target="_blank" rel="noopener">이용약관 전문</a></p>
    </details>
    ${HP.flags.consentKinds.includes('research')?`<label><input type="checkbox" data-c="research"${st.consent.research?' checked':''}><span><em class="opt">선택</em> 서비스 개선·통계 분석에 이용 기록 활용 <small>본 공고·저장·검색·일정 담기 기록을 내 계정과 연결해 분석해요(예: "공대생이 많이 보는 공고"). 분석 결과는 개인을 알아볼 수 없는 통계로만 써요 · 동의 철회 또는 탈퇴 시 연결을 끊어요</small></span></label>`:''}
    ${HP.flags.consentKinds.includes('personalize')?`<label><input type="checkbox" data-c="personalize"${st.consent.personalize?' checked':''}><span><em class="opt">선택</em> 맞춤 추천에 내 이용 기록 반영 <small>자주 본 분야를 추천 순서에 반영해요</small></span></label>`:''}
    ${HP.flags.consentKinds.includes('notify')?`<label><input type="checkbox" data-c="notify"${st.consent.notify?' checked':''}><span><em class="opt">선택</em> 마감 알림 메일 받기 <small>내 일정에 담은 공고의 마감 전 알림 (시안에서는 발송 안 함)</small></span></label>`:''}
   </div><p class="hp-err" id="ob-err" role="alert"></p>`;
  const last=step===3||editMode&&step===2;
  box.innerHTML=head+body+`<div class="hp-actions">${step>(editMode?1:0)?'<button type="button" class="btn-outline" id="ob-prev">이전</button>':'<span></span>'}<button type="button" class="btn-fill" id="ob-next">${last?(editMode?'저장':'가입 완료'):'다음'}</button></div>`;
  bind();
 }
 function bind(){
  const q=s=>box.querySelector(s);
  if(step===0){
   q('#ob-college').onchange=e=>{st.college=e.target.value;st.dept='';q('#ob-dept').innerHTML=deptOpts()};
   box.querySelectorAll('input[name=ob-course]').forEach(r=>r.onchange=()=>{st.course=r.value;st.grade='';draw()});
  }
  if(step===1){
   q('#ob-jobs').onchange=e=>{
    const v=e.target.value;
    if(e.target.checked){if(v==='none')st.jobs=['none'];else{st.jobs=st.jobs.filter(x=>x!=='none');if(st.jobs.length>=JOB_MAX){e.target.checked=false;toast(`최대 ${JOB_MAX}개까지 고를 수 있어요`);return}st.jobs.push(v)}}
    else st.jobs=st.jobs.filter(x=>x!==v);
    box.querySelectorAll('#ob-jobs input').forEach(i=>i.checked=st.jobs.includes(i.value));
    q('#ob-jobcount').textContent=`${st.jobs.length}/${JOB_MAX} 선택`;
   };
  }
  if(step===2)q('#ob-subs').onchange=()=>{st.subs=[...box.querySelectorAll('#ob-subs input:checked')].map(i=>i.value)};
  if(step===3){
   const all=q('#c-all'),boxes=[...box.querySelectorAll('[data-c]')];
   const syncAll=()=>{all.checked=boxes.every(b=>b.checked)};syncAll();
   all.onchange=()=>{boxes.forEach(b=>{b.checked=all.checked;st.consent[b.dataset.c]=all.checked})};
   boxes.forEach(b=>b.onchange=()=>{st.consent[b.dataset.c]=b.checked;syncAll()});
  }
  const prev=q('#ob-prev');if(prev)prev.onclick=()=>{collect();step--;draw()};
  q('#ob-next').onclick=()=>{
   collect();
   if(step===0&&!st.college){toast('단과대학을 골라 주세요');return}
   if(step===1&&!st.jobs.length){toast('하나 이상 골라 주세요. 잘 모르겠으면 "아직 모르겠어요"를 골라요');return}
   const last=step===3||editMode&&step===2;
   if(!last){log('onboard_step',{step:step+1,step_name:steps[step],edit:!!editMode});step++;draw();return}
   if(!editMode&&!(st.consent.terms&&st.consent.privacy&&st.consent.age14)){q('#ob-err').textContent='필수 항목 세 개에 동의해 주세요. 만 14세 미만은 가입할 수 없어요.';return}
   const before=HPDB.me();const firstTime=!before.onboarded;
   const consent=editMode?before.consent:Object.assign(st.consent,{at:nowISO()});
   const u=HPDB.updateMe({nickname:st.nickname.trim()||before.email.split('@')[0].slice(0,12),course:st.course,college:st.college,dept:st.dept,grade:st.grade,jobs:st.jobs,subs:st.subs,consent,onboarded:true});
   syncProfileFromUser(u);
   log(firstTime?'onboard_done':'profile_edit',{jobs_n:st.jobs.length,subs_n:st.subs.length,consent_research:!!consent.research,consent_personalize:!!consent.personalize});
   log('job_set',{keyword:st.jobs.join(',').slice(0,80)});
   d.close();renderAuth();HP.emit('auth');
   if(firstTime&&!u.verified&&HP.pnuOn){openPnuIntro(then?()=>then(u):null);if(!then)location.hash='mine';return}
   toast(firstTime?'가입을 마쳤어요. 내게 맞는 공고를 골라 뒀어요':'저장했어요');
   if(then)then(u);else if(firstTime)location.hash='mine';
  };
 }
 function collect(){
  const q=s=>box.querySelector(s);
  if(step===0){st.nickname=q('#ob-nick').value;st.college=q('#ob-college').value;st.dept=q('#ob-dept').value;st.grade=q('#ob-grade').value;const c=box.querySelector('input[name=ob-course]:checked');if(c)st.course=c.value}
 }
 draw();
}
HP.openOnboarding=openOnboarding;

/* ---------- 부산대 인증: 학교 메일로 6자리 코드 → 인증 마크 ----------
   실서비스: Edge Function pnu-verify (send: 코드 메일 발송 · verify: 확인 후 profiles.verified_pnu=true).
   한 학교 메일은 한 계정에만, 코드 10분 유효, 다시 보내기 60초 뒤·하루 5번, 틀리면 5번까지 */
const maskMail=m=>{const [a,b]=String(m||'').split('@');return a?a.slice(0,2)+'*'.repeat(Math.max(1,a.length-2))+'@'+b:''};
function openPnuIntro(after){
 const d=modal(`<div class="hp-login hp-pnu-intro"><h2>가입을 마쳤어요</h2>
  <p class="hp-sub">부산대 학생이라면 학교 메일로 <b>부산대 인증 마크</b>를 달아 보세요. 1분이면 돼요.</p>
  <ul class="hp-pnu-why"><li>팀원 모집 글을 쓸 수 있어요</li><li>팀 지원·팀 찾기·후기에 인증 마크가 보여 믿음을 줘요</li><li>학교 메일 주소는 인증에만 쓰고 다른 사람에게 보이지 않아요</li></ul>
  <div class="hp-actions"><button type="button" class="btn-outline" id="pi-later">나중에 할게요</button><button type="button" class="btn-fill" id="pi-go">지금 인증하기</button></div>
  <p class="hp-fine">마이페이지 > 설정에서 언제든 인증할 수 있어요.</p></div>`,{onClose(){}});
 d.querySelector('#pi-later').onclick=()=>{log('pnu_verify',{status:'later'});d.close();toast('가입을 마쳤어요. 내게 맞는 공고를 골라 뒀어요');if(after)after()};
 d.querySelector('#pi-go').onclick=()=>{d.close();openPnuVerify(after)};
}
function openPnuVerify(after,reason){
 const u=HPDB.me();if(!u)return openLogin('로그인 후 인증할 수 있어요');
 if(u.verified){toast('이미 부산대 인증을 마쳤어요');if(after)after(u);return}
 const d=modal(`<div class="hp-login hp-pnu"><h2>부산대 인증</h2>
  ${reason?`<p class="hp-sub"><b>${h(reason)}</b></p>`:''}
  <p class="hp-sub">학교 메일로 받은 6자리 코드를 넣으면 인증 마크가 달려요. 학교가 보증하는 공식 학적 확인은 아니에요.</p>
  <form id="pv-send" class="hp-form" novalidate>
   <label for="pv-id">부산대 웹메일 주소</label>
   <div class="hp-mailrow hp-pnu-row"><input id="pv-id" inputmode="email" autocomplete="username" placeholder="아이디" autocapitalize="off" spellcheck="false"><span class="hp-pnu-dom">@pusan.ac.kr</span></div>
   <button class="btn-fill hp-wide" type="submit" id="pv-send-btn">인증 코드 보내기</button>
   <p class="hp-err" id="pv-err" role="alert"></p>
  </form>
  <form id="pv-code" class="hp-form" novalidate hidden>
   <label for="pv-num">메일로 받은 6자리 코드 <small id="pv-to"></small></label>
   <div class="hp-mailrow"><input id="pv-num" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"><button class="btn-fill" type="submit">확인</button></div>
   <p class="hp-hint">10분 안에 넣어 주세요. 안 왔다면 스팸함을 확인하거나 <button type="button" class="hp-link" id="pv-resend" disabled>다시 보내기</button> <span id="pv-wait"></span></p>
   <p class="hp-hint">시안에서는 메일이 가지 않아요. 아무 숫자 6자리를 넣으면 돼요.</p>
   <p class="hp-err" id="pv-err2" role="alert"></p>
  </form></div>`);
 const q=s=>d.querySelector(s);let mail='',tries=0,timer=null;
 const startWait=()=>{let n=60;const b=q('#pv-resend'),w=q('#pv-wait');b.disabled=true;clearInterval(timer);timer=setInterval(()=>{n--;w.textContent=n>0?`(${n}초 뒤)`:'';if(n<=0){b.disabled=false;clearInterval(timer)}},1000);w.textContent='(60초 뒤)'};
 q('#pv-send').onsubmit=e=>{
  e.preventDefault();const id=q('#pv-id').value.trim().toLowerCase().replace(/@pusan\.ac\.kr$/,'');
  if(!/^[a-z0-9._-]{2,40}$/.test(id)){q('#pv-err').textContent='웹메일 아이디만 적어 주세요 (영문·숫자).';return}
  mail=id+'@pusan.ac.kr';
  if(db.users.some(x=>x.id!==u.id&&!x.demo&&x.pnu_email===mail)){q('#pv-err').textContent='이미 다른 계정에 인증된 학교 메일이에요.';return}
  q('#pv-send').hidden=true;q('#pv-code').hidden=false;q('#pv-to').textContent='('+maskMail(mail)+')';q('#pv-num').focus();
  log('pnu_verify',{status:'sent'});startWait();
 };
 q('#pv-resend').onclick=()=>{log('pnu_verify',{status:'resent'});toast('코드를 다시 보냈어요 (시안)');startWait()};
 q('#pv-code').onsubmit=e=>{
  e.preventDefault();const c=q('#pv-num').value.trim();
  if(!/^\d{6}$/.test(c)){tries++;q('#pv-err2').textContent=tries>=5?'5번 틀려서 다시 보내기로 새 코드를 받아 주세요.':'6자리 숫자를 넣어 주세요.';return}
  clearInterval(timer);
  const nu=HPDB.updateMe({verified:true,pnu_email:mail,pnu_verified_at:nowISO()});
  log('pnu_verify',{status:'ok'});d.close();renderAuth();HP.emit('auth');HP.emit('db');
  toast('부산대 인증을 마쳤어요. 인증 마크가 달렸어요');if(after)after(nu);
 };
 d.addEventListener('close',()=>clearInterval(timer));
}
HP.openPnuVerify=openPnuVerify;HP.maskMail=maskMail;

/* 회원 정보 → 기존 "내 맞춤 설정"(profile)과 맞춘다 */
function syncProfileFromUser(u){
 if(!u||!u.college)return;
 profile={course:u.course||'학부',college:u.college,dept:u.dept||'',grade:u.grade||'',subs:(u.subs||[]).filter(s=>SUBS.includes(s))};
 try{save()}catch{}
 try{populateFormFromProfile()}catch{}
 renderMine();
}
HP.syncProfileFromUser=syncProfileFromUser;

/* ---------- 희망 직무 맞춤 레일 (내게 맞는 탭) ---------- */
function jobScore(a,jobs){
 const txt=[a.title,a.org,a.target,a.benefit,a.cat,a.sub].join(' ');
 const hits=[];let score=0;
 jobs.forEach(id=>{const j=JOBS.find(x=>x.id===id);if(!j)return;const k=j.kw.filter(w=>txt.includes(w));if(k.length){score+=k.length+(a.title.includes(k[0])?2:0);hits.push(j.name)}});
 return {score,hits};
}
HP.jobScore=jobScore;
const _renderMine=W.renderMine;
W.renderMine=function(){
 _renderMine();
 const out=document.getElementById('mine-out');if(!out)return;
 const u=HPDB.me();
 let html='';
 if(u&&u.onboarded&&u.jobs&&u.jobs.length&&!u.jobs.includes('none')){
  const act=A.filter(active).filter(a=>!profile||match(a,profile));
  const items=act.map(a=>{const s=jobScore(a,u.jobs);return s.score?{a,m:{why:['★ 직무: '+s.hits.join(', ')],score:s.score}}:null}).filter(Boolean)
   .sort((x,y)=>y.m.score-x.m.score||cmpEnd(x.a,y.a)).slice(0,16);
  html=railSection('희망 직무 맞춤',`${items.length}건 · ${u.jobs.map(jobName).join(', ')}`,items,false,'','rail-job','',true);
 }else if(!u){
  html=`<div class="wrap"><div class="hp-cta-strip"><div><b>희망 직무를 고르면 관련 공고만 따로 모아 드려요</b><span>로그인하면 내 일정·포트폴리오·팀원 모집도 쓸 수 있어요.</span></div><button type="button" class="btn-fill" data-hp-login>로그인하고 시작하기</button></div></div>`;
 }
 /* 로그인 안내 띠는 첫 공고 줄 다음에 (공고가 먼저 보이게, DESIGN.md 4-1) */
 if(html){const first=!u&&out.querySelector('.rail-band');if(first)first.insertAdjacentHTML('afterend',html);else out.insertAdjacentHTML('afterbegin',html);observeReveals()}
 HP.emit('rendered','mine');
};
document.addEventListener('click',e=>{const b=e.target.closest('[data-hp-login]');if(b){e.preventDefault();openLogin()}});

/* ---------- 노출(impression) 기록: 목록에서 실제로 화면에 보인 공고 ---------- */
const seen=new Set();
const io='IntersectionObserver' in W?new IntersectionObserver(ents=>{
 ents.forEach(en=>{
  if(!en.isIntersecting)return;io.unobserve(en.target);
  const a=en.target.querySelector('a.card');if(!a)return;const id=(a.getAttribute('href')||'').slice(1);const n=A.find(x=>x.id===id);if(!n)return;
  const rail=en.target.closest('.rail-band,section');const where=rail&&rail.id?rail.id:(en.target.closest('#all-grid')?'all':en.target.closest('#saved-grid')?'saved':'other');
  const key=where+'|'+id;if(seen.has(key))return;seen.add(key);
  const pos=[...en.target.parentElement.children].indexOf(en.target)+1;
  pend.push({notice_key:noticeKey(n),list:where,pos,sub:n.sub});
  if(pend.length>=20)flushImp();
 });
},{threshold:.6}):null;
let pend=[];
/* 노출은 공고 하나당 한 줄로 기록한다(서버에서 공고 번호로 바로 집계). 묶어 보내기가 요청 수를 줄여 준다 */
function flushImp(){if(!pend.length)return;const p=pend.slice(0,60);pend=[];p.forEach(it=>log('impression',it))}
setInterval(flushImp,15000);addEventListener('pagehide',flushImp);
function watchCards(){if(!io)return;document.querySelectorAll('.card-item').forEach(li=>{if(!li.dataset.hpw){li.dataset.hpw='1';io.observe(li)}})}
new MutationObserver(()=>{clearTimeout(watchCards.t);watchCards.t=setTimeout(watchCards,200)}).observe(document.getElementById('main-content'),{childList:true,subtree:true});

/* 목록 클릭 위치, 저장·공유, 상세 체류 시간, 검색 결과 0건 */
document.addEventListener('click',e=>{
 const c=e.target.closest('a.card');
 if(c){const li=c.closest('.card-item');const id=(c.getAttribute('href')||'').slice(1);const n=A.find(x=>x.id===id);if(n&&li){const rail=li.closest('.rail-band,section');log('list_click',{notice_key:noticeKey(n),list:rail&&rail.id?rail.id:'other',pos:[...li.parentElement.children].indexOf(li)+1,sub:n.sub})}}
},true);
const _toggleBookmark=W.toggleBookmark;
W.toggleBookmark=function(id,el){const was=isSaved(id);const r=_toggleBookmark(id,el);const n=A.find(x=>x.id===id);log(was?'unsave':'save',{notice_key:n?noticeKey(n):id,sub:n?n.sub:null});HP.emit('saved');return r};
const _share=W.shareNotice;
W.shareNotice=function(a,btn){log('share',{notice_key:noticeKey(a),sub:a.sub,method:navigator.share&&matchMedia('(pointer:coarse)').matches?'native':'copy'});return _share(a,btn)};
let dwell=null;
function endDwell(){if(dwell){const s=Math.round((Date.now()-dwell.t)/1000);if(s>=2)log('dwell',{notice_key:dwell.k,active_s:Math.min(s,3600),sub:dwell.sub});dwell=null}}
addEventListener('hashchange',()=>{endDwell();const hh=decodeURIComponent(location.hash.slice(1));const a=A.find(x=>x.id===hh);if(a)dwell={k:noticeKey(a),t:Date.now(),sub:a.sub}});
addEventListener('pagehide',endDwell);
const _renderAll=W.renderAll;let zeroQ='';
W.renderAll=function(){_renderAll();const q=(document.getElementById('q')||{}).value||'';const empty=!document.querySelector('#all-grid .card-item');if(q.trim().length>=2&&empty&&q!==zeroQ){zeroQ=q;clearTimeout(W.renderAll.t);W.renderAll.t=setTimeout(()=>log('search_zero',{keyword:q.trim().slice(0,80)}),900)}};

/* ---------- 라우팅: 팀원 모집 · 마이 ---------- */
function routePlus(){
 const hh=decodeURIComponent(location.hash.slice(1));
 const me=document.getElementById('tab-me');if(me)me.hidden=hh!=='me';
 if(hh==='teams'){document.getElementById('page-title').textContent='팀원 모집';HP.emit('route','teams')}
 if(hh==='me'){document.getElementById('page-title').textContent='마이페이지';HP.emit('route','me')}
}
addEventListener('hashchange',routePlus);
/* 공고를 서버에서 다시 받은 뒤 원본이 route()를 부르면 팀·마이 화면도 다시 그린다 (주소로 바로 들어온 경우 대비) */
const _route=W.route;
W.route=function(){_route();routePlus()};
HP.on('db',()=>{renderAuth()});

/* ---------- 시작 ---------- */
function boot(){
 injectChrome();
 build();renderMine();renderAll();
 const u=HPDB.me();if(u&&u.onboarded)syncProfileFromUser(u);
 route();routePlus();
 log('visit_plus',{logged_in:!!u});
}
HP.boot=boot;
HP._afterModules=[];
/* 모든 추가 스크립트(me·teams·signals·promo)가 실행된 뒤에 시작한다.
   setTimeout(0)만 쓰면 처음 받는(캐시 없는) 스크립트를 기다리는 사이 먼저 실행돼 뒤 모듈이 'ready'를 놓친다 */
function start(){if(HP.isReady)return;boot();HP._afterModules.forEach(f=>f());HP.isReady=true;HP.emit('ready')}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else setTimeout(start,0);
const _on=HP.on;HP.on=function(ev,fn){_on(ev,fn);if(ev==='ready'&&HP.isReady){try{fn()}catch(e){console.error(e)}}};
})();
