/* =====================================================================
   효온 플러스 · 공용 도구 (연락 방법 검사·표시). 팀원 모집(teams)과 마이페이지(me)가 함께 쓴다.
   ===================================================================== */
(function(){
'use strict';
const W=window,HP=W.HP,h=s=>esc(s);
/* 연락 방법: 오픈채팅 링크·전화번호·이메일·인스타(@아이디)·그 밖의 글 모두 가능. 합류가 확정된 팀원과 본인에게만 보이는 칸이라 번호도 허용(공개 글에는 여전히 불가) */
function contactCheck(raw){
 const v=String(raw||'').trim().replace(/\s+/g,' ');
 if(!v)return {ok:false,err:'연락 방법을 적어 주세요.'};
 if(v.length>120)return {ok:false,err:'120자 이내로 적어 주세요.'};
 if(/[<>"'`]/.test(v))return {ok:false,err:'따옴표나 꺾쇠(< >)는 쓸 수 없어요.'};
 if(/^https?:\/\//i.test(v)){
  if(!/^https:\/\/[^\s]+$/i.test(v))return {ok:false,err:'링크는 https:// 로 시작하고 띄어쓰기가 없어야 해요.'};
  return {ok:true,kind:'link',value:v};
 }
 if(/^[a-z][a-z0-9+.-]*:\/\//i.test(v))return {ok:false,err:'링크는 https:// 로 시작해야 해요.'};
 const digits=v.replace(/[-\s.()]/g,'');
 if(/^[+0-9]/.test(v)&&/^\+?\d+$/.test(digits)){
  const n=digits.replace(/^\+82/,'0');
  if(!/^01[016789]\d{7,8}$/.test(n)&&!/^0\d{8,10}$/.test(n))return {ok:false,err:'전화번호 형식을 확인해 주세요. 예) 010-1234-5678'};
  return {ok:true,kind:'phone',value:/^01/.test(n)?n.replace(/^(01\d)(\d{3,4})(\d{4})$/,'$1-$2-$3'):n.replace(/^(02|0\d{2})(\d{3,4})(\d{4})$/,'$1-$2-$3')};
 }
 if(v.includes('@')&&!v.startsWith('@')){
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v))return {ok:false,err:'이메일 형식을 확인해 주세요.'};
  return {ok:true,kind:'email',value:v};
 }
 if(/^@[A-Za-z0-9._]{2,30}$/.test(v))return {ok:true,kind:'insta',value:v};
 if(v.length<2)return {ok:false,err:'2자 이상 적어 주세요.'};
 return {ok:true,kind:'text',value:v};
}
function contactHtml(v){
 const c=contactCheck(v),val=c.ok?c.value:String(v||''),e=h(val);
 const copy=`<button type="button" class="hp-link" data-copy="${e}">복사</button>`;
 if(c.kind==='link')return `<a href="${e}" target="_blank" rel="noopener noreferrer">${e}</a>`;
 if(c.kind==='phone')return `<a href="tel:${e.replace(/-/g,'')}">${e}</a> ${copy}`;
 if(c.kind==='email')return `<a href="mailto:${e}">${e}</a> ${copy}`;
 if(c.kind==='insta')return `<a href="https://www.instagram.com/${h(val.slice(1))}/" target="_blank" rel="noopener noreferrer">${e}</a> ${copy}`;
 return `<span>${e}</span> ${copy}`;
}
HP.contactCheck=contactCheck;HP.contactHtml=contactHtml;
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-copy]');if(!b)return;
 (navigator.clipboard?navigator.clipboard.writeText(b.dataset.copy):Promise.reject()).then(()=>HP.toast('복사했어요'),()=>HP.toast('복사하지 못했어요. 길게 눌러 복사해 주세요'))});
})();
