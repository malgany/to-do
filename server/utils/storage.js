const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const LISTS_FILE = path.join(DATA_DIR, 'lists.json');
const PHOTOS_DIR = path.join(DATA_DIR, 'photos');

// Lock simples para prevenir race conditions
let writeLock = Promise.resolve();

// Garantir que os diretórios existem
function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PHOTOS_DIR)) {
    fs.mkdirSync(PHOTOS_DIR, { recursive: true });
  }
  if (!fs.existsSync(LISTS_FILE)) {
    fs.writeFileSync(LISTS_FILE, JSON.stringify({ lists: [] }, null, 2));
  }
}

// Executar operação com lock
async function withLock(operation) {
  const release = writeLock.then(() => operation());
  writeLock = release.catch(() => {});
  return release;
}

// Ler todas as listas
function readLists() {
  ensureDirectories();
  const data = fs.readFileSync(LISTS_FILE, 'utf8');
  return JSON.parse(data);
}

// Escrever todas as listas
function writeLists(data) {
  ensureDirectories();
  fs.writeFileSync(LISTS_FILE, JSON.stringify(data, null, 2));
}

// Obter lista por ID
function getListById(listId) {
  const data = readLists();
  return data.lists.find(list => list.id === listId);
}

// Criar nova lista
async function createList(list) {
  return withLock(() => {
    const data = readLists();
    const now = new Date().toISOString();
    const newList = {
      ...list,
      createdAt: list.createdAt || now,
      updatedAt: now
    };
    data.lists.push(newList);
    writeLists(data);
    return newList;
  });
}

// Atualizar lista
async function updateList(listId, updates) {
  return withLock(() => {
    const data = readLists();
    const index = data.lists.findIndex(list => list.id === listId);
    if (index === -1) return null;
    
    data.lists[index] = { 
      ...data.lists[index], 
      ...updates,
      updatedAt: new Date().toISOString()
    };
    writeLists(data);
    return data.lists[index];
  });
}

// Deletar lista
async function deleteList(listId) {
  return withLock(() => {
    const data = readLists();
    const index = data.lists.findIndex(list => list.id === listId);
    if (index === -1) return false;
    
    data.lists.splice(index, 1);
    writeLists(data);
    return true;
  });
}

// Adicionar tarefa a uma lista
async function addTask(listId, task) {
  return withLock(() => {
    const data = readLists();
    const list = data.lists.find(l => l.id === listId);
    if (!list) return null;
    
    const now = new Date().toISOString();
    const newTask = {
      ...task,
      createdAt: task.createdAt || now,
      updatedAt: now
    };
    
    list.tasks.push(newTask);
    list.updatedAt = now;
    writeLists(data);
    return newTask;
  });
}

// Atualizar tarefa
async function updateTask(listId, taskId, updates) {
  return withLock(() => {
    const data = readLists();
    const list = data.lists.find(l => l.id === listId);
    if (!list) return null;
    
    const taskIndex = list.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return null;
    
    const now = new Date().toISOString();
    list.tasks[taskIndex] = { 
      ...list.tasks[taskIndex], 
      ...updates,
      updatedAt: now
    };
    list.updatedAt = now;
    writeLists(data);
    return list.tasks[taskIndex];
  });
}

// Deletar tarefa
async function deleteTask(listId, taskId) {
  return withLock(() => {
    const data = readLists();
    const list = data.lists.find(l => l.id === listId);
    if (!list) return false;
    
    const taskIndex = list.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return false;
    
    list.tasks.splice(taskIndex, 1);
    list.updatedAt = new Date().toISOString();
    writeLists(data);
    return true;
  });
}

module.exports = {
  readLists,
  writeLists,
  getListById,
  createList,
  updateList,
  deleteList,
  addTask,
  updateTask,
  deleteTask,
  PHOTOS_DIR
};

