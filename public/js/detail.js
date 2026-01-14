// detail.js - Detalhes da tarefa e upload de fotos
(function() {
'use strict';

const urlParams = new URLSearchParams(window.location.search);
const listId = urlParams.get('listId');
const taskId = urlParams.get('taskId');
const deviceId = getDeviceId();

let currentList = null;
let currentTask = null;
let isOwner = false;

// Dark mode automático
if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.documentElement.classList.add('dark');
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
  document.documentElement.classList.toggle('dark', e.matches);
});

// Inicializar
document.addEventListener('DOMContentLoaded', async () => {
  if (!listId || !taskId) {
    window.location.href = '/';
    return;
  }
  
  setupEventListeners();
  await loadTask();
  setupPolling();
});

// Configurar event listeners
function setupEventListeners() {
  // Botão voltar
  document.getElementById('back-btn').addEventListener('click', () => {
    window.location.href = `/list.html?id=${listId}`;
  });
  
  // Checkbox
  document.getElementById('task-checkbox').addEventListener('change', handleToggle);
  
  // Botões de foto
  document.getElementById('camera-btn').addEventListener('click', () => {
    document.getElementById('camera-input').click();
  });
  
  document.getElementById('gallery-btn').addEventListener('click', () => {
    document.getElementById('gallery-input').click();
  });
  
  document.getElementById('add-photo-placeholder').addEventListener('click', () => {
    document.getElementById('gallery-input').click();
  });
  
  // File inputs
  document.getElementById('camera-input').addEventListener('change', handlePhotoUpload);
  document.getElementById('gallery-input').addEventListener('change', handlePhotoUpload);
}

// Carregar tarefa
async function loadTask() {
  try {
    currentList = await getList(listId);
    currentTask = currentList.tasks.find(t => t.id === taskId);
    
    if (!currentTask) {
      showToast('Tarefa não encontrada');
      setTimeout(() => window.location.href = `/list.html?id=${listId}`, 2000);
      return;
    }
    
    isOwner = currentList.ownerId === deviceId;
    
    renderTask();
  } catch (error) {
    console.error('Erro ao carregar tarefa:', error);
    showToast('Erro ao carregar tarefa');
    setTimeout(() => window.location.href = `/list.html?id=${listId}`, 2000);
  }
}

// Renderizar tarefa
function renderTask() {
  // Título da lista
  document.getElementById('list-title').textContent = currentList.name;
  
  // Texto da tarefa
  document.getElementById('task-text').textContent = currentTask.text;
  
  // Checkbox
  const checkbox = document.getElementById('task-checkbox');
  checkbox.checked = currentTask.completed;
  
  // Se não for owner, desabilitar checkbox para fotos
  if (!isOwner) {
    document.getElementById('photo-buttons').style.display = 'none';
    document.getElementById('add-photo-placeholder').style.display = 'none';
  }
  
  // Renderizar fotos
  renderPhotos();
}

// Renderizar fotos
function renderPhotos() {
  const photosGrid = document.getElementById('photos-grid');
  const placeholder = document.getElementById('add-photo-placeholder');
  
  if (!currentTask.photos || currentTask.photos.length === 0) {
    photosGrid.innerHTML = '';
    return;
  }
  
  photosGrid.innerHTML = '';
  currentTask.photos.forEach(filename => {
    const photoCard = createPhotoCard(filename);
    photosGrid.appendChild(photoCard);
  });
  
  // Se tem fotos, mostrar placeholder menor
  if (currentTask.photos.length > 0) {
    placeholder.classList.remove('w-40', 'h-40');
    placeholder.classList.add('w-full', 'h-32');
  }
}

// Criar card de foto
function createPhotoCard(filename) {
  const div = document.createElement('div');
  div.className = 'relative group aspect-square';
  
  const photoUrl = getPhotoUrl(filename);
  
  div.innerHTML = `
    <img 
      src="${photoUrl}" 
      alt="Foto da tarefa" 
      class="w-full h-full object-cover rounded-xl border-2 border-border-light dark:border-border-dark"
      onclick="openPhotoModal('${photoUrl}')"
    />
    ${isOwner ? `
      <button 
        class="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
        onclick="deletePhoto('${filename}')"
      >
        <span class="material-icons-round text-sm">close</span>
      </button>
    ` : ''}
  `;
  
  return div;
}

// Toggle tarefa
async function handleToggle() {
  const checkbox = document.getElementById('task-checkbox');
  const newCompleted = checkbox.checked;
  
  try {
    await toggleTask(listId, taskId, newCompleted);
    
    // Atualizar localmente
    currentTask.completed = newCompleted;
    currentTask.completedAt = newCompleted ? new Date().toISOString() : null;
    currentTask.completedBy = newCompleted ? deviceId : null;
    
    showToast(newCompleted ? 'Tarefa concluída!' : 'Tarefa reaberta');
    // Polling detectará a mudança para outros usuários
  } catch (error) {
    console.error('Erro ao atualizar tarefa:', error);
    // Reverter checkbox
    checkbox.checked = !newCompleted;
    showToast('Erro ao atualizar tarefa');
  }
}

// Upload de foto
async function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Validar tamanho (5MB)
  if (file.size > 5 * 1024 * 1024) {
    showToast('Foto muito grande! Máximo 5MB');
    return;
  }
  
  // Validar tipo
  if (!file.type.startsWith('image/')) {
    showToast('Por favor, selecione uma imagem');
    return;
  }
  
  // Mostrar loading
  showLoading(true);
  
  try {
    const result = await uploadPhoto(listId, taskId, file);
    
    // Adicionar à lista local
    if (!currentTask.photos) currentTask.photos = [];
    currentTask.photos.push(result.filename);
    
    // Re-renderizar
    renderPhotos();
    
    showToast('Foto adicionada!');
    // Polling detectará a mudança para outros usuários
  } catch (error) {
    console.error('Erro ao fazer upload:', error);
    showToast('Erro ao enviar foto');
  } finally {
    showLoading(false);
    // Limpar input
    event.target.value = '';
  }
}

// Deletar foto (apenas owner)
window.deletePhoto = async function(filename) {
  if (!isOwner) return;
  
  const confirmed = await showConfirm(
    'Deseja remover esta foto?',
    {
      title: 'Remover Foto',
      confirmText: 'Remover',
      cancelText: 'Cancelar',
      type: 'warning'
    }
  );
  
  if (!confirmed) return;
  
  // Remover da lista local
  currentTask.photos = currentTask.photos.filter(f => f !== filename);
  
  // Re-renderizar
  renderPhotos();
  
  // TODO: Implementar endpoint de delete no backend se necessário
  showToast('Foto removida');
};

// Abrir modal de foto em tela cheia
window.openPhotoModal = function(photoUrl) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4';
  modal.onclick = () => modal.remove();
  
  modal.innerHTML = `
    <img 
      src="${photoUrl}" 
      alt="Foto" 
      class="max-w-full max-h-full object-contain rounded-lg"
    />
    <button 
      class="absolute top-4 right-4 bg-white dark:bg-gray-800 text-gray-800 dark:text-white p-2 rounded-full shadow-lg"
      onclick="this.parentElement.remove()"
    >
      <span class="material-icons-round">close</span>
    </button>
  `;
  
  document.body.appendChild(modal);
};

// Configurar Polling
function setupPolling() {
  startPolling(listId, handlePollingUpdate);
}

// Lidar com atualizações do polling
function handlePollingUpdate(data) {
  // Se lista foi deletada
  if (data.deleted) {
    showToast('Esta lista foi removida');
    setTimeout(() => window.location.href = '/', 2000);
    return;
  }
  
  // Atualizar tarefa
  if (data.tasks) {
    const updatedTask = data.tasks.find(t => t.id === taskId);
    
    // Se tarefa foi deletada
    if (!updatedTask) {
      showToast('Esta tarefa foi removida');
      setTimeout(() => window.location.href = `/list.html?id=${listId}`, 2000);
      return;
    }
    
    // Detectar mudanças
    const completedChanged = updatedTask.completed !== currentTask.completed;
    const photosAdded = updatedTask.photos && updatedTask.photos.length > (currentTask.photos || []).length;
    
    // Atualizar task local
    currentTask = updatedTask;
    currentList = data;
    
    // Atualizar UI
    document.getElementById('task-checkbox').checked = currentTask.completed;
    renderPhotos();
    
    // Notificações
    if (completedChanged) {
      showToast(currentTask.completed ? 'Tarefa marcada como concluída' : 'Tarefa reaberta');
    } else if (photosAdded) {
      showToast('Nova foto adicionada');
    }
  }
}

// Parar polling ao sair
window.addEventListener('beforeunload', () => {
  stopPolling();
});

// Utility: Loading overlay
function showLoading(show) {
  const overlay = document.getElementById('loading-overlay');
  if (show) {
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

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

})(); // Fim do IIFE
