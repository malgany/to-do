const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const C=require('../shopping-core'),M=require('../household-model'),R=require('../shopping-remote');

function copyHarness(records={}){
  const storage=new Map(),window={ShoppingCore:C,HouseholdModel:M,ShoppingRemote:R,addEventListener(){}};
  const context={window,crypto:require('node:crypto').webcrypto,document:{activeElement:null},navigator:{onLine:false},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout,clearTimeout};
  vm.runInNewContext(fs.readFileSync(require.resolve('../shopping-store'),'utf8'),context);
  vm.runInNewContext(fs.readFileSync(require.resolve('../shopping-ui'),'utf8'),context);
  const store=new window.ShoppingStore();store.switchScope('user','home');
  store.cloud={async call(name,args){const id=args.list.id;records[id]=R.mutate(records[id]||null,name,args)||records[id];return R.result(records[id],name,args);}};
  store.receive(R.fromHouse({records},'home'));
  const local={id:'local',title:'Compras antigas',kind:'mercado',createdAt:10,closedAt:20,tasks:[{id:'rice',text:'Arroz',done:true,photos:[]}]};
  let lists=[local,...Object.values(store.data.lists).filter(l=>!l.deletedAt)];
  const ui=Object.assign(Object.create(window.ShoppingUI.prototype),{store,products:C.catalog(require('../shopping-catalog')),homeScope:'local',b:{clientId:'user',lists:()=>lists,receiveHousehold(incoming){lists=[local,...incoming];},save(){store.cacheLists(lists);},openList(){},toast(){},refresh(){}},renderHome(){},setHomeScope(){}});
  return {ui,store,local,records,context,reload(){const next=new window.ShoppingStore();next.switchScope('user','home');return next;},async sync(){context.navigator.onLine=true;await store.flush();lists=[local,...Object.values(store.data.lists).filter(l=>!l.deletedAt)];}};
}

test('copying an old closed local purchase survives server validation and reload',async()=>{
  const h=copyHarness();await h.ui.copyToHousehold(h.local);await h.sync();
  assert.equal(h.store.pendingCount(),0,h.store.error);
  const copies=Object.values(h.reload().data.lists).filter(l=>!l.deletedAt);
  assert.equal(copies.length,1);assert.equal(copies[0].closedAt,undefined);
  assert.equal(copies[0].tasks[0].shopping.categoryId,'basicos');
  assert.equal(h.local.closedAt,20);assert.equal(h.local.tasks[0].shopping,undefined);
});

test('copying again after deleting a previous household copy does not reuse its tombstone',async()=>{
  const previous={id:'import_local',purchaseId:'import_local',householdId:'home',sourceRef:'local',title:'Old',kind:'mercado',tasks:[],deletedAt:100,deletedBy:'user'};
  const record=R.mutate(null,'syncHouseholdList',{householdId:'home',list:previous});
  const h=copyHarness({import_local:record});h.local.closedAt=undefined;h.local.tasks=[];
  await h.ui.copyToHousehold(h.local);await h.sync();
  const copies=Object.values(h.reload().data.lists).filter(l=>!l.deletedAt);
  assert.equal(copies.length,1);assert.notEqual(copies[0].id,'import_local');
  assert.equal(h.records.import_local.deletedAt,100);
});

test('repeat copy before and after sync opens the existing copy without duplicating it',async()=>{
  const h=copyHarness();h.local.tasks=[];delete h.local.closedAt;
  await h.ui.copyToHousehold(h.local);await h.ui.copyToHousehold(h.local);
  assert.equal(Object.keys(h.store.data.pendingLists).length,1);
  await h.sync();await h.ui.copyToHousehold(h.local);
  assert.equal(Object.keys(h.store.data.lists).length,1);assert.equal(h.store.pendingCount(),0);
});

test('a pending legacy copy can be repaired and synced without creating another copy',async()=>{
  const h=copyHarness();
  h.store.queueList({...h.local,id:'import_local',purchaseId:'import_local',householdId:'home',sourceRef:'local',closedAt:undefined});
  await h.ui.copyToHousehold(h.local);await h.sync();
  assert.equal(h.store.pendingCount(),0,h.store.error);
  assert.equal(Object.keys(h.records).length,1);
});

test('account change purges the previous household even while editing or dragging',()=>{
  const calls=[],timers=[];
  const window={ShoppingCore:{},HouseholdModel:{}};
  const document={activeElement:{id:'taskDetailText',blur(){calls.push('blur');}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../shopping-ui'),'utf8'),{window,document,setTimeout:fn=>timers.push(fn),clearTimeout:()=>{}});
  const ui=Object.create(window.ShoppingUI.prototype);
  Object.assign(ui,{store:{uid:'bob',householdId:'b',data:{lists:{b:{id:'b',householdId:'b'}}}},lastScope:'alice:a',dragging:true,quickExtras:{},dialog:{close(){calls.push('close');}},b:{clearDraft(){calls.push('draft');},receiveHousehold(lists,id,changed){calls.push({id,changed,ids:Array.from(lists,l=>l.id)});},refresh(){calls.push('refresh');}},renderHome(){calls.push('home');}});
  ui.changed();
  assert.ok(calls.some(c=>c.id==='b'&&c.changed&&c.ids.join()==='b'));
  assert.equal(timers.length,0);assert.equal(ui.dragging,false);
  assert.ok(calls.indexOf('blur')>calls.findIndex(c=>c.id==='b'));
  calls.length=0;ui.changed();
  assert.equal(timers.length,1);assert.equal(calls.length,0);
});
