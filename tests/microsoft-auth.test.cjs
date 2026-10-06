'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { MicrosoftAuth } = require('../src/microsoft-auth.cjs');
const { Engine, MC, VERSION, writeJson } = require('../src/engine.cjs');
const { redactedLog } = require('../src/redacted-log.cjs');
const ID = '12345678-1234-1234-1234-123456789abc';
const PROFILE = { name: 'HollowTeste', id: '123456789abcdef0123456789abcdef0' };
const storage = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from([...value].reverse().join('')), decryptString: value => [...value.toString()].reverse().join('') };
async function fixture(operation) {
  const base = path.resolve(__dirname, '../dist/auth-tests');
  await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, 'case-'));
  try { await operation(root); } finally { await fs.rm(root, { recursive: true, force: true }); }
}
function fetcher(check = () => {}) {
  return async (url, options) => {
    check(url, options);
    const data = url.endsWith('/token') ? { access_token: 'microsoft-secret', refresh_token: 'refresh-secret' }
      : url.includes('user.auth.xboxlive') ? { Token: 'xbox-secret' }
        : url.includes('xsts.auth') ? { Token: 'xsts-secret', DisplayClaims: { xui: [{ uhs: 'userhash', xid: '123' }] } }
          : url.endsWith('login_with_xbox') ? { access_token: 'minecraft-secret', expires_in: 86400 }
            : url.endsWith('/entitlements/mcstore') ? { items: [{ name: 'game_minecraft' }] } : PROFILE;
    return { ok: true, json: async () => data };
  };
}
function browser(onAuthorize = () => {}) {
  return async value => {
    const url = new URL(value); onAuthorize(url);
    const redirect = new URL(url.searchParams.get('redirect_uri'));
    redirect.search = new URLSearchParams({ state: 'wrong-state', code: 'injected' });
    assert.equal((await fetch(redirect)).status, 400);
    redirect.search = new URLSearchParams({ state: url.searchParams.get('state'), code: 'valid-code' });
    assert.equal((await fetch(redirect)).status, 200);
  };
}
test('Microsoft PKCE rejeita state inválido, troca tokens e guarda apenas refresh cifrado', async () => fixture(async root => {
  let challenge, calls = 0;
  const auth = new MicrosoftAuth({ root, clientId: ID, storage, openBrowser: browser(url => {
    assert.equal(url.origin, 'https://login.microsoftonline.com');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    challenge = url.searchParams.get('code_challenge');
  }), fetcher: fetcher((url, options) => {
    calls++;
    if (url.endsWith('/token')) {
      const body = new URLSearchParams(options.body);
      assert.equal(body.get('code'), 'valid-code');
      assert.equal(crypto.createHash('sha256').update(body.get('code_verifier')).digest('base64url'), challenge);
      assert.equal(body.has('client_secret'), false);
    }
    if (url.endsWith('/minecraft/profile')) assert.equal(options.headers.Authorization, 'Bearer minecraft-secret');
  }) });
  const account = await auth.authenticate();
  assert.equal(account.accessToken, 'minecraft-secret');
  assert.equal(account.name, PROFILE.name); assert.equal(calls, 6);
  const file = await fs.readFile(auth.vault, 'utf8');
  for (const secret of ['minecraft-secret', 'refresh-secret', 'microsoft-secret', 'xsts-secret']) assert.equal(file.includes(secret), false);
  assert.deepEqual(await auth.publicAccount(), { name: PROFILE.name });
  await auth.authenticate(); assert.equal(calls, 6, 'reuses live session');
  await auth.logout(); await assert.rejects(fs.access(auth.vault)); assert.equal(await auth.publicAccount(), null);
}));
test('sessão salva renova sem abrir navegador e invalid_grant pede novo login', async () => fixture(async root => {
  await writeJson(path.join(root, 'microsoft-account.json'), { clientId: ID, name: PROFILE.name, refresh: storage.encryptString('old-refresh').toString('base64') });
  let browsers = 0, refreshes = 0;
  const auth = new MicrosoftAuth({ root, clientId: ID, storage, openBrowser: browser(() => browsers++), fetcher: async (url, options) => {
    if (url.endsWith('/token') && new URLSearchParams(options.body).get('grant_type') === 'refresh_token') {
      refreshes++;
      if (refreshes === 2) return { ok: false, status: 400, json: async () => ({ error: 'invalid_grant', error_description: 'LEAK-ME' }) };
    }
    return fetcher()(url, options);
  } });
  await auth.authenticate(); assert.equal(browsers, 0); assert.equal(refreshes, 1);
  auth.session = null; await auth.authenticate(); assert.equal(browsers, 1); assert.equal(refreshes, 2);
}));
test('configuração ausente não abre navegador, cancelamento encerra callback e limpa estado', async () => fixture(async root => {
  const auth = new MicrosoftAuth({ root, clientId: '', storage, openBrowser: () => { throw new Error('must not open'); } });
  await assert.rejects(auth.authenticate(), /aprovar/);
  auth.clientId = ID;
  let callback;
  auth.openBrowser = async value => { callback = new URL(value).searchParams.get('redirect_uri'); auth.cancel(); };
  await assert.rejects(auth.authenticate(), /cancelado/);
  assert.equal(auth.controller, null);
  await assert.rejects(fetch(callback), /fetch failed/);
}));
test('API recusada não vaza resposta sensível e não persiste sessão', async () => fixture(async root => {
  const auth = new MicrosoftAuth({ root, clientId: ID, storage, openBrowser: browser(), fetcher: async (url, options) => url.endsWith('login_with_xbox')
    ? { ok: false, status: 403, json: async () => ({ error_description: 'private-secret' }) }
    : fetcher()(url, options) });
  await assert.rejects(auth.authenticate(), error => error.message.includes('aprovado') && !error.stack.includes('private-secret'));
  await assert.rejects(fs.access(auth.vault));
}));
test('sem criptografia disponível não grava tokens no disco', async () => fixture(async root => {
  const auth = new MicrosoftAuth({ root, clientId: ID, storage: { isEncryptionAvailable: () => false }, openBrowser: browser(), fetcher: fetcher() });
  await auth.authenticate(); await assert.rejects(fs.access(auth.vault));
}));
test('conta sem acesso ao Java é recusada antes de salvar sessão', async () => fixture(async root => {
  const auth = new MicrosoftAuth({ root, clientId: ID, storage, openBrowser: browser(), fetcher: async (url, options) => url.endsWith('/entitlements/mcstore')
    ? { ok: true, json: async () => ({ items: [] }) } : fetcher()(url, options) });
  await assert.rejects(auth.authenticate(), /acesso ativo/);
  assert.equal(auth.session, undefined); await assert.rejects(fs.access(auth.vault));
}));
test('argumentos online usam UUID, token e tipo msa, offline mantém token 0', async () => fixture(async root => {
  const engine = new Engine({ root });
  const args = { jvm: [], game: ['--username', '${auth_player_name}', '--uuid', '${auth_uuid}', '--accessToken', '${auth_access_token}', '--userType', '${user_type}'] };
  await writeJson(engine.versionFile(MC), { libraries: [], assetIndex: { id: '17' }, arguments: args });
  await writeJson(engine.versionFile(VERSION), { libraries: [], arguments: { jvm: [], game: [] }, mainClass: 'Main' });
  const account = { ...PROFILE, accessToken: 'secret', clientId: ID, expires: Date.now() + 60000 };
  const online = await engine.buildArguments(PROFILE.name, 6, account);
  assert.equal(online[online.indexOf('--uuid') + 1], PROFILE.id);
  assert.equal(online[online.indexOf('--accessToken') + 1], 'secret');
  assert.equal(online[online.indexOf('--userType') + 1], 'msa');
  const offline = await engine.buildArguments(PROFILE.name, 6);
  assert.equal(offline[offline.indexOf('--accessToken') + 1], '0');
  await assert.rejects(engine.buildArguments(PROFILE.name, 6, { ...account, expires: 0 }), /expirada/);
}));
test('logs ocultam token dividido entre blocos de saída', async () => {
  const stream = redactedLog('minecraft-secret');
  let output = ''; stream.on('data', chunk => output += chunk);
  const finished = new Promise(resolve => stream.once('end', resolve));
  stream.write('Start minecraft-sec'); stream.write('ret end\n'); stream.end('minecraft-secret');
  await finished; assert.equal(output.includes('minecraft-secret'), false); assert.equal(output, 'Start [sessão protegida] end\n[sessão protegida]');
});
