function timestamp(value, fallback) {
  return value != null && Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function recentLists(records, house, now = Date.now()) {
  const lists = [];
  for (const [id, record] of Object.entries(records || {})) {
    if (!record || record.deletedAt) continue;
    const list = JSON.parse(record.list);
    if (list.householdId !== house || list.id !== id || list.deletedAt) continue;
    const updatedAt = timestamp(list.metaUpdatedAt, timestamp(list.updatedAt, now));
    lists.push({
      id,
      title: list.title,
      kind: list.kind,
      closed: Boolean(record.closedAt),
      createdAt: Math.min(timestamp(list.createdAt, updatedAt), updatedAt),
    });
  }
  lists.sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  return lists.slice(0, 5);
}

const shortDate = new Intl.DateTimeFormat('pt-BR', {day:'2-digit', month:'2-digit'});
const segmenter = new Intl.Segmenter('pt-BR', {granularity:'grapheme'});
const emoji = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u;

export function creationLabel(timestamp, now = new Date()) {
  const created = new Date(timestamp);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (created.toDateString() === now.toDateString()) return 'Hoje';
  if (created.toDateString() === yesterday.toDateString()) return 'Ontem';
  return shortDate.format(created);
}

export function displayTitle(title) {
  let hasEmoji = false;
  let text = '';
  for (const {segment} of segmenter.segment(title)) {
    if (emoji.test(segment)) hasEmoji = true;
    else text += segment;
  }
  return {text: text.replace(/\s+/g, ' ').trim() || 'Lista', hasEmoji};
}
