# To-Do List PWA com Sincronização em Tempo Real

Uma aplicação de lista de tarefas moderna e responsiva construída com Node.js, Socket.IO e PWA (Progressive Web App). Permite criar listas, adicionar tarefas, compartilhar listas via link e sincronizar em tempo real entre múltiplos dispositivos.

## 🚀 Funcionalidades

- ✅ **Criar e gerenciar listas** com ícones e cores personalizadas
- ✅ **Adicionar, editar e marcar tarefas** como concluídas
- ✅ **Compartilhar listas via link** - visitantes podem marcar tarefas como concluídas
- ✅ **Sincronização em tempo real** via WebSockets
- ✅ **Upload de fotos** para tarefas (apenas donos das listas)
- ✅ **PWA instalável** - funciona offline
- ✅ **Dark mode automático** - segue preferência do sistema
- ✅ **Sem necessidade de login** - identificação por deviceId

## 📋 Requisitos

- Node.js 14+ 
- npm ou yarn

## 🔧 Instalação

1. Clone o repositório:
```bash
git clone <repo-url>
cd to-do
```

2. Instale as dependências:
```bash
npm install
```

3. Inicie o servidor:
```bash
npm start
```

Ou para desenvolvimento com auto-reload:
```bash
npm run dev
```

4. Acesse no navegador:
```
http://localhost:3000
```

## 📱 Como Usar

### Tela Principal
- Visualize todas as suas listas e listas compartilhadas
- Clique no botão **+** para criar uma nova lista
- Escolha um nome, ícone e cor para sua lista
- Clique em uma lista para ver suas tarefas

### Visualização de Lista
- **Adicionar tarefa**: Digite no campo inferior e pressione Enter ou clique em ↑
- **Marcar como concluída**: Clique no checkbox ao lado da tarefa
- **Ver detalhes**: Clique na tarefa para ver fotos e mais informações
- **Compartilhar** (apenas dono): Clique no ícone de compartilhar no header

### Compartilhamento
1. Dono da lista clica em "Compartilhar"
2. Link é copiado automaticamente ou compartilhado via API nativa
3. Visitantes podem acessar o link e **apenas marcar tarefas como concluídas**
4. Mudanças são sincronizadas em tempo real para todos os dispositivos conectados

### Detalhes da Tarefa
- **Adicionar fotos**: Clique em "Tirar Foto" ou "Galeria"
- **Ver fotos**: Clique em uma foto para visualizá-la em tela cheia
- **Marcar tarefa**: Use o checkbox no topo

## 🏗️ Arquitetura

```
to-do/
├── server/
│   ├── index.js              # Servidor Express + Socket.IO
│   ├── routes/
│   │   ├── lists.js          # Endpoints de listas
│   │   ├── tasks.js          # Endpoints de tarefas
│   │   └── photos.js         # Upload e servir fotos
│   ├── socket-handlers.js    # Handlers do WebSocket
│   └── utils/
│       └── storage.js        # Persistência em JSON
├── public/
│   ├── index.html            # Tela principal
│   ├── list.html             # Visualização de lista
│   ├── detail.html           # Detalhes da tarefa
│   ├── js/
│   │   ├── main.js
│   │   ├── list.js
│   │   ├── detail.js
│   │   ├── api.js            # Chamadas à API
│   │   ├── socket.js         # Cliente WebSocket
│   │   └── device.js         # Gerenciamento de deviceId
│   ├── sw.js                 # Service Worker
│   └── manifest.json         # Manifest do PWA
├── data/
│   ├── lists.json            # Dados das listas
│   └── photos/               # Fotos enviadas
└── package.json
```

## 🔐 Controle de Permissões

### Dono da Lista (`deviceId === ownerId`)
- ✅ Adicionar, editar, deletar tarefas
- ✅ Deletar a lista
- ✅ Adicionar/remover fotos
- ✅ Compartilhar lista

### Visitante (via link compartilhado)
- ✅ Marcar/desmarcar tarefas como concluídas
- ❌ Não pode adicionar ou deletar tarefas
- ❌ Não pode adicionar fotos
- ✅ Recebe atualizações em tempo real

## 🌐 API Endpoints

### Listas
- `GET /api/lists` - Obter todas as listas
- `GET /api/lists/:id` - Obter lista específica
- `POST /api/lists` - Criar nova lista
- `PUT /api/lists/:id` - Atualizar lista
- `DELETE /api/lists/:id` - Deletar lista

### Tarefas
- `POST /api/lists/:listId/tasks` - Adicionar tarefa
- `PUT /api/lists/:listId/tasks/:taskId/toggle` - Toggle concluída
- `PUT /api/lists/:listId/tasks/:taskId` - Atualizar tarefa
- `DELETE /api/lists/:listId/tasks/:taskId` - Deletar tarefa

### Fotos
- `POST /api/photos` - Upload de foto
- `GET /api/photos/:filename` - Servir foto

## 🔄 WebSocket Events

### Cliente → Servidor
- `join-list` - Entrar na sala da lista
- `leave-list` - Sair da sala
- `task-completed` - Tarefa marcada como concluída
- `task-added` - Nova tarefa adicionada
- `task-deleted` - Tarefa deletada
- `photo-added` - Foto adicionada

### Servidor → Cliente
- `task-updated` - Tarefa atualizada (broadcast)
- `task-added` - Tarefa adicionada (broadcast)
- `task-deleted` - Tarefa deletada (broadcast)
- `photo-added` - Foto adicionada (broadcast)

## 📦 Estrutura de Dados

### Lista
```json
{
  "id": "uuid",
  "name": "Mercado",
  "icon": "shopping_cart",
  "color": "green",
  "ownerId": "device-uuid-123",
  "createdAt": "2026-01-10T12:00:00Z",
  "tasks": [...]
}
```

### Tarefa
```json
{
  "id": "uuid",
  "text": "Leite e ovos",
  "completed": false,
  "createdAt": "2026-01-10T12:05:00Z",
  "completedAt": null,
  "completedBy": null,
  "photos": []
}
```

## 🎨 Tecnologias

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: HTML5, TailwindCSS, Vanilla JavaScript
- **Persistência**: JSON (file system)
- **Upload**: Multer
- **PWA**: Service Worker, Manifest
- **Real-time**: Socket.IO (WebSockets)

## 📱 PWA

A aplicação é instalável como PWA:

1. Abra no Chrome/Edge/Safari
2. Clique em "Instalar" ou "Adicionar à tela inicial"
3. Use como app nativo!

**Funciona offline** graças ao Service Worker que cacheia:
- Arquivos estáticos (HTML, CSS, JS)
- Fontes e ícones
- Fotos já carregadas

## 🔒 Segurança

⚠️ **Importante**: Esta aplicação é para uso pessoal/familiar.

- **Sem autenticação real** - deviceId é apenas UX
- **Links são públicos** - qualquer pessoa com o link pode acessar
- **Dados não criptografados** - armazenados em JSON plano
- **Fotos públicas** - se souber o filename pode acessar

Para uso em produção, considere adicionar:
- Autenticação real (JWT, OAuth)
- Criptografia de dados
- Rate limiting
- Validações mais rigorosas

## 🛠️ Desenvolvimento

### Estrutura do Código
- `server/` - Backend Node.js
- `public/` - Frontend estático
- `data/` - Dados persistidos (gitignored)

### Debugging
- Logs do servidor: Console do Node.js
- Logs do cliente: DevTools do navegador
- WebSocket: Aba Network → WS

### Hot Reload
Use `nodemon` para desenvolvimento:
```bash
npm run dev
```

## 📝 Licença

Este projeto é open-source e está disponível sob a licença MIT.

## 👨‍💻 Autor

Desenvolvido por Tony

---

**Aproveite sua To-Do List! 🎉**

