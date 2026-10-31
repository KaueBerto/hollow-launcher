# Perfil padrão do Minecraft

O launcher 2.8.0 inclui um perfil inicial derivado da instalação configurada pelo responsável pelo AVERON SMP. O preset contém `options.txt` e configurações seguras dos mods, incluindo teclas, sensibilidade, vídeo, áudio, HUD e preferências visuais.

O pacote é aplicado antes da primeira abertura do Java. Cada arquivo só é criado quando ainda não existe; uma atualização do launcher nunca substitui a configuração de um jogador. Um recibo em `%LOCALAPPDATA%\HollowSMP\profile-defaults-installed.json` torna a operação idempotente. O reset preserva o recibo, `options*.txt` e a pasta `config`.

O arquivo incorporado possui manifesto com tamanho e SHA-256 do ZIP e de cada entrada. Caminhos absolutos, travessia, links, entradas criptografadas, duplicadas ou fora de `config` e `options*.txt` são recusados antes da instalação.

Não são distribuídos contas, sessões, tokens, senhas, nickname, lista de servidores, mundos, histórico de comandos, projetos recentes do CPM, cache de usuários do voice chat, histórico de mundos do JEI, sessões do WorldEdit, blueprints/hotbars pessoais do Axiom, caches, logs ou backups. FancyMenu e o resource pack continuam sendo preparados pelo fluxo próprio do menu.

Para gerar uma nova revisão a partir de um perfil local:

```powershell
node scripts/prepare-profile-defaults.cjs "$env:LOCALAPPDATA\HollowSMP\game" assets
```

Depois, revise o manifesto, execute os testes e publique uma nova versão do launcher. A alteração do hash gera um novo identificador do preset, mas continua preenchendo apenas arquivos ausentes.
