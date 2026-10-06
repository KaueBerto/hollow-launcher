# Ambiente do End

Arte original criada pelo recurso integrado de geração de imagens, usando a skill imagegen, para o fundo do Hollow Launcher. Arquivo nos fontes: `assets/end-background.png`. A logo original e o ícone não foram alterados.

As partículas, névoa, deslocamento do cenário e reação do portal são feitos em CSS. O campo tem 18 partículas, animações pausadas quando a janela está escondida e alternativa estática para movimento reduzido.

## Prompt final utilizado

Use case: stylized-concept. Asset type: widescreen desktop Minecraft modpack launcher background, landscape 16:9. Create an original cinematic voxel/block-world environment inspired by Minecraft's End dimension, with dark obsidian towers, distant floating islands and blocky pale end-stone ledges, deep charcoal-plum void sky, subdued violet ambient lighting, a faint magenta glow on the horizon and soft purple mist. No characters, no portal, no text, no letters, no logo, no UI. Composition purpose: launcher controls occupy the left 45% and a large existing colorful logo will overlay the right center. Keep left half extremely quiet and dark with empty negative space, mostly dark void and distant mist. Place the most interesting but restrained voxel silhouettes low along the bottom and far right edges. Maintain visible block geometry, clean atmospheric depth, muted colors and moderate contrast; no bright lights behind controls, no busy texture, no yellow sky, no photorealism. Background should evoke an immersive calm End landscape while leaving the launcher UI readable. Finished production-quality environmental art, not a mockup.

## Painel do servidor

Consulta somente a lista de servidores do Minecraft Java; não faz login, não entra no mundo e não altera a VPS. Usa o endereço Hollow configurado no motor, resolve SRV quando aplicável, lê jogadores e confirma o ping por resposta pong. Não apresenta MOTD ou textos arbitrários do servidor na interface. Falhas mostram **Sem resposta do servidor**, sem bloquear Jogar.

Atualiza a cada 45 segundos enquanto a janela está visível; consultas simultâneas compartilham a mesma conexão e consultas automáticas recentes usam cache de 15 segundos. O botão de atualizar faz uma nova consulta. Tempo limite de cinco segundos, pacotes limitados a 1 MiB, sem serviços de terceiros.

Referência técnica: [implementação de ping Java do PrismarineJS](https://github.com/PrismarineJS/node-minecraft-protocol/blob/master/src/ping.js).
