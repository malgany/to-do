const assert = require('node:assert/strict');
const test = require('node:test');

test('recent household reminders exclude closed lists and deleted items', async () => {
  const {reminders, completeRecord} = await import('../vigia/model.js');
  const record = (id,tasks) => ({revision:3,list:JSON.stringify({id,title:id,householdId:'house',tasks})});
  const tasks = Array.from({length:7},(_,i)=>({id:String(i),text:'Item '+i,createdAt:i,done:i===2}));
  const market = record('market',tasks);
  const records = {market, pharmacy:record('pharmacy',[{...tasks[0],createdAt:9}]),
    archived:{...market,closedAt:100}, removed:record('removed',[{...tasks[0],deletedAt:10}])};
  const view = reminders(records,'house');
  assert.equal(view.pending,7);
  assert.deepEqual(view.items.map(item=>item.id),['0','6','5','4','3']);
  const next = completeRecord(market,'house',view.items[1],'member',11);
  assert.equal(next.revision,4);
  assert.equal(JSON.parse(next.list).tasks[6].done,true);
  assert.equal(JSON.parse(next.list).tasks[6].doneUpdatedBy,'member');
  assert.deepEqual(JSON.parse(next.list).tasks.slice(0,6),tasks.slice(0,6));
  assert.equal(completeRecord(next,'house',view.items[1],'member',12),undefined);
  assert.equal(completeRecord({...market,closedAt:10},'house',view.items[1],'member',12),undefined);
});
