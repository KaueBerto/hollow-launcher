'use strict';

const os = require('node:os');
const path = require('node:path');

function platformInfo(platform = process.platform, arch = process.arch) {
  if (!['win32', 'linux', 'test'].includes(platform) || arch !== 'x64') {
    throw new Error('Este launcher exige Windows ou Linux de 64 bits.');
  }
  const windows = platform === 'win32';
  return {
    platform,
    windows,
    mojangName: windows ? 'windows' : 'linux',
    adoptiumName: windows ? 'windows' : 'linux',
    javaName: windows ? 'java.exe' : 'java',
    javawName: windows ? 'javaw.exe' : 'java',
    archiveName: windows ? 'java21.zip' : 'java21.tar.gz',
    classpathSeparator: windows ? ';' : ':',
    defaultRoot: windows
      ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'HollowSMP')
      : path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'averon-launcher'),
  };
}

module.exports = { platformInfo };
