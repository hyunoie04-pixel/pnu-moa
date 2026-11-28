/* =====================================================================
   효온 플러스 (로컬 시안) · 캘린더 담기 · 마이페이지 · 포트폴리오
   ===================================================================== */
(function(){
'use strict';
const W=window,HP=W.HP,DB=HP.db,h=s=>esc(s);
const ST=[['interest','관심'],['plan','지원 예정'],['applied','지원 완료'],['waiting','결과 대기'],['pass','합격·선정'],['fail','불합격'],['done','참여 완료']];
const stName=k=>(ST.find(x=>x[0]===k)||[k,k])[1];
const REM=[[0,'알림 없음'],[1,'1일 전'],[3,'3일 전'],[7,'7일 전']];
const PF_TYPES=['공모전·대회','대외활동','인턴·현장실습','프로젝트','비교과·교육','봉사','장학·수상','자격증·어학','동아리·학생회','기타'];
const subToType=s=>({'공모전·경진대회':'공모전·대회','대외활동·행사':'대외활동','취업·채용·현장실습':'인턴·현장실습','교육·특강·프로그램':'비교과·교육','봉사·사회공헌':'봉사','장학·지원금':'장학·수상','창업':'프로젝트','국제교류·해외':'대외활동','대학원·연구':'프로젝트'}[s]||'기타');

/* ---------- 내 일정 (캘박) ---------- */
function myCal(){const u=DB.me();return u?DB.list('cal',x=>x.uid===u.id):[]}
function calItemOf(noticeId){const u=DB.me();return u?DB.list('cal',x=>x.uid===u.id&&x.notice_id===noticeId)[0]:null}
function addToMyCal(a,via){
 return HP.requireLogin('내 일정에 담으려면 로그인해 주세요',u=>{
  if(calItemOf(a.id)){HP.toast('이미 내 일정에 있어요');return}
  DB.insert('cal',{uid:u.id,notice_id:a.id,row_key:noticeKey(a),title:a.title,end:a.end||'',sub:a.sub,link:a.link||'',org:a.org||'',status:'interest',remind:u.consent&&u.consent.notify?3:0,memo:''});
  HP.log('calendar_add',{notice_key:noticeKey(a),sub:a.sub,method:'my',via:via||'detail'});
  HP.toast('내 일정에 담았어요 · 마이페이지에서 지원 상태를 기록해 보세요');
  if(location.hash.slice(1)===a.id)decorateDetail(a);
 });
}
HP.addToMyCal=addToMyCal;

function download(name,text,type){
 const b=new Blob([text],{type:type||'text/plain;charset=utf-8'}),u=URL.createObjectURL(b),a=document.createElement('a');
 a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);
}
HP.download=download;

/* ---------- 공고 상세에 버튼 얹기 ---------- */
const _renderDetail=W.renderDetail;
W.renderDetail=function(a){_renderDetail(a);decorateDetail(a)};
function decorateDetail(a){
 const dc=document.getElementById('dc');if(!dc)return;
 dc.querySelectorAll('.hp-detail-box').forEach(x=>x.remove());
 const side=dc.querySelector('.dside');if(!side)return;
 const inCal=calItemOf(a.id);
 const btns=dc.querySelector('.cal-add-btns');
 const myBtn=dc.querySelector('[data-hp-mycal]');
 if(myBtn){myBtn.textContent=inCal?'내 일정에 있음 · 보기':'내 일정에 담기';myBtn.setAttribute('aria-pressed',String(!!inCal))}
 if(btns&&!myBtn){
  btns.insertAdjacentHTML('beforeend',`<button type="button" class="btn-outline hp-cal-my" data-hp-mycal aria-pressed="${!!inCal}">${inCal?'내 일정에 있음 · 보기':'내 일정에 담기'}</button>`);
  const g=btns.querySelector('a[href*="calendar.google.com"]');if(g)g.addEventListener('click',()=>HP.log('calendar_add',{notice_key:noticeKey(a),sub:a.sub,method:'google'}));
  const t=dc.querySelector('.cal-add-title');if(t)t.textContent='마감일을 캘린더에 담기';
 }else if(!btns&&!myBtn){
  const box=document.createElement('div');box.className='cal-add hp-detail-box';
  box.innerHTML=`<p class="cal-add-title">내 일정에 담아 두기</p><p class="cal-add-sub">${a.end?'지난 공고예요. 기록용으로 담을 수 있어요.':'마감일이 정리되지 않은 공고예요. 담아 두면 마이페이지에서 메모와 상태를 남길 수 있어요.'}</p><div class="cal-add-btns"><button type="button" class="btn-outline hp-cal-my" data-hp-mycal aria-pressed="${!!inCal}">${inCal?'내 일정에 있음':'내 일정에 담기'}</button></div>`;
  side.insertBefore(box,side.querySelector('.report'));
 }
 if(HP.flags.portfolio){const pf=document.createElement('div');pf.className='hp-detail-box hp-pf-hint';
 pf.innerHTML=`<p>이 공고에 참여했나요?</p><button type="button" class="hp-link" data-hp-pf-from>포트폴리오에 기록하기 →</button>`;
 side.insertBefore(pf,side.querySelector('.report'))}
 HP.emit('detail',a);
}
HP.decorateDetail=decorateDetail;
document.addEventListener('click',e=>{
 const hh=decodeURIComponent(location.hash.slice(1));const a=HP.findNotice(hh);
 if(e.target.closest('[data-hp-mycal]')&&a){if(calItemOf(a.id)){location.hash='me';W.HP_ME_TAB='cal';return}addToMyCal(a,'detail');return}
 if(e.target.closest('[data-hp-pf-from]')&&a){HP.requireLogin('포트폴리오는 로그인 후 쓸 수 있어요',()=>openPfForm(null,a))}
});

/* ---------- 마이페이지 ---------- */
let tab='cal';
const TABS_ME=[['cal','내 일정'],['pf','포트폴리오'],['team','내 팀'],['set','설정']].filter(t=>t[0]!=='team'||HP.flags.teams);
function renderMe(){
 const sec=document.getElementById('me');if(!sec)return;
 if(W.HP_ME_TAB){tab=W.HP_ME_TAB;W.HP_ME_TAB=null}
 const u=DB.me();
 if(!u||!u.onboarded){
  sec.innerHTML=`<div class="wrap hp-page"><div class="empty"><p>${u?'가입을 마치면 마이페이지를 쓸 수 있어요.':'로그인하면 내 일정, 포트폴리오, 팀을 한곳에서 볼 수 있어요.'}</p><button type="button" class="btn-fill" id="me-login">${u?'가입 이어서 하기':'로그인'}</button></div></div>`;
  document.getElementById('me-login').onclick=()=>u?HP.openOnboarding():HP.openLogin();return;
 }
 const cal=myCal(),pf=DB.list('pf',x=>x.uid===u.id);
 const teams=DB.list('teams',t=>t.leader===u.id&&t.status!=='hidden').length+DB.list('apps',x=>x.uid===u.id&&x.status==='accepted').length;
 const soon=cal.filter(x=>x.end&&x.end>=todayKST()&&!['fail','done','pass'].includes(x.status)).sort((a,b)=>a.end.localeCompare(b.end));
 const col=[u.course,u.college,u.dept,u.grade?(u.grade==='5'?'5학년 이상':u.grade+'학년'):''].filter(Boolean).join(' · ');
 sec.innerHTML=`<div class="wrap hp-page">
  <div class="hp-me-head dark-surface">
   <div class="hp-me-id"><span class="hp-av lg" aria-hidden="true">${h((u.nickname||'?').slice(0,1))}</span><div>
    <h2>${h(u.nickname)}</h2><p>${h(col)}</p>
    <div class="hp-badges">${u.verified?'<span class="hp-badge ok">부산대 인증</span>':HP.pnuOn?'<button type="button" class="hp-badge hp-badge-btn" id="me-pnu">부산대 인증하기</button>':''}${(u.jobs||[]).map(j=>`<span class="hp-badge job">${h(HP.jobName(j))}</span>`).join('')}</div></div></div>
   <div class="hp-me-actions"><button type="button" class="btn-outline" id="me-edit">정보 수정</button><button type="button" class="btn-outline" id="me-out">로그아웃</button></div>
   <dl class="hp-me-stats">
    <div><dt>다가오는 마감</dt><dd>${soon.length}<small>건</small></dd></div>
    <div><dt>내 일정</dt><dd>${cal.length}<small>건</small></dd></div>
    ${HP.flags.portfolio?`<div><dt>포트폴리오</dt><dd>${pf.length}<small>개</small></dd></div>`:''}
    ${HP.flags.teams?`<div><dt>참여 중인 팀</dt><dd>${teams}<small>팀</small></dd></div>`:''}
   </dl>
  </div>
  ${soon[0]?`<p class="hp-next">가장 가까운 마감: <a href="#${h(soon[0].notice_id)}">${h(soon[0].title)}</a> <b>${HP.ddayText(soon[0].end)}</b></p>`:''}
  <div class="chips hp-me-tabs" role="tablist" aria-label="마이페이지 메뉴">${TABS_ME.map(([k,n])=>`<button type="button" class="chip" role="tab" data-me="${k}" aria-pressed="${k===tab}" aria-selected="${k===tab}">${n}${k==='pf'&&!HP.flags.portfolio?'<span class="hp-soon">준비중</span>':''}</button>`).join('')}</div>
  <div id="me-body"></div>
 </div>`;
 sec.querySelector('#me-edit').onclick=()=>HP.openOnboarding(null,true);
 const pnuB=sec.querySelector('#me-pnu');if(pnuB)pnuB.onclick=()=>HP.openPnuVerify(()=>renderMe());
 sec.querySelector('#me-out').onclick=()=>{HP.log('logout');DB.signOut();HP.renderAuth();HP.toast('로그아웃했어요');location.hash='mine'};
 sec.querySelector('.hp-me-tabs').onclick=e=>{const b=e.target.closest('[data-me]');if(b){if(b.dataset.me==='pf'&&!HP.flags.portfolio){HP.toast('포트폴리오는 준비 중입니다.');return}tab=b.dataset.me;renderMe();HP.log('tab',{tab:'me-'+tab})}};
 const body=sec.querySelector('#me-body');
 if(tab==='cal')renderCal(body,u);
 if(tab==='pf')renderPf(body,u);
 if(tab==='team')(HP.renderMyTeams||(()=>{body.innerHTML=''}))(body,u);
 if(tab==='set')renderSet(body,u);
}
HP.renderMe=renderMe;

function renderCal(body,u){
 const items=myCal().sort((a,b)=>(a.end||'9999').localeCompare(b.end||'9999'));
 const t=todayKST();
 const up=items.filter(x=>!x.end||x.end>=t),past=items.filter(x=>x.end&&x.end<t);
 const recorded=new Set(DB.list('pf',p=>p.uid===u.id).map(p=>p.notice_id));
 const reviewed=new Set(DB.list('reviews',r=>r.uid===u.id).map(r=>r.notice_key));
 const row=x=>{const n=HP.findNotice(x.notice_id);const pfOk=HP.flags.portfolio&&['pass','done'].includes(x.status)&&!recorded.has(x.notice_id);
  const rvOk=['pass','done'].includes(x.status)&&!reviewed.has(x.row_key)&&HP.openReview;
  return `<li class="hp-cal-row" data-id="${h(x.id)}">
   <div class="hp-cal-d ${x.end&&x.end<t?'past':''}"><b>${x.end?HP.fmtDate(x.end):'미정'}</b><span>${HP.ddayText(x.end)}</span></div>
   <div class="hp-cal-main"><a href="#${h(x.notice_id)}" class="hp-cal-t">${h(x.title)}</a><p>${h(x.org||'')}${n?'':' · <em>지금 목록에 없는 공고</em>'}</p>
    <input class="hp-memo" data-k="memo" value="${h(x.memo)}" placeholder="메모 (예: 자소서 초안 11/28까지)" maxlength="120" aria-label="메모"></div>
   <div class="hp-cal-ctl">
    <label class="sr" for="st-${h(x.id)}">진행 상태</label><select id="st-${h(x.id)}" data-k="status">${ST.map(([k,n])=>`<option value="${k}"${k===x.status?' selected':''}>${n}</option>`).join('')}</select>
    <label class="sr" for="rm-${h(x.id)}">알림</label><select id="rm-${h(x.id)}" data-k="remind" ${x.end?'':'disabled'}>${REM.map(([k,n])=>`<option value="${k}"${+x.remind===k?' selected':''}>${n}</option>`).join('')}</select>
    <div class="hp-cal-btns">${rvOk?'<button type="button" class="hp-link" data-a="review">한 줄 후기 남기기</button>':''}${pfOk?'<button type="button" class="hp-link" data-a="pf">포트폴리오에 기록</button>':''}<button type="button" class="hp-link danger" data-a="del">빼기</button></div>
   </div></li>`};
 const counts={};items.forEach(x=>counts[x.status]=(counts[x.status]||0)+1);
 body.innerHTML=`<div class="hp-sec-head"><div><h3>내 일정</h3><p>담은 공고의 마감일과 지원 상태를 한눈에 봐요. 알림은 마감 전 메일로 보내 드릴 예정이에요(시안에서는 발송 안 함).</p></div>
  <div class="hp-row-btns"><a class="btn-outline" href="#calendar">마감 달력 보기</a></div></div>
  ${items.length?`<div class="hp-pipe">${ST.map(([k,n])=>`<span class="${counts[k]?'on':''}">${n} <b>${counts[k]||0}</b></span>`).join('')}</div>`:''}
  ${items.length?`<ul class="hp-cal-list">${up.map(row).join('')}</ul>${past.length?`<details class="hp-past"><summary>지난 일정 ${past.length}건</summary><ul class="hp-cal-list">${past.map(row).join('')}</ul></details>`:''}`
  :`<div class="empty"><p>아직 담은 공고가 없어요. 공고 상세에서 <b>내 일정에 담기</b>를 눌러 보세요.</p><a class="btn-fill" href="#mine">공고 보러 가기</a></div>`}`;
 body.querySelectorAll('.hp-cal-row').forEach(li=>{
  const id=li.dataset.id;
  li.addEventListener('change',e=>{const k=e.target.dataset.k;if(!k)return;const v=k==='remind'?+e.target.value:e.target.value;const before=DB.list('cal',x=>x.id===id)[0];DB.update('cal',id,{[k]:v});
   if(k==='status'){HP.log('apply_status',{notice_key:before&&before.row_key,status:v,prev:before&&before.status,sub:before&&before.sub});renderMe()}
   if(k==='remind')HP.log('remind_set',{days:v})});
  li.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b)return;const x=DB.list('cal',r=>r.id===id)[0];
   if(b.dataset.a==='del'){DB.remove('cal',id);HP.log('calendar_remove',{notice_key:x&&x.row_key});renderMe()}
   if(b.dataset.a==='pf'){const n=HP.findNotice(x.notice_id);openPfForm(null,n,x)}
   if(b.dataset.a==='review'&&HP.openReview)HP.openReview(x,()=>renderMe())});
 });
}

/* ---------- 포트폴리오 ---------- */
function openPfForm(item,notice,calRow){
 if(!HP.flags.portfolio){HP.toast('포트폴리오는 준비 중입니다.');return}
 const u=DB.me();if(!u)return;
 const it=item||{type:notice?subToType(notice.sub):'공모전·대회',title:notice?notice.title.replace(/^\s*\[[^\]]*\]\s*/,''):'',org:notice?notice.org:'',start:'',end:notice&&notice.end?notice.end:'',ongoing:false,role:'',desc:'',result:calRow&&calRow.status==='pass'?'합격·선정':'',skills:[],link:'',notice_id:notice?notice.id:'',visibility:'private'};
 const d=HP.modal(`<form class="hp-form hp-pf-form" id="pf-form" novalidate>
  <h2>${item?'활동 기록 수정':'활동 기록 추가'}</h2>
  <p class="hp-sub">나중에 자기소개서·이력서에 바로 옮겨 쓸 수 있게 적어 두세요. <b>무엇을 했고, 내가 맡은 일, 결과</b> 순서로 쓰면 좋아요.</p>
  <div class="hp-grid2">
   <div class="hp-field wide"><label for="pf-title">활동명 <em class="req">필수</em></label><input id="pf-title" maxlength="100" value="${h(it.title)}" required></div>
   <div class="hp-field"><label for="pf-type">유형 <em class="req">필수</em></label><select id="pf-type">${PF_TYPES.map(t=>`<option${t===it.type?' selected':''}>${t}</option>`).join('')}</select></div>
   <div class="hp-field"><label for="pf-org">주최·소속</label><input id="pf-org" maxlength="60" value="${h(it.org)}"></div>
   <div class="hp-field"><label for="pf-start">시작일</label><input id="pf-start" type="date" value="${h(it.start)}"></div>
   <div class="hp-field"><label for="pf-end">종료일</label><input id="pf-end" type="date" value="${h(it.end)}" ${it.ongoing?'disabled':''}><label class="hp-inline"><input type="checkbox" id="pf-ongoing"${it.ongoing?' checked':''}> 진행 중</label></div>
   <div class="hp-field wide"><label for="pf-role">내 역할 <em class="req">필수</em></label><input id="pf-role" maxlength="80" value="${h(it.role)}" placeholder="예) 팀장 · 데이터 수집과 발표 자료 제작"></div>
   <div class="hp-field wide"><label for="pf-desc">내용 <em class="req">필수</em> <small id="pf-desc-n">${(it.desc||'').length}/1000</small></label><textarea id="pf-desc" maxlength="1000" rows="5" placeholder="예) 부산 공영자전거 이용 데이터를 분석해 대여소 재배치안을 제안했어요. 저는 공공데이터 수집과 시각화를 맡았고, 본선 10팀에 들었어요.">${h(it.desc)}</textarea></div>
   <div class="hp-field"><label for="pf-result">성과·수상</label><input id="pf-result" maxlength="60" value="${h(it.result)}" placeholder="예) 우수상, 본선 진출"></div>
   <div class="hp-field"><label for="pf-skills">핵심 역량 <small>(쉼표로 최대 5개)</small></label><input id="pf-skills" maxlength="80" value="${h((it.skills||[]).join(', '))}" placeholder="예) 데이터 분석, Python, 발표"></div>
   <div class="hp-field wide"><label for="pf-link">결과물 링크</label><input id="pf-link" type="url" maxlength="300" value="${h(it.link)}" placeholder="https:// (노션, 깃허브, 유튜브 등)"></div>
   ${HP.flags.publicPf?`<div class="hp-field wide"><label>공개 범위</label><div class="seg"><label><input type="radio" name="pf-vis" value="private"${it.visibility!=='link'?' checked':''}><span>나만 보기</span></label><label><input type="radio" name="pf-vis" value="link"${it.visibility==='link'?' checked':''}><span>링크가 있는 사람</span></label></div></div>`:''}
  </div>
  ${it.notice_id?`<p class="hp-hint">효온 공고와 연결됨: ${h((HP.findNotice(it.notice_id)||{}).title||'(지금 목록에 없는 공고)')}</p>`:''}
  <p class="hp-hint">효온은 활동 사실을 확인·인증하지 않아요. 증빙이 필요하면 주최 기관의 확인서를 따로 챙겨 주세요.</p>
  <p class="hp-err" id="pf-err" role="alert"></p>
  <div class="hp-actions">${item?'<button type="button" class="btn-outline danger" id="pf-del">삭제</button>':'<span></span>'}<button class="btn-fill" type="submit">저장</button></div>
 </form>`,{wide:true});
 const q=s=>d.querySelector(s);
 q('#pf-desc').oninput=e=>{q('#pf-desc-n').textContent=e.target.value.length+'/1000'};
 q('#pf-ongoing').onchange=e=>{q('#pf-end').disabled=e.target.checked};
 if(item)q('#pf-del').onclick=()=>{if(q('#pf-del').dataset.armed!=='1'){q('#pf-del').dataset.armed='1';q('#pf-del').textContent='한 번 더 누르면 삭제';return}DB.remove('pf',item.id);HP.log('portfolio_delete');d.close();renderMe()};
 q('#pf-form').onsubmit=e=>{
  e.preventDefault();
  const v={type:q('#pf-type').value,title:q('#pf-title').value.trim(),org:q('#pf-org').value.trim(),start:q('#pf-start').value,end:q('#pf-ongoing').checked?'':q('#pf-end').value,ongoing:q('#pf-ongoing').checked,
   role:q('#pf-role').value.trim(),desc:q('#pf-desc').value.trim(),result:q('#pf-result').value.trim(),
   skills:q('#pf-skills').value.split(/[,，]/).map(s=>s.trim()).filter(Boolean).slice(0,5),link:q('#pf-link').value.trim(),
   visibility:HP.flags.publicPf?((d.querySelector('input[name=pf-vis]:checked')||{}).value||'private'):'private',notice_id:it.notice_id||''};
  const miss=[!v.title&&'활동명',!v.role&&'내 역할',!v.desc&&'내용'].filter(Boolean);
  if(miss.length){q('#pf-err').textContent=miss.join(', ')+'을(를) 적어 주세요.';return}
  if(v.link&&!safeUrl(v.link)){q('#pf-err').textContent='링크는 https:// 로 시작하는 주소만 넣을 수 있어요.';return}
  if(v.start&&v.end&&v.end<v.start){q('#pf-err').textContent='종료일이 시작일보다 빨라요.';return}
  if(item){DB.update('pf',item.id,v);HP.log('portfolio_edit',{pf_type:v.type})}
  else{DB.insert('pf',Object.assign({uid:u.id},v));HP.log('portfolio_add',{pf_type:v.type,from_notice:!!v.notice_id,notice_key:v.notice_id?noticeKey(HP.findNotice(v.notice_id)||{}):null,skills_n:v.skills.length})}
  d.close();HP.toast('포트폴리오에 저장했어요');
  if(location.hash==='#me'){tab='pf';renderMe()}
 };
}
HP.openPfForm=openPfForm;

let pfFilter='전체';
function pfPeriod(x){return [x.start?x.start.replace(/-/g,'.'):'',x.ongoing?'진행 중':x.end?x.end.replace(/-/g,'.'):''].filter(Boolean).join(' ~ ')}
function renderPf(body,u){
 const all=DB.list('pf',x=>x.uid===u.id).sort((a,b)=>(b.end||b.start||'9999').localeCompare(a.end||a.start||'9999'));
 const types=PF_TYPES.filter(t=>all.some(x=>x.type===t));
 const list=pfFilter==='전체'?all:all.filter(x=>x.type===pfFilter);
 const byYear={};list.forEach(x=>{const y=(x.end||x.start||'').slice(0,4)||(x.ongoing?'진행 중':'날짜 미정');(byYear[y]=byYear[y]||[]).push(x)});
 const sugg=myCal().filter(c=>['pass','done'].includes(c.status)&&!all.some(p=>p.notice_id===c.notice_id));
 body.innerHTML=`<div class="hp-sec-head"><div><h3>포트폴리오</h3><p>참여한 활동을 쌓아 두면 자기소개서·이력서를 쓸 때 꺼내 쓸 수 있어요.</p></div>
  <div class="hp-row-btns"><button type="button" class="btn-fill" id="pf-add">활동 추가</button><button type="button" class="btn-outline" id="pf-print" ${all.length?'':'disabled'}>PDF로 저장</button><button type="button" class="btn-outline" id="pf-copy" ${all.length?'':'disabled'}>글로 복사</button>${HP.flags.publicPf?`<button type="button" class="btn-outline" id="pf-public" ${all.some(x=>x.visibility==='link')?'':'disabled'}>공개 화면 보기</button>`:''}</div></div>
  ${sugg.length?`<div class="hp-suggest"><b>기록해 볼까요?</b> 내 일정에서 합격·참여 완료로 바꾼 활동이 ${sugg.length}건 있어요. ${sugg.slice(0,3).map(c=>`<button type="button" class="hp-link" data-sg="${h(c.id)}">${h(c.title.slice(0,28))} 기록하기</button>`).join(' ')}</div>`:''}
  ${types.length>1?`<div class="chips">${['전체',...types].map(t=>`<button type="button" class="chip" data-pft="${h(t)}" aria-pressed="${t===pfFilter}">${h(t)} <b>${t==='전체'?all.length:all.filter(x=>x.type===t).length}</b></button>`).join('')}</div>`:''}
  ${list.length?Object.keys(byYear).map(y=>`<section class="hp-pf-year"><h4>${h(y)}</h4><ul class="hp-pf-list">${byYear[y].map(x=>`<li class="hp-pf-card">
   <div class="hp-pf-top"><span class="hp-badge">${h(x.type)}</span>${x.visibility==='link'?'<span class="hp-badge ok">링크 공개</span>':''}${x.result?`<span class="hp-badge win">${h(x.result)}</span>`:''}</div>
   <h5>${h(x.title)}</h5><p class="hp-pf-meta">${h([x.org,pfPeriod(x)].filter(Boolean).join(' · '))}</p>
   <p class="hp-pf-role"><b>역할</b> ${h(x.role)}</p><p class="hp-pf-desc">${h(x.desc)}</p>
   ${x.skills&&x.skills.length?`<p class="hp-pf-skills">${x.skills.map(s=>`<span>#${h(s)}</span>`).join('')}</p>`:''}
   <div class="hp-pf-foot">${safeUrl(x.link)?`<a href="${h(safeUrl(x.link))}" target="_blank" rel="noopener noreferrer" class="hp-link">결과물 보기 ↗</a>`:''}${x.notice_id&&HP.findNotice(x.notice_id)?`<a href="#${h(x.notice_id)}" class="hp-link">관련 공고</a>`:''}<button type="button" class="hp-link" data-pf="${h(x.id)}">수정</button></div>
  </li>`).join('')}</ul></section>`).join('')
  :`<div class="empty"><p>아직 기록한 활동이 없어요. 수업 프로젝트, 동아리, 공모전 무엇이든 좋아요.</p></div>`}`;
 const q=s=>body.querySelector(s);
 q('#pf-add').onclick=()=>openPfForm();
 body.querySelectorAll('[data-pf]').forEach(b=>b.onclick=()=>openPfForm(all.find(x=>x.id===b.dataset.pf)));
 body.querySelectorAll('[data-pft]').forEach(b=>b.onclick=()=>{pfFilter=b.dataset.pft;renderMe()});
 body.querySelectorAll('[data-sg]').forEach(b=>b.onclick=()=>{const c=myCal().find(x=>x.id===b.dataset.sg);openPfForm(null,HP.findNotice(c.notice_id)||{id:c.notice_id,title:c.title,org:c.org,sub:c.sub,end:c.end},c)});
 q('#pf-print').onclick=()=>{printPf(u,all);HP.log('portfolio_export',{method:'pdf',n:all.length})};
 q('#pf-copy').onclick=async()=>{const t=all.map(x=>`■ ${x.title} (${x.type}${pfPeriod(x)?', '+pfPeriod(x):''})\n- 주최: ${x.org||'-'}\n- 역할: ${x.role}\n- 내용: ${x.desc}${x.result?'\n- 성과: '+x.result:''}${x.skills.length?'\n- 역량: '+x.skills.join(', '):''}`).join('\n\n');
  try{await navigator.clipboard.writeText(t);HP.toast('글로 복사했어요. 자기소개서에 붙여 넣어 보세요')}catch{HP.toast('복사하지 못했어요')}HP.log('portfolio_export',{method:'copy',n:all.length})};
 q('#pf-public').onclick=()=>{const pub=all.filter(x=>x.visibility==='link');HP.modal(`<div class="hp-public"><span class="hp-eyebrow">공개 포트폴리오 미리보기</span><h2>${h(u.nickname)}의 활동</h2><p class="hp-sub">링크 공개로 고른 ${pub.length}개만 보여요. 이메일·학과·학년은 보이지 않아요.</p><p class="hp-hint">실제 서비스 주소 예시: hyon.kr/p/${h(u.id.slice(-6))}</p>${pub.map(x=>`<div class="hp-pf-card"><span class="hp-badge">${h(x.type)}</span><h5>${h(x.title)}</h5><p class="hp-pf-meta">${h([x.org,pfPeriod(x)].filter(Boolean).join(' · '))}</p><p class="hp-pf-desc">${h(x.desc)}</p></div>`).join('')}</div>`,{wide:true});HP.log('portfolio_public_view')};
}
function printPf(u,items){
 const w=W.open('','_blank');if(!w){HP.toast('팝업이 막혔어요. 팝업을 허용해 주세요');return}
 w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${h(u.nickname)} 포트폴리오</title><style>
 body{font:14px/1.6 "Pretendard","Malgun Gothic",sans-serif;color:#0F1F3A;max-width:760px;margin:32px auto;padding:0 24px}
 h1{font-size:26px;margin:0 0 4px}.sub{color:#4A5A75;margin:0 0 24px}.it{border-top:1px solid #C5D6EC;padding:14px 0;break-inside:avoid}
 .it h2{font-size:17px;margin:0}.m{color:#4A5A75;font-size:13px;margin:2px 0 6px}.t{display:inline-block;font-size:12px;border:1px solid #C5D6EC;border-radius:4px;padding:0 6px;margin-right:6px}
 .f{font-size:12px;color:#4A5A75;margin-top:28px}@media print{body{margin:0}}</style></head><body>
 <h1>${h(u.nickname)} · 활동 기록</h1><p class="sub">${h([u.college,u.dept].filter(Boolean).join(' '))} · 희망 직무: ${h((u.jobs||[]).map(HP.jobName).join(', '))}</p>
 ${items.map(x=>`<div class="it"><h2><span class="t">${h(x.type)}</span>${h(x.title)}</h2><p class="m">${h([x.org,pfPeriod(x),x.result].filter(Boolean).join(' · '))}</p><p><b>역할</b> ${h(x.role)}</p><p>${h(x.desc)}</p>${x.skills.length?`<p class="m">${x.skills.map(s=>'#'+h(s)).join(' ')}</p>`:''}${safeUrl(x.link)?`<p class="m">${h(safeUrl(x.link))}</p>`:''}</div>`).join('')}
 <p class="f">효온(hyon.kr)에서 본인이 직접 기록한 내용이며, 효온이 활동 사실을 확인·인증하지 않았습니다.</p>
 <script>setTimeout(function(){print()},300)<\/script></body></html>`);
 w.document.close();
}

function renderSet(body,u){
 const c=u.consent||{};
 body.innerHTML=`<div class="hp-sec-head"><div><h3>설정</h3><p>동의 항목과 계정을 관리해요.</p></div></div>
  <div class="hp-set">
   <section><h4>계정</h4>
    <p class="hp-acct"><span class="hp-badge">${u.provider==='kakao'?'카카오':u.provider==='google'?'구글':'메일'} 로그인</span> ${h(u.email||'(이메일 없음)')}</p>
    ${HP.pnuOn||u.verified?`<div class="hp-pnu-box ${u.verified?'ok':''}"><div><b>${u.verified?'부산대 인증 완료':'부산대 인증 전'}</b><small>${u.verified?h(HP.maskMail(u.pnu_email))+' · '+h(new Date(u.pnu_verified_at||Date.now()).toLocaleDateString('ko-KR'))+' 인증':'학교 메일로 코드를 받아 인증하면 팀원 모집 글을 쓸 수 있고, 지원·후기에 인증 마크가 보여요.'}</small></div>${u.verified?'':'<button type="button" class="btn-fill" id="set-pnu">인증하기</button>'}</div>`:''}
   </section>
   <section><h4>${HP.flags.consentKinds.length?'선택 동의':'동의'}</h4>
    ${HP.flags.consentKinds.includes('research')?`<label class="hp-toggle"><input type="checkbox" data-c="research"${c.research?' checked':''}><span><b>이용 기록 분석</b><small>본 공고·저장·일정 기록을 내 계정과 연결해 통계 분석에 써요.</small></span></label>`:''}
    ${HP.flags.consentKinds.includes('personalize')?`<label class="hp-toggle"><input type="checkbox" data-c="personalize"${c.personalize?' checked':''}><span><b>맞춤 추천</b><small>자주 본 분야를 추천 순서에 반영해요.</small></span></label>`:''}
    ${HP.flags.consentKinds.includes('notify')?`<label class="hp-toggle"><input type="checkbox" data-c="notify"${c.notify?' checked':''}><span><b>마감 알림 메일</b><small>${h(u.email||HP.maskMail(u.pnu_email)||'메일 없음')} 로 보내요. (시안에서는 발송 안 함)</small></span></label>`:''}
    <p class="hp-hint">필수 동의(이용약관, 개인정보 수집·이용)는 ${c.at?h(new Date(c.at).toLocaleDateString('ko-KR')):''}에 했어요. 철회하려면 탈퇴해 주세요. 내 정보를 보고 싶거나 고치거나 지우고 싶으면 <a href="#feedback">의견 보내기</a>로 요청해 주세요(확인 후 10일 안에 처리해요).</p>
   </section>
   <section><h4>팀원 모집용 연락처</h4>
    <div class="hp-field"><label for="set-contact">내 연락 방법 <small>(내가 수락한 팀원에게만 보여요)</small></label><input id="set-contact" type="text" value="${h(u.contact)}" placeholder="오픈채팅 링크 · 전화번호 · 이메일 · 인스타(@아이디) 등" maxlength="120"><small class="hp-hint">카카오 오픈채팅이 아니어도 돼요. 번호를 적으면 합류가 확정된 팀원에게 그대로 보여요.</small></div>
    <div class="hp-field"><label for="set-bio">한 줄 소개 <small>(팀 지원 시 팀장에게 보여요)</small></label><input id="set-bio" value="${h(u.bio)}" maxlength="80" placeholder="예) 데이터 분석 좋아하는 산업공학과 3학년"></div>
    <div class="hp-field"><label for="set-skills">할 수 있는 것 <small>(쉼표로 구분)</small></label><input id="set-skills" value="${h((u.skills||[]).join(', '))}" maxlength="100" placeholder="예) 피그마, 파이썬, 영상 편집"></div>
    <button type="button" class="btn-outline" id="set-save">저장</button>
   </section>
   <section class="danger-zone"><h4>탈퇴</h4><p class="hp-hint">탈퇴하면 계정, 내 일정${HP.flags.portfolio?', 포트폴리오':''}${HP.flags.teams?', 내가 만든 팀 글과 받은 지원':''}, 동의 기록이 바로 지워져요. 익명 통계는 남을 수 있어요.</p>
    <button type="button" class="btn-outline danger" id="set-del">탈퇴하기</button></section>
  </div>`;
 const sp=body.querySelector('#set-pnu');if(sp)sp.onclick=()=>HP.openPnuVerify(()=>renderMe());
 body.querySelectorAll('[data-c]').forEach(b=>b.onchange=()=>{const nc=Object.assign({},u.consent,{[b.dataset.c]:b.checked,at:u.consent.at});
  if(b.dataset.c==='research'&&!b.checked){try{const q=HPQ.read().map(e=>e.user_id===u.id?Object.assign({},e,{user_id:null,jobs:null}):e);localStorage.setItem('hyp-events',JSON.stringify(q))}catch{}}
  DB.updateMe({consent:nc});HP.log('consent_change',{['consent_'+b.dataset.c]:b.checked});HP.toast('저장했어요')});
 body.querySelector('#set-save').onclick=()=>{const ct=body.querySelector('#set-contact').value.trim();
  const cc=ct?HP.contactCheck(ct):{ok:true,value:''};if(!cc.ok){HP.toast(cc.err);return}
  DB.updateMe({contact:cc.value,bio:body.querySelector('#set-bio').value.trim(),skills:body.querySelector('#set-skills').value.split(/[,，]/).map(s=>s.trim()).filter(Boolean).slice(0,8)});HP.toast('저장했어요')};
 const del=body.querySelector('#set-del');
 del.onclick=()=>{
  const u2=DB.me();if(!u2)return;
  const list=['계정과 프로필(소속·희망 직무·닉네임)','내 일정과 지원 기록','동의 기록'];
  if(HP.flags.portfolio)list.splice(2,0,'포트폴리오');
  if(HP.flags.teams)list.splice(3,0,'내가 올린 팀 모집 글·지원·초대·팀 구해요 글과 신고 내용');
  const d=HP.modal(`<form class="hp-form" id="del-form" novalidate><h2>정말 탈퇴할까요?</h2>
   <p class="hp-sub">탈퇴하면 아래 정보가 <b>바로 영구 삭제</b>되고 되돌릴 수 없어요.</p>
   <ul class="hp-del-list">${list.map(x=>`<li>${h(x)}</li>`).join('')}</ul>
   <p class="hp-hint">${HP.flags.portfolio?'포트폴리오·일정이':'일정이'} 필요하면 탈퇴하기 전에 먼저 ${HP.flags.portfolio?'<b>PDF로 저장</b>하거나 글로 복사':'따로 적어'}해 두세요. 익명 이용 통계는 개인을 알 수 없는 형태로 남을 수 있어요.</p>
   <div class="hp-field"><label for="del-ok">계속하려면 <b>탈퇴</b>라고 입력해 주세요</label><input id="del-ok" autocomplete="off" placeholder="탈퇴"></div>
   <div class="hp-actions"><button type="button" class="btn-outline" data-close>취소</button><button type="submit" class="btn-fill danger" id="del-go" disabled>영구 삭제하고 탈퇴</button></div></form>`);
  const inp=d.querySelector('#del-ok'),go=d.querySelector('#del-go');
  inp.addEventListener('input',()=>{go.disabled=inp.value.trim()!=='탈퇴'});
  d.querySelector('#del-form').onsubmit=e=>{e.preventDefault();if(inp.value.trim()!=='탈퇴')return;
   d.close();DB.deleteMe();HP.renderAuth();HP.toast('탈퇴했어요. 그동안 고마웠어요');location.hash='mine'};
  setTimeout(()=>inp.focus(),50);
 };
}

HP.on('route',r=>{if(r==='me')renderMe()});
HP.on('auth',()=>{if(location.hash==='#me')renderMe();const hh=decodeURIComponent(location.hash.slice(1));const a=HP.findNotice(hh);if(a)decorateDetail(a)});
HP.on('ready',()=>{const hh=decodeURIComponent(location.hash.slice(1));const a=HP.findNotice(hh);if(a)decorateDetail(a)});
})();
