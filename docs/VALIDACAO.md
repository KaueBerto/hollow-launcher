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
