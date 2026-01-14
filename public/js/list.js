// list.js - Visualização de lista com sincronização em tempo real
(function() {
'use strict';

const urlParams = new URLSearchParams(window.location.search);
const listId = urlParams.get('id');
const deviceId = getDeviceId();

let currentList = null;
let isOwner = false;
let completedExpanded = false;

// Dark mode automático
if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.documentElement.classList.add('dark');
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
  document.documentElement.classList.toggle('dark', e.matches);
});

// Inicializar
document.addEventListener('DOMContentLoaded', async () => {
  if (!listId) {
    window.location.href = '/';
    return;
  }
  
  setupEventListeners();
  await loadList();
  setupWebSocket();
});

// Configurar event listeners
function setupEventListeners() {
  // Botão voltar
  document.getElementById('back-btn').addEventListener('click', () => {
    window.location.href = '/';
  });
  
  // Botão compartilhar
  document.getElementById('share-btn').addEventListener('click', shareList);
  
  // Adicionar tarefa
  const taskInput = document.getElementById('task-input');
  const sendBtn = document.getElementById('send-task-btn');
  
  sendBtn.addEventListener('click', addNewTask);
  taskInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addNewTask();
  });
  
  // Toggle seção de concluídas
  document.getElementById('toggle-completed').addEventListener('click', toggleCompleted);
}

// Carregar lista
async function loadList() {
  try {
    currentList = await getList(listId);
    isOwner = currentList.ownerId === deviceId;
    
    renderList();
  } catch (error) {
    console.error('Erro ao carregar lista:', error);
    showToast('Erro ao carregar lista');
    setTimeout(() => window.location.href = '/', 2000);
  }
}

// Renderizar lista
function renderList() {
  // Título
  document.getElementById('list-title').textContent = currentList.name;
  
  // Badge de compartilhada
  if (!isOwner) {
    document.getElementById('shared-badge').classList.remove('hidden');
  }
  
  // Botões do header
  if (isOwner) {
    document.getElementById('share-btn').classList.remove('hidden');
    document.getElementById('menu-btn').classList.remove('hidden');
  }
  
  // Input de adicionar tarefa (esconder se não for owner)
  if (!isOwner) {
    document.getElementById('add-task-bar').style.display = 'none';
    document.getElementById('fab-container').style.display = 'none';
  }
  
  // Renderizar tarefas
  renderTasks();
}

// Renderizar tarefas
function renderTasks() {
  const pendingContainer = document.getElementById('pending-tasks');
  const completedContainer = document.getElementById('completed-tasks');
  const completedSection = document.getElementById('completed-section');
  const completedCount = document.getElementById('completed-count');
  
  const pending = currentList.tasks.filter(t => !t.completed);
  const completed = currentList.tasks.filter(t => t.completed);
  
  // Tarefas pendentes
  pendingContainer.innerHTML = '';
  pending.forEach(task => {
    pendingContainer.appendChild(createTaskElement(task, false));
  });
  
  // Tarefas concluídas
  if (completed.length > 0) {
    completedSection.classList.remove('hidden');
    completedCount.textContent = completed.length;
    
    completedContainer.innerHTML = '';
    completed.forEach(task => {
      completedContainer.appendChild(createTaskElement(task, true));
    });
  } else {
    completedSection.classList.add('hidden');
    completedContainer.classList.add('hidden');
  }
}

// Criar elemento de tarefa
function createTaskElement(task, isCompleted) {
  const div = document.createElement('div');
  div.className = 'group flex items-center p-4 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-DEFAULT shadow-sm hover:shadow-soft transition-shadow';
  div.dataset.taskId = task.id;
  
  if (!isCompleted) {
    div.classList.add('cursor-pointer');
    div.addEventListener('click', (e) => {
      // Se clicou no checkbox, não navegar
      if (e.target.type !== 'checkbox') {
        window.location.href = `/detail.html?listId=${listId}&taskId=${task.id}`;
      }
    });
  }
  
  const checkboxHtml = isCompleted ? `
    <div class="relative flex items-center justify-center w-6 h-6 mr-4">
      <div class="w-6 h-6 bg-primary rounded-full flex items-center justify-center cursor-pointer" onclick="event.stopPropagation(); handleToggle('${task.id}', ${isCompleted})">
        <span class="material-icons-round text-white text-sm">check</span>
      </div>
    </div>
  ` : `
    <div class="relative flex items-center justify-center w-6 h-6 mr-4">
      <input 
        type="checkbox" 
        class="peer appearance-none w-6 h-6 border-2 border-primary rounded-full checked:bg-primary checked:border-primary transition-colors cursor-pointer z-10" 
        onchange="handleToggle('${task.id}', ${isCompleted})"
        onclick="event.stopPropagation()"
      />
      <span class="material-icons-round absolute text-white text-sm opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none">check</span>
    </div>
  `;
  
  const textClass = isCompleted 
    ? 'text-lg text-text-secondary-light dark:text-text-secondary-dark line-through' 
    : 'text-lg text-text-primary-light dark:text-text-primary-dark';
  
  div.innerHTML = `
    ${checkboxHtml}
    <span class="${textClass}">${escapeHtml(task.text)}</span>
  `;
  
  return div;
}

// Toggle tarefa
window.handleToggle = async function(taskId, currentCompleted) {
  const newCompleted = !currentCompleted;
  
  // Atualização otimista
  updateTaskState(taskId, newCompleted);
  
  try {
    // Enviar para servidor
    await toggleTask(listId, taskId, newCompleted);
    
    // Broadcast via WebSocket
    emitTaskCompleted(listId, taskId, newCompleted, deviceId);
  } catch (error) {
    console.error('Erro ao atualizar tarefa:', error);
    // Reverter
    updateTaskState(taskId, currentCompleted);
    showToast('Erro ao atualizar tarefa');
  }
};

// Atualizar estado da tarefa no DOM e na lista local
function updateTaskState(taskId, completed) {
  const task = currentList.tasks.find(t => t.id === taskId);
  if (task) {
    task.completed = completed;
    task.completedAt = completed ? new Date().toISOString() : null;
    task.completedBy = completed ? deviceId : null;
  }
  renderTasks();
}

// Adicionar nova tarefa
async function addNewTask() {
  const input = document.getElementById('task-input');
  const text = input.value.trim();
  
  if (!text) return;
  
  // Limpar input
  input.value = '';
  
  try {
    const newTask = await addTask(listId, text);
    
    // Adicionar à lista local
    currentList.tasks.push(newTask);
    renderTasks();
    
    // Broadcast via WebSocket
    emitTaskAdded(listId, newTask);
    
    showToast('Tarefa adicionada!');
  } catch (error) {
    console.error('Erro ao adicionar tarefa:', error);
    showToast('Erro ao adicionar tarefa');
    // Restaurar texto no input
    input.value = text;
  }
}

// Toggle seção de concluídas
function toggleCompleted() {
  completedExpanded = !completedExpanded;
  const completedContainer = document.getElementById('completed-tasks');
  const arrow = document.querySelector('#toggle-completed .material-icons-round');
  
  if (completedExpanded) {
    completedContainer.classList.remove('hidden');
    arrow.style.transform = 'rotate(180deg)';
  } else {
    completedContainer.classList.add('hidden');
    arrow.style.transform = 'rotate(0deg)';
  }
}

// Compartilhar lista
async function shareList() {
  const shareUrl = `${window.location.origin}/list.html?id=${listId}`;
  
  try {
    if (navigator.share) {
      // API nativa de compartilhamento (mobile)
      await navigator.share({
        title: `Lista: ${currentList.name}`,
        text: 'Confira esta lista de tarefas',
        url: shareUrl
      });
    } else {
      // Copiar para clipboard
      await navigator.clipboard.writeText(shareUrl);
      showToast('Link copiado para a área de transferência!');
    }
  } catch (error) {
    // Fallback: mostrar modal com o link
    const result = prompt('Link para compartilhar:', shareUrl);
    if (result) {
      showToast('Link copiado!');
    }
  }
}

// Configurar WebSocket
function setupWebSocket() {
  // Entrar na sala da lista
  joinList(listId);
  
  // Listeners de eventos
  onTaskUpdated(({ taskId, completed, completedBy }) => {
    console.log('Task updated via WebSocket:', taskId, completed);
    updateTaskState(taskId, completed);
    
    // Mostrar quem completou (se não foi este dispositivo)
    if (completedBy !== deviceId && completed) {
      showToast('Tarefa marcada como concluída');
    }
  });
  
  onTaskAdded(({ task }) => {
    console.log('Task added via WebSocket:', task);
    // Verificar se já existe
    if (!currentList.tasks.find(t => t.id === task.id)) {
      currentList.tasks.push(task);
      renderTasks();
      showToast('Nova tarefa adicionada');
    }
  });
  
  onTaskDeleted(({ taskId }) => {
    console.log('Task deleted via WebSocket:', taskId);
    currentList.tasks = currentList.tasks.filter(t => t.id !== taskId);
    renderTasks();
    showToast('Tarefa removida');
  });
  
  onTaskEdited(({ taskId, text }) => {
    console.log('Task edited via WebSocket:', taskId, text);
    const task = currentList.tasks.find(t => t.id === taskId);
    if (task) {
      task.text = text;
      renderTasks();
    }
  });
  
  onPhotoAdded(({ taskId, filename }) => {
    console.log('Photo added via WebSocket:', taskId, filename);
    const task = currentList.tasks.find(t => t.id === taskId);
    if (task) {
      if (!task.photos) task.photos = [];
      if (!task.photos.includes(filename)) {
        task.photos.push(filename);
      }
    }
  });
}

// Sair da sala ao fechar a página
window.addEventListener('beforeunload', () => {
  leaveList(listId);
});

// Utility: Toast
function showToast(message) {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');
  
  toastMessage.textContent = message;
  toast.classList.remove('opacity-0');
  toast.classList.add('opacity-100');
  
  setTimeout(() => {
    toast.classList.remove('opacity-100');
    toast.classList.add('opacity-0');
  }, 3000);
}

// Utility: Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

})(); // Fim do IIFE
