# AveronSync no launcher

O launcher 2.6.1 instala o JAR fornecido `averonsync-mc1.21.1-neoforge-4.0.6-averonsync.0.5.jar`, sem alterações.

SHA-256: `c992ab11d716d94a806c3e69e547f6600c6f2bf6bbff6b1e93fd14083d556a07`.

O fork mantém os IDs `automodpack` e `automodpack_mod`. Por isso, não pode coexistir com o AutoModpack original. A integração identifica o ID nos metadados NeoForge, inclusive se alguém renomear o JAR, e preserva uma cópia antes de retirá-lo de `mods`.

## Instalações existentes

1. O Minecraft e seus processos de atualização precisam estar encerrados.
2. Se existir uma transação 5.x pendente, o verificador legado a conclui com o binário 5.x. Uma falha interrompe a migração e mantém o diagnóstico em `modpack-preflight.log`.
3. O novo JAR é copiado para um arquivo temporário e conferido por SHA-256 antes de retirar o anterior.
4. JARs substituídos ficam em `%LOCALAPPDATA%\HollowSMP\sync-backups`, identificados pelo hash e nome original. A projeção 5.x `game/automodpack/client` fica em `sync-backups/automodpack-5-client`.
5. O AveronSync passa a administrar seu próprio armazenamento 4.x em `automodpack/modpacks`. O usuário entra no servidor para receber o pacote desse protocolo; os arquivos da projeção 5.x não são apresentados como um pacote 4.x já instalado.

Configurações, nickname, opções do jogo, resource packs, bancos do Distant Horizons e schematics não são apagados pela migração. O reset também preserva `sync-backups`. Não remova esse backup para tentar corrigir uma atualização; ele conserva a instalação anterior para diagnóstico.

O menu FancyMenu continua sendo instalado antes da primeira abertura. O aceite de termos, confiança no servidor, downloads e atualizações do fork permanecem sob responsabilidade do próprio AveronSync; o launcher não fabrica o aceite nem altera suas verificações.

O servidor precisa usar o protocolo compatível com esse fork. A integração no launcher não reinicia nem substitui arquivos da VPS.

## Código correspondente

O arquivo `vendor/averonsync/AveronSync-0.5-source.zip` contém os fontes fornecidos com esta versão, incluindo Gradle, instruções de compilação, licenças e alterações do fork. Ele acompanha o instalador em `resources/licenses` e o ZIP de distribuição em `licenses`. O AutoModpack 5.x e a ponte Java permanecem apenas como dependências da migração antiga.
