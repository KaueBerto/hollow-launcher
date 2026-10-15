# Identidade do Averon Launcher

A versão 2.4.0 usa a logo AVERON SMP fornecida pelo responsável, sem redesenhar a arte. O PNG original está em `assets/averon-smp.png`, com transparência e proporções preservadas. `assets/averon.ico` contém sete tamanhos, de 16 a 256 px, gerados pelo script `scripts/prepare-brand.ps1` com a imagem centralizada e sem distorção.

O dourado da coroa e das letras orienta o botão Jogar, o controle de memória, o foco de teclado, os seletores de conta e o progresso. Vermelho aparece nos detalhes e na confirmação de reset; cinza pedra e verde escuro compõem as superfícies. Toda a interface usa Monocraft Bold. A logo horizontal tem uma área própria e os modos de conta ficam alinhados abaixo dela.

O fundo é a paisagem Minecraft fornecida anteriormente, em `assets/end-background.png`. O escurecimento em CSS mantém os controles legíveis. Névoa, partículas douradas e vermelhas, flutuação da logo e brilho ao preparar o jogo respeitam a opção de reduzir movimentos e pausam quando a janela fica oculta.

## Compatibilidade da identidade

O nome visível, o ícone, o instalador e as telas usam Averon. O identificador de instalação, o repositório de atualizações, o endereço do servidor e a pasta `%LOCALAPPDATA%\HollowSMP` continuam iguais para aproveitar a instalação, as preferências e o modpack existentes. Nenhuma cópia ou migração dos dados é necessária para a mudança visual. O nome externo da atividade do Discord depende do nome cadastrado no Developer Portal para o Application ID atual.

## Painel do servidor

Consulta o status do Minecraft Java, sem login ou alteração da VPS. Resolve SRV quando aplicável, lê jogadores e confirma o ping por resposta pong. Não apresenta MOTD ou textos arbitrários do servidor na interface. Falhas mostram **Sem resposta do servidor**, sem bloquear Jogar.

Atualiza a cada 45 segundos enquanto a janela está visível; consultas simultâneas compartilham a mesma conexão e consultas automáticas recentes usam cache de 15 segundos. O botão circular permite atualizar manualmente. Números nas capturas de documentação são ilustrativos.
