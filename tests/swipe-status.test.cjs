'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function sourceBetween(start,end){
    const i=html.indexOf(start),j=html.indexOf(end,i);
    assert.ok(i>=0&&j>i,'source fragment not found: '+start);
    return html.slice(i,j);
}
const swapSource=sourceBetween('async function switchResponseVersion(actualIdx, versionIdx)',
    'async function requestDeleteMessage(actualIdx)');
const argNames=['state','getActiveConv','syncActiveResponseVersion','ensureResponseVersions',
    'showGlassConfirm','invalidatePinnedMemoriesAfter','invalidateStorySnapshotsAfter',
    'restoreResponseUserVersion','removeLinkedSecondStageMessages','cloneJsonData',
    'ensureMessageIdentity','createLinkedResponseMessageSnapshot','notifyStatusCenterUpdated',
    'captureStorySnapshot','invalidateConversationAfterUserEdit','rebuildMvuSnapshots',
    'persistState','renderMessagesOnly','renderConversationListOnly','openReplyHistory'];
const swapFactory=new Function(...argNames,swapSource+'\nreturn switchResponseVersion;');
function fixture({legacy=false,later=false,save=true}={}){
    const history=[
        {id:'r1',message:{role:'assistant',content:'first'},linkedMessages:[],
         ...(legacy?{}:{statusCenter:{tables:[{name:'Scene Anchor',content:'Day 1'}]}})},
        {id:'r2',message:{role:'assistant',content:'second'},linkedMessages:[],
         statusCenter:{tables:[{name:'Scene Anchor',content:'Day 2'}]}}
    ];
    const msg={id:'reply',role:'assistant',content:'second',activeResponseVersion:1,responseVersions:history};
    const conv={id:'A',messages:[msg],statusCenter:{tables:[{name:'Scene Anchor',content:'Day 2'}]},mvu:null};
    if(later)conv.messages.push({id:'later',role:'user',content:'later story'});
    const state={activeConvId:'A',isGenerating:false},warnings=[],called=[];
    const values=[state,()=>conv,()=>{},()=>msg.responseVersions,
      async reason=>{warnings.push(reason);return false;},
      ()=>called.push('pins'),()=>called.push('story'),
      ()=>null,()=>{},x=>JSON.parse(JSON.stringify(x)),()=>{},()=>{},
      ()=>called.push('notified'),()=>called.push('checkpoint'),()=>{},()=>{},
      async()=>save,()=>{},()=>{},()=>{}];
    return {swap:swapFactory(...values),conv,msg,warnings,called};
}
test('selecting a fresh swipe restores the matching character/world state snapshot',async()=>{
    const f=fixture();
    await f.swap(0,0);
    assert.equal(f.msg.content,'first');
    assert.equal(f.conv.statusCenter.tables[0].content,'Day 1');
    assert.ok(f.called.includes('notified'));
    assert.ok(f.called.includes('checkpoint'));
});
test('older swipes with no authentic snapshot require explicit warning',async()=>{
    const f=fixture({legacy:true});
    await f.swap(0,0);
    assert.equal(f.msg.content,'second');
    assert.equal(f.conv.statusCenter.tables[0].content,'Day 2');
    assert.equal(f.warnings.length,1);
});
test('historical swipes with subsequent user turns refuse unsafe in-place switch',async()=>{
    const f=fixture({later:true});
    await f.swap(0,0);
    assert.equal(f.msg.content,'second');
    assert.equal(f.conv.messages.length,2);
    assert.equal(f.warnings.length,1);
    assert.deepEqual(f.called,[]);
});
test('version normalizer preserves real status snapshots without inventing legacy ones',()=>{
    const func=sourceBetween('function normalizeResponseVersionRecord(record, conv, msg)',
        'function ensureResponseVersions(conv, msg)');
    const normalize=new Function('cloneJsonData','createResponseMessageSnapshot','createLinkedResponseMessageSnapshot','makeId',
        func+'\nreturn normalizeResponseVersionRecord;')(
        x=>JSON.parse(JSON.stringify(x)),x=>({...x}),x=>({...x}),()=>String(Math.random()));
    const v1=normalize({id:'old',message:{role:'assistant',content:'old'}},null,{role:'assistant'});
    assert.equal(Object.hasOwn(v1,'statusCenter'),false);
    const v2=normalize({id:'new',message:{role:'assistant',content:'new'},
        statusCenter:{tables:[{name:'Scene Anchor',content:'Day 1'}]}},null,{role:'assistant'});
    assert.equal(v2.statusCenter.tables[0].content,'Day 1');
});
test('fresh replies explicitly capture current state after applying status updates',()=>{
    const func=sourceBetween('function finishAssistantMessage(conv, fullContent, speakerForMsg',
        '/** Save whatever was streamed so far');
    assert.match(func,/responseVersions\[pushObj\.activeResponseVersion\]\.statusCenter\s*=/);
});
