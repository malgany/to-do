const assert = require('node:assert/strict');
const test = require('node:test');

test('Vigia shows five household lists by creation date with the purchase closure state', async () => {
  const {recentLists} = await import('../vigia/model.js');
  const record = (id, createdAt, tasks = [], fields = {}) => ({
    list: JSON.stringify({id, householdId: 'house', title: id, createdAt, metaUpdatedAt: 90, tasks}),
    ...fields,
  });
  const records = {
    old: record('old', 1, [], {closedAt: 99}),
    fifth: record('fifth', 2),
    fourth: record('fourth', 3),
    checked: record('checked', 4, [{done: true}]),
    finished: record('finished', 5, [{done: true}, {done: false}, {done: true, deletedAt: 50}], {closedAt: 80}),
    latest: record('latest', 6, [{done: false}]),
    deleted: record('deleted', 7, [], {deletedAt: 81}),
  };

  const lists = recentLists(records, 'house');
  assert.deepEqual(lists.map(list => list.title), ['latest', 'finished', 'checked', 'fourth', 'fifth']);
  assert.deepEqual(lists.map(list => list.closed), [false, true, false, false, false]);
  assert.deepEqual(recentLists(records, 'another-house'), []);
});

test('Vigia uses calendar days across month boundaries and removes whole emoji sequences from display', async () => {
  const {creationLabel, displayTitle} = await import('../vigia/model.js');
  const now = new Date(2026, 10, 1, 0, 10);
  assert.equal(creationLabel(new Date(2026, 10, 1, 0, 1), now), 'Hoje');
  assert.equal(creationLabel(new Date(2026, 9, 31, 23, 59), now), 'Ontem');
  assert.equal(creationLabel(new Date(2026, 9, 30, 23, 59), now), '30/10');
  assert.deepEqual(displayTitle('Compras 🛍️ 🛒'), {text: 'Compras', hasEmoji: true});
  assert.deepEqual(displayTitle('Casa 👩🏽‍🍳 🇧🇷 2️⃣'), {text: 'Casa', hasEmoji: true});
  assert.deepEqual(displayTitle('Kit emergência 2'), {text: 'Kit emergência 2', hasEmoji: false});
  assert.deepEqual(displayTitle('🛒'), {text: 'Lista', hasEmoji: true});
});
