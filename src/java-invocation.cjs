'use strict';
function javaInvocation(java, args, game, { account = false } = {}) {
  // NeoForge compares absolute classpath and module-path locations. Preserve them.
  // spawn uses Windows Unicode arguments directly, including usernames with accents.
  // Use a conservative upper bound for Windows escaping, below CreateProcess's limit.
  const length = java.length + 3 + args.reduce((total, value) => total + value.length + 4 + (value.match(/[\\"]/g)?.length || 0) * 2, 0);
  // Microsoft tokens stay in the ACL-protected argument file, not the process command line.
  return !account && length < 30000 ? { method: 'direct', args: [...args] } : { method: 'argument-file', args: [...args] };
}
function startupFailure(code, elapsedMs, log) {
  if (code === 0 && elapsedMs >= 15000) return null;
  const tail = log.slice(-12000);
  let hint = '';
  if (/Could not reserve enough space|insufficient memory|Native memory allocation/i.test(tail)) hint = 'O Java não conseguiu reservar memória. Tente reduzir a memória do jogo no launcher.';
  else if (/GLFW error 65542|does not support OpenGL|Failed to create (?:window|context)|GLXBadFBConfig/i.test(tail)) hint = 'O Minecraft não conseguiu iniciar os gráficos. Confira o driver de vídeo e o suporte a OpenGL.';
  else if (/UnsupportedClassVersionError/i.test(tail)) hint = 'Uma biblioteca ou mod exige outra versão do Java. O log informa qual arquivo falhou.';
  else if (/duplicate mods|DuplicateModsFoundException|Missing.*mandatory|missing.*required|Mod loading error/i.test(tail)) hint = 'O carregamento dos mods falhou. O log informa o mod ou a dependência envolvidos.';
  else {
    const lines = tail.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    hint = lines.filter(line => /Exception|Error:|Caused by:|Could not |Cannot |FAILED|Unrecognized .*option/i.test(line)).slice(-3).join('\n').slice(-700) || 'O processo do Minecraft encerrou antes de continuar. O log contém os detalhes disponíveis.';
  }
  return `O Minecraft encerrou${elapsedMs < 15000 ? ' logo após iniciar' : ''} (código ${code ?? 'indisponível'}).\n\n${hint}\n\nClique em Abrir logs e envie o arquivo game-launch.log para identificar a causa. Não é necessário baixar tudo novamente.`;
}
module.exports = { javaInvocation, startupFailure };
