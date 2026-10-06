'use strict';
const $ = selector => document.querySelector(selector);
let current = { ready: false, busy: false, gameRunning: false };
let saveTimer;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const motion = new Map();
let completionTimer, completed = false;

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
  const microsoft = options().mode === 'microsoft';
  $('#nickname').hidden = microsoft;
  $('#account-note').hidden = !microsoft;
  $('#remember').disabled = current.busy || microsoft;
  $('#account-note').textContent = current.account?.name || 'Conta Microsoft';
  $('#logout').hidden = !microsoft || !current.account || current.busy || current.gameRunning;
  $('#cancel-login').hidden = !current.authPending;
  $('#play').textContent = current.authPending ? 'AGUARDANDO LOGIN…' : current.busy ? 'PREPARANDO…' : current.gameRunning ? 'JOGO ABERTO' : microsoft && !current.account ? 'ENTRAR E JOGAR' : !current.ready ? 'INSTALAR E JOGAR' : 'JOGAR';
  for (const element of document.querySelectorAll('#reset, #play, #nickname, #ram, [name=mode]')) element.disabled = current.busy || element.id === 'play' && current.gameRunning;
  $('#close').disabled = current.busy;
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
$('#close').addEventListener('click', () => window.hollow.close());
$('#logout').addEventListener('click', () => execute(() => window.hollow.logout()));
$('#cancel-login').addEventListener('click', () => window.hollow.cancelLogin());
$('#play-form').addEventListener('submit', event => { event.preventDefault(); if (!current.busy) execute(() => window.hollow.play(options())); });
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
