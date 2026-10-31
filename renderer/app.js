'use strict';
const $ = selector => document.querySelector(selector);
let current = { ready: false, busy: false, gameRunning: false };
let saveTimer;
let completionTimer, completed = false;
let portalTimer;
let wasStartup = true;
const music = new window.LauncherMusic(new Audio('../assets/launcher-music.mp3'), $('#music-toggle'), localStorage);
function syncMusic() {
  music.setAllowed(!document.hidden && !current.gameRunning && current.startup?.visible === false);
}
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
const serverStatus = window.LauncherServerStatus($);
const renderMemory = window.LauncherMemory($);
const { reducedMotion, motion, animate, showDialog, closeDialog } = window.LauncherMotion();
function clearCompletion() {
  clearTimeout(completionTimer); completed = false;
}

function options() {
  return { mode: $('[name=mode]:checked').value, nickname: $('#nickname').value.trim(), ram: Number($('#ram').value), remember: $('#remember').checked, landscape: $('#landscape').checked, landscapeDirectory: dialogs.directory };
}
function settings(value) {
  renderMemory(current.memory);
  $(`[name=mode][value="${value.mode === 'microsoft' ? 'microsoft' : 'nickname'}"]`).checked = true;
  $('#nickname').value = value.nickname || '';
  $('#ram').value = value.ram;
  $('#remember').checked = value.remember;
  $('#landscape').checked = value.landscape === true;
  render();
}
function render() {
  syncMusic();
  const memoryReady = renderMemory(current.memory);
  const startup = current.startup || { visible: true, kind: 'checking' };
  if (wasStartup && !startup.visible && document.body.classList.contains('entered') && !reducedMotion.matches) document.body.classList.add('entering');
  wasStartup = Boolean(startup.visible);
  $('#startup-update').hidden = !startup.visible;
  $('header').inert = Boolean(startup.visible);
  $('main').inert = Boolean(startup.visible);
  $('#startup-close').disabled = Boolean(current.updating);
  $('#startup-title').textContent = startup.kind === 'installing' ? 'Aplicando atualização…' : startup.kind === 'downloading' ? 'Baixando atualização…' : startup.kind === 'ready' ? 'Preparando atualização…' : 'Verificando atualizações…';
  $('#startup-note').textContent = startup.kind === 'installing' ? 'O Averon já vai abrir de novo' : startup.kind === 'downloading' ? `${Math.round(startup.percent || 0)}% · Averon ${startup.version}` : 'Preparando sua próxima aventura';
  $('#startup-progress').hidden = startup.kind !== 'downloading';
  $('#startup-progress').value = Number(startup.percent) || 0;
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
  $('#ram').disabled ||= !memoryReady;
  $('#play').disabled ||= !memoryReady;
  $('#close').disabled = current.busy || updating;
  $('#landscape').disabled = current.busy || updating || current.gameRunning;
  $('#download-landscape').disabled = current.busy || updating || current.gameRunning;
  $('.progress-area').hidden = !current.busy && !completed;
  $('.progress-area').classList.toggle('finishing', completed);
  $('#status').textContent = completed ? 'Instalação concluída.' : current.text || '';
  if (completed) $('#progress').value = 100;
  else if (Number.isFinite(current.percent)) $('#progress').value = current.percent;
  else $('#progress').removeAttribute('value');
}
const dialogs = window.LauncherDialogs({ $, showDialog, closeDialog, settings, beforeOperation: () => clearTimeout(saveTimer), openLogs: () => window.hollow.openLogs() });
function message(text, title, logs) { dialogs.message(text, title, logs); }
function execute(operation) { return dialogs.execute(operation); }
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { if (!current.busy) window.hollow.save(options()).catch(() => {}); }, 300);
}
$('#minimize').addEventListener('click', () => window.hollow.minimize());
$('#startup-close').addEventListener('click', () => window.hollow.close());
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
$('#landscape').addEventListener('change', save);
$('#download-landscape').addEventListener('click', () => execute(() => window.hollow.landscape(options())));
for (const mode of document.querySelectorAll('[name=mode]')) mode.addEventListener('change', () => {
  render(); save();
  animate(options().mode === 'microsoft' ? $('#account-note') : $('#nickname'), [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }]);
});
$('#reset').addEventListener('click', () => { if (!current.busy) { clearTimeout(saveTimer); showDialog($('#confirm-reset')); } });
$('#cancel-reset').addEventListener('click', () => closeDialog($('#confirm-reset')));
$('#do-reset').addEventListener('click', () => { const selected = options(); closeDialog($('#confirm-reset')); execute(() => window.hollow.reset(selected)); });
document.addEventListener('visibilitychange', () => {
  syncMusic();
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
let lastLaunchFailure;
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
  if (value.launchFailure?.id && value.launchFailure.id !== lastLaunchFailure) {
    lastLaunchFailure = value.launchFailure.id;
    message(value.launchFailure.message, value.launchFailure.title || 'O Minecraft encerrou', true);
  }
});
window.hollowTestReady = window.hollow.state().then(async value => {
  current = value; settings(value.settings); await document.fonts.ready;
  document.body.classList.add('entered');
  if (!reducedMotion.matches) document.body.classList.add('entering');
  return true;
}).catch(() => { document.body.classList.add('entered'); message('Não consegui carregar as preferências. Abra o launcher novamente.'); return false; });
