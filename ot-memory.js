/**
 * Important memories panel inside the existing Status Center.
 * No extra floating buttons, DOM observers or privileged HTML rendering.
 */
(function(){
'use strict';
var mode='tables';
function rt(){return window.OpenTavernStatusCenterRuntime||null;}
function btn(label){
    var b=document.createElement('button');b.type='button';b.textContent=label;
    b.style.cssText='font:inherit;font-size:12px;border-radius:8px;padding:5px 10px;'+
        'border:1px solid rgba(127,127,127,.25);background:transparent;color:inherit;cursor:pointer;';
    return b;
}
function ensure(){
    var shell=document.getElementById('otStatusShell'),layout=document.getElementById('otStatusLayout');
    if(!shell||!layout)return false;
    if(document.getElementById('wuuPinnedMemoryPane'))return true;
    var header=layout.previousElementSibling;
    if(!header)return false;
    var right=header.querySelector('#otStatusClose');
    if(!right)return false;
    var toggle=btn('重要记忆');
    toggle.id='wuuPinnedMemoryToggle';
    toggle.setAttribute('aria-pressed','false');
    toggle.style.marginLeft='auto';
    right.parentNode.insertBefore(toggle,right);
    var debugBtn=btn('上下文');
    debugBtn.id='wuuStatusDebugToggle';
    debugBtn.setAttribute('aria-pressed','false');
    right.parentNode.insertBefore(debugBtn,right);
    var pane=document.createElement('section');
    pane.id='wuuPinnedMemoryPane';
    pane.setAttribute('aria-label','当前对话的固定记忆');
    pane.style.cssText='display:none;flex:1;min-height:0;overflow:auto;padding:12px 16px;';
    shell.appendChild(pane);
    toggle.onclick=function(){mode=mode==='memory'?'tables':'memory';switchTab();};
    debugBtn.onclick=function(){mode=mode==='debug'?'tables':'debug';switchTab();};
    return true;
}
function switchTab(){
    if(!ensure())return;
    document.getElementById('otStatusLayout').style.display=mode==='tables'?'flex':'none';
    var pane=document.getElementById('wuuPinnedMemoryPane');
    pane.style.display=mode==='tables'?'none':'block';
    var memoryButton=document.getElementById('wuuPinnedMemoryToggle');
    memoryButton.textContent=mode==='memory'?'返回状态表':'重要记忆';
    memoryButton.setAttribute('aria-pressed',mode==='memory'?'true':'false');
    var debugButton=document.getElementById('wuuStatusDebugToggle');
    debugButton.textContent=mode==='debug'?'返回状态表':'上下文';
    debugButton.setAttribute('aria-pressed',mode==='debug'?'true':'false');
    if(mode!=='tables')render();
}
function debugLine(pane,title,value) {
    var box=document.createElement('div');
    box.style.cssText='margin-bottom:12px;border:1px solid rgba(127,127,127,.2);'+
        'border-radius:10px;padding:10px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;';
    var heading=document.createElement('strong');
    heading.textContent=title;box.appendChild(heading);
    var detail=document.createElement('div');
    detail.style.cssText='font-size:12px;margin-top:4px;';
    detail.textContent=value;box.appendChild(detail);pane.appendChild(box);
}
function renderDebug(pane, runtime) {
    var intro=document.createElement('p');
    intro.style.cssText='font-size:12px;opacity:.72;line-height:1.6;margin-bottom:12px;';
    intro.textContent='最近一次本地 Prompt 组装时的状态表预算诊断。长度按字符估算，并非精确 Token 或最终网络请求；其他世界书、角色卡和消息可在原有完整 Prompt 查看器检查。';
    pane.appendChild(intro);
    var diagnostics=runtime&&runtime.getPromptDiagnostics&&runtime.getPromptDiagnostics();
    if(!diagnostics){debugLine(pane,'暂无记录','发起一次对话后，这里显示状态表注入及预算情况。');return;}
    debugLine(pane,'状态中心字符预算',String(diagnostics.estimatedChars||0)+' / '+String(diagnostics.limit||16000));
    debugLine(pane,'本次完整注入', (diagnostics.included||[]).join('、')||'无');
    debugLine(pane,'已部分截断', (diagnostics.truncated||[]).join('、')||'无');
    debugLine(pane,'未注入（上下文预算）', (diagnostics.omitted||[]).join('、')||'无');
}
function render(){
    if(mode==='tables'||!ensure())return;
    var pane=document.getElementById('wuuPinnedMemoryPane'),runtime=rt();
    if(!pane)return;
    pane.replaceChildren();
    if(mode==='debug'){renderDebug(pane,runtime);return;}
    var h=document.createElement('div');
    h.style.cssText='font-size:12px;opacity:.75;line-height:1.6;margin-bottom:12px;';
    h.textContent='在聊天消息底部点击 ✦，将重要事实固定在当前对话。编辑、删除或更改来源消息时，关联记忆自动标记为失效，不再注入模型。';
    pane.appendChild(h);
    var entries=runtime&&typeof runtime.listPinnedMemories==='function'?runtime.listPinnedMemories():[];
    if(!entries.length){
        var empty=document.createElement('p');empty.textContent='当前对话还没有固定记忆。';
        empty.style.opacity='.65';pane.appendChild(empty);return;
    }
    entries.slice().reverse().forEach(function(memory){
        var item=document.createElement('article');
        item.style.cssText='border:1px solid rgba(127,127,127,.2);border-radius:12px;'+
            'padding:10px 12px;margin-bottom:10px;';
        var stamp=document.createElement('div');
        stamp.style.cssText='font-size:11px;opacity:.65;margin-bottom:6px;';
        stamp.textContent=(memory.stale?'⚠ 已失效 · 不再注入':'已固定 · 有效')+
            ' · '+(memory.createdAt?new Date(memory.createdAt).toLocaleString():'');
        item.appendChild(stamp);
        var content=document.createElement('div');
        content.style.cssText='font-size:13px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;';
        content.textContent=memory.text;
        item.appendChild(content);
        var remove=btn('移除');
        remove.style.marginTop='9px';
        remove.onclick=async function(){
            if(!window.confirm('删除这条固定记忆？原始聊天消息不会被删除。'))return;
            remove.disabled=true;
            try{
                if(await rt().deletePinnedMemory(memory.id))render();
                else window.alert('移除失败，请检查浏览器存储。');
            }finally{remove.disabled=false;}
        };
        item.appendChild(remove);
        pane.appendChild(item);
    });
}
function init(){if(ensure())switchTab();}
document.addEventListener('DOMContentLoaded',init);
window.addEventListener('load',init);
window.addEventListener('ot-status-modal-created',init);
window.addEventListener('ot-pinned-memory-updated',render);
window.addEventListener('ot-chat-context-changed',render);
if(document.readyState!=='loading')init();
})();
