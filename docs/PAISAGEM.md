# Paisagem do Distant Horizons

O download opcional prepara o banco de paisagem na pasta que o Distant Horizons usa para o cadastro do AVERON salvo em Multijogador. O nome da pasta segue o cadastro e a opção `serverFolderNameMode` do jogador, sem alterar essas configurações.

Desde a versão 2.5.3, ter o mesmo endereço salvo com nomes diferentes não bloqueia o download. O launcher reutiliza a pasta registrada no recibo da instalação, quando ela ainda corresponde a um cadastro atual. Se não houver uma escolha válida e existirem várias pastas possíveis, abre uma seleção com os nomes e endereços cadastrados. Escolha o cadastro usado para conectar ao servidor e clique em **Continuar**. **Cancelar** abandona a operação sem iniciar o download.

A seleção é validada novamente antes da instalação e fica registrada em `landscape-installed.json` depois que ela termina. Não é preciso apagar cadastros ou bancos. Uma instalação válida na pasta registrada é reaproveitada nas próximas aberturas, mesmo que o Distant Horizons tenha atualizado o banco durante uma sessão de jogo. O processo de verificação, download com retomada e backup de um banco substituído permanece igual.

![Seleção do cadastro para a paisagem](landscape-selection.png)
