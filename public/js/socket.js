// Cliente WebSocket usando Socket.IO
'use strict';

let socket = null;

function initSocket() {
  if (!socket) {
    socket = io();
    
    socket.on('connect', () => {
      console.log('✅ Conectado ao WebSocket');
    });
    
    socket.on('disconnect', () => {
      console.log('❌ Desconectado do WebSocket');
    });
    
    socket.on('connect_error', (error) => {
      console.error('Erro de conexão:', error);
    });
  }
  return socket;
}

// Entrar na sala de uma lista
function joinList(listId) {
  const socket = initSocket();
  socket.emit('join-list', listId);
  console.log(`Entrou na lista: ${listId}`);
}

// Sair da sala de uma lista
function leaveList(listId) {
  const socket = initSocket();
  socket.emit('leave-list', listId);
  console.log(`Saiu da lista: ${listId}`);
}

// Emitir evento de tarefa concluída
function emitTaskCompleted(listId, taskId, completed, deviceId) {
  const socket = initSocket();
  socket.emit('task-completed', { listId, taskId, completed, deviceId });
}

// Emitir evento de tarefa adicionada
function emitTaskAdded(listId, task) {
  const socket = initSocket();
  socket.emit('task-added', { listId, task });
}

// Emitir evento de tarefa deletada
function emitTaskDeleted(listId, taskId) {
  const socket = initSocket();
  socket.emit('task-deleted', { listId, taskId });
}

// Emitir evento de tarefa editada
function emitTaskEdited(listId, taskId, text) {
  const socket = initSocket();
  socket.emit('task-edited', { listId, taskId, text });
}

// Emitir evento de foto adicionada
function emitPhotoAdded(listId, taskId, filename) {
  const socket = initSocket();
  socket.emit('photo-added', { listId, taskId, filename });
}

// Registrar listeners para eventos recebidos
function onTaskUpdated(callback) {
  const socket = initSocket();
  socket.on('task-updated', callback);
}

function onTaskAdded(callback) {
  const socket = initSocket();
  socket.on('task-added', callback);
}

function onTaskDeleted(callback) {
  const socket = initSocket();
  socket.on('task-deleted', callback);
}

function onTaskEdited(callback) {
  const socket = initSocket();
  socket.on('task-edited', callback);
}

function onPhotoAdded(callback) {
  const socket = initSocket();
  socket.on('photo-added', callback);
}

