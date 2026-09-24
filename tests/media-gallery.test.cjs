'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const start=html.indexOf('window.WuuChatImageRuntime = {');
const end=html.indexOf('// ==================== Translation DOM Updates',start);
assert.ok(start>=0&&end>start,'missing reusable chat image runtime');
function fixture(save=true) {
 const A={id:'A',messages:[
  {id:'m1',role:'user',attachments:[
   {type:'image',source:'user',dataUrl:'data:image/png;base64,YQ==',name:'uploaded'},
   {type:'image',source:'user',url:'http://unsafe.example/x.png',name:'blocked'}]},
  {id:'m2',role:'assistant',content:'hello'}]};
 const B={id:'B',messages:[{id:'m3',role:'user',attachments:[{type:'image',url:'https://example.com/b.png'}]}]};
 const state={activeConvId:'A',conversations:{A,B},isGenerating:false};
 let changes=0;
 const runtime=new Function('state','window','getActiveConv','isSafeChatImageSource','cloneJsonData','persistState','requestRender',
   html.slice(start,end)+'\nreturn window.WuuChatImageRuntime;')(
   state,{},()=>state.conversations[state.activeConvId],
   uri=>/^https:\/\//.test(uri)||/^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(uri),
   x=>JSON.parse(JSON.stringify(x)),async()=>save,()=>changes++);
 return {runtime,state,A,B,get changes(){return changes;}};
}
test('gallery lists only safe images of the current conversation',()=>{
 const f=fixture();
 const list=f.runtime.list();
 assert.equal(list.length,1);
 assert.equal(list[0].name,'uploaded');
 f.state.activeConvId='B';
 assert.equal(f.runtime.list().length,1);
 assert.equal(f.runtime.list()[0].src,'https://example.com/b.png');
});
test('reusing a user image creates display-only attachment without mutating the original',async()=>{
 const f=fixture();
 const result=await f.runtime.attach('A',1,'m1',0);
 assert.equal(result.ok,true);
 assert.equal(f.A.messages[1].attachments[0].source,'chat_embed');
 assert.equal(f.A.messages[0].attachments[0].source,'user');
 assert.equal(f.changes,1);
});
test('gallery rejects cross-chat, missing, unsafe and over-limit references',async()=>{
 const f=fixture();
 assert.equal((await f.runtime.attach('B',1,'m1',0)).ok,false);
 assert.equal((await f.runtime.attach('A',1,'m1',1)).ok,false);
 assert.equal((await f.runtime.attach('A',1,'not-here',0)).ok,false);
 f.A.messages[1].attachments=Array.from({length:12},()=>({type:'image'}));
 assert.equal((await f.runtime.attach('A',1,'m1',0)).ok,false);
});
test('failed save rolls back new reference and never changes source',async()=>{
 const f=fixture(false);
 assert.equal((await f.runtime.attach('A',1,'m1',0)).ok,false);
 assert.equal(f.A.messages[1].attachments.length,0);
 assert.equal(f.A.messages[0].attachments[0].source,'user');
});
