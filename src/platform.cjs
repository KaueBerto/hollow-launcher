'use strict';

const os = require('node:os');
const path = require('node:path');

function platformInfo(platform = process.platform, arch = process.arch) {
  const supported = ['win32', 'linux', 'test'].includes(platform) ? arch === 'x64' : platform === 'darwin' && ['x64', 'arm64'].includes(arch);
  if (!supported) {
    throw new Error('Este launcher exige Windows, Linux ou macOS de 64 bits.');
  }
  const windows = platform === 'win32';
  const mac = platform === 'darwin';
  return {
    platform,
    arch,
    windows,
    mac,
    mojangName: windows ? 'windows' : mac ? 'osx' : 'linux',
    adoptiumName: windows ? 'windows' : mac ? 'mac' : 'linux',
    adoptiumArchitecture: arch === 'arm64' ? 'aarch64' : 'x64',
    javaName: windows ? 'java.exe' : 'java',
    javawName: windows ? 'javaw.exe' : 'java',
    archiveName: windows ? 'java21.zip' : 'java21.tar.gz',
    extractedJavaHome: mac ? ['Contents', 'Home'] : [],
    classpathSeparator: windows ? ';' : ':',
    defaultRoot: windows
      ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'HollowSMP')
      : mac
        ? path.join(os.homedir(), 'Library', 'Application Support', 'averon-launcher')
        : path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'averon-launcher'),
  };
}

module.exports = { platformInfo };
