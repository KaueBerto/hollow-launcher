# Atualizações do launcher

A partir de 2.2.0, o Hollow usa um instalador Windows e consulta as Releases públicas de `KaueBerto/hollow-launcher` ao abrir e a cada seis horas enquanto estiver aberto. Somente versões estáveis mais novas são consideradas. Commits no repositório, tags sem release e prévias não atualizam os jogadores.

## Para jogadores

Feche o launcher portátil antigo e instale `HollowSMP-Launcher-Setup-2.2.0.exe` uma vez. Abra pelo atalho criado. As versões portáteis antigas não têm este atualizador e precisam dessa instalação inicial.

Uma versão nova é baixada em segundo plano. **Atualizar e reiniciar** aparece no topo quando o download termina. Feche o Minecraft e clique para aplicar: o instalador substitui o aplicativo e o reabre. A instalação não é aplicada ao simplesmente fechar o launcher. Se houver falha de conexão, o jogo continua disponível; **Tentar atualização** permite tentar novamente.

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
