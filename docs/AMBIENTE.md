# Ambiente do launcher

O fundo atual é a paisagem Minecraft fornecida pelo responsável do Hollow na versão 2.1.0-rc.5. A imagem foi copiada integralmente para `assets/end-background.png`; esse nome interno foi mantido por compatibilidade. A logo e o ícone permanecem originais.

O escurecimento é aplicado em CSS para manter textos e controles legíveis. Partículas, névoa, deslocamento suave e reação do portal também usam CSS, com pausa ao esconder e alternativa estática para movimento reduzido.

O cenário gerado anteriormente para a versão rc.3 e seu prompt continuam disponíveis no histórico do Git.

## Painel do servidor

Consulta somente a lista de servidores do Minecraft Java; não faz login, não entra no mundo e não altera a VPS. Usa o endereço Hollow configurado no motor, resolve SRV quando aplicável, lê jogadores e confirma o ping por resposta pong. Não apresenta MOTD ou textos arbitrários do servidor na interface. Falhas mostram **Sem resposta do servidor**, sem bloquear Jogar.

Atualiza a cada 45 segundos enquanto a janela está visível; consultas simultâneas compartilham a mesma conexão e consultas automáticas recentes usam cache de 15 segundos. O botão de atualizar faz uma nova consulta. Tempo limite de cinco segundos, pacotes limitados a 1 MiB, sem serviços de terceiros.

Referência técnica: [implementação de ping Java do PrismarineJS](https://github.com/PrismarineJS/node-minecraft-protocol/blob/master/src/ping.js).
