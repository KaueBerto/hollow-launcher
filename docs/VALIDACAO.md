# Validação

Versão 1.7.0, Windows de 64 bits, 06/10/2026.

## Verificações desta versão

`scripts/test.ps1` compila e executa verificações locais sem instalar o jogo.

| Verificação | Resultado |
| --- | --- |
| UUID offline, regras de bibliotecas, caminhos e AutoModpack incorporado | Passou |
| Reset completo e repetição em pasta de teste isolada | Passou |
| Recusa de arquivo ocupado, preservando a instalação | Passou |
| Recusa de pasta fora do escopo e preservação de arquivo externo | Passou |
| 16 trocas de modo, checkbox e 20 redesenhos | Passou |
| Arraste da memória em 2, 13 e 24 GB e valor exibido | Passou |
| Fontes em negrito, alinhamento e recorte de texto | Passou |
| Timer ativo e movimento da logo dentro da área do controle | Passou |
| Preview da tela com Resetar sem borda | Inspecionado |

O reset em testes usa dados artificiais em uma pasta chamada `hollow-reset-test`. A instalação real do jogador não é apagada pelas verificações.

## Motor de instalação

O motor foi validado anteriormente com download real do Java 21, Minecraft 1.21.1, 3.888 recursos únicos e instalação do NeoForge 21.1.253. O cliente iniciou com NeoForge e AutoModpack usando o Java baixado pelo launcher. O registro de perfil oficial foi verificado em arquivos de teste, preservando outros perfis e criando backup.

Nesta versão, o reset é seguido pelo mesmo instalador. Uma reinstalação completa após apagar dados reais não foi repetida; o teste do reset usa arquivos artificiais e verifica a exclusão isoladamente.

## Limites

- Login Microsoft em conta real pelo programa oficial não foi validado de ponta a ponta.
- Entrada no servidor e download completo do modpack não foram validados de ponta a ponta.
- A autenticação por nickname depende das configurações do servidor.
- O bloqueio de reset por processos Java é conservador: outros programas Java também devem ser fechados.
- Nenhuma alteração da VPS ou reinício do servidor foi realizado.
