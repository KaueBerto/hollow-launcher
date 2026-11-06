# AveronSync no launcher

O launcher 2.8.6 instala o JAR fornecido `averonsync-mc1.21.1-neoforge-4.0.6-averonsync.0.26.jar`, sem alterações.

SHA-256: `cb6f9eba6eda3ab82a1dbf9335994c0f5a39afbcfcb090ca7f89ec05a2f7cf9a`.

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

O arquivo `vendor/averonsync/AveronSync-0.26-source.zip` contém os fontes correspondentes desta versão, incluindo Gradle, instruções de compilação, licenças, fila VIP e starter kits do fork. Ele acompanha o instalador em `resources/licenses` e o ZIP de distribuição em `licenses`. O AutoModpack 5.x e a ponte Java permanecem apenas como dependências da migração antiga.

## AveronSync 0.11 / launcher 2.8.4

Inclui a cor VIP azul clara no TAB no servidor, preservando o nome de personagem do AveronOrigins. A integração visual ainda requer teste dentro do jogo. A versão do servidor precisa ser atualizada separadamente para ativar esse recurso.

## AveronSync 0.14 / launcher 2.8.5

VIP nível 1 permite somente Terras Áridas (`badlands`), Bétulas (`birch`) e Espeleotema (`dripstone`). Os outros 13 pets permanecem no código e nos recursos, sem acesso pelo nível 1. A política também é aplicada no servidor aos comandos e à sincronização.

A versão 0.14 foi inicialmente instalada sem reiniciar, enquanto o servidor ainda executava 0.11. O launcher 2.8.5 foi publicado a pedido do responsável, e a execução da 0.14 foi confirmada após um reinício posterior. Essa instalação é o histórico da versão anterior à correção 0.15 descrita abaixo.

As artes Cubees mantêm os direitos de seus autores; veja `licenses/Cubees-NOTICE.txt`. Os recursos derivados das artes são incluídos no JAR distribuído, separados dos fontes do programa. Para recompilar esses recursos, o responsável precisa fornecer os pacotes originais ao importador `tools/import_cubees.py`, conforme `PETS-AVERONSYNC.md`.

## AveronSync 0.15 / launcher 2.8.6

Corrige o relógio visual dos pets em mundos com milhões de ticks: a soma do tempo inteiro com o partial tick passa a preservar precisão double. Antes, em torno de 51 milhões de ticks, o arredondamento float limitava o avanço a quatro ticks por vez, aproximadamente 5 atualizações por segundo. A animação e o movimento de seguir o dono agora avançam entre ticks. Os 16 pets e a restrição do VIP nível 1 aos três pets escolhidos permanecem.

Instalar o novo JAR na VPS não ativa a versão sem reiniciar o Minecraft. Clientes e servidor devem executar 0.15 para conectar. Esta distribuição não reinicia a VPS.

## AveronSync 0.26 / launcher 2.9.6

Menu G com abas Cavalos e Pets; seleção dos três pets do VIP nível 1, guardar, carinho e emote. Pets com 75% da escala original e posicionamento à direita ao agachar. Inclui o cavalo castanho de missão, apito original vinculado ao dono, corrida no Ctrl e seleção no menu G. Missão ainda precisa ser configurada no servidor. Clientes e servidor precisam executar 0.26. Instalar o JAR na VPS exige reinício posterior do Minecraft para ativação.
