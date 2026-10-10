# Atualizações do launcher

A partir de 2.2.2, o Hollow usa um instalador Windows e consulta as Releases públicas de `KaueBerto/hollow-launcher` ao abrir e a cada seis horas enquanto estiver aberto. Somente versões estáveis mais novas são consideradas. Commits no repositório, tags sem release e prévias não atualizam os jogadores.

## Para jogadores

Feche o launcher portátil antigo e instale `HollowSMP-Launcher-Setup-2.2.2.exe` uma vez. Abra pelo atalho criado. As versões portáteis antigas não têm este atualizador e precisam dessa instalação inicial.

Ao abrir o Hollow, uma janela compacta com a logo e animação mostra a verificação, o progresso do download e a aplicação. Se houver versão nova, o launcher instala silenciosamente e reabre sozinho. Se estiver atualizado, a janela se transforma no launcher normal. Falha de rede ou uma consulta inicial que demore mais de 15 segundos libera o launcher; você pode tentar novamente pelo número da versão no topo. Resultados que cheguem depois desse limite permanecem em segundo plano e não interrompem o jogador.

Com Minecraft aberto ou preparação em andamento, a aplicação é adiada e a versão baixada fica pronta para a próxima abertura ou para o botão **Atualizar e reiniciar**. Verificações periódicas enquanto o launcher está aberto continuam em segundo plano. Fechar o launcher durante uma partida não aplica atualização.

Quem está na 2.2.0 ou 2.2.1 deve usar o botão antigo para aplicar a 2.2.2 uma vez. Depois disso, a atualização na abertura é automática.

A pasta do jogo `%LOCALAPPDATA%\HollowSMP`, os mundos, mods, configurações e preferências são reaproveitados. Atualização do launcher e atualização do modpack são processos separados: o AutoModpack continua cuidando do pacote do servidor dentro do jogo.

## Publicar uma versão

1. Altere `version` em `package.json` e `package-lock.json` para uma versão estável maior, por exemplo `2.2.1`. Não reutilize uma versão já publicada.
2. Execute `npm ci`, `npm test` e `npm run test:ui` em Windows x64.
3. Execute `npm run build` e `npm run package`.
4. Faça commit e envie para `main`. Crie uma Release **em rascunho**, com tag `v2.2.1` apontando para esse commit.
5. Anexe os arquivos de `dist/`: `HollowSMP-Launcher-Setup-2.2.1.exe`, o respectivo `.exe.blockmap`, `latest.yml`, `SHA256.txt` e, opcionalmente, `HollowSMP-Launcher-Windows.zip`.
6. Confira os arquivos e publique o rascunho como release estável, sem marcar pré-lançamento. A partir daí os launchers consultam essa versão automaticamente.

O `latest.yml` é gerado pelo electron-builder com a versão, nome, tamanho e SHA-512 do instalador. Não o edite nem renomeie o instalador após compilar. Publicar todos os arquivos antes de tirar a release do rascunho evita anunciar uma versão cujo download ainda não está disponível. O `.blockmap` permite downloads diferenciais; caso não seja possível, o atualizador pode baixar o instalador completo.

O build usa o provedor GitHub público configurado em `package.json`. Nenhum token de publicação deve ser incorporado ao aplicativo; credenciais são usadas somente na máquina de quem publica. Não há rollback automático: publique uma versão maior contendo a correção caso precise reverter comportamento.

O aplicativo ainda não tem certificado de assinatura do Hollow. O atualizador verifica a integridade pelos hashes da release; assinatura de código e proteção da conta GitHub são medidas distintas. Mantenha o acesso de publicação restrito e configure um certificado no electron-builder quando disponível.

## Desenvolvimento e verificações

`npm start` e o smoke test não consultam atualizações. Os testes verificam estados, concorrência entre Jogar e atualização, jogo aberto, falhas de rede e falhas de instalação. Para conferir a cadeia real, use duas versões instaladas em uma pasta de teste e um perfil isolado; nunca use a instalação de um jogador como teste de downgrade.

O script `powershell -File scripts/release.ps1` envia o código e os arquivos para uma release em rascunho, usando a credencial local do GitHub sem incorporá-la ao launcher. Acrescente `-Publish` para publicar após a conferência. Ele verifica versão, arquivos e hashes remotos e recusa substituir uma release já publicada.

## Paisagem do Distant Horizons (2.3.0)

A opção baixar paisagem do distant horizons do servidor vem desmarcada. Baixar agora instala a paisagem com o Minecraft fechado. São 1,86 GB de download e 1,93 GB instalados; mantenha pelo menos 6 GB livres durante a preparação. O launcher baixa quatro partes simultaneamente, retoma partes interrompidas e verifica os arquivos antes de instalar. Um banco anterior é preservado em landscape-backups. A instalação não ativa o Distant Horizons. Desmarcar a opção não apaga a paisagem. O arquivo é distribuído separadamente por HTTPS e não aumenta o instalador.


## Correção de pasta (2.3.1)

O destino da paisagem segue o nome do cadastro de hollowsmp.com.br em servers.dat e o modo de pasta da configuração do Distant Horizons. Minecraft Server usa Minecraft+Server; Hollow SMP usa Hollow+SMP. A pasta interna do mundo é b4c77i87dhs4g@minecraft@@overworld, confirmada no log da conexão. O manifesto mantém o nome da origem, mas o launcher resolve o destino de cada cliente. Cadastros duplicados com nomes diferentes pedem que o jogador mantenha um único cadastro antes de instalar.


## Reaproveitamento de paisagem (2.3.2)

A instalação da versão 2.3.0 é reconhecida mesmo sem a pasta no registro antigo. Se necessário, o banco existente é copiado localmente para a pasta correta, preservando o original e evitando outro download. O registro é atualizado uma vez. Nas próximas aberturas, o launcher confere o registro e o cabeçalho SQLite; alterações normais feitas pelo Distant Horizons não invalidam a instalação. Arquivos ausentes ou inválidos continuam exigindo nova instalação.

## Atualização do modpack antes de abrir o jogo (2.3.3)

O launcher aguarda o Minecraft e o helper anterior encerrarem antes de iniciar Java. Se existe uma transação do AutoModpack pendente, conclui-a com o jogo fechado usando a API original de planejamento e aplicação. Configurações Properties com diferenças só em comentários ou datas mantêm a equivalência da revisão; mudanças de valores continuam exigindo revisão. O histórico da geração já finalizada é usado apenas para avançar no mesmo pacote quando faltam documentos intermediários, mantendo a verificação da política de destino. Falha bloqueia a abertura com diagnóstico em modpack-preflight.log, em vez de repetir o ciclo silenciosamente. Não limpa mods, preferências ou mundos. Não altera o JAR original nem publica dados do servidor.

## Reset preserva paisagem e schematics (2.3.4)

O reset mantém integralmente game/Distant_Horizons_server_data e game/schematics, incluindo subpastas, bancos SQLite, arquivos WAL/SHM e pastas vazias. O registro landscape-installed.json também permanece para reconhecer a paisagem já instalada e evitar outro download. A confirmação do reset informa essa preservação.

## Detecção de fechamento (2.3.5)

O launcher libera o jogo no evento de saída do processo do Minecraft, após finalizar o log e remover os argumentos de sessão. Não espera processos de diagnóstico fecharem os canais de saída herdados. Eventos atrasados de uma partida anterior não alteram o estado da nova partida. A verificação de Java considera somente a instalação do Hollow e ignora o companion do Crash Assistant. O Minecraft ainda salvando e os helpers de atualização do AutoModpack continuam protegendo a instalação contra escrita simultânea; fechar apenas a janela não autoriza interromper esses processos.
