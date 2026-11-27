# AveronSync no launcher

O launcher 2.9.22 instala o JAR fornecido `averonsync-mc1.21.1-neoforge-4.0.6-averonsync.0.56.jar`, sem alterações.

SHA-256: `3320b2e68ddbed8a2a5ca6de00c708d9feabe255bdb2fb83dbe4af2a679a33f3`.

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

O arquivo `vendor/averonsync/AveronSync-0.56-source.zip` contém os fontes correspondentes desta versão, incluindo Gradle, instruções de compilação, licenças, fila VIP e starter kits do fork. Ele acompanha o instalador em `resources/licenses` e o ZIP de distribuição em `licenses`. O AutoModpack 5.x e a ponte Java permanecem apenas como dependências da migração antiga.

## AveronSync 0.11 / launcher 2.8.4

Inclui a cor VIP azul clara no TAB no servidor, preservando o nome de personagem do AveronOrigins. A integração visual ainda requer teste dentro do jogo. A versão do servidor precisa ser atualizada separadamente para ativar esse recurso.

## AveronSync 0.14 / launcher 2.8.5

VIP nível 1 permite somente Terras Áridas (`badlands`), Bétulas (`birch`) e Espeleotema (`dripstone`). Os outros 13 pets permanecem no código e nos recursos, sem acesso pelo nível 1. A política também é aplicada no servidor aos comandos e à sincronização.

A versão 0.14 foi inicialmente instalada sem reiniciar, enquanto o servidor ainda executava 0.11. O launcher 2.8.5 foi publicado a pedido do responsável, e a execução da 0.14 foi confirmada após um reinício posterior. Essa instalação é o histórico da versão anterior à correção 0.15 descrita abaixo.

As artes Cubees mantêm os direitos de seus autores; veja `licenses/Cubees-NOTICE.txt`. Os recursos derivados das artes são incluídos no JAR distribuído, separados dos fontes do programa. Para recompilar esses recursos, o responsável precisa fornecer os pacotes originais ao importador `tools/import_cubees.py`, conforme `PETS-AVERONSYNC.md`.

## AveronSync 0.15 / launcher 2.9.16

Corrige o relógio visual dos pets em mundos com milhões de ticks: a soma do tempo inteiro com o partial tick passa a preservar precisão double. Antes, em torno de 51 milhões de ticks, o arredondamento float limitava o avanço a quatro ticks por vez, aproximadamente 5 atualizações por segundo. A animação e o movimento de seguir o dono agora avançam entre ticks. Os 16 pets e a restrição do VIP nível 1 aos três pets escolhidos permanecem.

Instalar o novo JAR na VPS não ativa a versão sem reiniciar o Minecraft. Clientes e servidor devem executar 0.15 para conectar. Esta distribuição não reinicia a VPS.

## AveronSync 0.48 / launcher 2.9.6

Menu G com abas Cavalos e Pets; seleção dos três pets do VIP nível 1, guardar, carinho e emote. Pets com 75% da escala original e posicionamento à direita ao agachar. Inclui o cavalo castanho de missão, apito original vinculado ao dono, corrida no Ctrl e seleção no menu G. Missão ainda precisa ser configurada no servidor. Clientes e servidor precisam executar 0.48. Instalar o JAR na VPS exige reinício posterior do Minecraft para ativação.

## AveronSync 0.27 / launcher 2.9.7

Corrige curvas normais do cavalo: a velocidade retida do tick anterior gira junto com o corpo, evitando continuar na direção antiga. Mantém a velocidade, componente vertical e a derrapagem explícita. Teste nativo reproduziu aproximadamente 4 graus de divergência na 0.48; na 0.27 os oito casos de esquerda/direita, avanço/ré e velocidades diferentes ficaram abaixo de 0,01 grau. Cliente e servidor devem executar 0.27. Instalação na VPS não inclui reinício.

## AveronSync 0.29 / launcher 2.9.8

Deslocamento horizontal do cavalo em 50% da velocidade anterior: trote aproximadamente 2 blocos/s e galope 12,5 blocos/s. Animações e sons de passos no ritmo original. Comandos mais recentes prevalecem quando vários chegam no mesmo tick; física calculada uma vez por tick no servidor, com dono e autenticação validados. Renderização usa o arco mais curto ao atravessar +180/-180 graus. Câmera livre, controles e correção de trajetória da 0.27 preservados. Testes locais de servidor e cliente aprovados na 0.28; ritmo original restaurado e 130 testes core aprovados na 0.29. Cliente e servidor devem executar 0.29. Instalação na VPS não inclui reinício.

## AveronSync 0.32 / launcher 2.9.9

O cavalo relincha ao apito, chega trotando e desacelera perto do dono. Monte com o botão direito. O vínculo aparece no menu G e dá +10% e +20% de velocidade em estradas após 5 e 15 minutos de deslocamento montado. Cavalo e cavaleiro recebem dano de queda separadamente. Se o cavalo morrer, `/cavalo apito` entrega um novo apito. Com Better Third Person instalado, esta montaria usa a câmera padrão do Minecraft.

## AveronSync 0.49 / launcher 2.9.17

- Animações de entrada e saída (EliteAnimations v1, Halloween): cinco temas, `/animacao` para escolher, testar ou desligar. O tamanho acompanha a raça do AveronOrigins (`minecraft:scale`).
- VIP nível 2: `/async vip add <nick> 2`. Tem a Possessão do Boneco como animação padrão e mais três pets (Cerejeira, Profundezas sombrias, Portal do Nether), seis no total.
- Parro (DepartmentQDE x Mister Spooky): pet e montaria dados por `/async parro dar <jogador>`, chamados pela aba Parro do menu G ou `/parro`. Sobe de nível, ataca mobs (nunca jogadores), vira montaria com sela, salta e plana.

Os canais de rede mudaram (`averonsync-mount-menu-6`, `averonsync-entrance-1`, `averonsync-parro-1`). Cliente e servidor precisam executar 0.49. Instalar o JAR na VPS exige reiniciar o Minecraft dela. Não foi testado no jogo antes desta release.

## AveronSync 0.50 / launcher 2.9.18

- Parro: vínculo por sementes no lugar do XP de combate (10 níveis, de 12,5 a 17 blocos/s e até 40% maior), animações corrigidas (sinais do Blockbench 5, transições entre estados, estados de ar em loop), cauda com física de segmentos, controle montado como o cavalo (A/D viram) e degrau de 1 bloco com sela.
- Comandos de admin também em `/parro dar|remover|info <jogador>` (OP 2). Em singleplayer e LAN, o Parro é liberado sozinho, o login não é exigido e `/async` funciona com OP 3.
- Animações de entrada: quem ainda não logou e vai ter animação fica invisível para os outros até ela começar (canal `averonsync-entrance-2`).
- Montarias andam mais devagar em servidor dedicado sobrecarregado (abaixo de 20 TPS, até 60% em 10 TPS).

Cliente e servidor precisam executar 0.50. Instalar o JAR na VPS exige reiniciar o Minecraft dela.

## AveronSync 0.51 / launcher 2.9.19

- VIP por código: `/averon codigo <codigo>` ativa o VIP por 30 dias e entrega o kit na hora; renovar com outro código entrega o kit de novo. Admin: `/async vip codigo gerar|contar|revogar` e `/async vip kit verificar`. Códigos ficam só como hash em `automodpack/averonsync-vip-codes.json`.
- Kits em `config/averonsync-vip-kits.json` (criado com exemplo na primeira vez), um nível por lista de itens. Kit que não cabe no inventário fica guardado e sai com `/kitvip`. O Starter Kit não é mais necessário.
- Cavalo: pelagens Preto e Alazão para VIP 1; Palomino e Pampa também para VIP 2. Vínculo por maçãs (10 níveis, até +15% de velocidade).
- Parro: vínculo de 10 níveis (30 minutos entre sementes), jogador montado grudado na sela, giro mais rápido.

Cliente e servidor precisam executar 0.51. Instalar o JAR na VPS exige reiniciar o Minecraft dela.

## AveronSync 0.52 / launcher 2.9.20

- Mensagens de entrada em português: launcher desatualizado, arquivos do jogo desatualizados, servidor em atualização, mod ausente e modpack em preparo agora dizem ao jogador o que fazer (abrir o Averon Launcher). O texto vem do servidor, então vale também para launchers antigos quando a VPS roda 0.52.

Cliente e servidor precisam executar 0.52. Instalar o JAR na VPS exige reiniciar o Minecraft dela.

## AveronSync 0.55 / launcher 2.9.21

- TAB: `[VIP]` antes do nome para VIP 1 e VIP 2; VIP 1 azul claro e VIP 2 laranja. A lista fica em ordem VIP 2, VIP 1 e demais, cada grupo alfabético (o cliente reordena lendo a tag e a cor).
- Códigos VIP: os códigos gerados por `/async vip codigo gerar` aparecem mesmo com `sendCommandFeedback` desligado e copiam com um clique. As mensagens de VIP ativado e de `/kitvip` também aparecem sempre.
- Fila de entrada: o tempo máximo de espera padrão subiu de 10 para 30 minutos (`entryQueue.maxWaitSeconds`, 1800). Servidores com o valor já gravado no `automodpack-server.json` precisam editar esse campo.

Cliente e servidor precisam executar 0.55. Instalar o JAR na VPS exige reiniciar o Minecraft dela.

## AveronSync 0.56 / launcher 2.9.22

- Fila de entrada inteligente: `maxConcurrentAdmissions` (padrão 2) é o máximo de jogadores entrando ao mesmo tempo enquanto o servidor está saudável; com o tempo médio do tick acima de 35 ms a fila volta a admitir um por vez. O intervalo entre admissões continua valendo. Servidores com o valor já gravado no `automodpack-server.json` precisam editar o campo.

Cliente e servidor precisam executar 0.56. Instalar o JAR na VPS exige reiniciar o Minecraft dela.
