// Módulo de API para comunicação com o backend
'use strict';

const API_BASE = '/api';

// Funções auxiliares
async function handleResponse(response) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(error.error || 'Erro na requisição');
  }
  return response.json();
}

// LISTAS
async function getAllLists() {
  const response = await fetch(`${API_BASE}/lists`);
  return handleResponse(response);
}

async function getList(listId) {
  const response = await fetch(`${API_BASE}/lists/${listId}`);
  return handleResponse(response);
}

async function createList(name, icon, color) {
  const deviceId = getDeviceId();
  const response = await fetch(`${API_BASE}/lists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, icon, color, ownerId: deviceId })
  });
  return handleResponse(response);
}

async function updateList(listId, updates) {
  const deviceId = getDeviceId();
  const response = await fetch(`${API_BASE}/lists/${listId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...updates, deviceId })
  });
  return handleResponse(response);
}

async function deleteList(listId) {
  const deviceId = getDeviceId();
  const response = await fetch(`${API_BASE}/lists/${listId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId })
  });
  return handleResponse(response);
}

// TAREFAS
async function addTask(listId, text) {
  const deviceId = getDeviceId();
  const response = await fetch(`${API_BASE}/lists/${listId}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, deviceId })
  });
  return handleResponse(response);
}

async function toggleTask(listId, taskId, completed) {
  const deviceId = getDeviceId();
  const response = await fetch(`${API_BASE}/lists/${listId}/tasks/${taskId}/toggle`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed, deviceId })
  });
  return handleResponse(response);
}

async function updateTask(listId, taskId, text) {
  const deviceId = getDeviceId();
  const response = await fetch(`${API_BASE}/lists/${listId}/tasks/${taskId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, deviceId })
  });
  return handleResponse(response);
}

async function deleteTask(listId, taskId) {
  const deviceId = getDeviceId();
  const response = await fetch(`${API_BASE}/lists/${listId}/tasks/${taskId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId })
  });
  return handleResponse(response);
}

// FOTOS
async function uploadPhoto(listId, taskId, file) {
  const deviceId = getDeviceId();
  const formData = new FormData();
  formData.append('photo', file);
  formData.append('listId', listId);
  formData.append('taskId', taskId);
  formData.append('deviceId', deviceId);
  
  const response = await fetch(`${API_BASE}/photos`, {
    method: 'POST',
    body: formData
  });
  return handleResponse(response);
}

function getPhotoUrl(filename) {
  return `${API_BASE}/photos/${filename}`;
}

// Tratamento de erros global
function showError(message) {
  console.error('Erro:', message);
  // Usar alerta personalizado se disponível
  if (typeof showAlert === 'function') {
    showAlert(message, 'error');
  } else {
    alert(message);
  }
}

