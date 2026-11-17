function timestamp(value, fallback) {
  return value != null && Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function recentLists(records, house, now = Date.now()) {
  const lists = [];
  for (const [id, record] of Object.entries(records || {})) {
    if (!record || record.deletedAt) continue;
    const list = JSON.parse(record.list);
    if (list.householdId !== house || list.id !== id || list.deletedAt) continue;
    const tasks = list.tasks.filter(task => task && task.deletedAt == null);
    const updatedAt = timestamp(list.metaUpdatedAt, timestamp(list.updatedAt, now));
    lists.push({
      id,
      title: list.title,
      total: tasks.length,
      done: tasks.filter(task => task.done).length,
      closed: Boolean(record.closedAt),
      createdAt: Math.min(timestamp(list.createdAt, updatedAt), updatedAt),
    });
  }
  lists.sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  return lists.slice(0, 5);
}
