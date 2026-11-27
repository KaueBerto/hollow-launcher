# Perfil padrão do Minecraft

O launcher 2.8.0 inclui um perfil inicial derivado da instalação configurada pelo responsável pelo AVERON SMP. O preset contém `options.txt` e configurações seguras dos mods, incluindo teclas, sensibilidade, vídeo, áudio, HUD e preferências visuais.

O pacote é aplicado antes da primeira abertura do Java. Em geral, cada arquivo só é criado quando ainda não existe; uma atualização do launcher não substitui a configuração de um jogador. Um recibo em `%LOCALAPPDATA%\HollowSMP\profile-defaults-installed.json` torna a operação idempotente. O reset preserva o recibo, `options*.txt` e a pasta `config`.

Na versão 2.8.2, quatro arquivos visuais são exceções explícitas para manter todos com o mesmo preset oficial: `emf_compat.json`, `entity_model_features.json`, `entity_texture_features.json` e `etf_warnings.json`. A migração ocorre uma única vez. Se um desses arquivos já existir e for diferente, sua cópia anterior é preservada em `%LOCALAPPDATA%\HollowSMP\profile-defaults-backups\<id>\config` antes da substituição. O reset também preserva esses backups.

O arquivo incorporado possui manifesto com tamanho e SHA-256 do ZIP e de cada entrada. A lista de arquivos obrigatórios é limitada aos quatro nomes de EMF/ETF permitidos. Caminhos absolutos, travessia, links, entradas criptografadas, duplicadas ou fora de `config` e `options*.txt` são recusados antes da instalação.

Não são distribuídos contas, sessões, tokens, senhas, nickname, lista de servidores, mundos, histórico de comandos, projetos recentes do CPM, cache de usuários do voice chat, histórico de mundos do JEI, sessões do WorldEdit, blueprints/hotbars pessoais do Axiom, caches, logs ou backups. FancyMenu e o resource pack continuam sendo preparados pelo fluxo próprio do menu.

Para gerar uma nova revisão a partir de um perfil local:

```powershell
node scripts/prepare-profile-defaults.cjs "$env:LOCALAPPDATA\HollowSMP\game" assets
```

Depois, revise o manifesto, execute os testes e publique uma nova versão do launcher. A alteração do hash gera um novo identificador do preset, mas continua preenchendo apenas arquivos ausentes.

## Teclas e Simple Voice Distance (launcher 2.9.25)

O preset passou a incluir as teclas de atalho atuais do responsável pelo servidor (somente as linhas `key_*` de `options.txt`: 13 teclas alteradas e 13 de mods que faltavam, como o painel de montarias, o ciclo de modo de voz do Simple Voice Distance e o treechop) e o `config/simplevoicedistanceneoforge/client.toml`, do addon Simple Voice Distance.

Vídeo, recursos, volume, microfone e demais opções do preset continuam como estavam; nada do Simple Voice Chat em si (microfone, volumes, mudo) é distribuído. Como em todo o preset, os arquivos só são criados quando ainda não existem: **quem já instalou o launcher mantém as próprias teclas e configurações**. A distância da voz propriamente dita (`max_voice_distance`) é uma configuração do servidor e não vem do launcher.
