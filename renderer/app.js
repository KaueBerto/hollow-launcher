'use strict';
const $ = selector => document.querySelector(selector);
let current = { ready: false, busy: false, gameRunning: false };
let saveTimer;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const motion = new Map();
let completionTimer, completed = false;
let portalTimer;
// A fixed, sparse particle field keeps the atmosphere calm and reproducible.
for (let i = 0; i < 18; i++) {
  const particle = document.createElement('span'); particle.className = 'end-particle';
  particle.style.setProperty('--x', `${(i * 37 + 9) % 100}%`);
  particle.style.setProperty('--size', `${i % 3 + 2}px`);
  particle.style.setProperty('--duration', `${19 + i % 7 * 2}s`);
  particle.style.setProperty('--delay', `${-i * 2.7}s`);
  particle.style.setProperty('--opacity', `${.15 + i % 4 * .07}`);
  particle.style.setProperty('--drift', `${i % 2 ? -24 : 28}px`);
  $('.particles').append(particle);
}
function serverStatus(value = {}) {
  const panel = $('.server-status'); panel.dataset.state = value.kind || 'checking';
  $('#server-label').textContent = value.kind === 'online' ? 'Servidor online' : value.kind === 'unknown' ? 'Sem resposta do servidor' : 'Consultando servidor…';
  const count = Number.isInteger(value.players) && Number.isInteger(value.maxPlayers) ? `${value.players}/${value.maxPlayers} jogadores` : 'Hollow SMP';
  $('#server-details').textContent = value.kind === 'online' ? `${count}${Number.isInteger(value.ping) ? ` · ${value.ping} ms` : ''}` : value.kind === 'unknown' ? 'Você pode tentar entrar normalmente.' : 'Hollow SMP';
  $('#refresh-server').disabled = Boolean(value.checking);
}

function animate(element, frames, duration = 240) {
  motion.get(element)?.cancel();
  motion.delete(element);
  if (reducedMotion.matches || document.hidden) return;
  const animation = element.animate(frames, { duration, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  motion.set(element, animation);
  animation.finished.then(() => { if (motion.get(element) === animation) motion.delete(element); }).catch(() => {});
}
function showDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}
function closeDialog(dialog) {
  if (!dialog.open || dialog.dataset.closing) return;
  if (reducedMotion.matches || document.hidden) { dialog.close(); return; }
  dialog.dataset.closing = 'true';
  dialog.inert = true;
  animate(dialog, [{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(6px) scale(.99)' }], 150);
  const animation = motion.get(dialog);
  const finish = () => { delete dialog.dataset.closing; dialog.inert = false; dialog.close(); };
  animation ? animation.finished.then(finish, finish) : finish();
}
function clearCompletion() {
  clearTimeout(completionTimer); completed = false;
}

function options() {
  return { mode: $('[name=mode]:checked').value, nickname: $('#nickname').value.trim(), ram: Number($('#ram').value), remember: $('#remember').checked };
}
function settings(value) {
  $(`[name=mode][value="${value.mode === 'microsoft' ? 'microsoft' : 'nickname'}"]`).checked = true;
  $('#nickname').value = value.nickname || '';
  $('#ram').value = value.ram;
  $('#remember').checked = value.remember;
  render();
}
function render() {
  const update = current.update || {};
  const updating = Boolean(current.updating);
  const updateButton = $('#launcher-update');
  updateButton.textContent = update.kind === 'ready' ? 'Atualizar e reiniciar' : update.kind === 'downloading' ? `Atualizando ${Math.round(update.percent || 0)}%` : update.kind === 'checking' ? 'Verificando…' : update.kind === 'error' ? 'Tentar atualização' : `v${current.version || ''}`;
  updateButton.disabled = updating || ['checking', 'downloading', 'disabled'].includes(update.kind) || update.kind === 'ready' && (current.busy || current.gameRunning);
  updateButton.title = update.kind === 'ready' && current.gameRunning ? 'Feche o Minecraft para atualizar' : update.kind === 'error' ? 'Não foi possível verificar. Você pode jogar normalmente e tentar novamente.' : 'Verificar atualização do launcher';
  const microsoft = options().mode === 'microsoft';
  $('.brand').classList.toggle('preparing', current.busy && !current.authPending);
  serverStatus(current.server);
  $('#nickname').hidden = microsoft;
  $('#account-note').hidden = !microsoft;
  $('#remember').disabled = current.busy || microsoft;
  $('#account-note').textContent = current.account?.name || 'Conta Microsoft';
  $('#logout').hidden = !microsoft || !current.account || current.busy || current.gameRunning;
  $('#cancel-login').hidden = !current.authPending;
  $('#play').textContent = current.authPending ? 'AGUARDANDO LOGIN…' : current.busy ? 'PREPARANDO…' : current.gameRunning ? 'JOGO ABERTO' : microsoft && !current.account ? 'ENTRAR E JOGAR' : !current.ready ? 'INSTALAR E JOGAR' : 'JOGAR';
  for (const element of document.querySelectorAll('#reset, #play, #nickname, #ram, [name=mode]')) element.disabled = updating || current.busy || element.id === 'play' && current.gameRunning;
  $('#close').disabled = current.busy || updating;
  $('#ram-value').textContent = `${$('#ram').value} GB`;
  $('.progress-area').hidden = !current.busy && !completed;
  $('.progress-area').classList.toggle('finishing', completed);
  $('#status').textContent = completed ? 'Instalação concluída.' : current.text || '';
  if (completed) $('#progress').value = 100;
  else if (Number.isFinite(current.percent)) $('#progress').value = current.percent;
  else $('#progress').removeAttribute('value');
}
function message(text, title = 'Hollow SMP') {
  $('#message-title').textContent = title;
  $('#message-text').textContent = text;
  showDialog($('#message'));
}
async function execute(operation) {
  clearTimeout(saveTimer);
  try {
    const result = await operation();
    if (!result.ok) message(result.error);
    else { if (result.settings) settings(result.settings); if (result.message) message(result.message); }
  } catch { message('Não foi possível concluir. Feche e abra o launcher para tentar novamente.'); }
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { if (!current.busy) window.hollow.save(options()).catch(() => {}); }, 300);
}
$('#minimize').addEventListener('click', () => window.hollow.minimize());
$('#launcher-update').addEventListener('click', () => execute(() => current.update?.kind === 'ready' ? window.hollow.installUpdate() : window.hollow.checkUpdate()));
$('#close').addEventListener('click', () => window.hollow.close());
$('#logout').addEventListener('click', () => execute(() => window.hollow.logout()));
$('#cancel-login').addEventListener('click', () => window.hollow.cancelLogin());
$('#play-form').addEventListener('submit', event => {
  event.preventDefault(); if (current.busy || current.gameRunning) return;
  clearTimeout(portalTimer); $('.brand').classList.add('responding');
  portalTimer = setTimeout(() => $('.brand').classList.remove('responding'), 1000);
  execute(() => window.hollow.play(options()));
});
$('#refresh-server').addEventListener('click', async () => {
  $('#refresh-server').disabled = true;
  try { await window.hollow.refreshServer(); }
  catch { serverStatus({ kind: 'unknown' }); }
  finally { $('#refresh-server').disabled = false; }
});
$('#ram').addEventListener('input', () => { render(); save(); });
$('#nickname').addEventListener('input', save);
$('#remember').addEventListener('change', save);
for (const mode of document.querySelectorAll('[name=mode]')) mode.addEventListener('change', () => {
  render(); save();
  animate(options().mode === 'microsoft' ? $('#account-note') : $('#nickname'), [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }]);
});
$('#reset').addEventListener('click', () => { if (!current.busy) { clearTimeout(saveTimer); showDialog($('#confirm-reset')); } });
$('#cancel-reset').addEventListener('click', () => closeDialog($('#confirm-reset')));
$('#do-reset').addEventListener('click', () => { closeDialog($('#confirm-reset')); execute(() => window.hollow.reset()); });
$('#message-ok').addEventListener('click', () => closeDialog($('#message')));
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog); });
document.addEventListener('visibilitychange', () => {
  document.body.classList.toggle('paused', document.hidden);
  for (const [element, animation] of motion) {
    if (document.hidden && element.tagName === 'DIALOG') animation.finish();
    else if (document.hidden) animation.pause();
    else animation.play();
  }
});
$('.brand').addEventListener('animationend', event => { if (event.animationName === 'brand-enter') document.body.classList.remove('entering'); });
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) { document.body.classList.remove('entering'); for (const animation of motion.values()) animation.finish(); }
});
window.hollow.onState(value => {
  if (value.gameRunning && !current.gameRunning && $('#message').open) $('#message').close();
  const wasBusy = current.busy, wasReady = current.ready;
  current = { ...current, ...value };
  if (current.gameRunning || current.busy && !wasBusy) clearCompletion();
  if (!current.gameRunning && (value.text === 'Instalação concluída.' && value.percent === 100 || !completed && wasBusy && !wasReady && current.ready)) {
    completed = true;
    animate($('.progress-area'), [{ opacity: .4, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }]);
    clearTimeout(completionTimer);
    completionTimer = setTimeout(() => { completed = false; render(); }, 1800);
  }
  render();
});
window.hollowTestReady = window.hollow.state().then(async value => {
  current = value; settings(value.settings); await document.fonts.ready;
  document.body.classList.add('entered');
  if (!reducedMotion.matches) document.body.classList.add('entering');
  return true;
}).catch(() => { document.body.classList.add('entered'); message('Não consegui carregar as preferências. Abra o launcher novamente.'); return false; });
