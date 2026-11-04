'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { platformInfo } = require('../src/platform.cjs');
const { allowed } = require('../src/core/minecraft.cjs');
const { defaultPipes } = require('../src/discord-presence.cjs');

test('Linux uses its Java executable, native rules and classpath separator', () => {
  const linux = platformInfo('linux', 'x64');
  assert.equal(linux.javaName, 'java');
  assert.equal(linux.classpathSeparator, ':');
  assert.equal(linux.archiveName, 'java21.tar.gz');
  assert.equal(allowed({ rules: [{ action: 'allow', os: { name: 'linux' } }] }, '6.8.0', 'linux'), true);
  assert.equal(allowed({ rules: [{ action: 'allow', os: { name: 'windows' } }] }, '6.8.0', 'linux'), false);
});

test('Discord uses Unix sockets on Linux and named pipes on Windows', () => {
  assert.match(defaultPipes('win32')[0], /pipe/);
  const socket = defaultPipes('linux')[0];
  assert.equal(path.basename(socket), 'discord-ipc-0');
  assert.doesNotMatch(socket, /\\\\[.?]\\pipe/);
});
