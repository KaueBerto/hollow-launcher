const test = require('node:test');
const assert = require('node:assert/strict');
const { javaInvocation, startupFailure } = require('../src/java-invocation.cjs');
test('nickname launches Java directly with absolute module paths and Unicode arguments intact', () => {
  const game = 'C:\\Users\\João da Silva\\AppData\\Local\\HollowSMP\\game';
  const values = ['-cp', game+'\\libraries\\lib.jar;'+game+'\\versions\\1.21.1.jar', '-DlibraryDirectory='+game+'\\libraries', 'Main', '--gameDir', game, '--assetsDir', game+'\\assets', 'olá mundo'];
  const result = javaInvocation('C:\\Java\\java.exe', values, game);
  assert.equal(result.method, 'direct');
  assert.deepEqual(result.args, values);
});
test('Microsoft session stays in an argument file; long Windows command lines retain the safe fallback', () => {
  assert.equal(javaInvocation('java.exe',['--accessToken','private'],'C:\\Game',{account:true}).method,'argument-file');
  assert.equal(javaInvocation('java.exe',['x'.repeat(32000)],'C:\\Game').method,'argument-file');
  assert.deepEqual(javaInvocation('java.exe',['C:\\Other\\lib.jar'],'C:\\Game').args,['C:\\Other\\lib.jar']);
});
test('fast exits and real crashes provide a diagnostic, normal exits stay quiet', () => {
  assert.match(startupFailure(1,500,'Could not reserve enough space for 6291456KB object heap'),/reduzir a memória/);
  assert.match(startupFailure(1,500,'GLFW error 65542: driver does not support OpenGL'),/driver de vídeo/);
  assert.match(startupFailure(0,500,''),/logo após iniciar/);
  assert.equal(startupFailure(0,30000,''),null);
  assert.match(startupFailure(1,60000,'Caused by: BrokenModException'),/BrokenModException/);
});
