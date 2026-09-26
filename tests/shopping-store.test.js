const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const HouseholdModel=require('../household-model');
const ShoppingCore=require('../shopping-core');
const source=fs.readFileSync(path.join(__dirname,'../shopping-store.js'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));

function harness(storage=new Map()){
  const profiles=[],houses=[],timers=[],listeners=new Map(),calls=[];
  let auth;
  const cloud={
    onAuth(fn){auth=fn;},
    watchProfile(uid,next,error){const subscription={uid,next,error,stopped:false};profiles.push(subscription);return ()=>{subscription.stopped=true;};},
    watchHouse(id,next,error){const subscription={id,next,error,stopped:false};houses.push(subscription);return ()=>{subscription.stopped=true;};},
    async call(name,args){calls.push({name,args:clone(args)});return clone(args.list||{});}
  };
  const window={ShoppingCloud:cloud,HouseholdModel,ShoppingCore,addEventListener:(name,fn)=>listeners.set(name,fn)};
  const context={window,navigator:{onLine:false},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
    setTimeout(fn,delay){const timer={fn,delay,cancelled:false};timers.push(timer);return timer;},
    clearTimeout(timer){timer.cancelled=true;}
  };
  vm.runInNewContext(source,context,{filename:'shopping-store.js'});
  const store=new window.ShoppingStore();
  return {store,storage,cloud,context,profiles,houses,timers,calls,listeners,
    signIn(uid='user',id='home'){auth({uid});profiles.at(-1).next({householdId:id});},
    auth(user){auth(user);}
  };
}

function list(id='list',version=1){
  return {id,householdId:'home',purchaseId:id,title:'Mercado',kind:'mercado',metaUpdatedAt:version,metaUpdatedBy:'user',tasks:[
    {id:'rice',text:'Arroz',done:false,textUpdatedAt:1,textUpdatedBy:'user',doneUpdatedAt:1,doneUpdatedBy:'user',photos:[]}
  ]};
}

function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('offline authentication restores the remembered household and unsent edits before profile data',()=>{
  const storage=new Map();
  const original=harness(storage);original.signIn();original.store.queueList(list());
  const restored=harness(storage);restored.auth({uid:'user'});
  assert.equal(restored.store.householdId,'home');
  assert.equal(restored.store.data.lists.list.tasks[0].text,'Arroz');
  assert.equal(restored.store.pendingCount(),1);
  assert.equal(restored.houses.at(-1).id,'home');
  restored.profiles.at(-1).next(null);
  assert.equal(restored.store.householdId,'home');
  assert.equal(restored.store.pendingCount(),1);
  restored.profiles.at(-1).next({householdId:'new-home'});
  assert.equal(restored.store.householdId,'new-home');
  assert.equal(restored.store.pendingCount(),0);
  assert.equal(storage.get('todo_shopping_link_v1_user'),'new-home');
});

test('local purchase history survives household snapshots, reload, and local revision while signed in',async()=>{
  const h=harness();h.signIn();
  const local={...list('local'),householdId:null};local.tasks[0].done=true;
  h.store.finish(local,'complete',1000);
  h.store.receive({purchases:{shared:{id:'shared',revision:1,items:[]}},lists:{}});
  assert(local.closedAt);
  assert.equal(h.store.history().length,2);
  assert.equal(h.store.data.purchases.local,undefined);
  const reloaded=harness(h.storage);reloaded.auth({uid:'user'});
  const purchase=reloaded.store.history().find(p=>p.id==='local');
  assert.equal(purchase.localOnly,true);
  assert.equal(purchase.items[0].outcome,'bought');
  await reloaded.store.revise(purchase,{items:[{taskId:'rice',outcome:'missing'}]});
  reloaded.store.receive({purchases:{shared:{id:'shared',revision:1}}});
  const revised=reloaded.store.history().find(p=>p.id==='local');
  assert.equal(revised.revision,2);
  assert.equal(revised.items[0].outcome,'missing');
  assert.equal(reloaded.calls.length,0,'a local revision must not call a household function');
});

test('late profile, household and error callbacks cannot leak a previous account into the current scope',()=>{
  const h=harness();h.signIn('alice','alice-home');
  const oldProfile=h.profiles.at(-1),oldHouse=h.houses.at(-1);
  h.signIn('bob','bob-home');
  oldProfile.next({householdId:'alice-new-home'});
  oldProfile.error(new Error('late profile error'));
  oldHouse.next({lists:{secret:{id:'secret'}},purchases:{secret:{id:'secret'}}});
  oldHouse.error(new Error('late household error'));
  assert.equal(h.store.uid,'bob');assert.equal(h.store.householdId,'bob-home');
  assert.equal(h.store.data.lists.secret,undefined);assert.equal(h.store.history().length,0);
  assert.equal(h.store.error,'');assert(oldProfile.stopped);assert(oldHouse.stopped);
});

test('an old in-flight response cannot alter a new account or release its active flush guard',async()=>{
  const h=harness();h.signIn();h.store.queueList(list());
  const old=deferred(),current=deferred();
  h.cloud.call=()=>old.promise;h.context.navigator.onLine=true;
  const first=h.store.flush();
  h.context.navigator.onLine=false;h.signIn('bob','home');
  h.store.queueList({...list('bob-list'),title:'Bob'});
  h.cloud.call=()=>current.promise;h.context.navigator.onLine=true;
  const second=h.store.flush();
  old.resolve(list());await first;
  assert.equal(h.store.uid,'bob');assert.equal(h.store.data.lists.list,undefined);
  assert.equal(h.store.flushing,true);
  current.resolve({...list('bob-list'),title:'Bob'});await second;
  assert.equal(h.store.pendingCount(),0);assert.equal(h.store.flushing,false);
});

test('an acknowledgement retains newer edits queued while the same list is in flight',async()=>{
  const h=harness();h.signIn();h.store.queueList(list());
  const response=deferred();h.cloud.call=()=>response.promise;h.context.navigator.onLine=true;
  const flight=h.store.flush();
  const newer=list('list',2);newer.title='Compra atualizada';newer.tasks[0].done=true;newer.tasks[0].doneUpdatedAt=2;
  h.store.queueList(newer);response.resolve(list());await flight;
  assert.equal(h.store.data.pendingLists.list.title,'Compra atualizada');
  assert.equal(h.store.data.lists.list.tasks[0].done,true);
  assert(h.timers.some(t=>!t.cancelled),'retained edits must be scheduled for another attempt');
  h.cloud.call=async(name,args)=>clone(args.list);await h.store.flush();
  assert.equal(h.store.pendingCount(),0);
  assert.equal(h.store.data.lists.list.title,'Compra atualizada');
});

test('changes enqueued by a flush notification remain pending and receive a follow-up attempt',async()=>{
  const h=harness();h.signIn();h.context.navigator.onLine=true;
  let queued=false;
  h.store.onChange=()=>{if(!queued){queued=true;h.store.queueList(list('from-ui'));}};
  await h.store.flush();
  assert.equal(h.store.pendingCount(),1);
  assert(h.timers.some(t=>!t.cancelled));
  await h.store.flush();
  assert.equal(h.store.pendingCount(),0);
  assert.equal(h.calls[0].args.list.id,'from-ui');
});

test('Realtime Database omitted and keyed arrays normalize before rendering and history use',()=>{
  const h=harness();h.signIn();h.store.receive({
    lists:{empty:{id:'empty'},keyed:{id:'keyed',tasks:{rice:{id:'rice'},oil:{id:'oil',photos:{photo:{id:'photo',dataUrl:'data:x'}}}}}},
    purchases:{empty:{id:'empty'},keyed:{id:'keyed',items:{rice:{taskId:'rice',outcome:'bought'}}}}
  });
  assert(Array.isArray(h.store.data.lists.empty.tasks));assert.equal(h.store.data.lists.empty.tasks.length,0);
  const tasks=h.store.data.lists.keyed.tasks;assert(Array.isArray(tasks));assert.equal(tasks.length,2);
  assert.equal(tasks[0].photos.length,0);assert.equal(tasks[1].photos[0].id,'photo');
  assert(Array.isArray(h.store.data.purchases.empty.items));assert.equal(h.store.data.purchases.empty.items.length,0);
  assert.equal(h.store.history().find(p=>p.id==='keyed').items[0].taskId,'rice');
});

test('transient failures retry with bounded backoff and reconnect starts a fresh attempt',async()=>{
  const h=harness();h.signIn();h.store.queueList(list());h.context.navigator.onLine=true;
  let attempts=0;
  h.cloud.call=async()=>{attempts++;const error=new Error('offline');error.code='functions/unavailable';throw error;};
  await h.store.flush();const delays=[];
  while(true){const timer=h.timers.find(t=>!t.cancelled);if(!timer)break;timer.cancelled=true;delays.push(timer.delay);timer.fn();await settle();assert(attempts<=7);}
  assert.deepEqual(delays,[1000,2000,4000,8000,16000,30000]);
  assert.equal(h.store.pendingCount(),1);
  h.cloud.call=async(name,args)=>clone(args.list);h.listeners.get('online')();await settle();
  assert.equal(h.store.pendingCount(),0);assert.equal(h.store.error,'');
});
