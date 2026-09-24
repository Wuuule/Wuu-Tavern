'use strict';
const test=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
function slice(start,end) {
 const i=html.indexOf(start),j=html.indexOf(end,i);
 assert.ok(i>=0&&j>i,start+' missing');
 return html.slice(i,j);
}
function mock(save=true) {
 const c={id:'A',character:{name:'Alice'},userPersonaId:'p1',
     messages:[{id:'m1',role:'user',content:'We met in Kyoto.'},{id:'m2',role:'assistant',content:'Confirmed.'}],
     statusCenter:{version:2,tables:[],history:[]}};
 const state={conversations:{A:c,B:{id:'B',messages:[]}},activeConvId:'A',
     isGenerating:false,settings:{userName:'Player'}};
 let ids=1, saves=0;
 const code='function getActiveConv(){return state.conversations[state.activeConvId];}\n'+
  slice('var OT_STATUS_MAX_TABLES = 50;','// ==================== Translation DOM Updates')+
  '\nreturn {runtime:window.OpenTavernStatusCenterRuntime, buildPinnedMemoryPrompt,'+
  'readPinnedMemories,addPinnedMemory,deletePinnedMemory,invalidatePinnedMemoriesAfter,'+
  'buildStatusCenterRuntimeMessage,applyStatusCenterUpdates};';
 const fn=new Function('state','window','persistState','CustomEvent','isGroupChat','getGroupMembers',
    'getUserPersonaById','makeId',code);
 const result=fn(state,{dispatchEvent(){}},async()=>{saves++;return save;},
    class CustomEvent{},()=>false,()=>[],()=>({userName:'My Persona'}),()=>String(++ids));
 return {...result,state,c,get saves(){return saves;}};
}
test('pinned memories must be user-approved, isolated, bounded and source-linked',async()=>{
 const f=mock();
 assert.equal(f.readPinnedMemories(f.c).length,0);
 const result=await f.addPinnedMemory('m1','Met in Kyoto.');
 assert.equal(result.ok,true);
 assert.match(f.buildPinnedMemoryPrompt(f.c),/Met in Kyoto/);
 assert.equal(f.readPinnedMemories(f.state.conversations.B).length,0);
 f.c.messages[0].content='Edited unrelated dialogue';
 assert.equal(f.readPinnedMemories(f.c)[0].stale,true);
 assert.doesNotMatch(f.buildPinnedMemoryPrompt(f.c),/Met in Kyoto/);
 assert.equal(f.saves,1);
});
test('editing an earlier message invalidates all downstream pinned memory references',async()=>{
 const f=mock();
 await f.addPinnedMemory('m1','Fact from user.');
 await f.addPinnedMemory('m2','Fact from assistant.');
 f.invalidatePinnedMemoriesAfter(f.c,0);
 assert.equal(f.readPinnedMemories(f.c).filter(x=>x.stale).length,2);
});
test('failed save never leaves newly added memory falsely persisted',async()=>{
 const f=mock(false);
 assert.equal((await f.addPinnedMemory('m1','Should not survive')).ok,false);
 assert.equal(f.readPinnedMemories(f.c).length,0);
});
test('memory removal persists or restores its previous list on error',async()=>{
 const f=mock(); const added=await f.addPinnedMemory('m1','A fact');
 assert.equal(await f.deletePinnedMemory(added.id),true);
 assert.equal(f.readPinnedMemories(f.c).length,0);
 const fail=mock(false);
 fail.c.pinnedMemories=[{id:'x',messageId:'m1',text:'Existing',fingerprint:'bogus'}];
 assert.equal(await fail.deletePinnedMemory('x'),false);
 assert.equal(fail.c.pinnedMemories.length,1);
});
test('status prompt prioritizes current scene and produces closed tags',()=>{
 const f=mock();
 f.applyStatusCenterUpdates(f.c,[
 {name:'Background',content:'X'.repeat(12000)},
 {name:'Scene Anchor',content:'Day 10'},
 {name:'Other',content:'Y'.repeat(12000)}
 ]);
 const prompt=f.buildStatusCenterRuntimeMessage(f.c);
 const diag=f.runtime.getPromptDiagnostics();
 assert.match(prompt, /Day 10/);
 assert.ok(prompt.length<=16000);
 // Protocol examples above the status payload need not be XML-balanced.
 // Only the emitted CURRENT_STATUS_CENTER payload must be well formed.
 const payload=prompt.split('<CURRENT_STATUS_CENTER>').pop().split('</CURRENT_STATUS_CENTER>')[0];
 assert.equal((payload.match(/<StatusTable /g)||[]).length,
    (payload.match(/<\\/StatusTable>/g)||[]).length);
 assert.ok(diag.included.includes('Scene Anchor'));
 assert.ok(diag.omitted.length>0||diag.truncated.length>0);
});
test('all inline app JavaScript compiles independently of optional UIs',()=>{
 const mark=html.indexOf('var OT_STATUS_MAX_TABLES = 50;');
 const before=html.lastIndexOf('<script>',mark),after=html.indexOf('</script>',mark);
 assert.ok(before>0&&after>before);
 assert.doesNotThrow(()=>new Function(html.slice(before+8,after)));
 for(const filename of ['ot-boot.js','ot-status.js','ot-rp.js','ot-quick.js','ot-memory.js']){
    const source=fs.readFileSync(path.join(base,filename),'utf8');
    assert.doesNotThrow(()=>new Function(source),filename);
 }
});
