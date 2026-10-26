'use strict';

window.LauncherDialogs = function createDialogs({ $, showDialog, closeDialog, settings, beforeOperation, openLogs }) {
  let directory;
  let pendingOperation;

  function message(text, title = 'AVERON SMP', logs = false) {
    $('#message-open-logs').hidden = !logs;
    $('#message-title').textContent = title;
    $('#message-text').textContent = text;
    showDialog($('#message'));
  }

  async function execute(operation) {
    beforeOperation();
    try {
      const result = await operation();
      if (!result.ok && result.code === 'LANDSCAPE_SELECTION_REQUIRED') {
        const select = $('#landscape-server');
        select.replaceChildren();
        for (const choice of result.choices) {
          const option = document.createElement('option');
          option.value = choice.directory;
          option.textContent = `${choice.name} · ${choice.address}`;
          select.append(option);
        }
        pendingOperation = operation;
        showDialog($('#landscape-select'));
      } else if (!result.ok) message(result.error);
      else {
        if (result.settings) settings(result.settings);
        if (result.message) message(result.message);
      }
    } catch { message('Não foi possível concluir. Feche e abra o launcher para tentar novamente.'); }
  }

  $('#message-ok').addEventListener('click', () => closeDialog($('#message')));
  $('#message-open-logs').addEventListener('click', () => execute(openLogs));
  $('#landscape-cancel').addEventListener('click', () => {
    pendingOperation = null;
    closeDialog($('#landscape-select'));
  });
  $('#landscape-confirm').addEventListener('click', () => {
    if (!pendingOperation || !$('#landscape-server').value) return;
    directory = $('#landscape-server').value;
    const operation = pendingOperation;
    pendingOperation = null;
    $('#landscape-select').close();
    execute(operation);
  });
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      if (dialog.id === 'landscape-select') pendingOperation = null;
      closeDialog(dialog);
    });
  }

  return { message, execute, get directory() { return directory; } };
};
