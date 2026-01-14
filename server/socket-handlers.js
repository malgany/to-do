module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);

    // Cliente entra na "sala" da lista
    socket.on('join-list', (listId) => {
      socket.join(`list-${listId}`);
      console.log(`Cliente ${socket.id} entrou na lista ${listId}`);
    });

    // Cliente sai da sala
    socket.on('leave-list', (listId) => {
      socket.leave(`list-${listId}`);
      console.log(`Cliente ${socket.id} saiu da lista ${listId}`);
    });

    // Evento: Tarefa marcada como concluída/não concluída
    socket.on('task-completed', ({ listId, taskId, completed, deviceId }) => {
      console.log(`Task ${taskId} completed: ${completed} by ${deviceId}`);
      // Broadcast para todos na sala, exceto o emissor
      socket.to(`list-${listId}`).emit('task-updated', {
        listId,
        taskId,
        completed,
        completedBy: deviceId,
        completedAt: completed ? new Date().toISOString() : null
      });
    });

    // Evento: Nova tarefa adicionada
    socket.on('task-added', ({ listId, task }) => {
      console.log(`Nova tarefa adicionada na lista ${listId}:`, task.text);
      socket.to(`list-${listId}`).emit('task-added', { listId, task });
    });

    // Evento: Tarefa deletada
    socket.on('task-deleted', ({ listId, taskId }) => {
      console.log(`Tarefa ${taskId} deletada da lista ${listId}`);
      socket.to(`list-${listId}`).emit('task-deleted', { listId, taskId });
    });

    // Evento: Tarefa editada (texto)
    socket.on('task-edited', ({ listId, taskId, text }) => {
      console.log(`Tarefa ${taskId} editada na lista ${listId}`);
      socket.to(`list-${listId}`).emit('task-edited', { listId, taskId, text });
    });

    // Evento: Foto adicionada
    socket.on('photo-added', ({ listId, taskId, filename }) => {
      console.log(`Foto adicionada à tarefa ${taskId}`);
      socket.to(`list-${listId}`).emit('photo-added', { listId, taskId, filename });
    });

    socket.on('disconnect', () => {
      console.log('Cliente desconectado:', socket.id);
    });
  });
};

