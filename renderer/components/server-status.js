'use strict';
window.LauncherServerStatus = function createServerStatus($) {
  function serverStatus(value = {}) {
    const panel = $('.server-status'); panel.dataset.state = value.kind || 'checking';
    $('#server-label').textContent = value.kind === 'online' ? 'Servidor online' : value.kind === 'unknown' ? 'Sem resposta do servidor' : 'Consultando servidor…';
    const count = Number.isInteger(value.players) && Number.isInteger(value.maxPlayers) ? `${value.players}/${value.maxPlayers} jogadores` : 'AVERON SMP';
    $('#server-details').textContent = value.kind === 'online' ? `${count}${Number.isInteger(value.ping) ? ` · ${value.ping} ms` : ''}` : value.kind === 'unknown' ? 'Você pode tentar entrar normalmente.' : 'AVERON SMP';
    $('#refresh-server').disabled = Boolean(value.checking);
  }
  
  return serverStatus;
};
