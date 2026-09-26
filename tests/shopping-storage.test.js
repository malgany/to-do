const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {IDBFactory}=require('fake-indexeddb');
const source=fs.readFileSync(require.resolve('../shopping-storage'),'utf8');
const key='todo_shopping_v1_user_home';
function boot(indexedDB,legacy=new Map()){
  const localStorage={get length(){return legacy.size;},key:i=>[...legacy.keys()][i],getItem:k=>legacy.get(k)||null,
    setItem(){throw new Error('QuotaExceededError');},removeItem:k=>legacy.delete(k)};
  const window={indexedDB};
  vm.runInNewContext(source,{window,localStorage,console:{warn(){}}});
  return {storage:window.ShoppingStorage,window,localStorage};
}
test('full localStorage migrates purchases, photos and pending edits only after IndexedDB commit',async()=>{
  const idb=new IDBFactory(),photo='data:image/jpeg;base64,'+'a'.repeat(100000);
  const data=JSON.stringify({lists:{one:{photos:[photo]}},pendingLists:{one:{photos:[photo]}},purchases:{old:{title:'Original'}}});
  const legacy=new Map([[key,data],['todo_lists','original local lists'],['todo_shopping_link_v1_user','home']]);
  const {storage}=boot(idb,legacy);await storage.ready;
  assert.equal(storage.getItem(key),data);assert.equal(legacy.has(key),false);
  assert.equal(legacy.get('todo_lists'),'original local lists');assert.equal(legacy.get('todo_shopping_link_v1_user'),'home');
  storage.setItem(key,data+' ');await storage.whenSaved();
  const reload=boot(idb,legacy);await reload.storage.ready;assert.equal(reload.storage.getItem(key),data+' ');
});
test('failed database open preserves the legacy data',async()=>{
  const data='{"purchases":{"old":{}}}',legacy=new Map([[key,data]]);
  const idb={open(){const request={};queueMicrotask(()=>{request.error=new Error('Unavailable');request.onerror();});return request;}};
  const {storage}=boot(idb,legacy);await storage.ready;
  assert.equal(storage.getItem(key),data);assert.equal(legacy.get(key),data);
  assert.throws(()=>storage.setItem(key,'{}'),/Quota/);
});
test('aborted migration leaves originals intact',async()=>{
  const idb=new IDBFactory(),open=idb.open.bind(idb),legacy=new Map([[key,'{}']]);
  idb.open=(...args)=>{const req=open(...args);req.addEventListener('success',()=>{
    const db=req.result,transaction=db.transaction.bind(db);
    db.transaction=(stores,mode)=>{const tx=transaction(stores,mode);if(mode==='readwrite')queueMicrotask(()=>tx.abort());return tx;};
  });return req;};
  const {storage}=boot(idb,legacy);await storage.ready;
  assert.equal(legacy.get(key),'{}');assert.equal(storage.getItem(key),'{}');
});
test('ordered writes preserve the latest snapshot across reload',async()=>{
  const idb=new IDBFactory(),{storage}=boot(idb);await storage.ready;
  storage.setItem(key,'{"revision":1}');storage.setItem(key,'{"revision":2}');await storage.whenSaved();
  const reloaded=boot(idb);await reloaded.storage.ready;assert.equal(reloaded.storage.getItem(key),'{"revision":2}');
});
test('failed IndexedDB write rejects durability and retains the previous disk snapshot',async()=>{
  const idb=new IDBFactory(),open=idb.open.bind(idb);let abort=false;
  idb.open=(...args)=>{const req=open(...args);req.addEventListener('success',()=>{
    const db=req.result,transaction=db.transaction.bind(db);
    db.transaction=(stores,mode)=>{const tx=transaction(stores,mode);if(abort&&mode==='readwrite')queueMicrotask(()=>tx.abort());return tx;};
  });return req;};
  const {storage}=boot(idb);await storage.ready;
  storage.setItem(key,'{"saved":true}');await storage.whenSaved();
  abort=true;storage.setItem(key,'{"saved":false}');await assert.rejects(storage.whenSaved());
  abort=false;const reload=boot(idb);await reload.storage.ready;
  assert.equal(reload.storage.getItem(key),'{"saved":true}');
  storage.setItem(key,'{"retry":true}');await storage.whenSaved();
});
test('store queues a photo copy with full localStorage and restores it after reload',async()=>{
  const idb=new IDBFactory(),legacy=new Map(),h=boot(idb,legacy);await h.storage.ready;
  h.window.addEventListener=()=>{};h.window.HouseholdModel=require('../household-model');
  vm.runInNewContext(fs.readFileSync(require.resolve('../shopping-store'),'utf8'),{window:h.window,localStorage:h.localStorage,navigator:{onLine:false},setTimeout,clearTimeout});
  const store=new h.window.ShoppingStore();store.switchScope('user','home');
  store.queueList({id:'copy',householdId:'home',tasks:[{id:'item',photos:[{id:'p',dataUrl:'data:image/jpeg;base64,'+'a'.repeat(100000)}]}]});
  await store.whenSaved();
  const reload=boot(idb,legacy);await reload.storage.ready;
  const saved=JSON.parse(reload.storage.getItem(key));
  assert.equal(saved.pendingLists.copy.tasks[0].photos[0].dataUrl.length,100023);
});
