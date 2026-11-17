const assert = require('node:assert/strict');
const test = require('node:test');

test('Vigia shows five household lists by creation date with progress and the purchase closure state', async () => {
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
  assert.deepEqual(lists.map(({done, total, closed}) => [done, total, closed]), [
    [0, 1, false],
    [1, 2, true],
    [1, 1, false],
    [0, 0, false],
    [0, 0, false],
  ]);
  assert.deepEqual(recentLists(records, 'another-house'), []);
});
