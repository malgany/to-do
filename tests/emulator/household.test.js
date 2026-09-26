const {test,after}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const {ref,get,set,update,runTransaction}=require('firebase/database');
const R=require('../../shopping-remote'),M=require('../../household-model');
let env;after(async()=>{await env?.cleanup();});
async function call(db,name,args){
  const id=args.list?.id||args.listId||args.purchaseId,target=ref(db,`households/${args.householdId}/records/${id}`);
  const seed=(await get(target)).val();let failure;
  const result=await runTransaction(target,record=>{failure=null;try{return R.mutate(record||seed,name,args)||undefined;}catch(e){failure=e;return;}},{applyLocally:false});
  if(failure)throw failure;return R.result(result.snapshot.val()||seed,name,args);
}
test('Spark: two provisioned accounts, private access, atomic closure and immutable history envelope',{timeout:90000},async()=>{
  env=await initializeTestEnvironment({projectId:'demo-todo',database:{host:'127.0.0.1',port:9000,rules:fs.readFileSync('database.rules.json','utf8')}});
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async context=>set(ref(context.database()),{householdAccess:{home:{alice:true,bob:true}},householdUsers:{alice:{householdId:'home'},bob:{householdId:'home'}},households:{home:{name:'Nossa casa'}}}));
  const a=env.authenticatedContext('alice').database(),b=env.authenticatedContext('bob').database(),outsider=env.authenticatedContext('outsider').database(),guest=env.unauthenticatedContext().database();
  assert.equal((await get(ref(a,'householdUsers/alice'))).val().householdId,'home');
  assert.equal((await get(ref(b,'householdAccess/home'))).val().bob,true);
  for(const db of [outsider,guest]){await assertFails(get(ref(db,'households/home')));await assertFails(get(ref(db,'householdAccess/home')));}
  await assertFails(get(ref(a,'householdUsers/bob')));
  await assertFails(set(ref(a,'householdAccess/home/outsider'),true));
  await assertFails(set(ref(a,'householdUsers/alice'),{householdId:'other'}));
  await assertFails(set(ref(a,'households/other/records/fake'),{list:'{}',revision:1}));
  const now=Date.now(),householdId='home';
  const list={id:'purchase_test',purchaseId:'purchase_test',householdId,kind:'mercado',title:'Mercado',createdAt:now,metaUpdatedAt:now,metaUpdatedBy:'a',tasks:[{id:'rice',text:'Arroz',done:false,notHave:false,photos:[],createdAt:now,textUpdatedAt:now,textUpdatedBy:'a',doneUpdatedAt:now,doneUpdatedBy:'a',notHaveUpdatedAt:now,notHaveUpdatedBy:'a',shoppingUpdatedAt:now,shoppingUpdatedBy:'a',shopping:{productKey:'arroz-branco',name:'Arroz',categoryId:'basicos'}}]};
  await call(a,'syncHouseholdList',{householdId,list});
  const left=structuredClone(list),right=structuredClone(list);left.tasks[0].done=true;left.tasks[0].doneUpdatedAt=now+1;right.tasks[0].shopping.categoryId='outros';right.tasks[0].shoppingUpdatedAt=now+2;
  await Promise.all([call(a,'syncHouseholdList',{householdId,list:left}),call(b,'syncHouseholdList',{householdId,list:right})]);
  const target=ref(a,'households/home/records/'+list.id);
  const merged=R.unpack((await get(target)).val(),list.id,householdId).list;
  assert.equal(merged.tasks[0].done,true);assert.equal(merged.tasks[0].shopping.categoryId,'outros');
  await assert.rejects(call(a,'finishHouseholdPurchase',{householdId,listId:list.id,expected:M.fingerprint(list),mode:'complete',occurredAt:now}),/mudou/);
  const finish={householdId,listId:list.id,expected:M.fingerprint(merged),mode:'complete',occurredAt:now};
  const [p1,p2]=await Promise.all([call(a,'finishHouseholdPurchase',finish),call(b,'finishHouseholdPurchase',finish)]);assert.equal(p1.id,p2.id);
  const closed=(await get(target)).val();assert.equal(closed.purchase.revision,1);
  await assertFails(set(target,{...closed,list:JSON.stringify(list),revision:closed.revision+1}));
  await assertFails(set(target,{...closed,closedAt:null,revision:closed.revision+1}));
  await assertFails(set(target,{...closed,purchase:null,revision:closed.revision+1}));
  await assertFails(set(target,null));
  await assertFails(set(target,{...closed,purchase:{...closed.purchase,data:'{}'},revision:closed.revision+1}));
  await assertFails(set(target,{...closed,unexpected:'x',revision:closed.revision+1}));
  const corrected=await call(a,'reviseHouseholdPurchase',{householdId,purchaseId:p1.id,revision:1,mode:'quick',occurredAt:now,items:[{taskId:'rice',outcome:'missing'}]});assert.equal(corrected.items[0].outcome,'missing');
  await assert.rejects(call(b,'reviseHouseholdPurchase',{householdId,purchaseId:p1.id,revision:1,deleted:true}),/mudou/);
  const deletedList=R.unpack((await get(target)).val(),list.id,householdId).list;deletedList.deletedAt=Date.now();deletedList.deletedBy='a';
  await call(a,'syncHouseholdList',{householdId,list:deletedList});
  assert.ok((await get(target)).val().purchase);
  const pref=ref(a,'households/home/preferences/_settings');
  await set(pref,{jevEnabled:false,updatedAt:now,updatedBy:'alice'});
  await assertFails(set(pref,{jevEnabled:true,updatedAt:now+1,updatedBy:'bob'}));
  await assertFails(set(ref(outsider,'households/home/preferences/_settings'),{jevEnabled:true,updatedAt:now,updatedBy:'outsider'}));
  await assertFails(update(ref(a,'households/home'),{members:{outsider:true}}));
  // Empty arrays survive the string envelope and can be finalized/corrected.
  const empty={...list,id:'empty',purchaseId:'empty',tasks:[]};await call(a,'syncHouseholdList',{householdId,list:empty});
  const emptyP=await call(a,'finishHouseholdPurchase',{householdId,listId:'empty',expected:M.fingerprint(empty),mode:'quick',occurredAt:now});assert.deepEqual(emptyP.items,[]);
  await call(a,'reviseHouseholdPurchase',{householdId,purchaseId:'empty',revision:1,items:[],mode:'complete',occurredAt:now});
});
