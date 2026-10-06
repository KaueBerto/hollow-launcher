# Validação — Electron 2.0.0

Verificações realizadas em Windows x64, em 06/10/2026.

## Motor JavaScript

Os 12 testes de `npm test` passaram:

- UUID offline e regras de plataforma/argumentos.
- Caminhos fora da instalação recusados.
- SHA256 do AutoModpack original.
- Migração das preferências C# e privacidade de nickname não lembrado.
- Reset completo e repetido em pasta isolada, com arquivo externo preservado.
- Reset bloqueado por Java aberto.
- Junction recusada, com o alvo externo preservado.
- Arquivo ocupado recusado antes da exclusão.
- Perfil Microsoft com outros perfis, configurações e backup preservados.
- Extração de ZIP e recusa de download HTTP.
- Reutilização de arquivos com hash correto; conteúdo inválido não é finalizado.
- Fila de downloads aguarda os trabalhadores após uma falha.

A recusa por Java aberto usa uma simulação do detector. Arquivo ocupado e junction foram testados com recursos reais do Windows em pastas artificiais.

## Interface Electron

`npm run test:ui` passou: 16 trocas de conta, memória sincronizada, animação CSS ativa, fonte incorporada, interface sem acesso a Node e confirmação/cancelamento do reset. Screenshots dos modos Nickname e Microsoft foram gerados e inspecionados. O aplicativo empacotado e o executável portátil também passaram pelo mesmo teste da interface.

A captura de teste usa renderização offscreen por software para funcionar sem exibir uma janela de teste. O aplicativo normal usa a aceleração padrão do Chromium.

## Integração real

- O motor JavaScript verificou Java, Minecraft, bibliotecas e 3.888 recursos na instalação isolada já usada nos testes da versão anterior.
- Os argumentos JavaScript iniciaram um cliente real com Minecraft 1.21.1, NeoForge 21.1.253 e AutoModpack. Texturas e interface foram carregadas.
- O teste encerrou apenas seu próprio processo Java depois de confirmar a inicialização; não encerrou sessões do jogador.
- A extração e preparação do Java 21 pelo motor novo foram validadas em uma pasta nova, reaproveitando o ZIP com hash oficial.

## Limites

- Não foi repetido um download completo de todos os arquivos sem cache.
- O instalador NeoForge JavaScript foi executado em uma instalação nova: processamento de patches, criação da versão e bibliotecas passaram, reutilizando o JAR e bibliotecas previamente verificados.
- Login Microsoft em conta real e entrada no servidor com download completo do modpack não foram verificados de ponta a ponta.
- A entrada por nickname depende das regras do servidor.
- Nenhuma configuração da VPS foi alterada e nenhum reinício do servidor foi realizado.
## Animação — 2.0.1

Flutuação com ciclo de oito segundos, deslocamento vertical de 14 px, lateral de 6 px e inclinação suave de ±0,55°. O teste da interface verifica deslocamento, inclinação e continuidade no reinício do ciclo.

## Janela escondida — 2.0.2

16 testes passaram, incluindo ocultar/restaurar, reabertura manual, acompanhamento Microsoft, falha de consulta e cancelamento de consulta antiga. A interface Electron confirmou esconder e restaurar uma BrowserWindow real. O detector Windows identificou e acompanhou o encerramento de um processo Java de teste isolado; não foi realizado login Microsoft real.

## Prévia 2.1.0-rc.1 — Microsoft direto

Integração OAuth PKCE implementada; nenhum launcher oficial é aberto. Oito testes novos verificam callback local/state/PKCE, renovação, cancelamento, recusa da API, conta sem acesso ao Java, ausência de criptografia, argumentos online e ocultação de tokens. Serviços Microsoft/Xbox/Minecraft simulados; conta real e servidor autenticado ainda não validados. O smoke Electron verifica nome de conta, cancelamento e criptografia Windows real. Um Java real verificou a proteção do arquivo de argumentos e sua remoção ao encerrar. Consulte MICROSOFT.md: falta Client ID próprio aprovado.

## Motion design — 2.1.0-rc.2

Teste Electron: entrada concluída, 12 trocas rápidas de conta sem deslocar a área de entrada, fechamento animado e Escape nos avisos, confirmação de instalação e limpeza do indicador, movimento reduzido e mudança dessa preferência sem esconder a interface. A flutuação original da logo, memória e ocultar/restaurar o launcher continuam verificados.

## Ambiente do End — 2.1.0-rc.3

Seis testes do status Java: frames fragmentados e pong, servidor sem pong, timeout/dados inválidos, resolução SRV, cache/consulta simultânea/atualização manual e pausa de consultas com janela escondida. Consulta real ao Hollow SMP respondeu online, 0/20 jogadores e 19 ms nesta sessão; valores variam. A interface verifica arte carregada, 18 partículas que não bloqueiam controles, brilho durante preparação e limpeza de contagens após falha. Capturas do smoke usam dados de teste.

## Interface simplificada — 2.1.0-rc.4

Título redundante removido e formulário reposicionado. Verificação Electron passou: controles, memória, animações, modos de conta, avisos, ocultar/restaurar e cenário. Captura revisada visualmente.

