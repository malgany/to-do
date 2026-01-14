const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const storage = require('../utils/storage');

// GET /api/lists - Obter todas as listas
router.get('/', (req, res) => {
  try {
    const data = storage.readLists();
    res.json(data.lists);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar listas' });
  }
});

// GET /api/lists/:id - Obter lista específica
router.get('/:id', (req, res) => {
  try {
    const list = storage.getListById(req.params.id);
    if (!list) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }
    
    // Suporte para polling - retornar apenas se houver mudanças
    const since = req.query.since;
    if (since && list.updatedAt && list.updatedAt <= since) {
      return res.json({ unchanged: true, updatedAt: list.updatedAt });
    }
    
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar lista' });
  }
});

// POST /api/lists - Criar nova lista
router.post('/', async (req, res) => {
  try {
    const { name, icon, color, ownerId } = req.body;
    
    if (!name || !ownerId) {
      return res.status(400).json({ error: 'Nome e ownerId são obrigatórios' });
    }
    
    const newList = {
      id: uuidv4(),
      name,
      icon: icon || 'list',
      color: color || 'blue',
      ownerId,
      createdAt: new Date().toISOString(),
      tasks: []
    };
    
    const createdList = await storage.createList(newList);
    res.status(201).json(createdList);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar lista' });
  }
});

// PUT /api/lists/:id - Atualizar lista
router.put('/:id', async (req, res) => {
  try {
    const { name, icon, color, deviceId } = req.body;
    const list = storage.getListById(req.params.id);
    
    if (!list) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }
    
    // Validar ownership
    if (list.ownerId !== deviceId) {
      return res.status(403).json({ error: 'Sem permissão para editar esta lista' });
    }
    
    const updates = {};
    if (name) updates.name = name;
    if (icon) updates.icon = icon;
    if (color) updates.color = color;
    
    const updatedList = await storage.updateList(req.params.id, updates);
    res.json(updatedList);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar lista' });
  }
});

// DELETE /api/lists/:id - Deletar lista
router.delete('/:id', async (req, res) => {
  try {
    const { deviceId } = req.body;
    const list = storage.getListById(req.params.id);
    
    if (!list) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }
    
    // Validar ownership
    if (list.ownerId !== deviceId) {
      return res.status(403).json({ error: 'Sem permissão para deletar esta lista' });
    }
    
    await storage.deleteList(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao deletar lista' });
  }
});

module.exports = router;

