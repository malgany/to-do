import {creationLabel, displayTitle} from './model.js?v=3';

const icons = {
  mercado: 'M3 3h2l2.4 11h11.8l2-7H6 M9 20h.01 M18 20h.01',
  farmacia: 'M12 5v14 M5 12h14',
  pet: 'M4 10h.01 M8 6h.01 M16 6h.01 M20 10h.01 M7 17c0-2 3-6 5-6s5 4 5 6c0 1.5-1 2-2 2l-3-1-3 1c-1 0-2-.5-2-2z',
  lista: 'M9 6h11 M9 12h11 M9 18h11 M4 6h.01 M4 12h.01 M4 18h.01'
};

function listIcon(kind) {
  const namespace = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(namespace, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.classList.add('list-icon');
  const path = document.createElementNS(namespace, 'path');
  path.setAttribute('d', Object.hasOwn(icons, kind) ? icons[kind] : icons.lista);
  icon.append(path);
  return icon;
}

export function renderLists(element, lists, now = new Date()) {
  element.replaceChildren();
  for (const list of lists) {
    const row = document.createElement('li');
    row.classList.toggle('completed', list.closed);

    const mark = document.createElement('span');
    mark.className = 'list-mark';
    mark.setAttribute('role', 'checkbox');
    mark.setAttribute('aria-checked', String(list.closed));
    mark.setAttribute('aria-readonly', 'true');
    mark.setAttribute('aria-label', list.closed ? 'Lista finalizada' : 'Lista em aberto');
    mark.textContent = list.closed ? '✓' : '';

    const title = document.createElement('span');
    title.className = 'list-title';
    const {text, hasEmoji} = displayTitle(list.title);
    if (hasEmoji) title.append(listIcon(list.kind));
    const name = document.createElement('span');
    name.textContent = text;
    title.append(name);

    const date = document.createElement('time');
    date.className = 'list-date';
    const created = new Date(list.createdAt);
    date.dateTime = created.toISOString();
    date.setAttribute('aria-label', `Criada em ${created.toLocaleDateString('pt-BR')}`);
    date.textContent = creationLabel(list.createdAt, now);

    row.append(mark, title, date);
    element.append(row);
  }
}
