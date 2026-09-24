/** Per-conversation quick replies in the existing composer + menu. */
(function(){
'use strict';
var modal=null, selection=null, savedConversation='';
var css=[
'#wuuQuickModal[hidden]{display:none!important}',
'#wuuQuickModal{position:fixed;inset:0;z-index:2147482980;background:rgba(0,0,0,.63);',
'display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;}',
'#wuuQuickBody{width:min(560px,100%);max-height:85dvh;overflow:auto;background:var(--bg-primary,#24232b);',
'color:var(--text-primary,#f3f3f3);border:1px solid rgba(127,127,127,.24);border-radius:18px;',
'padding:18px;box-shadow:0 12px 50px rgba(0,0,0,.3);}',
'#wuuQuickBody input,#wuuQuickBody textarea{display:block;width:100%;box-sizing:border-box;',
'background:rgba(127,127,127,.09);color:inherit;border:1px solid rgba(127,127,127,.25);',
'border-radius:10px;padding:10px;font-size:13px;margin-top:5px;}',
'#wuuQuickBody label{font-size:12px;display:block;margin:10px 0;}',
'#wuuQuickBody textarea{min-height:94px;resize:vertical;line-height:1.5;}',
'#wuuQuickBody button{color:inherit;background:rgba(127,127,127,.14);border:1px solid rgba(127,127,127,.24);',
'border-radius:8px;padding:6px 11px;cursor:pointer;font-size:12px;}',
'#wuuQuickBody .wuuQuickRow{display:flex;gap:7px;flex-wrap:wrap;margin:7px 0;align-items:center;}',
'#wuuQuickEntries{max-height:180px;overflow:auto;margin:10px 0;padding:5px 0;border-top:1px solid rgba(127,127,127,.2);',
'border-bottom:1px solid rgba(127,127,127,.2);}',
'#wuuQuickEntries .wuuQuickTitle{flex:1;min-width:130px;overflow:hidden;text-overflow:ellipsis;text-align:left;}'
].join('');

function el(tag,txt){var e=document.createElement(tag);if(txt!=null)e.textContent=txt;return e;}
function runtime(){return window.WuuQuickReplyRuntime;}
function confirmMsg(message){window.alert(message);}
function ensure(){
 if(modal)return modal;
 var style=el('style');style.id='wuuQuickCss';style.textContent=css;document.head.appendChild(style);
 modal=el('div');modal.id='wuuQuickModal';modal.hidden=true;modal.setAttribute('role','dialog');
 modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','快捷语管理');
 var card=el('div');card.id='wuuQuickBody';
 var h=el('div');h.className='wuuQuickRow';h.style.justifyContent='space-between';
 var title=el('strong','快捷语');title.style.fontSize='15px';h.appendChild(title);
 var close=el('button','关闭');close.type='button';close.onclick=function(){modal.hidden=true;};
 h.appendChild(close);card.appendChild(h);
 var note=el('p','仅保存到当前对话；点击快捷语会填入输入框，不会自动发送或执行代码。');
 note.style.cssText='opacity:.67;font-size:12px;line-height:1.6;';
 card.appendChild(note);
 var entries=el('div');entries.id='wuuQuickEntries';card.appendChild(entries);
 var label=el('label','标题（最多32字）');
 var labelInput=el('input');labelInput.id='wuuQuickTitle';labelInput.maxLength=32;
 label.appendChild(labelInput);card.appendChild(label);
 var textLabel=el('label','输入内容（最多2400字）');
 var textarea=el('textarea');textarea.id='wuuQuickText';textarea.maxLength=2400;
 textLabel.appendChild(textarea);card.appendChild(textLabel);
 var tools=el('div');tools.className='wuuQuickRow';
 var save=el('button','保存快捷语');
 save.type='button';save.onclick=saveCurrent;
 var clear=el('button','新建');
 clear.type='button';clear.onclick=function(){selection=null;labelInput.value='';textarea.value='';labelInput.focus();};
 tools.appendChild(save);tools.appendChild(clear);card.appendChild(tools);
 modal.appendChild(card);
 modal.addEventListener('click',function(e){if(e.target===modal)modal.hidden=true;});
 document.body.appendChild(modal);
 return modal;
}
function render(){
 var rt=runtime(),list=rt&&rt.list?rt.list():[];
 var host=document.getElementById('wuuQuickEntries');if(!host)return;
 host.replaceChildren();
 if(!list.length){var empty=el('div','还没有快捷语。填写下方内容创建第一条。');
  empty.style.cssText='opacity:.65;font-size:12px;padding:14px 0;';host.appendChild(empty);return;}
 list.forEach(function(item){
  var row=el('div');row.className='wuuQuickRow';
  var use=el('button',item.title);use.type='button';use.className='wuuQuickTitle';use.title=item.text;
  use.onclick=function(){if(rt.insert(savedConversation,item.id)){modal.hidden=true;}else confirmMsg('无法插入，请确认当前对话并停止生成。');};
  row.appendChild(use);
  var edit=el('button','编辑');edit.type='button';
  edit.onclick=function(){selection=item.id;document.getElementById('wuuQuickTitle').value=item.title;
    document.getElementById('wuuQuickText').value=item.text;document.getElementById('wuuQuickText').focus();};
  row.appendChild(edit);
  var del=el('button','删除');del.type='button';
  del.onclick=async function(){if(!window.confirm('删除「'+item.title+'」？'))return;
    var res=await rt.remove(savedConversation,item.id);
    if(!res.ok)confirmMsg(res.error||'删除失败');
    else{if(selection===item.id)selection=null;render();}};
  row.appendChild(del);host.appendChild(row);
 });
}
async function saveCurrent(){
 var rt=runtime();if(!rt||!rt.upsert)return;
 var title=document.getElementById('wuuQuickTitle').value;
 var contents=document.getElementById('wuuQuickText').value;
 var res=await rt.upsert(savedConversation,{id:selection,title:title,text:contents});
 if(!res.ok){confirmMsg(res.error||'保存失败');return;}
 selection=res.id;render();
}
function show(){
 var rt=runtime();if(!rt||!rt.conversationId||!rt.conversationId()){confirmMsg('请先进入聊天');return;}
 savedConversation=rt.conversationId();selection=null;ensure();render();
 document.getElementById('wuuQuickTitle').value='';document.getElementById('wuuQuickText').value='';
 modal.hidden=false;
}
function boot(){
 var menu=document.getElementById('composerPlusMenu');if(!menu||document.getElementById('wuuQuickMenuButton'))return;
 var b=el('button','快捷语');b.id='wuuQuickMenuButton';b.type='button';
 b.setAttribute('role','menuitem');b.className='composer-plus-menu-item';
 b.onclick=function(e){e.preventDefault();e.stopPropagation();menu.hidden=true;
  var plus=document.getElementById('composerPlusBtn');if(plus)plus.setAttribute('aria-expanded','false');show();};
 menu.appendChild(b);
}
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&modal&&!modal.hidden)modal.hidden=true;});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.addEventListener('load',boot);
})();
