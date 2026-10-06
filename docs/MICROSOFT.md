# Ativar Microsoft no Hollow

O código do login direto está implementado. A distribuição atual é uma prévia: o aplicativo Hollow ainda precisa de Client ID próprio e aprovação para usar Minecraft Services. Não use o Client ID de outro launcher.

## Cadastro do responsável

1. Entre no [Microsoft Entra](https://entra.microsoft.com/) e abra **App registrations / Registros de aplicativos → New registration**.
2. Use **Hollow Launcher** como nome e habilite contas Microsoft pessoais.
3. Em **Authentication**, adicione a plataforma **Mobile and desktop applications** com redirect URI **`http://localhost`**. O launcher usa uma porta local temporária; não cadastre como SPA ou aplicação web.
4. Copie o **Application (client) ID**. É um identificador público, não uma senha. **Não crie nem distribua client secret** para este aplicativo desktop.
5. Solicite a aprovação para Minecraft Services pelo [processo Minecraft](https://help.minecraft.net/hc/en-us/articles/16254801392141) e seu [formulário de revisão](https://aka.ms/mce-reviewappid). Não há prazo de aprovação garantido pelo launcher.
6. Após aprovação, preencha `clientId` em `src/microsoft-config.cjs`, compile novamente e valide o login real. O ID entra no executável e serve para todos os jogadores.

Para desenvolvimento, também é possível definir `HOLLOW_MICROSOFT_CLIENT_ID` ou criar `%LOCALAPPDATA%\HollowSMP\microsoft-app.json` contendo `{ "clientId": "ID-DO-SEU-APP" }`. O reset apaga essa configuração local; o ID incorporado ao executável permanece.

## Jogador

Selecione **Microsoft** e clique em **Entrar e jogar**. Autorize a conta na página Microsoft que abre no navegador. Volte ao Hollow: ele verifica seu acesso ao Java, prepara o jogo e abre Minecraft com seu perfil oficial. A janela do Hollow se esconde durante a partida e retorna ao fechar.

Nas próximas aberturas, a sessão é renovada automaticamente quando possível. **Sair da conta** apaga o refresh token salvo neste launcher; não desconecta a conta de outros aplicativos ou do navegador. Se o Windows não oferecer criptografia, a sessão fica apenas na memória e será necessário autorizar novamente após fechar o Hollow.

## Implementação e validação

- OAuth Authorization Code + PKCE S256, state aleatório, callback vinculado exclusivamente ao loopback e tempo limite de cinco minutos.
- Endpoints Microsoft → Xbox Live → XSTS → Minecraft Services → acesso ao Java → perfil Minecraft.
- Tokens permanecem no processo principal. A interface recebe somente o nome público.
- Refresh token cifrado via `safeStorage` no Windows; access token do Minecraft fica em memória.
- Java usa arquivo temporário de argumentos com ACL restrita ao usuário atual e SYSTEM; ele é removido na primeira saída Java ou no encerramento/falha do processo. O log capturado pelo Hollow oculta o access token, inclusive entre blocos de saída.
- Os serviços são simulados nos testes. PKCE/state, renovação, cancelamento, recusa da API, armazenamento e argumentos online são verificados sem entrar em uma conta real. A criptografia Windows é verificada no teste Electron.

**Ainda falta validar:** login real com Client ID aprovado e entrada em um servidor autenticado. Não distribua esta prévia como login Microsoft já ativado. O arquivo Java protegido por ACL e a remoção após o encerramento foram verificados com um processo Java real de teste.

Referências: [Microsoft OAuth/PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [cadastro e aprovação Minecraft na documentação CmlLib](https://cmllib.github.io/CmlLib.Core-wiki/en/auth.microsoft/xboxauthnet.game.msal/clientid/).
