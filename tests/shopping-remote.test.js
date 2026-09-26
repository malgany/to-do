const {test}=require('node:test');const assert=require('node:assert/strict');
const R=require('../shopping-remote'),M=require('../household-model');
function list(){return {id:'list',purchaseId:'list',householdId:'home',kind:'mercado',title:'Mercado',metaUpdatedAt:1,metaUpdatedBy:'a',tasks:[{id:'rice',text:'Arroz',done:true,shopping:{productKey:'arroz-branco',name:'Arroz',categoryId:'basicos'},photos:[{id:'photo',dataUrl:'data:image/png;base64,AA'}]}]};}
test('Spark record strips UI flags and purchase photos; closure is idempotent',()=>{
  const l={...list(),pendingFinish:true,finishConflict:true,organization:'manual'};
  const record=R.mutate(null,'syncHouseholdList',{householdId:'home',list:l},10);
  const decoded=R.unpack(record,l.id,'home');assert.equal(decoded.list.pendingFinish,undefined);assert.equal(decoded.list.organization,undefined);
  const args={householdId:'home',listId:'list',expected:M.fingerprint(decoded.list),mode:'complete',occurredAt:9};
  const closed=R.mutate(record,'finishHouseholdPurchase',args,10);
  assert.equal(closed.list,record.list);assert.equal(closed.closedAt,10);
  assert.equal(JSON.parse(closed.purchase.data).items[0].photos,undefined);
  assert.equal(R.mutate(closed,'finishHouseholdPurchase',args,11),null);
  const output=R.fromHouse({records:{list:closed}},'home');assert.equal(output.purchases.list.items[0].outcome,'bought');assert.equal(output.lists.list.closedAt,10);
});
test('Spark reader rejects malformed records without exposing partially decoded data',()=>{
  assert.throws(()=>R.fromHouse({records:{bad:{list:'not json',revision:1}}},'home'),e=>e.code==='shopping/data-loss');
  assert.throws(()=>R.mutate(null,'syncHouseholdList',{householdId:'different',list:list()}));
  const l=list();l.tasks.push({...l.tasks[0]});assert.throws(()=>R.validateList(l,'home'));
});
test('Spark corrections preserve identity and use revision checks',()=>{
  const l=list(),record=R.mutate(null,'syncHouseholdList',{householdId:'home',list:l},10);
  const closed=R.mutate(record,'finishHouseholdPurchase',{householdId:'home',listId:l.id,expected:M.fingerprint(l),mode:'complete',occurredAt:9},10);
  const correction={householdId:'home',purchaseId:l.id,revision:1,mode:'quick',occurredAt:8,items:[{taskId:'rice',outcome:'missing'}]};
  const revised=R.mutate(closed,'reviseHouseholdPurchase',correction,11);
  assert.equal(revised.list,closed.list);assert.equal(revised.purchase.revision,2);
  assert.equal(R.unpack(revised,l.id,'home').purchase.items[0].productKey,'arroz-branco');
  assert.throws(()=>R.mutate(revised,'reviseHouseholdPurchase',correction,12),e=>e.code==='shopping/failed-precondition');
});
