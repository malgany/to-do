const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

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
