// modal.js - Sistema de alertas e confirmações personalizados
'use strict';

/**
 * Mostra um alerta personalizado
 * @param {string} message - Mensagem a ser exibida
 * @param {string} type - Tipo do alerta: 'info', 'success', 'warning', 'error'
 * @returns {Promise<void>}
 */
function showAlert(message, type = 'info') {
  return new Promise((resolve) => {
    // Remover modais existentes
    removeExistingModals();
    
    // Cores por tipo
    const colors = {
      info: {
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        text: 'text-blue-600 dark:text-blue-400',
        icon: 'info'
      },
      success: {
        bg: 'bg-green-100 dark:bg-green-900/30',
        text: 'text-green-600 dark:text-green-400',
        icon: 'check_circle'
      },
      warning: {
        bg: 'bg-orange-100 dark:bg-orange-900/30',
        text: 'text-orange-600 dark:text-orange-400',
        icon: 'warning'
      },
      error: {
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-600 dark:text-red-400',
        icon: 'error'
      }
    };
    
    const color = colors[type] || colors.info;
    
    // Criar modal
    const modal = document.createElement('div');
    modal.className = 'custom-modal fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fadeIn';
    modal.style.animation = 'fadeIn 0.2s ease-out';
    
    modal.innerHTML = `
      <div class="bg-background-light dark:bg-background-dark rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-slideUp" style="animation: slideUp 0.3s ease-out;">
        <div class="flex items-start space-x-4 mb-6">
          <div class="p-3 ${color.bg} rounded-xl ${color.text} flex-shrink-0">
            <span class="material-icons-round text-2xl">${color.icon}</span>
          </div>
          <div class="flex-1 pt-1">
            <p class="text-text-main-light dark:text-text-main-dark leading-relaxed">${escapeHtml(message)}</p>
          </div>
        </div>
        <button class="modal-ok-btn w-full py-3 px-4 rounded-xl bg-primary hover:bg-primary-dark text-white font-semibold transition-all active:scale-95">
          OK
        </button>
      </div>
    `;
    
    // Adicionar estilos de animação
    addAnimationStyles();
    
    // Event listeners
    const okBtn = modal.querySelector('.modal-ok-btn');
    
    const closeModal = () => {
      modal.style.animation = 'fadeOut 0.2s ease-out';
      setTimeout(() => {
        modal.remove();
        resolve();
      }, 200);
    };
    
    okBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    
    // Adicionar ao DOM
    document.body.appendChild(modal);
    okBtn.focus();
  });
}

/**
 * Mostra uma confirmação personalizada
 * @param {string} message - Mensagem a ser exibida
 * @param {Object} options - Opções de configuração
 * @returns {Promise<boolean>} - true se confirmado, false se cancelado
 */
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    // Remover modais existentes
    removeExistingModals();
    
    const {
      title = 'Confirmação',
      confirmText = 'Confirmar',
      cancelText = 'Cancelar',
      type = 'warning'
    } = options;
    
    // Cores por tipo
    const colors = {
      warning: {
        bg: 'bg-orange-100 dark:bg-orange-900/30',
        text: 'text-orange-600 dark:text-orange-400',
        btnBg: 'bg-orange-500 hover:bg-orange-600',
        icon: 'warning'
      },
      danger: {
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-600 dark:text-red-400',
        btnBg: 'bg-red-500 hover:bg-red-600',
        icon: 'error'
      },
      info: {
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        text: 'text-blue-600 dark:text-blue-400',
        btnBg: 'bg-primary hover:bg-primary-dark',
        icon: 'help'
      }
    };
    
    const color = colors[type] || colors.warning;
    
    // Criar modal
    const modal = document.createElement('div');
    modal.className = 'custom-modal fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fadeIn';
    modal.style.animation = 'fadeIn 0.2s ease-out';
    
    modal.innerHTML = `
      <div class="bg-background-light dark:bg-background-dark rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-slideUp" style="animation: slideUp 0.3s ease-out;">
        <div class="flex items-start space-x-4 mb-6">
          <div class="p-3 ${color.bg} rounded-xl ${color.text} flex-shrink-0">
            <span class="material-icons-round text-2xl">${color.icon}</span>
          </div>
          <div class="flex-1">
            <h3 class="text-lg font-bold text-text-main-light dark:text-text-main-dark mb-2">${escapeHtml(title)}</h3>
            <p class="text-text-sub-light dark:text-text-sub-dark leading-relaxed whitespace-pre-line">${escapeHtml(message)}</p>
          </div>
        </div>
        <div class="flex gap-3">
          <button class="modal-cancel-btn flex-1 py-3 px-4 rounded-xl border border-border-light dark:border-border-dark text-text-main-light dark:text-text-main-dark font-semibold hover:bg-surface-light dark:hover:bg-surface-dark transition-all active:scale-95">
            ${escapeHtml(cancelText)}
          </button>
          <button class="modal-confirm-btn flex-1 py-3 px-4 rounded-xl ${color.btnBg} text-white font-semibold transition-all active:scale-95">
            ${escapeHtml(confirmText)}
          </button>
        </div>
      </div>
    `;
    
    // Adicionar estilos de animação
    addAnimationStyles();
    
    // Event listeners
    const confirmBtn = modal.querySelector('.modal-confirm-btn');
    const cancelBtn = modal.querySelector('.modal-cancel-btn');
    
    const closeModal = (result) => {
      modal.style.animation = 'fadeOut 0.2s ease-out';
      setTimeout(() => {
        modal.remove();
        resolve(result);
      }, 200);
    };
    
    confirmBtn.addEventListener('click', () => closeModal(true));
    cancelBtn.addEventListener('click', () => closeModal(false));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(false);
    });
    
    // Adicionar ao DOM
    document.body.appendChild(modal);
    cancelBtn.focus();
  });
}

/**
 * Remove todos os modais personalizados existentes
 */
function removeExistingModals() {
  const existingModals = document.querySelectorAll('.custom-modal');
  existingModals.forEach(modal => modal.remove());
}

/**
 * Adiciona estilos de animação ao documento
 */
function addAnimationStyles() {
  if (!document.getElementById('modal-animations')) {
    const style = document.createElement('style');
    style.id = 'modal-animations';
    style.textContent = `
      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      
      @keyframes fadeOut {
        from {
          opacity: 1;
        }
        to {
          opacity: 0;
        }
      }
      
      @keyframes slideUp {
        from {
          transform: translateY(20px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * Escapa HTML para prevenir XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Sobrescrever alert e confirm nativos (opcional)
// window.alert = (msg) => showAlert(msg, 'info');
// window.confirm = (msg) => showConfirm(msg);

