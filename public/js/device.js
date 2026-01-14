// Sistema de identificação de dispositivo
// Gera e armazena um UUID único para cada dispositivo
'use strict';

function getDeviceId() {
  let deviceId = localStorage.getItem('deviceId');
  if (!deviceId) {
    // Gerar novo UUID
    deviceId = 'device-' + crypto.randomUUID();
    localStorage.setItem('deviceId', deviceId);
    console.log('Novo deviceId gerado:', deviceId);
  }
  return deviceId;
}

// Verificar se é dono de uma lista
function isOwner(list) {
  const deviceId = getDeviceId();
  return list.ownerId === deviceId;
}

// Export para uso em outros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getDeviceId, isOwner };
}

