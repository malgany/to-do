const {test}=require('node:test');const assert=require('node:assert/strict');const M=require('../household-model');
const task=()=>({id:'t1',text:'Arroz',done:false,notHave:false,textUpdatedAt:1,textUpdatedBy:'a',doneUpdatedAt:1,doneUpdatedBy:'a',shoppingUpdatedAt:1,shoppingUpdatedBy:'a',shopping:{productKey:'arroz',name:'Arroz',categoryId:'basicos'},photos:[]});
const list=()=>({id:'l1',purchaseId:'l1',kind:'mercado',title:'Mercado',tasks:[task()],metaUpdatedAt:1,metaUpdatedBy:'a'});
test('concurrent rename, category and completion retain unrelated changes',()=>{
  const a=task(),b=task();a.text='Arroz integral';a.textUpdatedAt=2;a.shopping={...a.shopping,categoryId:'outros'};a.shoppingUpdatedAt=2;b.done=true;b.doneUpdatedAt=3;
  const merged=M.mergeTask(a,b);assert.equal(merged.text,a.text);assert.equal(merged.done,true);assert.equal(merged.shopping.categoryId,'outros');
});
test('task deletions and photo tombstones cannot resurrect',()=>{const a=task(),b=task();a.deletedAt=3;a.deletedBy='a';b.textUpdatedAt=4;b.photos=[{id:'p',deletedAt:4,updatedAt:4}];a.photos=[{id:'p',dataUrl:'x',updatedAt:1}];const r=M.mergeTask(a,b);assert.equal(r.deletedAt,3);assert.equal(r.photos[0].deletedAt,4);});
test('finish is idempotent; stale snapshots require review',()=>{
  const l=list(),h={lists:{l1:l}};const old=M.fingerprint(l);l.tasks[0].done=true;
  assert.throws(()=>M.finalize(h,'l1',old,'complete',1,2),/conflict/);
  const p=M.finalize(h,'l1',M.fingerprint(l),'complete',1,2);assert.equal(p.items[0].outcome,'bought');
  assert.equal(M.finalize(h,'l1','stale','complete',1,3),p);assert.equal(Object.keys(h.purchases).length,1);
});
test('closed lists resist stale device changes',()=>{const l=list();l.closedAt=2;const stale=list();stale.tasks[0].done=true;stale.tasks[0].doneUpdatedAt=10;assert.equal(M.mergeList(l,stale).tasks[0].done,false);});
test('explicit newer restoration beats deletion; stale edits do not',()=>{const a=task();a.deletedAt=10;a.deletedBy='a';const b=task();b.deletedAt=null;b.deletionUpdatedAt=11;b.deletionUpdatedBy='a';assert.equal(M.mergeTask(a,b).deletedAt,null);assert.equal(M.mergeTask(a,task()).deletedAt,10);});
test('closed working list can be removed without changing contents',()=>{const a=list();a.closedAt=2;const b=list();b.deletedAt=3;b.deletedBy='a';assert.equal(M.mergeList(a,b).deletedAt,3);});
test('fingerprints survive Firebase key sorting and null removal',()=>{const a=list();a.tasks[0].shopping.quantity=null;const b=JSON.parse(JSON.stringify(a));b.tasks[0].shopping={categoryId:'basicos',name:'Arroz',productKey:'arroz'};assert.equal(M.fingerprint(a),M.fingerprint(b));});
test('fingerprint is independent of item order and photos, includes category changes',()=>{const a=list();a.tasks.push({...task(),id:'t2'});const b=structuredClone(a);b.tasks.reverse();b.tasks[0].photos=[{id:'p',dataUrl:'x'}];assert.equal(M.fingerprint(a),M.fingerprint(b));b.tasks[0].shopping.categoryId='other';assert.notEqual(M.fingerprint(a),M.fingerprint(b));});
