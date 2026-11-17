export function openList(record, house, id) {
  if (!record || record.closedAt || record.deletedAt) return null;
  const list = JSON.parse(record.list);
  return list.householdId === house && list.id === id && !list.deletedAt && !list.closedAt ? list : null;
}

export function reminders(records, house) {
  const items = [];
  for (const [id, record] of Object.entries(records || {})) {
    const list = openList(record, house, id);
    for (const task of list?.tasks || []) {
      if (!task.deletedAt) items.push({listId:id, title:list.title, kind:list.kind,
        id:task.id, text:task.text, done:task.done, created:task.createdAt || 0});
    }
  }
  items.sort((a,b) => b.created-a.created || a.listId.localeCompare(b.listId) || a.id.localeCompare(b.id));
  return {pending:items.filter(item => !item.done).length, items:items.slice(0,5)};
}

export function completeRecord(record, house, item, actor, now) {
  const list = openList(record, house, item.listId);
  const task = list?.tasks.find(task => task.id === item.id && !task.deletedAt);
  if (!task || task.done) return;
  const stamp = Math.max(now, (task.doneUpdatedAt || 0)+1, (task.notHaveUpdatedAt || 0)+1);
  Object.assign(task, {done:true, notHave:false, doneUpdatedAt:stamp, doneUpdatedBy:actor,
    notHaveUpdatedAt:stamp, notHaveUpdatedBy:actor});
  if (stamp >= (task.updatedAt || 0)) Object.assign(task,{updatedAt:stamp,updatedBy:actor});
  return {...record, list:JSON.stringify(list), revision:record.revision+1};
}
