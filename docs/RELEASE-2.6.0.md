O launcher passa a usar o AveronSync 4.0.6-averonsync.0.4 no lugar do AutoModpack original.

- Migração com verificação SHA-256 e backup do sincronizador e do estado antigo, preservando as configurações dos jogadores.
- Atualizações antigas pendentes são concluídas antes da troca. Os dois sincronizadores não são instalados juntos.
- Código separado em serviços de download, instalação, abertura do jogo, integração do modpack e IPC.
- Interface dividida em componentes para animações, diálogos e status do servidor, mantendo a identidade visual e as funções existentes.
- Fontes correspondentes do AveronSync incluídos na distribuição.

Na primeira conexão após a migração, o AveronSync pode precisar receber o modpack pelo seu próprio protocolo e apresentar seu aceite de termos.
