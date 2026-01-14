const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, '../public')));

// Routes da API
app.use('/api/lists', require('./routes/lists'));
app.use('/api/lists', require('./routes/tasks'));
app.use('/api/photos', require('./routes/photos'));

// Socket.IO handlers
require('./socket-handlers')(io);

// Fallback para SPA (redirecionar todas as rotas não-API para index.html)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  }
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
  console.log(`📁 Servindo arquivos de: ${path.join(__dirname, '../public')}`);
});

