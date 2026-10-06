'use strict';
const $ = selector => document.querySelector(selector);
let current = { ready: false, busy: false, gameRunning: false };
let saveTimer;

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
  $('#official').hidden = !microsoft || current.busy;
  $('#play').textContent = current.busy ? 'PREPARANDO…' : current.gameRunning ? 'JOGO ABERTO' : !current.ready ? 'INSTALAR E JOGAR' : microsoft ? 'ABRIR MINECRAFT' : 'JOGAR';
  for (const element of document.querySelectorAll('#reset, #play, #nickname, #ram, [name=mode]')) element.disabled = current.busy || element.id === 'play' && current.gameRunning;
  $('#close').disabled = current.busy;
  $('#ram-value').textContent = `${$('#ram').value} GB`;
  $('.progress-area').hidden = !current.busy;
  $('#status').textContent = current.text || '';
  if (Number.isFinite(current.percent)) $('#progress').value = current.percent;
  else $('#progress').removeAttribute('value');
}
function message(text, title = 'Hollow SMP') {
  $('#message-title').textContent = title;
  $('#message-text').textContent = text;
  if (!$('#message').open) $('#message').showModal();
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
$('#official').addEventListener('click', () => window.hollow.downloadOfficial());
$('#play-form').addEventListener('submit', event => { event.preventDefault(); if (!current.busy) execute(() => window.hollow.play(options())); });
$('#ram').addEventListener('input', () => { render(); save(); });
$('#nickname').addEventListener('input', save);
$('#remember').addEventListener('change', save);
for (const mode of document.querySelectorAll('[name=mode]')) mode.addEventListener('change', () => { render(); save(); });
$('#reset').addEventListener('click', () => { if (!current.busy) { clearTimeout(saveTimer); $('#confirm-reset').showModal(); } });
$('#cancel-reset').addEventListener('click', () => $('#confirm-reset').close());
$('#do-reset').addEventListener('click', () => { $('#confirm-reset').close(); execute(() => window.hollow.reset()); });
$('#message-ok').addEventListener('click', () => $('#message').close());
document.addEventListener('visibilitychange', () => document.body.classList.toggle('paused', document.hidden));
window.hollow.onState(value => {
  if (value.gameRunning && !current.gameRunning && $('#message').open) $('#message').close();
  current = { ...current, ...value };
  render();
});
window.hollowTestReady = window.hollow.state().then(value => { current = value; settings(value.settings); return true; }).catch(() => { message('Não consegui carregar as preferências. Abra o launcher novamente.'); return false; });
