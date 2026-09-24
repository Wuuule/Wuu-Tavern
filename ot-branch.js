/**
 * Non-destructive story-branch navigation.
 * Back/forward only switches conversations; it never deletes either timeline.
 */
(function(){
'use strict';
function runtime(){return window.WuuBranchRuntime||null;}
function ensure(){
    var top=document.getElementById('chatTopBar');
    if(!top)return null;
    var old=document.getElementById('wuuBranchNav');
    if(old)return old;
    var actions=top.querySelector('.topbar-actions');
    if(!actions)return null;
    var wrap=document.createElement('div');
    wrap.id='wuuBranchNav';
    wrap.style.cssText='display:none;align-items:center;gap:2px;padding:2px;border:1px solid rgba(127,127,127,.16);border-radius:10px;';
    var back=document.createElement('button');
    back.type='button';back.id='wuuBranchBack';back.textContent='↶';
    back.title='返回父剧情分支';back.setAttribute('aria-label','返回父剧情分支');
    var forward=document.createElement('button');
    forward.type='button';forward.id='wuuBranchForward';forward.textContent='↷';
    forward.title='回到子剧情分支';forward.setAttribute('aria-label','回到子剧情分支');
    [back,forward].forEach(function(b){
        b.style.cssText='width:27px;height:27px;border:0;border-radius:7px;background:transparent;color:inherit;cursor:pointer;font-size:16px;line-height:1;';
    });
    wrap.appendChild(back);wrap.appendChild(forward);
    actions.insertBefore(wrap,actions.firstChild);
    async function go(kind){
        var rt=runtime();if(!rt||typeof rt[kind]!=='function')return;
        back.disabled=true;forward.disabled=true;
        try{
            var result=await rt[kind]();
            if(!result||!result.ok)window.alert(result&&result.error||'剧情分支切换失败。');
        }catch(err){
            console.error('[Branch Nav]',err);window.alert('剧情分支切换失败。');
        }finally{back.disabled=false;forward.disabled=false;refresh();}
    }
    back.onclick=function(){go('back');};
    forward.onclick=function(){go('forward');};
    return wrap;
}
function refresh(){
    var wrap=ensure(),rt=runtime();
    if(!wrap||!rt||typeof rt.info!=='function'){if(wrap)wrap.style.display='none';return;}
    var info=rt.info()||{};
    var back=document.getElementById('wuuBranchBack'),forward=document.getElementById('wuuBranchForward');
    var hasBack=!!info.parent,hasForward=!!info.forward;
    wrap.style.display=(hasBack||hasForward)?'inline-flex':'none';
    if(back){
        back.disabled=!hasBack;
        back.title=hasBack?'返回父剧情线：'+String(info.parent.title||'父分支'):'没有父剧情线';
    }
    if(forward){
        forward.disabled=!hasForward;
        forward.title=hasForward?'回到子剧情线：'+String(info.forward.title||'子分支'):'没有可返回的子剧情线';
    }
}
document.addEventListener('DOMContentLoaded',refresh);
window.addEventListener('load',refresh);
window.addEventListener('ot-chat-context-changed',refresh);
if(document.readyState!=='loading')refresh();
})();
