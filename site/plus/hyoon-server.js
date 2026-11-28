/* =====================================================================
   효온 플러스 · 서버 저장 (팀원 모집 · 홍보 게시판)
   - 서버(Supabase)가 정답이고, 화면 코드는 이 브라우저의 작은 사본(HPDB)을 읽는다.
     로그인 후·화면에 들어갈 때·쓰기 뒤에 서버에서 다시 받아 사본을 통째로 바꾼다.
   - 쓰기는 모두 서버 함수(rpc)나 허용된 칼럼 insert/update로만 한다. 권한 검사는 DB가 한다(docs/supabase-phase2.sql).
   - 서버 설정이 없으면(HP.sbAuth 없음) 아무것도 하지 않아 시안의 가짜 저장이 그대로 동작한다.
   ===================================================================== */
(function(){
'use strict';
const W=window,HP=W.HP;
if(!HP||!HP.sbAuth||!HP.sbAuth.client)return;
const sb=HP.sbAuth.client,DB=HP.db;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nkey=a=>{try{return noticeKey(a)}catch(e){return ''}};
const idOfKey=k=>{try{const a=A.find(x=>nkey(x)===k);return a?a.id:''}catch(e){return ''}};
const meId=()=>{const u=DB.me();return u&&UUID.test(u.id)?u.id:null};
const TEAM_COLS='id,leader_id,notice_key,notice_title,notice_end,notice_poster,title,intro,want,roles,mode,meet,deadline,status,report_count,created_at,updated_at';

const MSG={
 login_required:'로그인이 필요해요',too_many_open_teams:'동시에 모집할 수 있는 팀은 3개예요. 기존 모집을 마감해 주세요',
 team_full:'그 사이 자리가 다 찼어요',team_not_open:'모집이 끝난 팀이에요',already_applied:'이미 지원한 팀이에요',not_pending:'이미 처리된 지원이에요',
 not_member:'이 팀의 팀원이 아니에요',not_leader:'팀장만 할 수 있어요',not_leader_or_closed:'모집 중인 내 팀에서만 초대할 수 있어요',already_member:'이미 이 팀에 있어요',
 too_many_invites:'대기 중인 초대가 너무 많아요(20개)',not_found:'이미 처리됐거나 없는 항목이에요',bad_code:'초대 링크가 만료됐거나 잘못됐어요',bad_decision:'이미 처리된 지원이에요',
 role_in_use:'이미 합류한 사람이 있는 역할은 지우거나 바꿀 수 없어요',need_below_filled:'이미 합류한 인원보다 적게 줄일 수 없어요',roles_invalid:'역할 구성을 확인해 주세요',
 too_many_pending:'확인을 기다리는 요청이 이미 3건이에요. 처리된 뒤에 보내 주세요',admin_only:'관리자만 할 수 있어요'
};
function errText(e){
 const m=String((e&&e.message)||e||'');
 for(const k in MSG)if(m.includes(k))return MSG[k];
 if(/duplicate key|already exists|23505/i.test(m)){
  if(/team_invites_one_pending/.test(m))return '이미 초대를 보냈어요';
  if(/team_seekers_one_open/.test(m))return '이미 등록한 팀 구해요 글이 있어요';
  if(/reports/.test(m))return '이미 신고한 글이에요';
  return '이미 처리된 항목이에요';
 }
 if(/row-level security|permission denied|42501/i.test(m))return '권한이 없어요. 로그인 상태를 확인해 주세요';
 if(/network|fetch/i.test(m))return '네트워크 연결을 확인해 주세요';
 return '처리하지 못했어요. 잠시 뒤 다시 시도해 주세요';
}

const S=HP.srv={
 enabled:true,
 live:()=>!!meId(),
 errText,
 error:null
};
let last=0,pulling=null,promoCache=null,promoAt=0;

/* ---------- 서버 → 사본 ---------- */
const mapTeam=(r,extra)=>Object.assign({id:r.id,leader:r.leader_id,notice_id:idOfKey(r.notice_key),notice_key:r.notice_key,notice_title:r.notice_title,notice_end:r.notice_end||'',
 poster:r.notice_poster||'',title:r.title,intro:r.intro,want:r.want||'',roles:Array.isArray(r.roles)?r.roles:[],mode:r.mode||'',meet:r.meet||'',deadline:r.deadline||'',
 status:r.status,reports:r.report_count||0,contact:'',invite_code:'',created_at:r.created_at},extra||{});
const mapApp=r=>({id:r.id,team_id:r.team_id,uid:r.user_id,role:r.role,message:r.message||'',status:r.status,via:r.via,created_at:r.created_at});
const mapInv=r=>({id:r.id,team_id:r.team_id,from:r.from_id,to:r.to_id,role:r.role,message:r.message||'',status:r.status,created_at:r.created_at});
const mapSeek=r=>({id:r.id,uid:r.user_id,notice_id:idOfKey(r.notice_key),notice_key:r.notice_key||'',notice_title:r.notice_title||'',roles:r.roles||[],intro:r.intro,status:r.status,created_at:r.created_at});
const mapCard=c=>({id:c.id,nickname:c.nickname||'',college:c.college||'',dept:c.dept||'',grade:c.grade||'',skills:c.skills||[],bio:c.bio||'',verified:!!c.verified_pnu,demo:false});

async function doPull(){
 const uid=meId();if(!uid)return;
 const [t,a,i,s,c]=await Promise.all([
  sb.from('teams').select(TEAM_COLS),sb.from('team_applications').select('*'),sb.from('team_invites').select('*'),
  sb.from('team_seekers').select('*'),sb.from('member_cards').select('*')]);
 const bad=[t,a,i,s,c].find(x=>x.error);
 if(bad){S.error=bad.error;console.warn('[hyoon-server] 읽기 실패',bad.error.message);return}
 S.error=null;
 const apps=a.data.map(mapApp);
 const mine=t.data.filter(x=>x.leader_id===uid||apps.some(p=>p.team_id===x.id&&p.uid===uid&&p.status==='accepted'));
 /* 연락처·초대 코드는 칼럼 권한으로 막혀 있어 함수로만 읽는다(내 팀·합류한 팀만) */
 const extras={};
 await Promise.all(mine.map(async x=>{
  const e={};
  try{const r=await sb.rpc('team_contact',{p_team:x.id});if(!r.error)e.contact=r.data||''}catch(_){}
  if(x.leader_id===uid){try{const r=await sb.rpc('team_invite_code',{p_team:x.id,p_regenerate:false});if(!r.error)e.invite_code=r.data||''}catch(_){}}
  extras[x.id]=e;
 }));
 DB.mergeUsers(c.data.map(mapCard));
 DB.setTable('teams',t.data.map(r=>mapTeam(r,extras[r.id])));
 DB.setTable('apps',apps);
 DB.setTable('invites',i.data.map(mapInv));
 DB.setTable('seekers',s.data.map(mapSeek));
 last=Date.now();
 HP.emit('srv');
}
S.pull=function(force){
 if(!meId())return Promise.resolve();
 if(pulling)return pulling;
 if(!force&&Date.now()-last<20000)return Promise.resolve();
 pulling=doPull().catch(e=>{S.error=e;console.warn('[hyoon-server]',e)}).finally(()=>{pulling=null});
 return pulling;
};

/* ---------- 쓰기: 성공하면 {ok:true,...}, 실패하면 {ok:false,err:'한국어 사유'} ---------- */
async function run(fn){
 try{const r=await fn();if(r&&r.error)return {ok:false,err:errText(r.error),raw:r.error};
  await S.pull(true);return Object.assign({ok:true},r&&r.data!==undefined?{data:r.data}:{})}
 catch(e){return {ok:false,err:errText(e),raw:e}}
}
const rpc=(name,args)=>run(()=>sb.rpc(name,args));
const need=()=>{if(!meId())return {ok:false,err:MSG.login_required};return null};

S.createTeam=async function(v,notice){
 const g=need();if(g)return g;
 const row={leader_id:meId(),notice_key:nkey(notice),notice_title:String(notice.title||'').slice(0,300),notice_end:notice.end||null,
  notice_poster:/^https:\/\//.test((notice.posters&&notice.posters[0])||'')?notice.posters[0]:null,
  title:v.title,intro:v.intro,want:v.want||null,roles:v.roles.map(r=>({name:r.name,need:+r.need})),mode:v.mode||null,meet:v.meet||null,deadline:v.deadline||null,contact:v.contact};
 return run(()=>sb.from('teams').insert(row).select('id').single());
};
S.updateTeam=async function(id,v){
 const g=need();if(g)return g;
 return run(()=>sb.from('teams').update({title:v.title,intro:v.intro,want:v.want||null,roles:v.roles.map(r=>({name:r.name,need:+r.need})),mode:v.mode||null,meet:v.meet||null,deadline:v.deadline||null,contact:v.contact}).eq('id',id));
};
S.setTeamStatus=async function(id,status){const g=need();if(g)return g;return run(()=>sb.from('teams').update({status}).eq('id',id))};
S.apply=(team,role,msg)=>rpc('apply_team',{p_team:team,p_role:role,p_message:msg});
S.withdraw=team=>rpc('withdraw_application',{p_team:team});
S.leave=team=>rpc('leave_team',{p_team:team});
S.decide=(app,dec)=>rpc('decide_application',{p_app:app,p_decision:dec});
S.invite=(team,to,role,msg)=>rpc('invite_member',{p_team:team,p_to:to,p_role:role,p_message:msg||''});
S.cancelInvite=id=>rpc('cancel_invite',{p_invite:id});
S.answerInvite=(id,yes)=>rpc('answer_invite',{p_invite:id,p_accept:!!yes});
S.joinByCode=(code,role)=>rpc('join_team_by_code',{p_code:code,p_role:role});
S.teamByCode=async function(code){
 try{const r=await sb.rpc('team_by_code',{p_code:code});if(r.error||!r.data||!r.data.length)return null;return r.data[0]}catch(e){return null}
};
S.regenInvite=team=>rpc('team_invite_code',{p_team:team,p_regenerate:true});
S.saveSeeker=async function(v,editId){
 const g=need();if(g)return g;
 const body={notice_key:v.notice_key||null,notice_title:v.notice_title||null,roles:v.roles,intro:v.intro};
 if(editId)return run(()=>sb.from('team_seekers').update(body).eq('id',editId));
 return run(async()=>{
  const c=await sb.from('team_seekers').update({status:'closed'}).eq('user_id',meId()).eq('status','open');
  if(c.error)return c;
  return sb.from('team_seekers').insert(Object.assign({user_id:meId()},body));
 });
};
S.closeSeeker=async function(id){const g=need();if(g)return g;return run(()=>sb.from('team_seekers').update({status:'closed'}).eq('id',id))};
S.report=async function(team,reason){const g=need();if(g)return g;return run(()=>sb.from('reports').insert({target_type:'team',target_id:team,user_id:meId(),reason}))};

/* ---------- 홍보 게시판 ---------- */
const PROMO_COLS='id,title,org,kind,summary,body,start_date,end_date,poster_url,link,pinned,sponsored,state,reject_reason,source,views,clicks,created_at,updated_at,approved_at';
const mapPromo=r=>({id:r.id,title:r.title,org:r.org,kind:r.kind,summary:r.summary,body:r.body||'',start:r.start_date||'',end:r.end_date||'',poster:r.poster_url||'',link:r.link||'',
 pinned:!!r.pinned,sponsored:!!r.sponsored,state:r.state,reject_reason:r.reject_reason||'',source:r.source,views:r.views||0,clicks:r.clicks||0,created_at:r.created_at});
S.promo={
 /* 게시 중인 글(누구나) + 내가 요청한 글(로그인 시). 결과는 {live:[...],mine:[...]} */
 async load(force){
  if(!force&&promoCache&&Date.now()-promoAt<30000)return promoCache;
  const out={live:[],mine:[],error:null};
  try{
   const pub=await sb.from('promo_posts').select(PROMO_COLS).eq('state','published');
   if(pub.error)out.error=pub.error;else out.live=pub.data.map(mapPromo);
   if(meId()){const m=await sb.rpc('my_promo_requests');if(!m.error&&m.data)out.mine=m.data.map(mapPromo)}
  }catch(e){out.error=e}
  promoCache=out;promoAt=Date.now();return out;
 },
 async request(v){
  const g=need();if(g)return g;
  try{
   const r=await sb.from('promo_posts').insert({title:v.title,org:v.org,kind:v.kind,summary:v.summary,body:v.body||null,start_date:null,end_date:v.end||null,
    poster_url:v.poster||null,link:v.link||null,requester:meId()});
   if(r.error)return {ok:false,err:errText(r.error)};
   promoAt=0;return {ok:true};
  }catch(e){return {ok:false,err:errText(e)}}
 },
 /* 포스터 사진 올리기: 줄인 JPEG를 내 폴더(회원 id)에 올리고 공개 주소를 돌려준다 */
 async uploadPoster(file){
  const g=need();if(g)return g;
  let blob;
  try{blob=await HP.shrinkImage(file,1280,900*1024)}
  catch(e){return {ok:false,err:e&&e.message==='toolarge'?'사진이 너무 커요. 더 작은 사진으로 올려 주세요':'사진을 읽지 못했어요. jpg·png·webp 사진인지 확인해 주세요'}}
  const id=(W.crypto&&crypto.randomUUID)?crypto.randomUUID():String(Date.now())+Math.random().toString(36).slice(2,8);
  const path=meId()+'/'+id+'.jpg';
  try{
   const r=await sb.storage.from('promo-posters').upload(path,blob,{contentType:'image/jpeg',cacheControl:'31536000'});
   if(r.error){
    const m=String(r.error.message||'');
    return {ok:false,err:/row-level|policy|unauthor/i.test(m)?'올릴 수 있는 사진은 한 사람당 10장까지예요':/size|exceed|large/i.test(m)?'사진이 너무 커요':'사진을 올리지 못했어요. 잠시 뒤 다시 시도해 주세요'}
   }
   return {ok:true,url:sb.storage.from('promo-posters').getPublicUrl(path).data.publicUrl};
  }catch(e){return {ok:false,err:errText(e)}}
 },
 hit(id,kind){try{sb.rpc('promo_hit',{p_id:id,p_kind:kind}).then(()=>{},()=>{})}catch(e){}}
};

/* 로그인·로그아웃 때 사본 다시 받기 / 비우기 */
HP.on('auth',()=>{
 if(meId()){S.pull(true)}
 else{['teams','apps','invites','seekers'].forEach(t=>DB.setTable(t,[]));promoAt=0;HP.emit('srv')}
});
HP.on('route',r=>{if(r==='teams')S.pull(false)});
})();
