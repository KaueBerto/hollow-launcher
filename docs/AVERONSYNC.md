# AveronSync no launcher

O launcher 2.8.5 instala o JAR fornecido `averonsync-mc1.21.1-neoforge-4.0.6-averonsync.0.14.jar`, sem alterações.

SHA-256: `9d4fb8692c1364e2a7e07499c8bc3c646fb969e4b59080221a9157c705e3bf8f`.

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

O arquivo `vendor/averonsync/AveronSync-0.14-source.zip` contém os fontes correspondentes desta versão, incluindo Gradle, instruções de compilação, licenças, fila VIP e starter kits do fork. Ele acompanha o instalador em `resources/licenses` e o ZIP de distribuição em `licenses`. O AutoModpack 5.x e a ponte Java permanecem apenas como dependências da migração antiga.

## AveronSync 0.11 / launcher 2.8.4

Inclui a cor VIP azul clara no TAB no servidor, preservando o nome de personagem do AveronOrigins. A integração visual ainda requer teste dentro do jogo. A versão do servidor precisa ser atualizada separadamente para ativar esse recurso.

## AveronSync 0.14 / launcher 2.8.5

VIP nível 1 permite somente Terras Áridas (`badlands`), Bétulas (`birch`) e Espeleotema (`dripstone`). Os outros 13 pets permanecem no código e nos recursos, sem acesso pelo nível 1. A política também é aplicada no servidor aos comandos e à sincronização.

A atualização está preparada para publicação coordenada com o reinício do Minecraft na VPS. O JAR foi instalado sem reiniciar; a instância em execução ainda usa 0.11. Não publique a atualização automática antes de ativar 0.14 no servidor, pois a versão é exigida na conexão.

As artes Cubees mantêm os direitos de seus autores; veja `licenses/Cubees-NOTICE.txt`. Os recursos derivados das artes são incluídos no JAR distribuído, separados dos fontes do programa. Para recompilar esses recursos, o responsável precisa fornecer os pacotes originais ao importador `tools/import_cubees.py`, conforme `PETS-AVERONSYNC.md`.
