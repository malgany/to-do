const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const storage = require('../utils/storage');

// POST /api/lists/:listId/tasks - Adicionar tarefa
router.post('/:listId/tasks', async (req, res) => {
  try {
    const { text, deviceId } = req.body;
    const list = storage.getListById(req.params.listId);
    
    if (!list) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }
    
    // Validar ownership
    if (list.ownerId !== deviceId) {
      return res.status(403).json({ error: 'Sem permissão para adicionar tarefas' });
    }
    
    if (!text || text.trim() === '') {
      return res.status(400).json({ error: 'Texto da tarefa é obrigatório' });
    }
    
    const newTask = {
      id: uuidv4(),
      text: text.trim(),
      completed: false,
      createdAt: new Date().toISOString(),
      completedAt: null,
      completedBy: null,
      photos: []
    };
    
    const createdTask = await storage.addTask(req.params.listId, newTask);
    res.status(201).json(createdTask);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao adicionar tarefa' });
  }
});

// PUT /api/lists/:listId/tasks/:taskId/toggle - Toggle complete (permitido para visitantes)
router.put('/:listId/tasks/:taskId/toggle', async (req, res) => {
  try {
    const { completed, deviceId } = req.body;
    const list = storage.getListById(req.params.listId);
    
    if (!list) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }
    
    const updates = {
      completed,
      completedAt: completed ? new Date().toISOString() : null,
      completedBy: completed ? deviceId : null
    };
    
    const updatedTask = await storage.updateTask(req.params.listId, req.params.taskId, updates);
    
    if (!updatedTask) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }
    
    res.json(updatedTask);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar tarefa' });
  }
});

// PUT /api/lists/:listId/tasks/:taskId - Atualizar tarefa completa
router.put('/:listId/tasks/:taskId', async (req, res) => {
  try {
    const { text, deviceId } = req.body;
    const list = storage.getListById(req.params.listId);
    
    if (!list) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }
    
    // Validar ownership
    if (list.ownerId !== deviceId) {
      return res.status(403).json({ error: 'Sem permissão para editar tarefas' });
    }
    
    const updates = {};
    if (text) updates.text = text.trim();
    
    const updatedTask = await storage.updateTask(req.params.listId, req.params.taskId, updates);
    
    if (!updatedTask) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }
    
    res.json(updatedTask);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar tarefa' });
  }
});

// DELETE /api/lists/:listId/tasks/:taskId - Deletar tarefa
router.delete('/:listId/tasks/:taskId', async (req, res) => {
  try {
    const { deviceId } = req.body;
    const list = storage.getListById(req.params.listId);
    
    if (!list) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }
    
    // Validar ownership
    if (list.ownerId !== deviceId) {
      return res.status(403).json({ error: 'Sem permissão para deletar tarefas' });
    }
    
    const success = await storage.deleteTask(req.params.listId, req.params.taskId);
    
    if (!success) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao deletar tarefa' });
  }
});

module.exports = router;

