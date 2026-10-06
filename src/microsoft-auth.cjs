'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { writeJson, readJson } = require('./engine.cjs');
const defaults = require('./microsoft-config.cjs');
const BASE = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const SCOPE = 'XboxLive.signin offline_access';
const validId = value => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value);

// Credentials stay in the main process; only the public Minecraft name reaches IPC.
class MicrosoftAuth {
  constructor({ root, storage, openBrowser, report = () => {}, fetcher = fetch, clientId }) {
    Object.assign(this, { root, storage, openBrowser, report, fetcher, clientId });
    this.vault = path.join(root, 'microsoft-account.json');
  }
  async configuredId() {
    let value = this.clientId ?? process.env.HOLLOW_MICROSOFT_CLIENT_ID ?? defaults.clientId;
    if (!value) {
      try { value = (await readJson(path.join(this.root, 'microsoft-app.json'))).clientId; }
      catch (error) { if (error.code !== 'ENOENT') throw new Error('A configuração Microsoft é inválida.'); }
    }
    if (!validId(value)) throw new Error('O login Microsoft direto ainda precisa ser ativado pelo responsável do Hollow. Falta cadastrar e aprovar o aplicativo na API do Minecraft.');
    return value;
  }
  async publicAccount() {
    if (this.session) return { name: this.session.name };
    try {
      const value = await readJson(this.vault);
      if (value.clientId === await this.configuredId() && /^[A-Za-z0-9_]{3,16}$/.test(value.name)) return { name: value.name };
    } catch {}
    return null;
  }
  cancel() { this.controller?.abort(); }
  async logout() {
    this.cancel(); this.session = null;
    await fs.rm(this.vault, { force: true });
  }
  async request(url, body, form = false, bearer) {
    let response;
    try {
      response = await this.fetcher(url, {
        method: body ? 'POST' : 'GET', redirect: 'error',
        signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(30000)]),
        headers: { ...(body ? { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' } : {}), ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
        body: body ? (form ? new URLSearchParams(body).toString() : JSON.stringify(body)) : undefined,
      });
    } catch {
      if (this.controller.signal.aborted) throw new Error('Login cancelado.');
      throw new Error('Não consegui acessar a Microsoft/Minecraft. Confira a conexão e tente novamente.');
    }
    let data;
    try { data = await response.json(); } catch { throw new Error('O serviço de login enviou uma resposta inválida.'); }
    if (!response.ok) {
      // Never include remote error descriptions, request bodies or tokens in errors/logs.
      const error = new Error(response.status === 403 && url.includes('api.minecraftservices.com/authentication')
        ? 'O cadastro do Hollow ainda não foi aprovado para a API do Minecraft. Contate o responsável do launcher.'
        : url.includes('/minecraft/profile') && response.status === 404
          ? 'Esta conta não possui um perfil Minecraft Java. Confira a compra ou assinatura e crie seu perfil no site do Minecraft.'
          : data.XErr === 2148916238 ? 'Esta conta precisa ser configurada em uma família Microsoft antes de entrar no Xbox.'
            : data.XErr === 2148916233 ? 'Crie o perfil Xbox da sua conta no site do Xbox e tente novamente.'
              : 'Não foi possível autenticar a conta Microsoft. Confira a conta e tente novamente.');
      error.reauthenticate = ['invalid_grant', 'interaction_required'].includes(data.error);
      throw error;
    }
    return data;
  }
  async browserLogin(clientId) {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const state = crypto.randomBytes(32).toString('hex');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const signal = this.controller.signal;
    let timer, abort;
    const server = http.createServer();
    server.requestTimeout = 10000; server.headersTimeout = 10000;
    try {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      const redirect = `http://localhost:${server.address().port}`;
      const callback = new Promise((resolve, reject) => {
        abort = () => reject(new Error('Login cancelado.'));
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) { abort(); return; }
        timer = setTimeout(() => reject(new Error('O login expirou. Clique em Jogar para tentar novamente.')), 300000);
        server.on('request', (request, response) => {
          const url = new URL(request.url, redirect);
          response.setHeader('Content-Type', 'text/plain; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
          response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
          if (request.method !== 'GET' || url.pathname !== '/' || request.headers.host !== `localhost:${server.address().port}` || url.searchParams.get('state') !== state) {
            response.writeHead(400); response.end('Resposta de login inválida. Volte ao Hollow.'); return;
          }
          if (url.searchParams.has('error')) { response.end('Login não autorizado. Volte ao Hollow.'); reject(new Error('Login não autorizado.')); return; }
          const code = url.searchParams.get('code');
          if (!code || code.length > 16384) { response.writeHead(400); response.end('Código inválido.'); return; }
          response.end('Autorização recebida. Volte ao Hollow Launcher para continuar.');
          resolve(code);
        });
      });
      // Attach handlers immediately, including when opening the browser fails.
      callback.catch(() => {});
      const url = new URL(`${BASE}/authorize`);
      url.search = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirect, response_mode: 'query', scope: SCOPE, state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' }).toString();
      this.report({ authPending: true, text: 'Autorize sua conta no navegador. Depois, volte ao Hollow.' });
      await this.openBrowser(url.href);
      return await this.request(`${BASE}/token`, { client_id: clientId, grant_type: 'authorization_code', code: await callback, redirect_uri: redirect, code_verifier: verifier, scope: SCOPE }, true);
    } finally {
      clearTimeout(timer); if (abort) signal.removeEventListener('abort', abort);
      server.close(); server.closeAllConnections();
      this.report({ authPending: false });
    }
  }
  async authenticate() {
    if (this.controller) throw new Error('Já existe um login em andamento.');
    const clientId = await this.configuredId();
    if (this.session?.clientId === clientId && this.session.expires > Date.now() + 120000) return this.session;
    this.controller = new AbortController();
    try {
      let tokens;
      if (this.storage.isEncryptionAvailable()) {
        let cached;
        try { cached = await readJson(this.vault); } catch {}
        if (cached?.clientId === clientId && cached.refresh) {
          let refresh;
          try { refresh = this.storage.decryptString(Buffer.from(cached.refresh, 'base64')); } catch { await fs.rm(this.vault, { force: true }); }
          if (refresh) {
            try { tokens = await this.request(`${BASE}/token`, { client_id: clientId, grant_type: 'refresh_token', refresh_token: refresh, scope: SCOPE }, true); }
            catch (error) { if (!error.reauthenticate) throw error; await fs.rm(this.vault, { force: true }); }
          }
        }
      }
      tokens ||= await this.browserLogin(clientId);
      if (!tokens.access_token) throw new Error('A Microsoft não retornou uma autorização válida.');
      this.report({ text: 'Verificando sua conta Minecraft…' });
      const xbox = await this.request('https://user.auth.xboxlive.com/user/authenticate', { Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${tokens.access_token}` }, RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT' });
      if (!xbox.Token) throw new Error('Não consegui autorizar o perfil Xbox.');
      const xsts = await this.request('https://xsts.auth.xboxlive.com/xsts/authorize', { Properties: { SandboxId: 'RETAIL', UserTokens: [xbox.Token] }, RelyingParty: 'rp://api.minecraftservices.com/', TokenType: 'JWT' });
      const uhs = xsts.DisplayClaims?.xui?.[0]?.uhs;
      if (!xsts.Token || !uhs) throw new Error('Não consegui autorizar o perfil Xbox.');
      const minecraft = await this.request('https://api.minecraftservices.com/authentication/login_with_xbox', { identityToken: `XBL3.0 x=${uhs};${xsts.Token}` });
      if (!minecraft.access_token || !Number.isFinite(minecraft.expires_in) || minecraft.expires_in <= 0) throw new Error('O Minecraft não retornou uma sessão válida.');
      const entitlements = await this.request('https://api.minecraftservices.com/entitlements/mcstore', null, false, minecraft.access_token);
      if (!entitlements.items?.some(item => ['game_minecraft', 'product_minecraft'].includes(item.name))) throw new Error('Esta conta não tem acesso ativo ao Minecraft Java. Confira a compra ou assinatura.');
      const profile = await this.request('https://api.minecraftservices.com/minecraft/profile', null, false, minecraft.access_token);
      if (!/^[a-f0-9]{32}$/i.test(profile.id) || !/^[A-Za-z0-9_]{3,16}$/.test(profile.name)) throw new Error('O perfil Minecraft recebido é inválido.');
      this.controller.signal.throwIfAborted();
      if (tokens.refresh_token && this.storage.isEncryptionAvailable()) {
        await writeJson(this.vault, { clientId, name: profile.name, refresh: this.storage.encryptString(tokens.refresh_token).toString('base64') });
      }
      this.controller.signal.throwIfAborted();
      this.session = { name: profile.name, id: profile.id, accessToken: minecraft.access_token, clientId, xuid: xsts.DisplayClaims?.xui?.[0]?.xid || '', expires: Date.now() + minecraft.expires_in * 1000 };
      return this.session;
    } catch (error) {
      if (this.controller.signal.aborted) throw new Error('Login cancelado.');
      throw error;
    } finally { this.controller = null; this.report({ authPending: false }); }
  }
}
module.exports = { MicrosoftAuth, validId };
