'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function block(a,b){const i=html.indexOf(a),j=html.indexOf(b,i);assert.ok(i>=0&&j>i,a);return html.slice(i,j);}
function statusFixture(group) {
 const A={id:'A',group:group?{members:[{character:{name:'Alice'},order:0},{character:{name:'Bob'},order:1}]}:null,character:group?null:{name:'Alice'},userPersonaId:'persona1'};
 const B={id:'B',character:{name:'Claire'}},state={activeConvId:'A',conversations:{A,B},settings:{userName:'Player'},isGenerating:false};
 const src='function getActiveConv(){return state.conversations[state.activeConvId];}\n'+
   block('var OT_STATUS_MAX_TABLES = 50;','// ==================== Translation DOM Updates')+
   '\nreturn {parseStatusTablesFromBlock,applyStatusCenterUpdates,getStatusPanels,buildStatusCenterRuntimeMessage};';
 const obj=new Function('state','window','persistState','CustomEvent','isGroupChat','getGroupMembers','getUserPersonaById',src)(
   state,{dispatchEvent(){}},async()=>true,class CustomEvent{},c=>!!(c.group&&c.group.members.length>1),
   c=>c.group.members,()=>({userName:'My Persona'}));
 return {...obj,A,B,state};
}
test('user and individual group character scopes are isolated',()=>{
 const f=statusFixture(true);
 const updates=f.parseStatusTablesFromBlock(
  '<StatusTable name="角色状态" scope="character" character="Alice">Trust: high</StatusTable>'+
  '<StatusTable name="角色状态" scope="character" character="Bob">Trust: low</StatusTable>'+
  '<StatusTable name="玩家状态" scope="user">Location: garden</StatusTable>');
 assert.equal(updates.length,3); f.applyStatusCenterUpdates(f.A,updates);
 const p=f.getStatusPanels(f.A);
 assert.equal(p.user.content,'Location: garden');assert.equal(p.user.name,'My Persona');
 assert.deepEqual(p.characters.map(x=>x.content),['Trust: high','Trust: low']);
 assert.equal(f.getStatusPanels(f.B).user.content,'');
 const prompt=f.buildStatusCenterRuntimeMessage(f.A);
 assert.match(prompt,/scope="character" character="Alice"/);assert.match(prompt,/scope="user"/);
});
test('legacy mixed state table exposes only matching character lines',()=>{
 const f=statusFixture(true);
 f.applyStatusCenterUpdates(f.A,[{name:'状态表',content:'Alice | calm\nBob | alert\nUnknown | away'}]);
 const p=f.getStatusPanels(f.A);
 assert.equal(p.characters[0].content,'Alice | calm');
 assert.equal(p.characters[1].content,'Bob | alert');
 assert.equal(p.user.content,'');
});
test('image embedding only allows HTTPS or known image data',()=>{
 const func=block('function renderChatImageAction(idx) {','async function insertChatImageAtMessage(idx)');
 const safe=new Function(func+'\nreturn isSafeChatImageSource;')();
 assert.equal(safe('https://cdn.example.org/image.png'),true);
 assert.equal(safe('data:image/png;base64,YWJj'),true);
 for(const uri of ['http://x.org/a.png','javascript:alert(1)','data:image/svg+xml;base64,YWJj','file:///a'])
  assert.equal(safe(uri),false,uri);
 assert.ok(html.includes("source:'chat_embed'"));
 assert.ok(html.includes("att.source === 'user'"));
 assert.ok(html.includes('<script src="./ot-rp.js"></script>'));
});
function branchFixture(save=true) {
 const A={id:'A',title:'Original',character:{name:'Alice'},messages:[{id:'m1',role:'assistant',content:'first'}],
 summaries:['old'],authorsNote:{text:'Before'},worldBookIds:['book1'],
 statusCenter:{version:2,tables:[{name:'Scene Anchor',content:'Day 1'}],history:[]}};
 const state={activeConvId:'A',conversations:{A},conversationOrder:['A'],isGenerating:false};
 let loaded='';
 const methods=new Function('state','getActiveConv','cloneJsonData','showGlassPrompt','showGlassConfirm','persistState',
 'makeId','normalizeConversation','loadConversation',block('var STORY_SNAPSHOT_LIMIT=40','function archiveCurrentConversation()')+
 '\nreturn {captureStorySnapshot,createStoryBranch};')(
 state,()=>state.conversations[state.activeConvId],x=>JSON.parse(JSON.stringify(x)),
 async()=> 'Branch copy',async()=>true,async()=>save,()=> 'new-id',()=>{},
 async id=>{loaded=id;state.activeConvId=id;});
 return {...methods,A,state,get loaded(){return loaded;}};
}
test('branch from old checkpoint copies old status and leaves original untouched',async()=>{
 const f=branchFixture();
 assert.ok(f.captureStorySnapshot(f.A,f.A.messages[0]));
 f.A.messages.push({id:'m2',role:'assistant',content:'later'});
 f.A.statusCenter.tables[0].content='Day 2';f.A.summaries=['later'];f.A.authorsNote={text:'After'};
 assert.ok(f.captureStorySnapshot(f.A,f.A.messages[1]));
 await f.createStoryBranch(0);
 assert.equal(f.loaded,'new-id');
 const b=f.state.conversations['new-id'];
 assert.equal(b.messages.length,1);assert.equal(b.statusCenter.tables[0].content,'Day 1');
 assert.deepEqual(b.summaries,['old']);assert.equal(b.authorsNote.text,'Before');
 assert.equal(b.branchMeta.parentMessageId,'m1');
 assert.equal(f.A.messages.length,2);assert.equal(f.A.statusCenter.tables[0].content,'Day 2');
});
test('branch save failure does not switch or delete original',async()=>{
 const f=branchFixture(false);f.captureStorySnapshot(f.A,f.A.messages[0]);
 await f.createStoryBranch(0);
 assert.deepEqual(f.state.conversationOrder,['A']);assert.equal(f.state.activeConvId,'A');
 assert.deepEqual(Object.keys(f.state.conversations),['A']);
});
test('oversized snapshots refuse to fabricate old states',()=>{
 const f=branchFixture();f.A.summaries=['x'.repeat(120000)];
 assert.equal(f.captureStorySnapshot(f.A,f.A.messages[0]),false);
 assert.equal(f.A.storySnapshots&&f.A.storySnapshots.m1,undefined);
});

function branchNavFixture(save=true){
 const A={id:'A',title:'Root',messages:[]};
 const B={id:'B',title:'Fork B',messages:[],branchMeta:{parentId:'A',parentMessageId:'m1',createdAt:2}};
 const C={id:'C',title:'Fork C',messages:[],branchMeta:{parentId:'A',parentMessageId:'m1',createdAt:3}};
 const state={activeConvId:'B',conversations:{A,B,C},conversationOrder:['C','B','A'],isGenerating:false};
 let loaded='',saves=0;
 const src=block('function listStoryBranchChildren(parentId){','window.WuuChatImageRuntime = {');
 const runtime=new Function('state','window','getActiveConv','persistState','loadConversation',
   src+'\nreturn window.WuuBranchRuntime;')(
   state,{},()=>state.conversations[state.activeConvId],async()=>{saves++;return save;},
   async id=>{loaded=id;state.activeConvId=id;});
 return {runtime,state,A,B,C,get loaded(){return loaded;},get saves(){return saves;}};
}
test('branch undo-redo navigation never deletes either timeline',async()=>{
 const f=branchNavFixture();
 const childInfo=f.runtime.info();
 assert.equal(childInfo.parent.id,'A');
 assert.equal((await f.runtime.back()).ok,true);
 assert.equal(f.loaded,'A');
 assert.equal(f.A.branchNavigation.lastChildId,'B');
 assert.deepEqual(Object.keys(f.state.conversations).sort(),['A','B','C']);
 const rootInfo=f.runtime.info();
 assert.equal(rootInfo.forward.id,'B','recently visited child wins over newer sibling');
 assert.equal((await f.runtime.forward()).ok,true);
 assert.equal(f.loaded,'B');
 assert.deepEqual(Object.keys(f.state.conversations).sort(),['A','B','C']);
});
test('branch navigation refuses to switch when its navigation record cannot persist',async()=>{
 const f=branchNavFixture(false);
 const result=await f.runtime.back();
 assert.equal(result.ok,false);
 assert.equal(f.state.activeConvId,'B');
 assert.equal(f.loaded,'');
 assert.deepEqual(Object.keys(f.state.conversations).sort(),['A','B','C']);
});
test('branch navigation helper is included in future Pages assembly',()=>{
 const pages=fs.readFileSync(path.join(__dirname,'..','.github','workflows','pages.yml'),'utf8');
 assert.match(pages,/ot-branch\.js/);
 const helper=fs.readFileSync(path.join(__dirname,'..','ot-branch.js'),'utf8');
 assert.doesNotThrow(()=>new Function(helper));
 assert.match(helper,/WuuBranchRuntime/);
});
