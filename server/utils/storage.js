const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const LISTS_FILE = path.join(DATA_DIR, 'lists.json');
const PHOTOS_DIR = path.join(DATA_DIR, 'photos');

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
function createList(list) {
  const data = readLists();
  data.lists.push(list);
  writeLists(data);
  return list;
}

// Atualizar lista
function updateList(listId, updates) {
  const data = readLists();
  const index = data.lists.findIndex(list => list.id === listId);
  if (index === -1) return null;
  
  data.lists[index] = { ...data.lists[index], ...updates };
  writeLists(data);
  return data.lists[index];
}

// Deletar lista
function deleteList(listId) {
  const data = readLists();
  const index = data.lists.findIndex(list => list.id === listId);
  if (index === -1) return false;
  
  data.lists.splice(index, 1);
  writeLists(data);
  return true;
}

// Adicionar tarefa a uma lista
function addTask(listId, task) {
  const data = readLists();
  const list = data.lists.find(l => l.id === listId);
  if (!list) return null;
  
  list.tasks.push(task);
  writeLists(data);
  return task;
}

// Atualizar tarefa
function updateTask(listId, taskId, updates) {
  const data = readLists();
  const list = data.lists.find(l => l.id === listId);
  if (!list) return null;
  
  const taskIndex = list.tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) return null;
  
  list.tasks[taskIndex] = { ...list.tasks[taskIndex], ...updates };
  writeLists(data);
  return list.tasks[taskIndex];
}

// Deletar tarefa
function deleteTask(listId, taskId) {
  const data = readLists();
  const list = data.lists.find(l => l.id === listId);
  if (!list) return false;
  
  const taskIndex = list.tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) return false;
  
  list.tasks.splice(taskIndex, 1);
  writeLists(data);
  return true;
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

