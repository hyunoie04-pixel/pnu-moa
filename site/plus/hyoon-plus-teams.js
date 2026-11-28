/* =====================================================================
   효온 플러스 (로컬 시안) · 공모전 팀원 모집
   두 방향으로 팀을 꾸린다.
   1) 팀원 모집글 → 지원자가 지원 → 팀장이 수락
   2) 팀장이 직접 모으기 → "팀 구해요"로 등록한 사람에게 초대 / 초대 링크로 바로 합류
   수락·합류한 사람에게만 팀장 연락처(오픈채팅)가 보인다. 공고 마감일이 지나면 자동 마감.
   ===================================================================== */
(function(){
'use strict';
const W=window,HP=W.HP,DB=HP.db,h=s=>esc(s);
const ROLES=['기획','디자인','개발','데이터 분석','영상·사진','마케팅·홍보','자료조사','발표','글쓰기','기타'];
const MODES=['대면 (부산대 근처)','온라인','대면+온라인'];
const MAX_OPEN=3;
const PHONE=/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/;
const {contactCheck,contactHtml}=HP;   /* hyoon-shared.js */
const isContest=a=>!!a&&(a.sub==='공모전·경진대회'||/공모전|경진대회|해커톤|챌린지|아이디어|대회/.test(a.title+' '+(a.cat||'')));
const raw=()=>DB.raw();
const SV=()=>!!(HP.srv&&HP.srv.enabled);              // 서버 저장 모드(운영·시험 서버). 아니면 시안의 가짜 저장
const srvFail=(res)=>{HP.toast((res&&res.err)||'처리하지 못했어요');return false};
function ensureTables(){const r=raw();['seekers','invites'].forEach(k=>{if(!Array.isArray(r[k]))r[k]=[]})}

function teamOpen(t){if(t.status!=='open')return false;const dl=t.deadline||t.notice_end;return !dl||dl>=todayKST()}
function filled(t){return t.roles.reduce((s,r)=>s+(r.filled||0),0)}
function need(t){return t.roles.reduce((s,r)=>s+(+r.need||0),0)}
function leaderOf(t){return DB.user(t.leader)||{nickname:'알 수 없음'}}
/* 팀장 이름·학과는 팀장 본인과 합류가 확정된 팀원에게만 보여 준다(서버 member_cards도 같은 규칙) */
function leaderSeen(t){const me=DB.me();return !!me&&(t.leader===me.id||DB.list('apps',a=>a.team_id===t.id&&a.uid===me.id&&a.status==='accepted').length>0)}
function members(t){return DB.list('apps',a=>a.team_id===t.id&&a.status==='accepted')}
function isMember(t,u){return !!u&&(t.leader===u.id||members(t).some(a=>a.uid===u.id))}
function openRoles(t){return t.roles.filter(r=>(r.filled||0)<r.need)}
function fillRole(t,role){const r=t.roles.find(x=>x.name===role)||openRoles(t)[0];if(r)r.filled=(r.filled||0)+1;DB.update('teams',t.id,{roles:t.roles});if(need(t)&&filled(t)>=need(t)){DB.update('teams',t.id,{status:'closed'});HP.toast('모든 자리가 차서 모집을 마감했어요')}}
function unfillRole(t,role){const r=t.roles.find(x=>x.name===role);if(r&&r.filled>0)r.filled--;DB.update('teams',t.id,{roles:t.roles,status:t.status==='closed'&&teamOpenDate(t)?'open':t.status})}
function teamOpenDate(t){const dl=t.deadline||t.notice_end;return !dl||dl>=todayKST()}
function userLine(u){return [u.dept,u.grade?(u.grade==='5'?'5학년 이상':u.grade+'학년'):''].filter(Boolean).join(' · ')}
function myOpenTeams(u){return u?DB.list('teams',t=>t.leader===u.id&&teamOpen(t)&&openRoles(t).length):[]}

/* ---------- 예시 데이터 (처음 한 번): 실제 공모전에 연결한 데모 팀·팀 구해요 ---------- */
function seed(){
 ensureTables();
 if(SV())return;                                        // 서버 모드에서는 예시 데이터를 만들지 않는다
 const r=raw();
 const contests=A.filter(active).filter(isContest).sort(cmpEnd).slice(0,4);
 if(!contests.length)return;
 if(!r.seeded){
  const demo=[
   {nickname:'바다곰',college:'공과대학',dept:'기계공학부',grade:'3',skills:['CAD','발표'],bio:'제품 아이디어 내는 걸 좋아해요'},
   {nickname:'광안리러너',college:'경영대학',dept:'경영학과',grade:'4',skills:['기획','엑셀'],bio:'공모전 수상 2회, 기획 담당'},
   {nickname:'효원픽셀',college:'예술대학',dept:'디자인학과',grade:'2',skills:['피그마','일러스트'],bio:'포스터·PPT 디자인 맡을게요'}
  ].map((d,i)=>Object.assign({id:'demo-u'+i,email:'demo'+i+'@example.invalid',demo:true,verified:true,course:'학부',jobs:[],subs:[],consent:{},onboarded:true,created_at:new Date().toISOString()},d));
  r.users.push(...demo);
  const plans=[
   {title:'아이디어는 있어요, 디자인·발표 함께할 분',roles:[['디자인',1,0],['발표',1,0]],mode:MODES[2],meet:'주 1회 저녁, 정문 근처 카페',intro:'주제 초안과 자료조사는 끝났어요. 결과물을 보기 좋게 만들어 줄 분을 찾아요.',want:'마감까지 꾸준히 연락되는 분이면 경험은 상관없어요.'},
   {title:'데이터 분석 같이 할 2명 모집',roles:[['데이터 분석',2,1],['기획',1,0]],mode:MODES[1],meet:'온라인 회의 주 2회',intro:'공공데이터로 지역 문제를 분석해 보려고 해요. 파이썬 조금 할 줄 알면 좋아요.',want:'통계·산업공학·컴공 아니어도 괜찮아요.'},
   {title:'영상 편집 가능한 분 찾습니다',roles:[['영상·사진',1,0],['기획',1,1]],mode:MODES[0],meet:'촬영은 부산대 캠퍼스에서',intro:'짧은 영상 1편 제출이에요. 촬영·편집 도와주실 분!',want:'프리미어나 캡컷 다뤄 보신 분'},
   {title:'처음 나가 보는 사람끼리 같이 해요',roles:[['기타',2,0]],mode:MODES[2],meet:'일정 맞춰서',intro:'공모전 처음이라 같이 배우면서 해 볼 분 구해요. 부담 없이 지원해 주세요.',want:'학년·학과 무관'}
  ];
  contests.forEach((a,i)=>{const p=plans[i%plans.length];
   r.teams.push({id:'demo-t'+i,demo:true,leader:demo[i%3].id,notice_id:a.id,notice_key:noticeKey(a),notice_title:a.title,notice_end:a.end||'',poster:posterOf(a,''),title:p.title,intro:p.intro,want:p.want,
    roles:p.roles.map(([name,n,f])=>({name,need:n,filled:f})),mode:p.mode,meet:p.meet,deadline:a.end||'',contact:'https://open.kakao.com/o/demo',status:'open',reports:0,invite_code:'demo'+i,created_at:new Date(Date.now()-(i+1)*36e5*7).toISOString()})});
  r.seeded=true;
 }
 if(!r.seededSeekers){
  const extra=[
   {id:'demo-u3',nickname:'해운대코더',college:'정보의생명공학대학',dept:'정보컴퓨터공학부',grade:'3',skills:['파이썬','웹 개발'],bio:'해커톤 2번 나가 봤어요'},
   {id:'demo-u4',nickname:'금정영상',college:'사회과학대학',dept:'신문방송학과',grade:'2',skills:['프리미어','촬영'],bio:'영상 편집 자신 있어요'}
  ].map(d=>Object.assign({email:d.id+'@example.invalid',demo:true,verified:true,course:'학부',jobs:[],subs:[],consent:{},onboarded:true,created_at:new Date().toISOString()},d));
  extra.forEach(u=>{if(!r.users.some(x=>x.id===u.id))r.users.push(u)});
  r.seekers.push(
   {id:'demo-s0',demo:true,uid:'demo-u3',notice_id:contests[1]?contests[1].id:'',notice_title:contests[1]?contests[1].title:'',roles:['개발','데이터 분석'],intro:'개발이나 데이터 분석 맡을 수 있어요. 주말 회의 가능해요.',status:'open',created_at:new Date(Date.now()-5*36e5).toISOString()},
   {id:'demo-s1',demo:true,uid:'demo-u4',notice_id:'',notice_title:'',roles:['영상·사진','마케팅·홍보'],intro:'영상 공모전이면 어디든 좋아요. 촬영 장비 있어요.',status:'open',created_at:new Date(Date.now()-9*36e5).toISOString()},
   {id:'demo-s2',demo:true,uid:'demo-u2',notice_id:contests[0].id,notice_title:contests[0].title,roles:['디자인'],intro:'포스터·발표 자료 디자인 할게요.',status:'open',created_at:new Date(Date.now()-20*36e5).toISOString()}
  );
  r.seededSeekers=true;
 }
 try{localStorage.setItem('hyp-db',JSON.stringify(r))}catch{}
}

/* ---------- 팀원 모집 탭 ---------- */
let view='teams',flt={q:'',only:'open',role:''};
/* 공모전 포스터: 공고 목록에서 찾고, 공고가 내려가도 팀 글에 저장해 둔 주소로 보여 준다 */
function posterOf(n,saved){return (n&&n.posters&&n.posters[0])||saved||''}
function posterTile(n,saved,title,cls){
 const u=posterOf(n,saved);
 return `<span class="hp-tposter${cls?' '+cls:''}" aria-hidden="true">${u?`<img src="${h(u)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`:''}<em>${h((n&&n.sub)||'공모전')}</em></span>`;
}
function teamCard(t){
 const L=leaderOf(t),n=HP.findNotice(t.notice_id),open=teamOpen(t),me=DB.me();
 const mine=me&&t.leader===me.id;const app=me&&DB.list('apps',x=>x.team_id===t.id&&x.uid===me.id)[0];
 const inv=me&&DB.list('invites',x=>x.team_id===t.id&&x.to===me.id&&x.status==='pending')[0];
 const pend=mine?DB.list('apps',a=>a.team_id===t.id&&a.status==='pending').length:0;
 return `<li class="hp-team-card has-poster${open?'':' closed'}"><button type="button" class="hp-team-hit" data-team="${h(t.id)}">
  ${posterTile(n,t.poster)}<span class="hp-team-body">
  <div class="hp-team-top"><span class="hp-badge ${open?'ok':''}">${open?'모집 중':'모집 마감'}</span>${t.demo?'<span class="hp-badge">예시</span>':''}${mine?'<span class="hp-badge job">내 팀</span>':''}${pend?`<span class="hp-badge win">새 지원 ${pend}</span>`:''}${inv?'<span class="hp-badge win">초대 받음</span>':''}${app?`<span class="hp-badge">${app.status==='accepted'?'합류함':app.status==='pending'?'지원함':app.status==='rejected'?'거절됨':app.status==='removed'?'팀에서 나옴':'지원 취소'}</span>`:''}<span class="hp-team-d">${t.deadline?HP.ddayText(t.deadline):''}</span></div>
  <p class="hp-team-contest">${h(n?n.title:t.notice_title)}</p>
  <h4>${h(t.title)}</h4>
  <p class="hp-team-roles">${t.roles.map(r=>`<span class="${(r.filled||0)>=r.need?'full':''}">${h(r.name)} ${r.filled||0}/${r.need}</span>`).join('')}</p>
  <p class="hp-team-meta">${h(t.mode)} · ${leaderSeen(t)?'팀장 '+h(L.nickname)+(L.dept?' ('+h(L.dept)+')':''):'팀장 정보는 합류하면 공개'}</p>
 </span></button></li>`;
}
function seekerCard(s){
 const u=DB.user(s.uid)||{},me=DB.me(),mine=me&&s.uid===me.id,n=s.notice_id?HP.findNotice(s.notice_id):null;
 const canInvite=!mine&&myOpenTeams(me).length>0;
 const sent=me&&DB.list('invites',x=>x.to===s.uid&&x.from===me.id&&x.status==='pending').length;
 return `<li class="hp-team-card hp-seeker${n?' has-poster':''}"><div class="hp-team-hit">
  ${n?posterTile(n,'',''):''}<span class="hp-team-body">
  <div class="hp-team-top"><span class="hp-badge job">팀 구해요</span>${s.demo?'<span class="hp-badge">예시</span>':''}${mine?'<span class="hp-badge ok">내 등록</span>':''}${u.verified?'<span class="hp-badge ok">부산대 인증</span>':''}</div>
  <p class="hp-team-contest">${n?h(n.title):s.notice_title?h(s.notice_title):'공모전 상관없이'}</p>
  <h4>${h(u.nickname||'?')} <small>${h(userLine(u))}</small></h4>
  <p class="hp-team-roles">${(s.roles||[]).map(r=>`<span>${h(r)}</span>`).join('')}</p>
  <p class="hp-seek-intro">${h(s.intro)}</p>
  ${u.skills&&u.skills.length?`<p class="hp-pf-skills">${u.skills.map(x=>`<span>#${h(x)}</span>`).join('')}</p>`:''}
  <div class="hp-seek-act">${mine?`<button type="button" class="btn-outline" data-seek-edit="${h(s.id)}">수정</button><button type="button" class="btn-outline" data-seek-close="${h(s.id)}">등록 내리기</button>`
   :sent?'<span class="hp-badge">초대 보냄</span>':`<button type="button" class="${canInvite?'btn-fill':'btn-outline'}" data-invite="${h(s.id)}">팀에 초대하기</button>`}</div>
 </span></div></li>`;
}
function renderTeams(){
 const sec=document.getElementById('teams');if(!sec)return;
 seed();
 const me=DB.me();
 if(SV()&&!HP.srv.live()){
  sec.innerHTML=`<div class="wrap hp-page"><div class="page-head"><div><h2>공모전 팀원 모집</h2><p>효온에 올라온 공모전으로 부산대 학생끼리 팀을 꾸려요. 팀 글은 로그인한 학생에게만 보여요.</p></div></div>
   <div class="empty"><p>로그인하면 모집 중인 팀과 팀을 찾는 사람을 볼 수 있어요.</p><button type="button" class="btn-fill" id="tm-login">로그인하고 보기</button></div></div>`;
  sec.querySelector('#tm-login').onclick=()=>HP.requireLogin('팀원 모집은 로그인 후 볼 수 있어요',()=>renderTeams());
  return;
 }
 const all=DB.list('teams',t=>t.status!=='hidden');
 const seekers=DB.list('seekers',s=>s.status==='open'&&(!s.notice_id||!HP.findNotice(s.notice_id)||active(HP.findNotice(s.notice_id))));
 const q=flt.q.trim().toLowerCase();
 let list=all.filter(t=>(flt.only!=='open'||teamOpen(t))&&(!flt.role||t.roles.some(r=>r.name===flt.role&&(r.filled||0)<r.need))&&(!q||(t.title+' '+t.notice_title+' '+t.intro).toLowerCase().includes(q)));
 list.sort((a,b)=>(teamOpen(b)-teamOpen(a))||(a.deadline||'9999').localeCompare(b.deadline||'9999'));
 let slist=seekers.filter(s=>(!flt.role||(s.roles||[]).includes(flt.role))&&(!q||((s.intro||'')+' '+(s.notice_title||'')+' '+((DB.user(s.uid)||{}).nickname||'')).toLowerCase().includes(q)));
 slist.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
 const mySeek=me&&DB.list('seekers',s=>s.uid===me.id&&s.status==='open')[0];
 const myInv=me?DB.list('invites',x=>x.to===me.id&&x.status==='pending'):[];
 const contests=A.filter(active).filter(isContest);
 const withTeams=new Set(all.filter(teamOpen).map(t=>t.notice_id));
 const teamCount={};all.filter(teamOpen).forEach(t=>{teamCount[t.notice_id]=(teamCount[t.notice_id]||0)+1});
 const lonely=contests.slice().sort(cmpEnd);   /* 팀을 만들 수 있는 모든 공모전(팀이 이미 있어도 함께 만들 수 있다) */
 sec.innerHTML=`<div class="wrap hp-page">
  <div class="page-head"><div><h2>공모전 팀원 모집</h2><p>효온에 올라온 공모전으로 부산대 학생끼리 팀을 꾸려요. 모집글을 올려 지원을 받거나, 팀을 찾는 사람에게 직접 초대를 보낼 수 있어요.</p></div>
   <div class="hp-row-btns"><button type="button" class="btn-fill" id="tm-new">팀원 모집하기</button><button type="button" class="btn-outline" id="sk-new">${mySeek?'내 팀 구해요 수정':'팀 구해요 등록'}</button></div></div>
  ${myInv.length?`<div class="hp-suggest"><b>받은 초대 ${myInv.length}건</b> ${myInv.map(x=>{const t=DB.list('teams',y=>y.id===x.team_id)[0];return t?`<button type="button" class="hp-link" data-team="${h(t.id)}">${h(t.title.slice(0,24))} (${h(x.role)})</button>`:''}).join(' ')}</div>`:''}
  <div class="chips hp-seg" role="tablist" aria-label="보기">
   <button type="button" class="chip" role="tab" data-view="teams" aria-pressed="${view==='teams'}" aria-selected="${view==='teams'}">팀원 구하는 팀 <b>${all.filter(teamOpen).length}</b></button>
   <button type="button" class="chip" role="tab" data-view="seekers" aria-pressed="${view==='seekers'}" aria-selected="${view==='seekers'}">팀 찾는 사람 <b>${seekers.length}</b></button>
  </div>
  <div class="tools"><div class="grow"><label for="tm-q">검색</label><input id="tm-q" type="search" value="${h(flt.q)}" placeholder="${view==='teams'?'공모전명, 팀 소개':'공모전명, 소개, 닉네임'}"></div>
   <div><label for="tm-role">${view==='teams'?'구하는 역할':'할 수 있는 역할'}</label><select id="tm-role"><option value="">전체 역할</option>${ROLES.map(r=>`<option${r===flt.role?' selected':''}>${r}</option>`).join('')}</select></div>
   ${view==='teams'?`<div><label for="tm-only">상태</label><select id="tm-only"><option value="open"${flt.only==='open'?' selected':''}>모집 중만</option><option value="all"${flt.only==='all'?' selected':''}>전체</option></select></div>`:''}</div>
  ${view==='teams'?`<div class="summary"><h2>${list.length}팀</h2><p>모집 마감 가까운 순 · 공고 마감일이 지나면 자동으로 닫혀요</p></div>
   ${list.length?`<ul class="hp-team-grid">${list.map(teamCard).join('')}</ul>`:'<div class="empty"><p>조건에 맞는 팀이 아직 없어요. 먼저 팀을 만들어 보세요.</p></div>'}
   ${lonely.length?`<section class="hp-lonely"><h3>팀을 만들 수 있는 공모전 <small>${lonely.length}개 · 마감 임박순</small></h3><ul>${lonely.map(a=>`<li><a href="#${h(a.id)}">${h(a.title)}</a><em class="hp-lonely-n${teamCount[a.id]?' has':''}">${teamCount[a.id]?'모집 중인 팀 '+teamCount[a.id]+'개':'아직 팀 없음'}</em><span>${HP.ddayText(a.end)}</span><button type="button" class="hp-link" data-new-for="${h(a.id)}">이 공모전으로 팀 만들기</button></li>`).join('')}</ul></section>`:''}`
  :`<div class="summary"><h2>${slist.length}명</h2><p>${me&&myOpenTeams(me).length?'내 팀에 맞는 사람에게 초대를 보내 보세요':'팀장이 되면 이 사람들에게 초대를 보낼 수 있어요'}</p></div>
   ${slist.length?`<ul class="hp-team-grid">${slist.map(seekerCard).join('')}</ul>`:'<div class="empty"><p>아직 팀을 찾는 사람이 없어요.</p></div>'}`}
  <p class="hp-hint hp-rules">이용 규칙: 한 사람이 동시에 모집할 수 있는 팀은 ${MAX_OPEN}개예요. 전화번호·실명은 글에 쓰지 말아 주세요. 홍보·광고·금전 요구 글은 신고되면 숨겨져요.</p>
 </div>`;
 const g=s=>sec.querySelector(s);
 let tq;g('#tm-q').oninput=e=>{flt.q=e.target.value;clearTimeout(tq);tq=setTimeout(()=>{renderTeams();const i=document.getElementById('tm-q');i.focus();i.setSelectionRange(i.value.length,i.value.length)},350)};
 g('#tm-role').onchange=e=>{flt.role=e.target.value;renderTeams()};
 if(g('#tm-only'))g('#tm-only').onchange=e=>{flt.only=e.target.value;renderTeams()};
 g('#tm-new').onclick=()=>openTeamForm();
 g('#sk-new').onclick=()=>openSeekerForm(null,mySeek);
 sec.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;renderTeams();HP.log('tab',{tab:'teams-'+view})});
 sec.querySelectorAll('[data-team]').forEach(b=>b.onclick=()=>openTeam(b.dataset.team));
 sec.querySelectorAll('[data-new-for]').forEach(b=>b.onclick=()=>openTeamForm(HP.findNotice(b.dataset.newFor)));
 sec.querySelectorAll('[data-invite]').forEach(b=>b.onclick=()=>openInvite(DB.list('seekers',s=>s.id===b.dataset.invite)[0]));
 sec.querySelectorAll('[data-seek-edit]').forEach(b=>b.onclick=()=>openSeekerForm(null,DB.list('seekers',s=>s.id===b.dataset.seekEdit)[0]));
 sec.querySelectorAll('[data-seek-close]').forEach(b=>b.onclick=async()=>{
  if(SV()){const r=await HP.srv.closeSeeker(b.dataset.seekClose);if(!r.ok)return srvFail(r);HP.log('seeker_close');renderTeams();return}
  DB.update('seekers',b.dataset.seekClose,{status:'closed'});HP.log('seeker_close');renderTeams()});
}

/* ---------- 팀 만들기 ---------- */
function openTeamForm(notice,edit){
 HP.requireLogin('팀원을 모집하려면 로그인해 주세요',u=>{
  if(HP.pnuOn&&!u.verified){HP.openPnuVerify(()=>openTeamForm(notice,edit),'팀원 모집 글은 부산대 인증을 마친 계정만 쓸 수 있어요');return}
  const mineOpen=DB.list('teams',t=>t.leader===u.id&&teamOpen(t)).length;
  if(!edit&&mineOpen>=MAX_OPEN){HP.toast(`동시에 모집할 수 있는 팀은 ${MAX_OPEN}개예요. 기존 모집을 마감해 주세요`);return}
  const contests=A.filter(active).filter(isContest).sort(cmpEnd);
  const t=edit||{notice_id:notice?notice.id:'',title:'',intro:'',want:'',roles:[{name:'기획',need:1,filled:0}],mode:MODES[2],meet:'',deadline:notice&&notice.end||'',contact:u.contact||''};
  const d=HP.modal(`<form class="hp-form" id="tm-form" novalidate><h2>${edit?'모집 글 수정':'팀원 모집하기'}</h2>
   <p class="hp-sub">효온에 올라온 공모전만 고를 수 있어요. 모집글을 올리면 지원을 받을 수 있고, "팀 찾는 사람"에게 직접 초대하거나 초대 링크로 친구를 바로 합류시킬 수도 있어요.</p>
   <div class="hp-grid2">
    <div class="hp-field wide"><label for="tm-n">공모전 <em class="req">필수</em></label><select id="tm-n" ${edit?'disabled':''}><option value="">공모전 선택</option>${contests.map(a=>`<option value="${h(a.id)}"${a.id===t.notice_id?' selected':''}>${h(a.title.slice(0,60))} (${HP.ddayText(a.end)})</option>`).join('')}</select></div>
    <div class="hp-field wide hp-tm-poster" id="tm-poster" hidden></div>
    <div class="hp-field wide"><label for="tm-t">제목 <em class="req">필수</em></label><input id="tm-t" maxlength="60" value="${h(t.title)}" placeholder="예) 데이터 분석 같이 할 2명 모집"></div>
    <div class="hp-field wide"><label>구하는 역할과 인원 <em class="req">필수</em></label><div id="tm-roles" class="hp-roles"></div><button type="button" class="hp-link" id="tm-addrole">+ 역할 추가</button></div>
    <div class="hp-field"><label for="tm-mode">진행 방식</label><select id="tm-mode">${MODES.map(m=>`<option${m===t.mode?' selected':''}>${m}</option>`).join('')}</select></div>
    <div class="hp-field"><label for="tm-dl">모집 마감일</label><input id="tm-dl" type="date" value="${h(t.deadline)}"></div>
    <div class="hp-field wide"><label for="tm-meet">회의 방식·빈도</label><input id="tm-meet" maxlength="60" value="${h(t.meet)}" placeholder="예) 주 1회 저녁, 온라인 (자세한 장소는 적지 마세요)"></div>
    <div class="hp-field wide"><label for="tm-i">팀 소개·아이디어 <em class="req">필수</em></label><textarea id="tm-i" rows="4" maxlength="600" placeholder="지금 어디까지 준비됐는지, 어떤 결과물을 낼지">${h(t.intro)}</textarea></div>
    <div class="hp-field wide"><label for="tm-w">이런 분이면 좋아요</label><input id="tm-w" maxlength="120" value="${h(t.want)}"></div>
    <div class="hp-field wide"><label for="tm-c">팀장 연락 방법 <em class="req">필수</em></label><input id="tm-c" type="text" value="${h(t.contact)}" placeholder="오픈채팅 링크 · 전화번호 · 이메일 · 인스타(@아이디) 등" maxlength="120" autocomplete="off"><small class="hp-hint">편한 방법으로 적어요. 이 칸은 <b>합류가 확정된 팀원과 나에게만</b> 보여요. 제목·소개에는 번호를 쓸 수 없어요.</small></div>
   </div>
   <p class="hp-err" id="tm-err" role="alert"></p>
   <div class="hp-actions"><span></span><button class="btn-fill" type="submit">${edit?'저장':'모집 시작'}</button></div></form>`,{wide:true});
  let roles=t.roles.map(r=>Object.assign({},r));
  const q=s=>d.querySelector(s);
  const drawRoles=()=>{q('#tm-roles').innerHTML=roles.map((r,i)=>`<div class="hp-role-row"><select data-i="${i}" data-k="name" aria-label="역할">${ROLES.map(x=>`<option${x===r.name?' selected':''}>${x}</option>`).join('')}</select><input type="number" min="1" max="5" value="${r.need}" data-i="${i}" data-k="need" aria-label="인원"><span>명</span>${roles.length>1?`<button type="button" class="hp-link danger" data-rm="${i}">빼기</button>`:''}</div>`).join('')};
  drawRoles();
  q('#tm-roles').onchange=e=>{const i=+e.target.dataset.i,k=e.target.dataset.k;if(k)roles[i][k]=k==='need'?Math.max(1,Math.min(5,+e.target.value||1)):e.target.value};
  q('#tm-roles').onclick=e=>{const b=e.target.closest('[data-rm]');if(b){roles.splice(+b.dataset.rm,1);drawRoles()}};
  q('#tm-addrole').onclick=()=>{if(roles.length>=4){HP.toast('역할은 4개까지예요');return}roles.push({name:'기타',need:1,filled:0});drawRoles()};
  const prev=()=>{const a=HP.findNotice(edit?t.notice_id:q('#tm-n').value);const box=q('#tm-poster');if(!box)return;box.hidden=!a;if(a)box.innerHTML=posterTile(a,edit?t.poster:'','','md')+`<p><b>${h(a.title)}</b><span>${a.end?'공모전 마감 '+HP.fmtDate(a.end)+' · '+HP.ddayText(a.end):'마감일 원문 확인'}</span><small>이 공모전 포스터가 팀 글에 함께 보여요</small></p>`};
  q('#tm-n').onchange=e=>{const a=HP.findNotice(e.target.value);if(a&&a.end&&!q('#tm-dl').value)q('#tm-dl').value=a.end;prev()};
  prev();
  q('#tm-form').onsubmit=async e=>{
   e.preventDefault();
   const nid=edit?t.notice_id:q('#tm-n').value,a=HP.findNotice(nid);
   const v={title:q('#tm-t').value.trim(),intro:q('#tm-i').value.trim(),want:q('#tm-w').value.trim(),mode:q('#tm-mode').value,meet:q('#tm-meet').value.trim(),deadline:q('#tm-dl').value,contact:q('#tm-c').value.trim(),roles};
   const err=q('#tm-err');
   if(!a&&!edit){err.textContent='공모전을 골라 주세요.';return}
   if(!v.title||!v.intro){err.textContent='제목과 팀 소개를 적어 주세요.';return}
   const cc=contactCheck(v.contact);if(!cc.ok){err.textContent=cc.err;return}v.contact=cc.value;
   if(PHONE.test(v.title+v.intro+v.want+v.meet)){err.textContent='전화번호는 글에 쓸 수 없어요. 연락처 칸을 써 주세요.';return}
   if(a&&a.end&&v.deadline&&v.deadline>a.end){err.textContent='모집 마감일은 공모전 마감일('+a.end+')보다 늦을 수 없어요.';return}
   if(SV()){
    if(v.title.length<2){err.textContent='제목을 2자 이상 적어 주세요.';return}
    if(v.intro.length<10){err.textContent='팀 소개를 10자 이상 적어 주세요.';return}
    if(edit)roles.forEach(r=>{if((r.filled||0)>r.need)r.need=r.filled});
    const sb=q('#tm-form [type=submit]');if(sb)sb.disabled=true;
    const res=edit?await HP.srv.updateTeam(t.id,v):await HP.srv.createTeam(v,a);
    if(sb)sb.disabled=false;
    if(!res.ok){err.textContent=res.err;return}
    if(edit){HP.log('team_edit',{team_id:t.id});d.close();HP.toast('저장했어요');if(location.hash==='#teams')renderTeams();return}
    const nidNew=res.data&&res.data.id;
    HP.log('team_create',{team_id:nidNew,notice_key:noticeKey(a),roles:roles.map(x=>x.name).join(','),need:roles.reduce((s,x)=>s+x.need,0),mode:v.mode});
    if(!u.contact)DB.updateMe({contact:v.contact});
    d.close();HP.toast('모집을 시작했어요. 팀 찾는 사람에게 초대도 보내 보세요');
    if(nidNew)openTeam(nidNew);if(location.hash==='#teams')renderTeams();return;
   }
   if(edit){roles.forEach(r=>{if((r.filled||0)>r.need)r.need=r.filled});DB.update('teams',t.id,v);HP.log('team_edit',{team_id:t.id})}
   else{const r=DB.insert('teams',Object.assign({leader:u.id,notice_id:a.id,notice_key:noticeKey(a),notice_title:a.title,notice_end:a.end||'',poster:posterOf(a,''),status:'open',reports:0,invite_code:Math.random().toString(36).slice(2,10)},v));
    HP.log('team_create',{team_id:r.id,notice_key:noticeKey(a),roles:roles.map(x=>x.name).join(','),need:roles.reduce((s,x)=>s+x.need,0),mode:v.mode});
    if(!u.contact)DB.updateMe({contact:v.contact});
    d.close();HP.toast('모집을 시작했어요. 팀 찾는 사람에게 초대도 보내 보세요');openTeam(r.id);if(location.hash==='#teams')renderTeams();return}
   d.close();HP.toast('저장했어요');
   if(location.hash==='#teams')renderTeams();
  };
 });
}
HP.openTeamForm=openTeamForm;

/* ---------- 팀 구해요 등록 ---------- */
function openSeekerForm(notice,edit){
 HP.requireLogin('팀 구해요 등록은 로그인 후 할 수 있어요',u=>{
  const contests=A.filter(active).filter(isContest).sort(cmpEnd);
  const s=edit||{notice_id:notice?notice.id:'',roles:[],intro:''};
  const d=HP.modal(`<form class="hp-form" id="sk-form" novalidate><h2>${edit?'팀 구해요 수정':'팀 구해요 등록'}</h2>
   <p class="hp-sub">등록하면 팀장들이 "팀 찾는 사람" 목록에서 나를 보고 초대를 보낼 수 있어요. 닉네임·학과·학년·한 줄 소개·할 수 있는 것이 보이고, 이메일은 보이지 않아요.</p>
   <div class="hp-grid2">
    <div class="hp-field wide"><label for="sk-n">어떤 공모전?</label><select id="sk-n"><option value="">공모전 상관없이</option>${contests.map(a=>`<option value="${h(a.id)}"${a.id===s.notice_id?' selected':''}>${h(a.title.slice(0,60))} (${HP.ddayText(a.end)})</option>`).join('')}</select></div>
    <div class="hp-field wide"><label>맡을 수 있는 역할 <em class="req">필수</em> <small>(최대 3개)</small></label><div class="hp-chips" id="sk-roles">${ROLES.map(r=>`<label class="hp-chip"><input type="checkbox" value="${r}"${(s.roles||[]).includes(r)?' checked':''}><span>${r}</span></label>`).join('')}</div></div>
    <div class="hp-field wide"><label for="sk-i">한마디 <em class="req">필수</em> <small>(200자)</small></label><textarea id="sk-i" rows="3" maxlength="200" placeholder="예) 영상 편집 자신 있어요. 주말 회의 가능해요.">${h(s.intro)}</textarea></div>
   </div>
   ${!u.bio&&!(u.skills&&u.skills.length)?'<p class="hp-hint">마이페이지 > 설정에서 한 줄 소개와 할 수 있는 것을 채우면 초대를 받을 확률이 높아져요.</p>':''}
   <p class="hp-err" id="sk-err" role="alert"></p>
   <div class="hp-actions"><span></span><button class="btn-fill" type="submit">${edit?'저장':'등록'}</button></div></form>`,{wide:true});
  const q=x=>d.querySelector(x);
  q('#sk-roles').onchange=e=>{const on=[...d.querySelectorAll('#sk-roles input:checked')];if(on.length>3){e.target.checked=false;HP.toast('역할은 3개까지 고를 수 있어요')}};
  q('#sk-form').onsubmit=async e=>{
   e.preventDefault();
   const roles=[...d.querySelectorAll('#sk-roles input:checked')].map(i=>i.value),intro=q('#sk-i').value.trim(),nid=q('#sk-n').value,a=HP.findNotice(nid);
   if(!roles.length){q('#sk-err').textContent='역할을 하나 이상 골라 주세요.';return}
   if(intro.length<5){q('#sk-err').textContent='한마디를 5자 이상 적어 주세요.';return}
   if(PHONE.test(intro)){q('#sk-err').textContent='전화번호는 적지 말아 주세요.';return}
   const v={notice_id:a?a.id:'',notice_title:a?a.title:'',roles,intro};
   if(SV()){
    const res=await HP.srv.saveSeeker({notice_key:a?noticeKey(a):'',notice_title:a?a.title.slice(0,300):'',roles,intro},edit&&edit.id);
    if(!res.ok){q('#sk-err').textContent=res.err;return}
    HP.log(edit?'seeker_edit':'seeker_create',edit?undefined:{notice_key:a?noticeKey(a):null,roles:roles.join(',')});
    d.close();HP.toast(edit?'저장했어요':'팀 구해요에 등록했어요');view='seekers';
    if(location.hash==='#teams')renderTeams();else location.hash='teams';
    return;
   }
   if(edit){DB.update('seekers',edit.id,v);HP.log('seeker_edit')}
   else{
    DB.list('seekers',x=>x.uid===u.id&&x.status==='open').forEach(x=>DB.update('seekers',x.id,{status:'closed'}));
    const sk=DB.insert('seekers',Object.assign({uid:u.id,status:'open'},v));
    HP.log('seeker_create',{notice_key:a?noticeKey(a):null,roles:roles.join(',')});
    /* 시안: 예시 팀장이 잠시 뒤 초대를 보내는 것처럼 보여 준다 */
    const demoTeam=DB.list('teams',t=>t.demo&&teamOpen(t)&&openRoles(t).some(r=>roles.includes(r.name)))[0]||DB.list('teams',t=>t.demo&&teamOpen(t)&&openRoles(t).length)[0];
    if(demoTeam)setTimeout(()=>{if(!DB.me()||DB.me().id!==u.id)return;const role=(openRoles(demoTeam).find(r=>roles.includes(r.name))||openRoles(demoTeam)[0]).name;
     DB.insert('invites',{team_id:demoTeam.id,from:demoTeam.leader,to:u.id,role,message:'등록하신 글 보고 연락드려요. 같이 해요!',status:'pending',demo:true});
     HP.toast('예시 팀장에게서 초대가 왔어요. 팀원 모집 탭이나 마이페이지 > 내 팀에서 확인해 보세요');if(location.hash==='#teams')renderTeams()},2500);
   }
   d.close();HP.toast(edit?'저장했어요':'팀 구해요에 등록했어요');view='seekers';
   if(location.hash==='#teams')renderTeams();else location.hash='teams';
  };
 });
}
HP.openSeekerForm=openSeekerForm;

/* ---------- 팀장이 직접 초대 ---------- */
function openInvite(seeker){
 if(!seeker)return;
 HP.requireLogin('초대하려면 로그인해 주세요',u=>{
  const mine=myOpenTeams(u);
  if(!mine.length){HP.toast('먼저 팀원 모집하기로 팀을 만들어야 초대할 수 있어요');return}
  const su=DB.user(seeker.uid)||{};
  const prefer=mine.find(t=>t.notice_id&&t.notice_id===seeker.notice_id)||mine[0];
  const roleOpts=t=>openRoles(t).map(r=>`<option${(seeker.roles||[]).includes(r.name)?' selected':''}>${h(r.name)}</option>`).join('');
  const d=HP.modal(`<form class="hp-form" id="iv-form"><h2>${h(su.nickname||'?')}님을 초대할까요?</h2>
   <p class="hp-sub">${h(userLine(su))}${su.bio?' · '+h(su.bio):''}<br>맡을 수 있는 역할: ${(seeker.roles||[]).map(h).join(', ')}</p>
   <div class="hp-grid2">
    <div class="hp-field wide"><label for="iv-t">초대할 팀</label><select id="iv-t">${mine.map(t=>`<option value="${h(t.id)}"${t===prefer?' selected':''}>${h(t.title.slice(0,40))} · ${h((HP.findNotice(t.notice_id)||{title:t.notice_title}).title.slice(0,24))}</option>`).join('')}</select></div>
    <div class="hp-field"><label for="iv-r">맡길 역할</label><select id="iv-r">${roleOpts(prefer)}</select></div>
    <div class="hp-field wide"><label for="iv-m">한마디 <small>(150자)</small></label><textarea id="iv-m" rows="3" maxlength="150" placeholder="예) 영상 공모전 같이 해요! 촬영은 제가, 편집 맡아 주실 분을 찾고 있어요."></textarea></div>
   </div>
   <p class="hp-hint">상대가 수락하면 바로 팀에 합류하고, 팀장 연락처가 상대에게 보여요.</p><p class="hp-err" id="iv-err" role="alert"></p>
   <div class="hp-actions"><span></span><button class="btn-fill" type="submit">초대 보내기</button></div></form>`);
  const q=x=>d.querySelector(x);
  q('#iv-t').onchange=e=>{const t=mine.find(x=>x.id===e.target.value);q('#iv-r').innerHTML=roleOpts(t)};
  q('#iv-form').onsubmit=async e=>{
   e.preventDefault();
   const t=mine.find(x=>x.id===q('#iv-t').value),role=q('#iv-r').value,msg=q('#iv-m').value.trim();
   if(PHONE.test(msg)){q('#iv-err').textContent='전화번호는 적지 말아 주세요.';return}
   if(isMember(t,su)){q('#iv-err').textContent='이미 이 팀에 있어요.';return}
   if(DB.list('invites',x=>x.team_id===t.id&&x.to===su.id&&x.status==='pending').length){q('#iv-err').textContent='이미 초대를 보냈어요.';return}
   if(SV()){
    const res=await HP.srv.invite(t.id,su.id,role,msg);
    if(!res.ok){q('#iv-err').textContent=res.err;return}
    HP.log('team_invite',{team_id:t.id,role,via:'seeker'});d.close();HP.toast('초대를 보냈어요. 수락하면 팀에 합류해요');renderTeams();return;
   }
   DB.insert('invites',{team_id:t.id,from:u.id,to:su.id,role,message:msg,status:'pending'});
   HP.log('team_invite',{team_id:t.id,role,via:'seeker'});
   d.close();
   if(seeker.demo){/* 예시 사용자는 잠시 뒤 수락 */const iv=DB.list('invites',x=>x.team_id===t.id&&x.to===su.id&&x.status==='pending')[0];
    setTimeout(()=>{acceptInvite(iv,true);HP.toast(`${su.nickname}님이 초대를 수락해 팀에 합류했어요`);if(location.hash==='#teams')renderTeams()},1800)}
   HP.toast('초대를 보냈어요. 수락하면 팀에 합류해요');renderTeams();
  };
 });
}
/* 서버 모드: 초대에 답하기. 성공하면 true */
async function answerInviteSrv(iv,yes){
 const r=await HP.srv.answerInvite(iv.id,yes);
 if(!r.ok){HP.toast(r.err);return false}
 HP.log('team_invite_answer',{team_id:iv.team_id,decision:yes?'accepted':'declined'});
 return true;
}
function acceptInvite(iv,silent){
 const t=DB.list('teams',x=>x.id===iv.team_id)[0];if(!t)return;
 if(!openRoles(t).some(r=>r.name===iv.role)&&!openRoles(t).length){DB.update('invites',iv.id,{status:'expired'});if(!silent)HP.toast('그 사이 자리가 다 찼어요');return}
 DB.update('invites',iv.id,{status:'accepted'});
 const prev=DB.list('apps',a=>a.team_id===t.id&&a.uid===iv.to)[0];
 if(prev)DB.update('apps',prev.id,{status:'accepted',role:iv.role,via:'invite'});
 else DB.insert('apps',{team_id:t.id,uid:iv.to,role:iv.role,message:'(초대로 합류)',status:'accepted',via:'invite'});
 fillRole(t,iv.role);
 DB.list('seekers',s=>s.uid===iv.to&&s.status==='open').forEach(s=>DB.update('seekers',s.id,{status:'closed'}));
 HP.log('team_invite_answer',{team_id:t.id,decision:'accepted'});
}

/* ---------- 초대 링크로 합류: #join-<코드> ---------- */
async function joinByCodeSrv(code){
 const info=await HP.srv.teamByCode(code);
 if(!info){HP.toast('초대 링크가 만료됐거나 잘못됐어요');location.hash='teams';return}
 HP.requireLogin('팀에 합류하려면 로그인해 주세요',async u=>{
  await HP.srv.pull(true);
  const known=DB.list('teams',x=>x.id===info.id)[0];
  if(known&&isMember(known,u)){openTeam(known.id);return}
  const openR=(info.roles||[]).filter(r=>(r.filled||0)<r.need);
  if(info.status!=='open'||!openR.length){HP.toast('모집이 끝난 팀이에요');return}
  const d=HP.modal(`<form class="hp-form" id="jn-form"><span class="hp-eyebrow">초대 링크</span><h2>이 팀에 합류할까요?</h2>
   <p class="hp-sub"><b>${h(info.title)}</b><br>${h(info.notice_title)}</p>
   <div class="hp-field"><label for="jn-r">맡을 역할</label><select id="jn-r">${openR.map(r=>`<option>${h(r.name)}</option>`).join('')}</select></div>
   <p class="hp-hint">팀장이 보낸 링크로 들어오면 지원 없이 바로 합류해요. 합류하면 팀장 연락처가 보여요.</p><p class="hp-err" id="jn-err" role="alert"></p>
   <div class="hp-actions"><button type="button" class="btn-outline" data-close>다음에</button><button class="btn-fill" type="submit">합류하기</button></div></form>`);
  d.querySelector('#jn-form').onsubmit=async e=>{e.preventDefault();const role=d.querySelector('#jn-r').value;
   const r=await HP.srv.joinByCode(code,role);
   if(!r.ok){d.querySelector('#jn-err').textContent=r.err;return}
   HP.log('team_join_link',{team_id:info.id,role});d.close();HP.toast('팀에 합류했어요');location.hash='teams';setTimeout(()=>openTeam(r.data||info.id),50)};
 });
}
function joinByCode(code){
 if(SV())return joinByCodeSrv(code);
 const t=DB.list('teams',x=>x.invite_code===code)[0];
 if(!t){HP.toast('초대 링크가 만료됐거나 잘못됐어요');location.hash='teams';return}
 HP.requireLogin('팀에 합류하려면 로그인해 주세요',u=>{
  if(isMember(t,u)){openTeam(t.id);return}
  if(!teamOpen(t)||!openRoles(t).length){HP.toast('모집이 끝난 팀이에요');openTeam(t.id);return}
  const L=leaderOf(t);
  const d=HP.modal(`<form class="hp-form" id="jn-form"><span class="hp-eyebrow">초대 링크</span><h2>이 팀에 합류할까요?</h2>
   <p class="hp-sub"><b>${h(t.title)}</b><br>${h(t.notice_title)}</p>
   <div class="hp-field"><label for="jn-r">맡을 역할</label><select id="jn-r">${openRoles(t).map(r=>`<option>${h(r.name)}</option>`).join('')}</select></div>
   <p class="hp-hint">팀장이 보낸 링크로 들어오면 지원 없이 바로 합류해요. 합류하면 팀장 연락처가 보여요.</p>
   <div class="hp-actions"><button type="button" class="btn-outline" data-close>다음에</button><button class="btn-fill" type="submit">합류하기</button></div></form>`);
  d.querySelector('#jn-form').onsubmit=e=>{e.preventDefault();const role=d.querySelector('#jn-r').value;
   const prev=DB.list('apps',a=>a.team_id===t.id&&a.uid===u.id)[0];
   if(prev)DB.update('apps',prev.id,{status:'accepted',role,via:'link'});else DB.insert('apps',{team_id:t.id,uid:u.id,role,message:'(초대 링크로 합류)',status:'accepted',via:'link'});
   fillRole(t,role);HP.log('team_join_link',{team_id:t.id,role});d.close();HP.toast('팀에 합류했어요');location.hash='teams';setTimeout(()=>openTeam(t.id),50)};
 });
}

/* ---------- 팀 상세 · 지원 · 팀 관리 ---------- */
function openTeam(id){
 const t=DB.list('teams',x=>x.id===id)[0];if(!t)return;
 const me=DB.me(),L=leaderOf(t),n=HP.findNotice(t.notice_id),mine=me&&me.id===t.leader,open=teamOpen(t);
 const myApp=me&&DB.list('apps',x=>x.team_id===t.id&&x.uid===me.id)[0];
 const myInv=me&&DB.list('invites',x=>x.team_id===t.id&&x.to===me.id&&x.status==='pending')[0];
 const apps=mine?DB.list('apps',x=>x.team_id===t.id&&x.status==='pending'):[];
 const mem=members(t);
 const sent=mine?DB.list('invites',x=>x.team_id===t.id):[];
 const cands=mine?DB.list('seekers',s=>s.status==='open'&&s.uid!==me.id&&!isMember(t,DB.user(s.uid))&&(!s.notice_id||s.notice_id===t.notice_id)).sort((a,b)=>(b.notice_id===t.notice_id)-(a.notice_id===t.notice_id)||(openRoles(t).some(r=>(b.roles||[]).includes(r.name))-openRoles(t).some(r=>(a.roles||[]).includes(r.name)))).slice(0,4):[];
 HP.log('team_view',{team_id:t.id,notice_key:t.notice_key,mine:!!mine});
 const appRow=x=>{const au=DB.user(x.uid)||{};return `<li class="hp-app" data-app="${h(x.id)}"><div><b>${h(au.nickname||'?')}</b> <span class="hp-badge">${h(x.role)}</span> ${au.verified?'<span class="hp-badge ok">부산대 인증</span>':''}<p>${h(userLine(au))}${au.bio?' · '+h(au.bio):''}</p><p class="hp-app-msg">“${h(x.message)}”</p>${au.skills&&au.skills.length?`<p class="hp-pf-skills">${au.skills.map(s=>`<span>#${h(s)}</span>`).join('')}</p>`:''}</div>
  <div class="hp-app-act"><button type="button" class="btn-fill" data-dec="accepted">수락</button><button type="button" class="btn-outline" data-dec="rejected">거절</button></div></li>`};
 const memRow=x=>{const au=DB.user(x.uid)||{};return `<li data-mem="${h(x.id)}"><span class="hp-av sm" aria-hidden="true">${h((au.nickname||'?').slice(0,1))}</span><b>${h(au.nickname||'?')}</b><span class="hp-badge">${h(x.role)}</span><small>${x.via==='invite'?'초대로 합류':x.via==='link'?'링크로 합류':'지원으로 합류'}</small>${mine?'<button type="button" class="hp-link danger" data-kick>내보내기</button>':''}</li>`};
 const link=location.origin+location.pathname+'#join-'+(t.invite_code||'');
 const d=HP.modal(`<div class="hp-team-detail">
  <div class="hp-team-top"><span class="hp-badge ${open?'ok':''}">${open?'모집 중':'모집 마감'}</span>${t.demo?'<span class="hp-badge">예시 글</span>':''}<span class="hp-team-d">${t.deadline?'모집 마감 '+HP.fmtDate(t.deadline)+' · '+HP.ddayText(t.deadline):''}</span></div>
  <div class="hp-team-head">${posterOf(n,t.poster)?`<a class="hp-team-head-poster" href="${h(posterOf(n,t.poster))}" target="_blank" rel="noopener noreferrer" aria-label="공모전 포스터 크게 보기">${posterTile(n,t.poster,'','lg')}</a>`:posterTile(n,'','','lg')}
  <div><h2>${h(t.title)}</h2>
  <p class="hp-team-contest">${n?`<a href="#${h(n.id)}" data-close>${h(n.title)}</a> · 공모전 마감 ${HP.fmtDate(n.end)}`:h(t.notice_title)}</p></div></div>
  <dl class="hp-team-info">
   <div><dt>구하는 역할</dt><dd class="hp-team-roles">${t.roles.map(r=>`<span class="${(r.filled||0)>=r.need?'full':''}">${h(r.name)} ${r.filled||0}/${r.need}</span>`).join('')}</dd></div>
   <div><dt>진행 방식</dt><dd>${h(t.mode)}${t.meet?' · '+h(t.meet):''}</dd></div>
   <div><dt>팀장</dt><dd>${leaderSeen(t)?`${h(L.nickname)} ${L.verified?'<span class="hp-badge ok">부산대 인증</span>':''} <small>${h(userLine(L))}</small>`:'<small>이름·학과는 합류가 확정되면 공개돼요</small>'}</dd></div>
   <div><dt>팀원</dt><dd>${mem.length?mem.map(x=>h((DB.user(x.uid)||{}).nickname||'?')+` (${h(x.role)})`).join(', '):'아직 없음'}</dd></div>
  </dl>
  <h3>팀 소개</h3><p class="hp-team-intro">${h(t.intro)}</p>
  ${t.want?`<h3>이런 분이면 좋아요</h3><p class="hp-team-intro">${h(t.want)}</p>`:''}
  ${mine?`<section class="hp-team-manage">
    <h3>팀원 직접 모으기</h3>
    <div class="hp-recruit">
     <div><b>초대 링크</b><p class="hp-hint" style="margin:2px 0 8px">친구에게 보내면 지원 없이 바로 합류해요.</p><div class="hp-mailrow"><input id="tm-link" readonly value="${h(link)}" aria-label="초대 링크"><button type="button" class="btn-outline" id="tm-copy">복사</button></div></div>
     <div><b>팀 찾는 사람 ${cands.length?`· 추천 ${cands.length}명`:''}</b>${cands.length?`<ul class="hp-cand-list">${cands.map(s=>{const su=DB.user(s.uid)||{};const inv=sent.find(x=>x.to===s.uid&&x.status==='pending');return `<li><div><b>${h(su.nickname||'?')}</b> <small>${h(userLine(su))}</small><p>${(s.roles||[]).map(h).join(' · ')} — ${h(s.intro.slice(0,50))}</p></div>${inv?'<span class="hp-badge">초대 보냄</span>':`<button type="button" class="btn-outline" data-inv-seek="${h(s.id)}">초대</button>`}</li>`}).join('')}</ul>`:'<p class="hp-hint">아직 이 공모전으로 팀을 찾는 사람이 없어요.</p>'}<button type="button" class="hp-link" id="tm-seekers">팀 찾는 사람 전체 보기 →</button></div>
    </div>
    ${sent.length?`<p class="hp-hint">보낸 초대: ${sent.map(x=>h((DB.user(x.to)||{}).nickname||'?')+' '+({pending:'대기',accepted:'수락',declined:'거절',expired:'만료'}[x.status]||x.status)).join(' · ')}</p>`:''}
    <h3>받은 지원 ${apps.length}건</h3>${apps.length?`<ul class="hp-app-list">${apps.map(appRow).join('')}</ul>`:'<p class="hp-hint">새 지원이 없어요.</p>'}
    ${mem.length?`<h3>팀원 ${mem.length}명</h3><ul class="hp-mem-list">${mem.map(memRow).join('')}</ul>`:''}
    <div class="hp-actions"><button type="button" class="btn-outline" id="tm-edit">글 수정</button><button type="button" class="btn-outline" id="tm-close">${t.status==='open'?'모집 마감하기':'모집 다시 열기'}</button></div></section>`
  :myInv?`<section class="hp-team-apply"><h3>팀장에게서 초대가 왔어요</h3><p><b>${h(myInv.role)}</b> 역할로 함께하자는 초대예요.</p>${myInv.message?`<p class="hp-app-msg">“${h(myInv.message)}”</p>`:''}
    <div class="hp-actions"><button type="button" class="btn-outline" id="iv-no">거절</button><button type="button" class="btn-fill" id="iv-yes">수락하고 합류</button></div></section>`
  :myApp&&myApp.status!=='withdrawn'?`<section class="hp-team-apply"><h3>내 상태</h3><p>${h(myApp.role)} · <b>${myApp.status==='pending'?'팀장 확인 중':myApp.status==='accepted'?'팀원이에요':myApp.status==='rejected'?'이번엔 함께하지 못해요':'팀에서 나왔어요'}</b></p>
    ${myApp.status==='accepted'?`<p class="hp-contact">팀장 연락 방법: ${contactHtml(t.contact)}</p><button type="button" class="hp-link danger" id="ap-leave">팀에서 나가기</button>`:''}
    ${myApp.status==='pending'?'<button type="button" class="btn-outline" id="ap-cancel">지원 취소</button>':''}</section>`
  :open?`<form class="hp-form hp-team-apply" id="ap-form"><h3>지원하기</h3>
    <div class="hp-grid2"><div class="hp-field"><label for="ap-role">지원 역할</label><select id="ap-role">${openRoles(t).map(r=>`<option>${h(r.name)}</option>`).join('')}</select></div>
    <div class="hp-field wide"><label for="ap-msg">팀장에게 한마디 <small>(소개·가능한 시간, 200자)</small></label><textarea id="ap-msg" maxlength="200" rows="3" placeholder="예) 피그마로 포스터 만들어 본 적 있어요. 평일 저녁 회의 가능해요."></textarea></div></div>
    <p class="hp-hint">팀장에게는 닉네임, 학과·학년, 한 줄 소개, 할 수 있는 것이 보여요. 이메일은 보이지 않아요.</p>
    <p class="hp-err" id="ap-err" role="alert"></p><div class="hp-actions"><span></span><button class="btn-fill" type="submit">지원하기</button></div></form>`
  :'<p class="hp-hint">모집이 마감됐어요.</p>'}
  <div class="hp-team-foot"><button type="button" class="hp-link" id="tm-share">링크 복사</button>${!mine?'<button type="button" class="hp-link danger" id="tm-report">신고</button>':''}</div>
 </div>`,{wide:true});
 const q=s=>d.querySelector(s);
 const re=()=>{d.close();openTeam(id);if(location.hash==='#teams')renderTeams()};
 if(q('#ap-form'))q('#ap-form').onsubmit=e=>{e.preventDefault();
  HP.requireLogin('지원하려면 로그인해 주세요',async u=>{
   const msg=q('#ap-msg').value.trim();if(msg.length<5){q('#ap-err').textContent='한마디를 5자 이상 적어 주세요.';return}
   if(PHONE.test(msg)){q('#ap-err').textContent='전화번호는 적지 말아 주세요.';return}
   if(SV()){
    const r=await HP.srv.apply(t.id,q('#ap-role').value,msg);
    if(!r.ok){q('#ap-err').textContent=r.err;return}
    HP.log('team_apply',{team_id:t.id,notice_key:t.notice_key,role:q('#ap-role').value});HP.toast('지원했어요. 팀장이 수락하면 연락처가 보여요');re();return;
   }
   const prev=DB.list('apps',x=>x.team_id===t.id&&x.uid===u.id)[0];
   const role=q('#ap-role').value;
   if(prev)DB.update('apps',prev.id,{role,message:msg,status:'pending'});else DB.insert('apps',{team_id:t.id,uid:u.id,role,message:msg,status:'pending',via:'apply'});
   HP.log('team_apply',{team_id:t.id,notice_key:t.notice_key,role});
   if(t.demo){const ap=DB.list('apps',x=>x.team_id===t.id&&x.uid===u.id)[0];setTimeout(()=>{DB.update('apps',ap.id,{status:'accepted'});fillRole(t,ap.role);HP.toast('예시 팀장이 지원을 수락했어요. 연락처가 열렸어요')},1200)}
   HP.toast('지원했어요. 팀장이 수락하면 연락처가 보여요');re();
  });
 };
 if(q('#ap-cancel'))q('#ap-cancel').onclick=async()=>{
  if(SV()){const r=await HP.srv.withdraw(t.id);if(!r.ok)return srvFail(r);HP.log('team_withdraw',{team_id:t.id});re();return}
  DB.update('apps',myApp.id,{status:'withdrawn'});HP.log('team_withdraw',{team_id:t.id});re()};
 if(q('#ap-leave'))q('#ap-leave').onclick=async()=>{const b=q('#ap-leave');if(b.dataset.armed!=='1'){b.dataset.armed='1';b.textContent='한 번 더 누르면 나가요';return}
  if(SV()){const r=await HP.srv.leave(t.id);if(!r.ok)return srvFail(r);HP.log('team_leave',{team_id:t.id});re();return}
  DB.update('apps',myApp.id,{status:'removed'});unfillRole(t,myApp.role);HP.log('team_leave',{team_id:t.id});re()};
 if(q('#iv-yes'))q('#iv-yes').onclick=async()=>{
  if(SV()){if(await answerInviteSrv(myInv,true)){HP.toast('팀에 합류했어요');re()}return}
  acceptInvite(myInv);HP.toast('팀에 합류했어요');re()};
 if(q('#iv-no'))q('#iv-no').onclick=async()=>{
  if(SV()){if(await answerInviteSrv(myInv,false))re();return}
  DB.update('invites',myInv.id,{status:'declined'});HP.log('team_invite_answer',{team_id:t.id,decision:'declined'});re()};
 d.querySelectorAll('[data-dec]').forEach(b=>b.onclick=async()=>{const li=b.closest('[data-app]'),ap=DB.list('apps',x=>x.id===li.dataset.app)[0],st=b.dataset.dec;
  if(SV()){const r=await HP.srv.decide(ap.id,st);if(!r.ok)return srvFail(r);HP.log('team_decide',{team_id:t.id,decision:st,role:ap.role});re();return}
  if(st==='accepted'){const r=t.roles.find(x=>x.name===ap.role);if(r&&(r.filled||0)>=r.need){HP.toast('이 역할은 이미 다 찼어요');return}DB.update('apps',ap.id,{status:st});fillRole(t,ap.role)}
  else DB.update('apps',ap.id,{status:st});
  HP.log('team_decide',{team_id:t.id,decision:st,role:ap.role});re()});
 d.querySelectorAll('[data-kick]').forEach(b=>b.onclick=async()=>{if(b.dataset.armed!=='1'){b.dataset.armed='1';b.textContent='한 번 더';return}const ap=DB.list('apps',x=>x.id===b.closest('[data-mem]').dataset.mem)[0];
  if(SV()){const r=await HP.srv.decide(ap.id,'removed');if(!r.ok)return srvFail(r);HP.log('team_remove_member',{team_id:t.id});re();return}
  DB.update('apps',ap.id,{status:'removed'});unfillRole(t,ap.role);HP.log('team_remove_member',{team_id:t.id});re()});
 d.querySelectorAll('[data-inv-seek]').forEach(b=>b.onclick=()=>{d.close();openInvite(DB.list('seekers',s=>s.id===b.dataset.invSeek)[0])});
 if(q('#tm-copy'))q('#tm-copy').onclick=async()=>{try{await navigator.clipboard.writeText(link);HP.toast('초대 링크를 복사했어요');HP.log('team_invite',{team_id:t.id,via:'link'})}catch{q('#tm-link').select();HP.toast('링크를 길게 눌러 복사해 주세요')}};
 if(q('#tm-seekers'))q('#tm-seekers').onclick=()=>{d.close();view='seekers';if(location.hash==='#teams')renderTeams();else location.hash='teams'};
 if(q('#tm-edit'))q('#tm-edit').onclick=()=>{d.close();openTeamForm(null,t)};
 if(q('#tm-close'))q('#tm-close').onclick=async()=>{
  if(SV()){const r=await HP.srv.setTeamStatus(t.id,t.status==='open'?'closed':'open');if(!r.ok)return srvFail(r);HP.log('team_close',{team_id:t.id,reopen:t.status!=='open'});re();return}
  DB.update('teams',t.id,{status:t.status==='open'?'closed':'open'});HP.log('team_close',{team_id:t.id,reopen:t.status!=='open'});re()};
 q('#tm-share').onclick=async()=>{try{await navigator.clipboard.writeText(location.origin+location.pathname+'#teams');HP.toast('링크를 복사했어요')}catch{HP.toast('복사하지 못했어요')}};
 if(q('#tm-report'))q('#tm-report').onclick=()=>{HP.requireLogin('신고하려면 로그인해 주세요',u=>{
  const reason=['광고·홍보','금전 요구','개인정보 노출','욕설·비방','기타'];
  const rd=HP.modal(`<form class="hp-form" id="rp-form"><h2>신고하기</h2><p class="hp-sub">운영자가 확인해서 숨기거나 정리해요. 신고자는 공개되지 않아요.</p>${reason.map((r,i)=>`<label class="hp-inline"><input type="radio" name="rp" value="${r}"${i===0?' checked':''}> ${r}</label>`).join('')}<div class="hp-actions"><span></span><button class="btn-fill" type="submit">신고</button></div></form>`);
  rd.querySelector('#rp-form').onsubmit=async e=>{e.preventDefault();const why=rd.querySelector('input[name=rp]:checked').value;
   if(SV()){const r=await HP.srv.report(t.id,why);if(!r.ok){HP.toast(r.err);rd.close();return}HP.log('team_report',{team_id:t.id,reason:why});rd.close();HP.toast('신고를 받았어요. 확인할게요');return}
   if(DB.list('reports',r=>r.target_id===t.id&&r.uid===u.id).length){HP.toast('이미 신고한 글이에요');rd.close();return}
   DB.insert('reports',{target_type:'team',target_id:t.id,uid:u.id,reason:why,status:'new'});DB.update('teams',t.id,{reports:(t.reports||0)+1});
   HP.log('team_report',{team_id:t.id,reason:why});rd.close();HP.toast('신고를 받았어요. 확인할게요')};
 })};
}
HP.openTeam=openTeam;

/* ---------- 마이페이지 > 내 팀 ---------- */
HP.renderMyTeams=function(body,u){
 ensureTables();
 const lead=DB.list('teams',t=>t.leader===u.id&&t.status!=='hidden');
 const apps=DB.list('apps',a=>a.uid===u.id&&a.status!=='withdrawn');
 const invs=DB.list('invites',x=>x.to===u.id&&x.status==='pending');
 const mySeek=DB.list('seekers',s=>s.uid===u.id&&s.status==='open')[0];
 const pending=lead.reduce((s,t)=>s+DB.list('apps',a=>a.team_id===t.id&&a.status==='pending').length,0);
 const teamOf=id=>DB.list('teams',t=>t.id===id)[0];
 body.innerHTML=`<div class="hp-sec-head"><div><h3>내 팀</h3><p>내가 모집하는 팀, 합류·지원한 팀, 받은 초대예요.${pending?` <b>확인할 지원 ${pending}건</b>`:''}</p></div><div class="hp-row-btns"><a class="btn-outline" href="#teams">팀원 모집 보기</a></div></div>
  ${invs.length?`<h4 class="hp-h4">받은 초대 ${invs.length}</h4><ul class="hp-inv-list">${invs.map(x=>{const t=teamOf(x.team_id);const L=t?leaderOf(t):{};return t?`<li data-iv="${h(x.id)}"><div><b>${h(t.title)}</b><p>${h(L.nickname)} 팀장 · ${h(x.role)} 역할 · ${h((HP.findNotice(t.notice_id)||{title:t.notice_title}).title.slice(0,30))}</p>${x.message?`<p class="hp-app-msg">“${h(x.message)}”</p>`:''}</div><div class="hp-app-act"><button type="button" class="btn-outline" data-iva="view">보기</button><button type="button" class="btn-fill" data-iva="yes">수락</button><button type="button" class="btn-outline" data-iva="no">거절</button></div></li>`:''}).join('')}</ul>`:''}
  <h4 class="hp-h4">내가 모집하는 팀 ${lead.length}</h4>${lead.length?`<ul class="hp-team-grid">${lead.map(teamCard).join('')}</ul>`:'<p class="hp-hint">아직 없어요.</p>'}
  <h4 class="hp-h4">합류·지원한 팀 ${apps.length}</h4>${apps.length?`<ul class="hp-team-grid">${apps.map(a=>teamOf(a.team_id)).filter(Boolean).map(teamCard).join('')}</ul>`:'<p class="hp-hint">아직 없어요.</p>'}
  <h4 class="hp-h4">팀 구해요</h4>${mySeek?`<p class="hp-hint">등록 중: ${(mySeek.roles||[]).map(h).join(', ')} · ${mySeek.notice_title?h(mySeek.notice_title.slice(0,30)):'공모전 상관없이'} <button type="button" class="hp-link" id="my-seek">수정</button></p>`:'<p class="hp-hint">등록하면 팀장들이 초대를 보낼 수 있어요. <button type="button" class="hp-link" id="my-seek">팀 구해요 등록</button></p>'}`;
 body.querySelectorAll('[data-team]').forEach(b=>b.onclick=()=>openTeam(b.dataset.team));
 body.querySelector('#my-seek').onclick=()=>openSeekerForm(null,mySeek);
 body.querySelectorAll('[data-iva]').forEach(b=>b.onclick=async()=>{const iv=DB.list('invites',x=>x.id===b.closest('[data-iv]').dataset.iv)[0];
  if(b.dataset.iva==='view')return openTeam(iv.team_id);
  if(SV()){const ok=await answerInviteSrv(iv,b.dataset.iva==='yes');if(ok){if(b.dataset.iva==='yes')HP.toast('팀에 합류했어요');HP.renderMe()}return}
  if(b.dataset.iva==='yes'){acceptInvite(iv);HP.toast('팀에 합류했어요')}else{DB.update('invites',iv.id,{status:'declined'});HP.log('team_invite_answer',{team_id:iv.team_id,decision:'declined'})}
  HP.renderMe()});
};

/* ---------- 공고 상세: 위쪽에 "팀원 모집하기", 옆에는 이 공모전의 팀·팀 찾는 사람 ---------- */
HP.on('detail',a=>{
 if(!isContest(a))return;
 seed();
 const dc=document.getElementById('dc');if(!dc)return;
 const acts=dc.querySelector('.detail-hero-actions');
 if(acts&&active(a)&&!acts.querySelector('[data-team-new]')){
  acts.insertAdjacentHTML('beforeend','<button type="button" class="btn-outline hp-hero-team" data-team-new>팀원 모집하기</button>');
  acts.querySelector('[data-team-new]').onclick=()=>openTeamForm(a);
 }
 const side=dc.querySelector('.dside');if(!side)return;
 const open=DB.list('teams',t=>t.notice_id===a.id&&teamOpen(t));
 const seek=DB.list('seekers',s=>s.status==='open'&&s.notice_id===a.id);
 const box=document.createElement('div');box.className='hp-detail-box hp-team-box';
 box.innerHTML=`<p class="cal-add-title">함께할 팀원 찾기</p><p class="cal-add-sub">${open.length?`모집 중인 팀 ${open.length}개`:'아직 모집 중인 팀이 없어요'}${seek.length?` · 팀 찾는 사람 ${seek.length}명`:''}</p>
  ${open.slice(0,3).map(t=>`<button type="button" class="hp-mini-team" data-team="${h(t.id)}"><b>${h(t.title)}</b><span>${openRoles(t).map(r=>h(r.name)).join(' · ')||'자리 마감'}</span></button>`).join('')}
  <div class="hp-mini-links">${active(a)?'<button type="button" class="hp-link" data-seek-new>이 공모전 팀 구해요 등록</button>':''}<a class="hp-link" href="#teams">팀원 모집 전체 보기</a></div>`;
 side.insertBefore(box,side.querySelector('.hp-pf-hint')||side.querySelector('.report'));
 box.querySelectorAll('[data-team]').forEach(b=>b.onclick=()=>openTeam(b.dataset.team));
 const sb=box.querySelector('[data-seek-new]');if(sb)sb.onclick=()=>openSeekerForm(a,DB.me()&&DB.list('seekers',s=>s.uid===DB.me().id&&s.status==='open')[0]);
});

/* 초대 링크 처리 */
function checkJoin(){const m=decodeURIComponent(location.hash.slice(1)).match(/^join-([a-z0-9]+)$/i);if(m)joinByCode(m[1])}
addEventListener('hashchange',checkJoin);

HP.on('route',r=>{if(r==='teams')renderTeams()});
/* 서버에서 새로 받으면(로그인·쓰기·화면 진입) 열려 있는 화면을 다시 그린다 */
HP.on('srv',()=>{if(location.hash==='#teams'&&!document.querySelector('dialog.hp-modal[open]'))renderTeams();else if(location.hash==='#me'&&HP.renderMe&&!document.querySelector('dialog.hp-modal[open]'))HP.renderMe()});
HP.on('ready',()=>{seed();if(location.hash==='#teams')renderTeams();checkJoin()});
})();
