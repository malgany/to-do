// Sistema de polling para sincronização
'use strict';

let pollingInterval = null;
let lastUpdatedAt = null;
let currentListId = null;
let isPolling = false;
let abortController = null;

// Iniciar polling para uma lista
function startPolling(listId, onUpdate) {
  // Se já está fazendo polling, parar primeiro
  if (isPolling) {
    stopPolling();
  }
  
  currentListId = listId;
  isPolling = true;
  lastUpdatedAt = null;
  
  console.log(`🔄 Iniciando polling para lista: ${listId}`);
  
  // Fazer primeira verificação imediatamente
  checkForUpdates(onUpdate);
  
  // Configurar intervalo de 5 segundos
  pollingInterval = setInterval(() => {
    checkForUpdates(onUpdate);
  }, 5000);
  
  // Pausar polling quando aba estiver em background
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

// Parar polling
function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  
  isPolling = false;
  currentListId = null;
  lastUpdatedAt = null;
  
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  
  console.log('⏸️ Polling parado');
}

// Verificar atualizações
async function checkForUpdates(onUpdate) {
  if (!currentListId || !isPolling) return;
  
  // Cancelar request anterior se ainda estiver em andamento
  if (abortController) {
    abortController.abort();
  }
  
  abortController = new AbortController();
  
  try {
    const params = lastUpdatedAt ? `?since=${encodeURIComponent(lastUpdatedAt)}` : '';
    const response = await fetch(`/api/lists/${currentListId}${params}`, {
      signal: abortController.signal
    });
    
    if (!response.ok) {
      // Se lista não existe mais (404), notificar
      if (response.status === 404) {
        console.log('⚠️ Lista não encontrada (deletada)');
        onUpdate({ deleted: true });
        stopPolling();
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    // Se não houve mudanças, não fazer nada
    if (data.unchanged) {
      return;
    }
    
    // Se houve mudanças, atualizar
    if (data.updatedAt && data.updatedAt !== lastUpdatedAt) {
      console.log(`✅ Atualizações detectadas: ${data.updatedAt}`);
      lastUpdatedAt = data.updatedAt;
      onUpdate(data);
    }
  } catch (error) {
    // Ignorar erros de abort (são intencionais)
    if (error.name === 'AbortError') {
      return;
    }
    
    console.error('❌ Erro ao verificar atualizações:', error);
    // Continuar tentando no próximo intervalo
  } finally {
    abortController = null;
  }
}

// Lidar com visibilidade da página
function handleVisibilityChange() {
  if (document.hidden) {
    console.log('👁️ Aba em background - pausando polling');
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  } else {
    console.log('👁️ Aba em foreground - retomando polling');
    if (isPolling && !pollingInterval) {
      // Verificar imediatamente ao voltar
      checkForUpdates(() => {});
      // Reiniciar intervalo
      pollingInterval = setInterval(() => {
        checkForUpdates(() => {});
      }, 5000);
    }
  }
}

// Forçar verificação imediata (útil após fazer mudanças locais)
function forceCheck(onUpdate) {
  if (isPolling) {
    checkForUpdates(onUpdate);
  }
}

// Resetar timestamp (forçar próxima verificação buscar tudo)
function resetTimestamp() {
  lastUpdatedAt = null;
}

