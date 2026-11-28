/* =====================================================================
   효온 플러스 (로컬 시안) · 홍보 게시판 (사용자 쪽)
   - 관리자가 게시한 동아리·학회·소모임·교내 행사 글을 홍보 탭에 보여 준다 (고정 글 먼저, 마감 가까운 순)
   - 로그인한 학생은 "홍보 요청하기"로 글을 보내고, 관리자가 승인하면 올라간다
   - 데이터는 이 브라우저의 localStorage 'hyp-promo' (관리자 시안과 같은 저장소). 실서비스: promo_posts 테이블
   ===================================================================== */
(function(){
'use strict';
const W=window,HP=W.HP,DB=HP.db,h=s=>esc(s);
const KEY='hyp-promo';
const SVP=()=>!!(HP.srv&&HP.srv.enabled);   // 서버 저장 모드
let PC={live:[],mine:[]};                  // 서버에서 받은 글(게시 중 / 내 요청)
const KINDS=['동아리·학회 모집','소모임·스터디','교내 행사','학생회 소식','기타'];
const BAD=/(01[016789][-\s.]?\d{3,4}[-\s.]?\d{4})/;
const load=()=>{try{const d=JSON.parse(localStorage.getItem(KEY)||'null');if(d&&Array.isArray(d.posts))return d}catch{}return {v:1,posts:[]}};
const save=d=>{try{localStorage.setItem(KEY,JSON.stringify(d))}catch{HP.toast('저장 공간이 부족해요')}};
const okUrl=u=>/^https:\/\/[^\s]+$/i.test(u||'');
const today=()=>todayKST();
function live(p){const t=today();return p.state==='published'&&(!p.start||p.start<=t)&&(!p.end||p.end>=t)}
function bump(id,field){if(SVP()){HP.srv.promo.hit(id,field==='views'?'view':'click');return}const d=load();const p=d.posts.find(x=>x.id===id);if(p){p[field]=(p[field]||0)+1;save(d)}}

function card(p){
 const dd=p.end?HP.ddayText(p.end):'상시';
 return `<li class="card-item hp-promo-item"><button type="button" class="hp-promo-card" data-promo="${h(p.id)}">
  <div class="hp-promo-poster">${p.poster?`<img src="${h(p.poster)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:`<span aria-hidden="true">${h((p.org||'?').slice(0,2))}</span>`}${p.pinned?'<em class="hp-promo-pin">고정</em>':''}${p.sponsored?'<em class="hp-ad" title="광고·제휴 게시물">AD</em>':''}</div>
  <div class="hp-promo-meta"><span class="hp-badge">${h(p.kind)}</span><b class="hp-promo-dd${p.end&&/D-[0-3]$|오늘/.test(dd)?' soon':''}">${h(dd)}</b></div>
  <h3>${h(p.title)}</h3><p class="hp-promo-org">${h(p.org)}</p><p class="hp-promo-sum">${h(p.summary)}</p></button></li>`;
}
function renderPromo(){
 if(SVP()){HP.srv.promo.load().then(r=>{PC=r;paint()});return}
 paint();
}
const postsLive=()=>SVP()?PC.live:load().posts;
const postsMine=u=>SVP()?PC.mine:(u?load().posts.filter(p=>p.requester===u.id):[]);
function paint(){
 const grid=document.getElementById('promo-grid');if(!grid)return;
 const all=postsLive().filter(live).sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||String(a.end||'9999').localeCompare(String(b.end||'9999')));
 const head=document.querySelector('#promo .page-head');
 if(head&&!head.querySelector('#hp-promo-req')){
  head.insertAdjacentHTML('beforeend','<div class="hp-promo-head-act"><button type="button" class="btn-outline" id="hp-promo-req">홍보 요청하기</button></div>');
  head.querySelector('#hp-promo-req').onclick=()=>HP.requireLogin('홍보 요청은 로그인 후 할 수 있어요',openRequest);
 }
 grid.classList.add('hp-promo-grid');
 grid.innerHTML=all.length?all.map(card).join(''):`<li class="empty"><p>아직 등록된 홍보 글이 없어요.</p><span style="font-size:13px;color:var(--sub)">동아리·학회·소모임·교내 행사 소식을 알리고 싶다면 위의 <b>홍보 요청하기</b>를 눌러 주세요.</span></li>`;
 renderMine();
}
function renderMine(){
 const u=DB.me();const box=document.getElementById('hp-promo-mine');
 const mine=u?postsMine(u):[];
 if(!mine.length){if(box)box.remove();return}
 const html=`<details class="hp-promo-mine" id="hp-promo-mine"><summary>내가 요청한 홍보 ${mine.length}건</summary><ul>${mine.map(p=>`<li><b>${h(p.title)}</b> <span class="hp-badge${p.state==='published'?' ok':''}">${{pending:'확인 중',published:live(p)?'게시 중':'게시 기간 아님',rejected:'반려',hidden:'숨김'}[p.state]||p.state}</span>${p.state==='rejected'&&p.reject_reason?`<p class="muted">사유: ${h(p.reject_reason)}</p>`:''}</li>`).join('')}</ul></details>`;
 if(box)box.outerHTML=html;else{const g=document.getElementById('promo-grid');if(g)g.insertAdjacentHTML('beforebegin',html)}
}
function openPost(id){
 const p=postsLive().find(x=>x.id===id)||(SVP()?PC.mine.find(x=>x.id===id):null);if(!p)return;
 bump(id,'views');HP.log('promo_view',{list:'promo',status:p.kind,extra:{promo_id:id}});
 const period=[p.start?HP.fmtDate(p.start):'',p.end?HP.fmtDate(p.end):''].filter(Boolean).join(' ~ ')||'상시';
 const d=HP.modal(`<div class="hp-promo-detail">${p.poster?`<img class="hp-promo-big" src="${h(p.poster)}" alt="${h(p.title)} 포스터" referrerpolicy="no-referrer">`:''}
  <span class="hp-eyebrow">${p.sponsored?'<b class="hp-ad-pill">광고</b> ':''}${h(p.kind)} · ${h(p.org)}</span><h2>${h(p.title)}</h2>
  <p class="hp-sub">${h(p.summary)}</p>
  <dl class="hp-promo-dl"><div><dt>기간</dt><dd>${h(period)} ${p.end?`<b>${h(HP.ddayText(p.end))}</b>`:''}</dd></div></dl>
  ${p.body?`<div class="hp-promo-body">${h(p.body).replace(/\n/g,'<br>')}</div>`:''}
  ${p.link?`<div class="hp-promo-contact" data-promo-contact><b>신청·문의</b> ${HP.contactHtml(p.link)}${okUrl(p.link)?` <button type="button" class="hp-link" data-copy="${h(p.link)}">복사</button>`:''}</div>`:''}
  <div class="hp-actions"><span></span><button type="button" class="btn-outline" data-close>닫기</button></div>
  <p class="hp-fine">${p.sponsored?'광고·제휴 게시물이에요. 일반 공고의 추천·인기 순위와 따로 보여 드려요. ':'효온이 확인해 올린 학생 단체 홍보예요. '}신청 전에 링크 내용을 꼭 확인해 주세요.</p></div>`,{wide:true});
 const a=d.querySelector('[data-promo-link]');if(a)a.addEventListener('click',()=>{bump(id,'clicks');HP.log('promo_click',{list:'promo',status:p.kind,extra:{promo_id:id}})});
 const ct=d.querySelector('[data-promo-contact]');if(ct)ct.addEventListener('click',e=>{if(e.target.closest('a,[data-copy]')){bump(id,'clicks');HP.log('promo_click',{list:'promo',status:p.kind,extra:{promo_id:id}})}});
}
function openRequest(u){
 const d=HP.modal(`<form class="hp-form" id="pr-form" novalidate><span class="hp-eyebrow">홍보 요청</span><h2>알리고 싶은 소식을 보내 주세요</h2>
  <p class="hp-sub">관리자가 확인한 뒤 홍보 탭에 올려요(보통 1~2일). 부산대 학생 단체·교내 행사만 받아요. 상업 광고·다단계·정치 홍보는 올리지 않아요.</p>
  <div class="hp-grid2">
   <div class="hp-field"><label for="pr-org">단체·행사 이름 <small>(필수)</small></label><input id="pr-org" maxlength="40" placeholder="예) 부산대 사진동아리 ○○"></div>
   <div class="hp-field"><label for="pr-kind">종류</label><select id="pr-kind">${KINDS.map(k=>`<option>${k}</option>`).join('')}</select></div>
  </div>
  <div class="hp-field"><label for="pr-title">제목 <small>(필수, 60자)</small></label><input id="pr-title" maxlength="60" placeholder="예) 2027년 1학기 신입 부원 모집"></div>
  <div class="hp-field"><label for="pr-sum">한 줄 소개 <small>(필수, 80자)</small></label><input id="pr-sum" maxlength="80" placeholder="예) 매주 출사, 사진 몰라도 환영해요"></div>
  <div class="hp-grid2">
   <div class="hp-field"><label for="pr-end">모집·행사 마감일</label><input id="pr-end" type="date"></div>
   <div class="hp-field"><label for="pr-link">신청·문의 방법 <small>(선택)</small></label><input id="pr-link" type="text" maxlength="120" autocomplete="off" placeholder="인스타 @아이디 · 오픈채팅·구글폼 주소 · 이메일 · 연락처"></div>
  </div>
  <div class="hp-field"><label for="pr-poster">포스터 사진 <small>(선택, jpg·png·webp)</small></label><input id="pr-poster" type="file" accept="image/*"><div id="pr-prev" class="hp-poster-prev" hidden><img alt="포스터 미리보기"><button type="button" class="hp-link danger" id="pr-prev-x">사진 빼기</button></div></div>
  <div class="hp-field"><label for="pr-body">자세한 내용 <small>(선택, 1,000자)</small></label><textarea id="pr-body" rows="5" maxlength="1000" placeholder="활동 내용, 모집 대상, 일정 등"></textarea></div>
  <p class="hp-hint">여기에 적은 인스타 아이디·연락처·이메일은 <b>게시되면 누구나 볼 수 있어요.</b> 개인 번호가 부담되면 인스타 아이디나 오픈채팅·구글폼을 써 주세요. 사진에는 얼굴이나 개인 정보가 나오지 않게 해 주세요.</p>
  <p class="hp-err" id="pr-err" role="alert"></p>
  <div class="hp-actions"><button type="button" class="btn-outline" data-close>취소</button><button type="submit" class="btn-fill">요청 보내기</button></div></form>`,{wide:true});
 const q=s=>d.querySelector(s);
 /* 사진 고르면 미리보기 */
 q('#pr-poster').onchange=()=>{const f=q('#pr-poster').files&&q('#pr-poster').files[0],box=q('#pr-prev');
  if(!f){box.hidden=true;return}
  if(f.size>25*1024*1024){HP.toast('사진이 너무 커요(25MB 이하)');q('#pr-poster').value='';box.hidden=true;return}
  box.querySelector('img').src=URL.createObjectURL(f);box.hidden=false};
 q('#pr-prev-x').onclick=()=>{q('#pr-poster').value='';q('#pr-prev').hidden=true};
 q('#pr-form').onsubmit=async e=>{
  e.preventDefault();
  const v={org:q('#pr-org').value.trim(),kind:q('#pr-kind').value,title:q('#pr-title').value.trim(),summary:q('#pr-sum').value.trim(),end:q('#pr-end').value,link:q('#pr-link').value.trim(),poster:'',body:q('#pr-body').value.trim()};
  const file=q('#pr-poster').files&&q('#pr-poster').files[0];
  const err=m=>{q('#pr-err').textContent=m};
  if(!v.org||!v.title||!v.summary)return err('단체 이름, 제목, 한 줄 소개를 채워 주세요.');
  if(v.end&&v.end<today())return err('이미 지난 날짜예요.');
  if(v.link){const cc=HP.contactCheck(v.link);if(!cc.ok)return err(cc.err);v.link=cc.value}
  if(BAD.test(v.title+v.summary+v.body))return err("제목·소개·내용에는 전화번호를 쓸 수 없어요. 연락처는 '신청·문의 방법' 칸에 적어 주세요.");
  const sub=q('#pr-form [type=submit]');
  if(file){
   if(sub)sub.disabled=true;
   if(SVP()){const up=await HP.srv.promo.uploadPoster(file);if(!up.ok){if(sub)sub.disabled=false;return err(up.err)}v.poster=up.url}
   else{try{const b=await HP.shrinkImage(file,900,300*1024);v.poster=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(b)})}catch(e2){if(sub)sub.disabled=false;return err('사진을 읽지 못했어요.')}}
  }
  if(SVP()){
   if(sub)sub.disabled=true;
   const r=await HP.srv.promo.request({org:v.org,kind:v.kind,title:v.title,summary:v.summary,end:v.end,link:v.link,poster:v.poster,body:v.body});
   if(sub)sub.disabled=false;
   if(!r.ok)return err(r.err);
   HP.log('promo_submit',{status:v.kind});d.close();HP.toast('요청을 보냈어요. 관리자 확인 뒤 올라가요');renderPromo();return;
  }
  const dd=load();
  if(dd.posts.filter(p=>p.requester===u.id&&p.state==='pending').length>=3)return err('확인을 기다리는 요청이 이미 3건이에요. 처리된 뒤에 보내 주세요.');
  dd.posts.push(Object.assign(v,{id:HP.uid('pr'),start:'',pinned:false,state:'pending',source:'request',requester:u.id,requester_name:u.nickname||'',requester_verified:!!u.verified,created_at:new Date().toISOString(),views:0,clicks:0}));
  save(dd);HP.log('promo_submit',{status:v.kind});d.close();HP.toast('요청을 보냈어요. 관리자 확인 뒤 올라가요');renderPromo();
 };
}
document.addEventListener('click',e=>{const c=e.target.closest('[data-promo]');if(c)openPost(c.dataset.promo)});
W.addEventListener('storage',e=>{if(e.key===KEY)renderPromo()});
addEventListener('hashchange',()=>{if(location.hash==='#promo')renderPromo()});
HP.on('auth',renderPromo);
HP.on('ready',renderPromo);
})();
