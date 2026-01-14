// main.js - Tela principal da aplicação
'use strict';

let selectedIcon = 'list';
let selectedColor = 'blue';

// Dark mode automático
if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.documentElement.classList.add('dark');
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
  document.documentElement.classList.toggle('dark', e.matches);
});

// Cores para os ícones
const colorClasses = {
  blue: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400' },
  green: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-600 dark:text-green-400' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-600 dark:text-purple-400' },
  red: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-600 dark:text-red-400' },
  orange: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-600 dark:text-orange-400' },
  pink: { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-600 dark:text-pink-400' }
};

// Inicializar aplicação
document.addEventListener('DOMContentLoaded', async () => {
  updateDate();
  setupModalHandlers();
  await loadLists();
});

// Atualizar data
function updateDate() {
  const dateEl = document.getElementById('current-date');
  const now = new Date();
  const options = { weekday: 'long', day: 'numeric', month: 'short' };
  const dateStr = now.toLocaleDateString('pt-BR', options);
  dateEl.textContent = dateStr;
}

// Carregar listas
async function loadLists() {
  try {
    const lists = await getAllLists();
    const deviceId = getDeviceId();
    
    // Separar listas próprias e compartilhadas
    const myLists = lists.filter(l => l.ownerId === deviceId);
    const sharedLists = lists.filter(l => l.ownerId !== deviceId);
    
    renderLists(myLists, sharedLists);
  } catch (error) {
    console.error('Erro ao carregar listas:', error);
    showError('Erro ao carregar listas');
  }
}

// Renderizar listas
function renderLists(myLists, sharedLists) {
  const container = document.getElementById('lists-container');
  const emptyState = document.getElementById('empty-state');
  
  // Mostrar empty state se não há listas
  if (myLists.length === 0 && sharedLists.length === 0) {
    emptyState.classList.remove('hidden');
    container.innerHTML = '';
    return;
  }
  
  emptyState.classList.add('hidden');
  container.innerHTML = '';
  
  // Renderizar minhas listas
  if (myLists.length > 0) {
    const myListsSection = document.createElement('div');
    myListsSection.innerHTML = '<h2 class="text-lg font-bold text-text-main-light dark:text-text-main-dark mb-3">Minhas Listas</h2>';
    const myListsContainer = document.createElement('div');
    myListsContainer.className = 'space-y-4 mb-6';
    
    myLists.forEach(list => {
      myListsContainer.appendChild(createListCard(list, true));
    });
    
    myListsSection.appendChild(myListsContainer);
    container.appendChild(myListsSection);
  }
  
  // Renderizar listas compartilhadas
  if (sharedLists.length > 0) {
    const sharedSection = document.createElement('div');
    sharedSection.innerHTML = '<h2 class="text-lg font-bold text-text-main-light dark:text-text-main-dark mb-3 flex items-center"><span class="material-icons-round text-xl mr-2">people</span>Listas Compartilhadas</h2>';
    const sharedContainer = document.createElement('div');
    sharedContainer.className = 'space-y-4';
    
    sharedLists.forEach(list => {
      sharedContainer.appendChild(createListCard(list, false));
    });
    
    sharedSection.appendChild(sharedContainer);
    container.appendChild(sharedSection);
  }
}

// Criar card de lista
function createListCard(list, isOwner) {
  const card = document.createElement('div');
  card.className = 'bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark p-5 rounded-xl active:scale-[0.98] transition-transform cursor-pointer group';
  card.onclick = () => window.location.href = `/list.html?id=${list.id}`;
  
  const colors = colorClasses[list.color] || colorClasses.blue;
  
  const pendingTasks = list.tasks.filter(t => !t.completed);
  const completedTasks = list.tasks.filter(t => t.completed);
  const totalTasks = list.tasks.length;
  
  let statusHTML = '';
  if (totalTasks === 0) {
    statusHTML = '<span class="text-xs font-medium text-text-sub-light dark:text-text-sub-dark">Nenhuma tarefa</span>';
  } else if (pendingTasks.length === 0) {
    statusHTML = `<span class="text-xs font-medium ${colors.text}">Todas concluídas</span>`;
  } else {
    statusHTML = `<span class="text-xs font-medium text-text-sub-light dark:text-text-sub-dark">${pendingTasks.length} tarefa${pendingTasks.length !== 1 ? 's' : ''} restante${pendingTasks.length !== 1 ? 's' : ''}</span>`;
  }
  
  // Mostrar preview das tarefas
  let tasksPreviewHTML = '';
  if (pendingTasks.length > 0) {
    const previewTasks = pendingTasks.slice(0, 2);
    tasksPreviewHTML = '<div class="space-y-3 mb-4">';
    previewTasks.forEach(task => {
      tasksPreviewHTML += `
        <div class="flex items-center space-x-3 text-sm text-text-sub-light dark:text-text-sub-dark">
          <div class="w-5 h-5 border-2 border-border-light dark:border-border-dark rounded-full flex-shrink-0"></div>
          <span class="truncate">${escapeHtml(task.text)}</span>
        </div>
      `;
    });
    tasksPreviewHTML += '</div>';
  } else if (completedTasks.length > 0) {
    const previewTasks = completedTasks.slice(0, 2);
    tasksPreviewHTML = '<div class="space-y-3 mb-4">';
    previewTasks.forEach(task => {
      tasksPreviewHTML += `
        <div class="flex items-center space-x-3 text-sm text-text-sub-light dark:text-text-sub-dark line-through opacity-60">
          <div class="w-5 h-5 bg-primary text-white rounded-full flex items-center justify-center flex-shrink-0">
            <span class="material-icons-round text-[12px]">check</span>
          </div>
          <span class="truncate">${escapeHtml(task.text)}</span>
        </div>
      `;
    });
    tasksPreviewHTML += '</div>';
  }
  
  card.innerHTML = `
    <div class="flex justify-between items-start mb-3">
      <div class="flex items-center space-x-3">
        <div class="p-2 ${colors.bg} rounded-lg ${colors.text}">
          <span class="material-icons-round text-xl">${list.icon}</span>
        </div>
        <h3 class="font-bold text-lg text-text-main-light dark:text-text-main-dark">${escapeHtml(list.name)}</h3>
      </div>
      ${isOwner ? `<button class="text-text-sub-light dark:text-text-sub-dark hover:text-red-500 transition-colors" onclick="event.stopPropagation(); deleteListPrompt('${list.id}', '${escapeHtml(list.name)}');"><span class="material-icons-round text-xl">delete</span></button>` : ''}
    </div>
    ${tasksPreviewHTML}
    <div class="pt-3 border-t border-border-light/50 dark:border-border-dark/50 flex justify-between items-center">
      ${statusHTML}
      <span class="text-xs font-semibold text-primary group-hover:underline">Ver lista</span>
    </div>
  `;
  
  return card;
}

// Setup modal handlers
function setupModalHandlers() {
  const modal = document.getElementById('create-list-modal');
  const fabBtn = document.getElementById('fab-add');
  const emptyCreateBtn = document.getElementById('empty-create-btn');
  const cancelBtn = document.getElementById('cancel-create-btn');
  const confirmBtn = document.getElementById('confirm-create-btn');
  const nameInput = document.getElementById('list-name-input');
  
  // Abrir modal
  fabBtn.addEventListener('click', openModal);
  emptyCreateBtn.addEventListener('click', openModal);
  
  // Fechar modal
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  // Criar lista
  confirmBtn.addEventListener('click', createNewList);
  nameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') createNewList();
  });
  
  // Seleção de ícone
  document.querySelectorAll('.icon-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.icon-option').forEach(b => {
        b.classList.remove('border-primary', 'bg-primary/10');
      });
      btn.classList.add('border-primary', 'bg-primary/10');
      selectedIcon = btn.dataset.icon;
    });
  });
  
  // Seleção de cor
  document.querySelectorAll('.color-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-option').forEach(b => {
        b.classList.remove('border-white', 'scale-110');
      });
      btn.classList.add('border-white', 'scale-110');
      selectedColor = btn.dataset.color;
    });
  });
  
  // Selecionar primeiro ícone e cor por padrão
  document.querySelector('.icon-option').click();
  document.querySelector('.color-option').click();
}

function openModal() {
  const modal = document.getElementById('create-list-modal');
  const nameInput = document.getElementById('list-name-input');
  modal.classList.remove('hidden');
  nameInput.value = '';
  nameInput.focus();
}

function closeModal() {
  const modal = document.getElementById('create-list-modal');
  modal.classList.add('hidden');
}

async function createNewList() {
  const nameInput = document.getElementById('list-name-input');
  const name = nameInput.value.trim();
  
  if (!name) {
    alert('Por favor, digite um nome para a lista');
    return;
  }
  
  try {
    const newList = await createList(name, selectedIcon, selectedColor);
    closeModal();
    
    // Redirecionar para a nova lista
    window.location.href = `/list.html?id=${newList.id}`;
  } catch (error) {
    console.error('Erro ao criar lista:', error);
    showError('Erro ao criar lista: ' + error.message);
  }
}

// Deletar lista
window.deleteListPrompt = async function(listId, listName) {
  if (!confirm(`Deseja realmente excluir a lista "${listName}"?\n\nTodas as tarefas serão perdidas.`)) {
    return;
  }
  
  try {
    await deleteList(listId);
    // Recarregar listas
    await loadLists();
  } catch (error) {
    console.error('Erro ao deletar lista:', error);
    alert('Erro ao deletar lista: ' + error.message);
  }
};

// Utility: Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

