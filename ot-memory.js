/**
 * Memory + prompt diagnostics panel inside the existing Status Center.
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
    pane.setAttribute('aria-label','当前对话记忆与上下文');
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
    intro.textContent='最近一次本地 Prompt 组装诊断。Token 为轻量估算值，用于定位上下文膨胀；最终计费以服务商 usage 为准。';
    pane.appendChild(intro);
    var full=runtime&&runtime.getFullPromptDiagnostics&&runtime.getFullPromptDiagnostics();
    if(full){
        var roles=full.roleEstimatedTokens||{};
        debugLine(pane,'Prompt 概览',
            '来源：'+String(full.completionSource||'generic')+'\n'+
            '消息：'+String(full.messageCount||0)+'\n'+
            '估算 tokens：~'+String(full.estimatedTokens||0)+'\n'+
            'system ~'+String(roles.system||0)+' / user ~'+String(roles.user||0)+
            ' / assistant ~'+String(roles.assistant||0)+'\n'+
            '历史推理回传：'+(full.includeReasoningInHistory?'ON':'OFF'));
        var wi=Array.isArray(full.worldInfo)?full.worldInfo:[];
        debugLine(pane,'世界书激活',
            (wi.length?wi.map(function(x){return '• '+x.label+'  ~'+x.estimatedTokens+' tok'+(x.constant?' [constant]':'');}).join('\n'):'无')+
            (full.worldInfoBudgetTrimmed?'\n⚠ 世界书预算发生裁剪':''));
    }
    var diagnostics=runtime&&runtime.getPromptDiagnostics&&runtime.getPromptDiagnostics();
    if(!diagnostics&&!full){debugLine(pane,'暂无记录','打开完整 Prompt 或发起一次对话后，这里会显示诊断。');return;}
    if(diagnostics){
        debugLine(pane,'状态中心字符预算',String(diagnostics.estimatedChars||0)+' / '+String(diagnostics.limit||16000));
        debugLine(pane,'本次完整注入',(diagnostics.included||[]).join('、')||'无');
        debugLine(pane,'已部分截断',(diagnostics.truncated||[]).join('、')||'无');
        debugLine(pane,'未注入（上下文预算）',(diagnostics.omitted||[]).join('、')||'无');
    }
}
function sectionTitle(text){
    var h=document.createElement('h3');h.textContent=text;
    h.style.cssText='font-size:13px;font-weight:700;margin:16px 0 8px;';
    return h;
}
function renderMemoryItem(pane,memory,type){
    var item=document.createElement('article');
    item.style.cssText='border:1px solid rgba(127,127,127,.2);border-radius:12px;'+
        'padding:10px 12px;margin-bottom:10px;';
    var stamp=document.createElement('div');
    stamp.style.cssText='font-size:11px;opacity:.65;margin-bottom:6px;';
    var prefix=type==='auto'?'自动记忆':'手动固定';
    if(type==='auto'&&memory.importance==='high')prefix+=' · 高重要度';
    stamp.textContent=(memory.stale?'⚠ 已失效 · 不再注入':prefix+' · 有效')+
        ' · '+(memory.createdAt?new Date(memory.createdAt).toLocaleString():'');
    item.appendChild(stamp);
    var content=document.createElement('div');
    content.style.cssText='font-size:13px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;';
    content.textContent=memory.text;item.appendChild(content);
    var remove=btn('移除');remove.style.marginTop='9px';
    remove.onclick=async function(){
        if(!window.confirm('删除这条记忆？原始聊天消息不会被删除。'))return;
        remove.disabled=true;
        try{
            var runtime=rt(),ok=type==='auto'
                ? await runtime.deleteAutoMemory(memory.id)
                : await runtime.deletePinnedMemory(memory.id);
            if(ok)render();else window.alert('移除失败，请检查浏览器存储。');
        }finally{remove.disabled=false;}
    };
    item.appendChild(remove);pane.appendChild(item);
}
function renderMemory(pane,runtime){
    var intro=document.createElement('div');
    intro.style.cssText='font-size:12px;opacity:.75;line-height:1.6;margin-bottom:10px;';
    intro.textContent='手动记忆由你点击消息底部 ✦ 固定；自动记忆只保存跨多轮仍有价值的稳定事实。两者都绑定来源消息，来源被编辑/删除或剧情回滚后会自动失效。';
    pane.appendChild(intro);

    var autoRow=document.createElement('div');
    autoRow.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;'+
        'padding:9px 10px;border:1px solid rgba(127,127,127,.2);border-radius:10px;margin-bottom:10px;';
    var autoText=document.createElement('div');
    autoText.innerHTML='<strong style="font-size:12px">自动长期记忆</strong><div style="font-size:11px;opacity:.65;margin-top:2px">每轮最多 2 条，当前对话独立开关</div>';
    autoRow.appendChild(autoText);
    var autoToggle=btn(runtime&&runtime.isAutoMemoryEnabled&&runtime.isAutoMemoryEnabled()?'已开启':'已关闭');
    autoToggle.setAttribute('aria-pressed',runtime&&runtime.isAutoMemoryEnabled&&runtime.isAutoMemoryEnabled()?'true':'false');
    autoToggle.onclick=async function(){
        var now=runtime&&runtime.isAutoMemoryEnabled&&runtime.isAutoMemoryEnabled();
        autoToggle.disabled=true;
        try{
            if(await runtime.setAutoMemoryEnabled(!now))render();
            else window.alert('设置保存失败。');
        }finally{autoToggle.disabled=false;}
    };
    autoRow.appendChild(autoToggle);pane.appendChild(autoRow);

    var pinned=runtime&&runtime.listPinnedMemories?runtime.listPinnedMemories():[];
    pane.appendChild(sectionTitle('手动固定 · '+pinned.length));
    if(!pinned.length){
        var pe=document.createElement('p');pe.textContent='还没有手动固定记忆。';pe.style.opacity='.6';pane.appendChild(pe);
    }else pinned.slice().reverse().forEach(function(m){renderMemoryItem(pane,m,'pinned');});

    var automatic=runtime&&runtime.listAutoMemories?runtime.listAutoMemories():[];
    pane.appendChild(sectionTitle('自动记忆 · '+automatic.length));
    if(!automatic.length){
        var ae=document.createElement('p');ae.textContent=runtime&&runtime.isAutoMemoryEnabled&&runtime.isAutoMemoryEnabled()
            ?'尚未抽取到值得长期保留的事实。':'自动长期记忆当前关闭。';
        ae.style.opacity='.6';pane.appendChild(ae);
    }else automatic.slice().reverse().forEach(function(m){renderMemoryItem(pane,m,'auto');});
}
function render(){
    if(mode==='tables'||!ensure())return;
    var pane=document.getElementById('wuuPinnedMemoryPane'),runtime=rt();
    if(!pane)return;
    pane.replaceChildren();
    if(mode==='debug'){renderDebug(pane,runtime);return;}
    renderMemory(pane,runtime);
}
function init(){if(ensure())switchTab();}
document.addEventListener('DOMContentLoaded',init);
window.addEventListener('load',init);
window.addEventListener('ot-status-modal-created',init);
window.addEventListener('ot-pinned-memory-updated',render);
window.addEventListener('ot-auto-memory-updated',render);
window.addEventListener('ot-chat-context-changed',render);
if(document.readyState!=='loading')init();
})();
