# Prevenir atualizações repetidas

O Hollow usa AutoModpack 5.0.0-rc.2 para sincronizar o pacote. Essa versão planeja a instalação enquanto o Minecraft ainda está aberto e verifica os arquivos novamente depois do fechamento. Mods que reescrevem configurações ao encerrar podem invalidar esse plano.

Foi confirmado nos registros o erro `Captured source changed` para configurações Java Properties: os valores permaneciam iguais, mas a data gravada em comentário mudava. O download já estava completo; a instalação falhava e a próxima conexão propunha a atualização novamente.

## Prevenção no pacote

O grupo principal deve excluir ambos os padrões:

```text
config/*.properties
config/**/*.properties
```

Isso mantém esses arquivos sob controle local, inclusive os de futuros mods que usem o mesmo formato. Instalações novas usam os padrões dos mods; personalizações nesses arquivos devem ser feitas localmente. Configurações JSON, JSON5, TOML, scripts e os próprios mods continuam seguindo as regras de distribuição do servidor.

Essa medida evita o conflito confirmado com arquivos Properties. Outros formatos que sejam modificados durante o encerramento ainda precisam ser analisados; ela não garante resolver todo erro de atualização do AutoModpack.

## Aplicar e verificar

No servidor, com Python 3, execute:

```text
python3 scripts/prevent-config-churn.py --server-dir /caminho/do/servidor --apply
```

O script preserva uma cópia da configuração anterior e aceita somente a estrutura esperada de um grupo principal. A aplicação é idempotente. Depois, no console do Minecraft:

```text
automodpack config reload
automodpack generate
```

Confira o pacote publicado:

```text
python3 scripts/prevent-config-churn.py --server-dir /caminho/do/servidor
```

A verificação falha se algum arquivo Properties ainda estiver publicado. Execute novamente ao alterar a política de distribuição ou adicionar grupos. O procedimento mantém configurações locais e mundos; não depende de uma rotina de recuperação no launcher.
