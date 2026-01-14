const express = require('express');
const path = require('path');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, '../public')));

// Routes da API
app.use('/api/lists', require('./routes/lists'));
app.use('/api/lists', require('./routes/tasks'));
app.use('/api/photos', require('./routes/photos'));

// Fallback para SPA (redirecionar todas as rotas não-API para index.html)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
  console.log(`📁 Servindo arquivos de: ${path.join(__dirname, '../public')}`);
  console.log(`🔄 Sistema de polling ativo (5s)`);
});

