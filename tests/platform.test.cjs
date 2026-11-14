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

test('macOS supports Intel and Apple Silicon Java and Mojang rules', () => {
  const intel = platformInfo('darwin', 'x64');
  const apple = platformInfo('darwin', 'arm64');
  assert.equal(intel.mojangName, 'osx');
  assert.equal(intel.adoptiumName, 'mac');
  assert.equal(intel.adoptiumArchitecture, 'x64');
  assert.equal(apple.adoptiumArchitecture, 'aarch64');
  assert.deepEqual(apple.extractedJavaHome, ['Contents', 'Home']);
  assert.equal(apple.classpathSeparator, ':');
  assert.match(apple.defaultRoot, /Library[\\/]Application Support[\\/]averon-launcher$/);
  assert.equal(allowed({ rules: [{ action: 'allow', os: { name: 'osx', arch: 'x86_64' } }] }, '24.0', 'darwin', 'x64'), true);
  assert.equal(allowed({ rules: [{ action: 'allow', os: { name: 'osx', arch: 'arm64' } }] }, '24.0', 'darwin', 'arm64'), true);
  assert.equal(allowed({ rules: [{ action: 'allow', os: { name: 'windows' } }] }, '24.0', 'darwin', 'arm64'), false);
  assert.equal(path.basename(defaultPipes('darwin')[0]), 'discord-ipc-0');
});

test('unsupported platform and architecture combinations are rejected', () => {
  assert.throws(() => platformInfo('linux', 'arm64'), /64 bits/);
  assert.throws(() => platformInfo('darwin', 'ia32'), /64 bits/);
});
