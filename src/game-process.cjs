'use strict';

function alive(child) {
  return Boolean(child && child.exitCode === null && child.signalCode == null);
}

// A helper can inherit Java's stdout/stderr and delay `close` after the game exits.
// Finish local cleanup before releasing the installation for another launch.
function trackGameProcess(engine, child, { cleanup = async () => {}, finishLog = async () => {} } = {}) {
  engine.gameProcess = child;
  let finished;
  const finish = code => {
    if (finished) return finished;
    finished = (async () => {
      try { await cleanup(); await finishLog(code); }
      finally {
        if (engine.gameProcess === child) {
          engine.gameProcess = null;
          engine.report({ text: code === 0 ? 'Minecraft fechado.' : 'O Minecraft encerrou. Confira game-launch.log.', gameRunning: false });
        }
      }
    })();
    finished.catch(() => {});
    return finished;
  };
  child.once('exit', finish);
  child.once('close', finish); // Spawn failures need a fallback; an old close never changes a new game.
  return finish;
}

function relevantJavaPids(rows, { game, java }) {
  if (!Array.isArray(rows)) throw new Error('Não consegui acompanhar o Minecraft.');
  const result = [];
  for (const row of rows) {
    if (!Number.isInteger(row.pid) || row.pid <= 0) throw new Error('Não consegui acompanhar o Minecraft.');
    const executable = String(row.executable || '').toLowerCase();
    const command = String(row.command || '');
    if (executable !== java.toLowerCase() && !command.toLowerCase().includes(game.toLowerCase())) continue;
    // This companion displays diagnostics; it does not run the game or apply pack updates.
    if (/(?:^|\s)dev\.kostromdan\.mods\.crash_assistant\.app\.class_loading\.Boot(?:\s|$)/.test(command)) continue;
    result.push(row.pid);
  }
  return result;
}

module.exports = { alive, trackGameProcess, relevantJavaPids };
