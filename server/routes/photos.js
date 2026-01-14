const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const storage = require('../utils/storage');

// Configurar multer para upload de fotos
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, storage.PHOTOS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage: multerStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não suportado. Use JPG, PNG, GIF ou WebP.'));
    }
  }
});

// POST /api/photos - Upload de foto
router.post('/', upload.single('photo'), (req, res) => {
  try {
    const { listId, taskId, deviceId } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma foto foi enviada' });
    }
    
    // Verificar se a lista existe e se o usuário tem permissão
    const list = storage.getListById(listId);
    if (!list) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }
    
    if (list.ownerId !== deviceId) {
      return res.status(403).json({ error: 'Sem permissão para adicionar fotos' });
    }
    
    // Adicionar foto à tarefa
    const task = list.tasks.find(t => t.id === taskId);
    if (!task) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }
    
    task.photos.push(req.file.filename);
    storage.updateTask(listId, taskId, { photos: task.photos });
    
    res.status(201).json({
      filename: req.file.filename,
      url: `/api/photos/${req.file.filename}`
    });
  } catch (error) {
    console.error('Erro ao fazer upload de foto:', error);
    res.status(500).json({ error: 'Erro ao fazer upload da foto' });
  }
});

// GET /api/photos/:filename - Servir foto
router.get('/:filename', (req, res) => {
  try {
    const filepath = path.join(storage.PHOTOS_DIR, req.params.filename);
    res.sendFile(filepath);
  } catch (error) {
    res.status(404).json({ error: 'Foto não encontrada' });
  }
});

module.exports = router;

