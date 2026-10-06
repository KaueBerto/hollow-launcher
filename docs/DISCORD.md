# Atividade no Discord

Enquanto o launcher estiver aberto, a atividade é sempre **Jogando HollowSMP**. Não há detalhes de instalação, nickname, tempo, imagens ou botões. Minimizar ou esconder durante o Minecraft mantém a atividade; sair do launcher remove a presença enviada por ele.

## Ativação pelo responsável

1. Abra o [Discord Developer Portal](https://discord.com/developers/applications) na sua conta e crie uma aplicação chamada **HollowSMP**. Esse nome é usado pelo Discord na atividade do tipo Jogando.
2. Em **General Information**, copie o **Application ID** público.
3. Preencha `applicationId` em `src/discord-config.cjs` e gere novamente o executável. O mesmo ID funciona para os jogadores que usam essa distribuição.

Não é necessário bot, token de usuário, bot token, client secret ou senha. O ID ainda está vazio: a integração permanece desativada até o responsável fornecê-lo.

O jogador precisa do aplicativo Discord aberto no computador e da exibição de atividade habilitada nas configurações do Discord. Se o Discord abrir depois, o launcher tenta conectar novamente. Falhas não impedem instalar ou abrir o Minecraft.

## Implementação e verificação

A conexão usa somente os pipes locais `discord-ipc-0` a `discord-ipc-9`, handshake v1 e `SET_ACTIVITY` com tipo Playing. Sem dependência adicional, autenticação ou acesso a mensagens. Respostas READY não são expostas ao renderer nem registradas. Frames limitados, timeout de conexão, reconexão e encerramento limitado a 250 ms.

Testes usam um servidor IPC simulado: READY fragmentado, atividade fixa/limpeza, heartbeat, reconexão, Discord iniciado depois, ID ausente, cancelamento e frames inválidos. Isso verifica o protocolo e o ciclo de vida; a exibição em uma conta real depende de configurar um Application ID válido.

Referências oficiais: [RPC via IPC](https://discord.com/developers/docs/topics/rpc#rpc-over-ipc) e [Rich Presence](https://discord.com/developers/docs/rich-presence/overview).
