# Organização do launcher

O projeto usa CommonJS no processo principal do Electron e scripts locais no renderer, sem Node exposto à interface. As mudanças de organização mantêm a API pública de `Engine` e os canais do preload.

| Módulo | Responsabilidade |
|---|---|
| `src/main.cjs` | Ciclo de vida do Electron, janela, tray e composição dos serviços |
| `src/ipc.cjs` | Casos de uso dos canais IPC, validação de origem e bloqueios durante operações |
| `src/engine.cjs` | Fachada do jogo, preferências, processos e reset |
| `src/core/files.cjs` | Caminhos confinados, JSON, hashes, ZIP e cópias |
| `src/core/minecraft.cjs` | Versões, opções, UUID offline, regras de bibliotecas e cadastro do servidor |
| `src/core/memory.cjs` | Capacidade física, limite de RAM por PC e ajuste das preferências antigas |
| `src/core/workers.cjs` | Fila de tarefas com concorrência limitada |
| `src/downloads.cjs` | Downloads HTTPS, retomada, integridade e progresso |
| `src/game-installation.cjs` | Java, NeoForge, bibliotecas e recursos do Minecraft |
| `src/game-launch.cjs` | Argumentos, credenciais protegidas, abertura e diagnóstico do Java |
| `src/modpack-sync.cjs` | Instalação verificada do AveronSync, substituição e backup do legado |
| `src/modpack-preflight.cjs` | Conclusão de transações antigas 5.x antes da migração |
| `src/menu-bootstrap.cjs` | Dependências e padrões do menu antes do jogo |
| `src/landscape*.cjs` | Download e instalação opcional dos dados do Distant Horizons |
| `src/diagnostics/ui-smoke.cjs` | Verificação da interface em perfil explicitamente isolado |
| `renderer/app.js` | Estado, formulário e composição dos componentes da interface |
| `renderer/components/motion.js` | Animações e abertura/fechamento dos diálogos |
| `renderer/components/dialogs.js` | Avisos, erros e escolha do cadastro para a paisagem |
| `renderer/components/memory.js` | Limites de RAM recebidos do processo principal e indicação da capacidade detectada |
| `renderer/components/server-status.js` | Apresentação do status do servidor |
| `renderer/music.js` | Reprodução, volume e preferência de mudo |

Os módulos de baixo nível não importam `Engine`. A fachada reexporta alguns helpers para compatibilidade com integrações existentes. IPC recebe serviços por parâmetros e acessores para os que são criados depois da janela. Os componentes da interface recebem suas dependências, sem acesso direto a filesystem ou processos.

## Validação

Execute `npm test`, `npm run test:ui`, `npm run build` e `npm run package`. O smoke usa `--test-root` e não aponta para a instalação real. Testes de migração cobrem substituição de JAR renomeado, backup, repetição sem recópia, transação pendente, jogo aberto, fonte corrompida, conflito de backup e junction.
