# Atividade no Discord

Enquanto o launcher estiver aberto, a atividade é **Jogando AveronSMP**, com a logo dourada atual do servidor. Não há nickname, detalhes de instalação, tempo ou botões. Minimizar ou esconder durante o Minecraft mantém a atividade; sair do launcher remove a presença enviada por ele.

## Identidade visual

O launcher envia `name: AveronSMP` explicitamente no `SET_ACTIVITY`, além de `assets.large_image` com a logo atual e `large_text: AveronSMP`. Assim, a presença não depende do antigo nome cadastrado para a aplicação. O Application ID público existente é preservado: `1557116892945055754`.

A logo usa a cópia original em `assets/averon-smp.png`, publicada por HTTPS em uma revisão fixa do repositório. O Discord suporta imagens externas e as entrega por seu proxy de mídia. Atualizar a marca no futuro exige ajustar `activityName` e `largeImage` em `src/discord-config.cjs` e publicar uma nova versão.

## Configuração e uso

Não é necessário criar bot, fornecer token de usuário, bot token, client secret ou senha. Os jogadores também não precisam criar uma aplicação. Para usar outra aplicação própria, copie seu Application ID público no [Discord Developer Portal](https://discord.com/developers/applications), atualize a configuração e gere o launcher novamente.

O jogador precisa do aplicativo Discord aberto e atualizado no computador, com a exibição de atividade habilitada. Se o Discord abrir depois, o launcher tenta conectar novamente. Falhas não impedem instalar ou abrir o Minecraft.

## Implementação e verificação

A conexão usa somente os pipes locais `discord-ipc-0` a `discord-ipc-9`, handshake v1 e `SET_ACTIVITY` do tipo Playing. Não acessa mensagens. Dados do evento READY não são expostos ao renderer nem registrados. Há limite de frames, timeout, reconexão e encerramento limitado a 250 ms.

Testes simulados verificam o payload exato de nome e logo, READY fragmentado, limpeza, heartbeat, reconexão, Discord iniciado depois, ID ausente, cancelamento e frames inválidos. Na validação local da versão 2.6.2, o Discord desktop confirmou o nome `AveronSMP` e converteu a URL da logo em um endereço de seu proxy de mídia. A visibilidade no perfil continua sujeita às preferências do jogador.

Referências oficiais: [RPC via IPC](https://discord.com/developers/docs/topics/rpc#rpc-over-ipc), [nome da atividade](https://discord.com/developers/docs/discord-social-sdk/development-guides/setting-rich-presence#setting-the-application-name) e [imagens da presença](https://discord.com/developers/docs/social-sdk/classdiscordpp_1_1ActivityAssets.html).
