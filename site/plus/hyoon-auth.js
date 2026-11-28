/* =====================================================================
   효온 플러스 (로컬 시안) · 실제 로그인 1단계
   - 카카오·구글 로그인은 시험 Supabase 프로젝트(window.HYOON_SB)로 진짜 진행한다.
   - 회원 프로필(profiles)·동의 이력(consents)만 시험 서버에 저장한다. 팀·일정·포트폴리오 등은 아직 이 브라우저(localStorage)에만 있다.
   - 설정(window.HYOON_SB)이 없거나 supabase-js 를 못 불러오면 아무것도 하지 않아 기존 가짜 로그인이 그대로 동작한다.
   ===================================================================== */
(function(){
'use strict';
const W=window,CFG=W.HYOON_SB;
if(!CFG||!W.supabase||!W.supabase.createClient)return;
const HP=W.HP;if(!HP)return;
const DB=HP.db;
const sb=W.supabase.createClient(CFG.url,CFG.key,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'hyoon-sb-auth'}});
const KINDS=['terms','privacy','age14','research','personalize','notify'];
let pushed={};            // 서버에 이미 기록된 동의 상태
let warned=false;
const warn=(what,err)=>{console.warn('[hyoon-auth]',what,err&&err.message||err);if(!warned){warned=true;HP.toast('시험 서버 저장에 실패했어요 ('+what+')')}};

/* ---------- 서버 프로필 ⇄ 시안 회원 ---------- */
function fromRow(r){return {nickname:r.nickname||'',verified:!!r.verified_pnu,pnu_email:r.pnu_email||'',pnu_verified_at:r.pnu_verified_at||null,
 course:r.course||'학부',college:r.college||'',dept:r.dept||'',grade:r.grade||'',jobs:r.jobs||[],subs:r.subs||[],bio:r.bio||'',skills:r.skills||[],
 contact:r.contact||'',onboarded:!!r.onboarded}}
function toRow(u){return {id:u.id,nickname:String(u.nickname||'').trim().slice(0,16),course:u.course||null,college:u.college||null,dept:u.dept||null,
 grade:u.grade?String(u.grade):null,jobs:(u.jobs||[]).slice(0,3),subs:(u.subs||[]).slice(0,20),bio:u.bio||null,skills:(u.skills||[]).slice(0,8),
 contact:u.contact||null,onboarded:!!u.onboarded}}

/* ---------- 내 일정(user_calendar) · 포트폴리오(portfolio_items) ⇄ 시안의 cal · pf ---------- */
const SYNC={cal:'user_calendar',pf:'portfolio_items'};
let liveUid=null;
const nkey=a=>{try{return noticeKey(a)}catch(e){return ''}};
const idOfKey=k=>{try{const a=A.find(x=>nkey(x)===k);return a?a.id:''}catch(e){return ''}};
const keyOfId=id=>{try{const a=A.find(x=>x.id===id);return a?nkey(a):null}catch(e){return null}};
const clip=(v,n)=>v==null?null:(String(v).slice(0,n)||null);
const MAP={
 cal:{
  to:x=>({id:x.id,user_id:x.uid,notice_key:String(x.row_key||'').slice(0,600),title:String(x.title||'').slice(0,300),org:clip(x.org,200),sub:clip(x.sub,100),link:clip(x.link,600),
   end_date:x.end||null,status:x.status||'interest',remind_days:[0,1,3,7].includes(+x.remind)?+x.remind:0,memo:clip(x.memo,120)}),
  from:r=>({id:r.id,uid:r.user_id,notice_id:idOfKey(r.notice_key),row_key:r.notice_key,title:r.title,end:r.end_date||'',sub:r.sub||'',link:r.link||'',org:r.org||'',
   status:r.status,remind:r.remind_days,memo:r.memo||'',created_at:r.created_at,updated_at:r.updated_at})
 },
 pf:{
  to:x=>({id:x.id,user_id:x.uid,type:x.type||'기타',title:String(x.title||'').slice(0,100),org:clip(x.org,100),start_date:x.start||null,end_date:x.ongoing?null:(x.end||null),ongoing:!!x.ongoing,
   role:String(x.role||'').slice(0,80),description:String(x.desc||'').slice(0,1000),result:clip(x.result,200),skills:(x.skills||[]).slice(0,5),link:x.link||null,
   notice_key:x.notice_id?keyOfId(x.notice_id):null,visibility:x.visibility==='link'?'link':'private'}),
  from:r=>({id:r.id,uid:r.user_id,type:r.type,title:r.title,org:r.org||'',start:r.start_date||'',end:r.end_date||'',ongoing:!!r.ongoing,role:r.role,desc:r.description,
   result:r.result||'',skills:r.skills||[],link:r.link||'',visibility:r.visibility,notice_id:idOfKey(r.notice_key),created_at:r.created_at,updated_at:r.updated_at})
 }
};
async function syncPull(uid){
 const [c,p]=await Promise.all([sb.from(SYNC.cal).select('*').eq('user_id',uid),sb.from(SYNC.pf).select('*').eq('user_id',uid)]);
 if(c.error)warn('일정 읽기',c.error);else DB.replaceRows('cal',uid,c.data.map(MAP.cal.from));
 if(p.error)warn('포트폴리오 읽기',p.error);else DB.replaceRows('pf',uid,p.data.map(MAP.pf.from));
}
async function pushRow(t,r){
 if(!liveUid||!r||r.uid!==liveUid)return;
 try{const {error}=await sb.from(SYNC[t]).upsert(MAP[t].to(r),{onConflict:'id'});if(error)warn(t==='cal'?'일정 저장':'포트폴리오 저장',error)}catch(e){warn('저장',e)}
}
async function delRow(t,id){
 if(!liveUid)return;
 try{const {error}=await sb.from(SYNC[t]).delete().eq('id',id).eq('user_id',liveUid);if(error)warn('삭제',error)}catch(e){warn('삭제',e)}
}
const _ins=DB.insert.bind(DB),_upd=DB.update.bind(DB),_rm=DB.remove.bind(DB);
DB.insert=function(t,row){
 if(SYNC[t]&&liveUid)row=Object.assign({id:(crypto.randomUUID?crypto.randomUUID():undefined)},row);
 const r=_ins(t,row);if(SYNC[t])pushRow(t,r);return r;
};
DB.update=function(t,id,patch){const r=_upd(t,id,patch);if(SYNC[t]&&r)pushRow(t,r);return r};
DB.remove=function(t,id){_rm(t,id);if(SYNC[t])delRow(t,id)};

async function pullAndAdopt(session,fresh){
 const su=session.user,uid=su.id;
 const meta=su.user_metadata||{};
 const email=su.email||meta.email||'';
 const provider=(su.app_metadata&&su.app_metadata.provider)||'oauth';
 const [pr,cs]=await Promise.all([
  sb.from('profiles').select('*').eq('id',uid).maybeSingle(),
  sb.from('consent_now').select('kind,granted,created_at').eq('user_id',uid)
 ]);
 if(pr.error){warn('프로필 읽기',pr.error);return}
 const row=pr.data;
 const consent={terms:false,privacy:false,age14:false,personalize:false,research:false,notify:false,at:null};
 pushed={};
 (cs.data||[]).forEach(c=>{consent[c.kind]=!!c.granted;pushed[c.kind]=!!c.granted;if(c.kind==='terms'&&c.granted)consent.at=c.created_at});
 const base={id:uid,email,provider,consent};
 const patch=row?Object.assign(base,fromRow(row)):Object.assign(base,{onboarded:false,verified:false,
  nickname:String(meta.nickname||meta.name||meta.full_name||'').slice(0,16)});
 const {user,isNew}=DB.adopt(patch);
 liveUid=uid;
 await syncPull(uid);
 return {user,isNew:!row,fresh};
}

let busy=false,obShown=false;
async function onSession(session,fresh){
 if(!session||busy)return;
 busy=true;
 try{
  const r=await pullAndAdopt(session,fresh);if(!r)return;
  const {user,isNew}=r;
  HP.renderAuth();
  if(fresh){
   HP.log&&HP.log(isNew?'signup':'login',{method:(session.user.app_metadata||{}).provider||'oauth',verified:!!user.verified});
   document.querySelectorAll('dialog.hp-modal[open]').forEach(d=>d.close());
  }
  if(!user.onboarded){ if(!obShown){obShown=true;HP.openOnboarding()} }
  else{ HP.syncProfileFromUser(user); if(fresh)HP.toast('로그인했어요'); HP.emit('auth');
   try{const rh=sessionStorage.getItem('hp-return-hash');if(rh){sessionStorage.removeItem('hp-return-hash');if(rh!==location.hash)setTimeout(()=>{location.hash=rh},300)}}catch(e){} }
 }finally{busy=false}
}

/* ---------- 내보내기: 시안의 저장 지점을 서버로도 보낸다 ---------- */
const _update=DB.updateMe.bind(DB);
DB.updateMe=function(patch){
 const u=_update(patch);
 if(u)push(u,patch);
 return u;
};
async function push(u,patch){
 try{
  const ses=(await sb.auth.getSession()).data.session;if(!ses||ses.user.id!==u.id)return;
  if(u.onboarded&&String(u.nickname||'').trim()){
   const {error}=await sb.from('profiles').upsert(toRow(u),{onConflict:'id'});
   if(error)return warn('프로필 저장',error);
  }
  if(patch&&patch.consent){
   const c=patch.consent;
   const send=KINDS.filter(k=>{const g=!!c[k];return pushed[k]!==g&&!(pushed[k]===undefined&&!g)}).map(k=>({user_id:u.id,kind:k,granted:!!c[k]}));
   if(send.length){
    const {error}=await sb.from('consents').insert(send);
    if(error)return warn('동의 기록',error);
    send.forEach(r=>{pushed[r.kind]=r.granted});
   }
  }
 }catch(e){warn('저장',e)}
}

const _out=DB.signOut.bind(DB);
DB.signOut=function(){liveUid=null;_out();sb.auth.signOut().catch(()=>{})};
const _del=DB.deleteMe.bind(DB);
DB.deleteMe=function(){
 sb.rpc('delete_my_account').then(({error})=>{if(error)warn('탈퇴',error)}).finally(()=>{sb.auth.signOut().catch(()=>{})});
 _del();
};

/* ---------- 로그인 버튼 ---------- */
HP.sbAuth={
 signIn(provider){
  const redirectTo=location.origin+location.pathname;
  const opt={redirectTo};
  if(provider==='kakao')opt.scopes='profile_nickname';   // 이메일 권한이 아직 없어서 닉네임만 요청 (비즈 앱 전환 뒤 이메일 추가)
  try{sessionStorage.setItem('hp-oauth-go','1');if(/^#(join-|teams|me|promo)/.test(location.hash))sessionStorage.setItem('hp-return-hash',location.hash)}catch(e){}   // 로그인 뒤 보던 화면(초대 링크 등)으로 돌아오기
  return sb.auth.signInWithOAuth({provider,options:opt}).then(({error})=>{if(error)HP.toast('로그인을 시작하지 못했어요: '+error.message)});
 },
 client:sb
};

/* ---------- 시작: 돌아온 로그인 처리 + 저장된 세션 복원 ---------- */
/* 돌아온 주소(?code=…)는 로그인 라이브러리가 코드를 교환한 "뒤에" 지운다 (먼저 지우면 로그인이 풀린다) */
function cleanUrl(){
 try{const u=new URL(location.href);
  if(u.searchParams.has('code')||u.searchParams.has('error_description')){
   ['code','error','error_code','error_description'].forEach(k=>u.searchParams.delete(k));
   history.replaceState(null,'',u.pathname+(u.search||'')+u.hash);
  }}catch(e){}
}
try{const q=new URL(location.href).searchParams;const err=q.get('error_description');
 if(err){setTimeout(()=>{HP.toast('로그인에 실패했어요: '+err);cleanUrl()},600)}}catch(e){}
sb.auth.initialize().then(({error})=>{
 if(error){console.warn('[hyoon-auth] 로그인 복귀 처리 실패',error);HP.toast('로그인 복귀 처리에 실패했어요: '+error.message)}
 setTimeout(cleanUrl,800);
});
sb.auth.onAuthStateChange((ev,session)=>{
 if(ev==='SIGNED_OUT'){liveUid=null;_out();HP.renderAuth();HP.emit('auth');return}
 if((ev==='SIGNED_IN'||ev==='INITIAL_SESSION')&&session){
  const fresh=sessionStorage.getItem('hp-oauth-go')==='1';
  if(fresh)sessionStorage.removeItem('hp-oauth-go');
  setTimeout(()=>onSession(session,fresh),0);
 }
});
HP.on('ready',()=>{
 const bar=document.querySelector('.hp-preview-bar');
 if(bar)bar.innerHTML=bar.innerHTML.replace('실제 사이트와 서버에는 아무것도 저장되지 않아요','로그인·회원 정보만 시험 서버에 저장되고, 나머지는 이 브라우저에만 저장돼요');
});
})();
