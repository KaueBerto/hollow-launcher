<p align="center">
  <img src="assets/logo_smp.png" alt="Hollow SMP" width="260">
</p>

<h1 align="center">Hollow Launcher</h1>

<p align="center">Launcher para Windows do Hollow SMP.<br>Instalação automática, visual pixelado e o seu modpack pelo AutoModpack.</p>

<p align="center">
  <img alt="Plataforma" src="https://img.shields.io/badge/Windows-10%20%2F%2011-8b2de2">
  <img alt="Minecraft" src="https://img.shields.io/badge/Minecraft-1.21.1-bb55ff">
  <img alt="NeoForge" src="https://img.shields.io/badge/NeoForge-21.1.253-8b2de2">
  <img alt="Versão" src="https://img.shields.io/badge/Launcher-1.7.0-bb55ff">
</p>

![Interface do Hollow Launcher](docs/launcher.png)

## Baixar e jogar

Baixe `HollowSMP-Launcher-Windows.zip` na página de [Releases](https://github.com/KaueBerto/hollow-launcher/releases/latest), extraia o pacote e abra `HollowSMP-Launcher.exe`.

1. Escolha **Nickname** ou **Microsoft** e ajuste a memória na barra.
2. Clique em **Instalar e jogar**. A primeira instalação baixa Java, Minecraft, bibliotecas e NeoForge.
3. Abra **Multijogador** e entre no servidor **Hollow SMP**.
4. Confirme a instalação do modpack pelo AutoModpack. Se houver pedido de reinício, feche o jogo, abra pelo launcher e conecte novamente.

A preparação inicial pode levar vários minutos, dependendo da conexão e do disco. Nas próximas aberturas, os arquivos instalados são reutilizados. O download do modpack acontece dentro do Minecraft, ao conectar ao servidor; a barra do launcher acompanha a preparação da base do jogo.

> O repositório é privado. Para distribuir aos jogadores sem acesso ao GitHub, compartilhe o ZIP da release por seu canal de downloads.

## Recursos

- Instalação automática do Java 21 e Minecraft 1.21.1 com NeoForge 21.1.253.
- AutoModpack 5.0.0-rc.2 incorporado e extraído sem modificações.
- Pasta própria do Hollow, separada das outras instalações do jogador.
- Logo original no ícone do executável, cores roxas e animação suave.
- Fonte Monocraft em negrito incorporada, sem instalação de fontes no Windows.
- Controle de memória de 2 a 24 GB por arraste ou teclado.
- Reset com confirmação, limpeza da instalação e nova preparação automática.
- Downloads por HTTPS, verificação de hashes quando disponíveis e arquivos temporários antes da substituição.

## Contas

| Modo | Como funciona |
| --- | --- |
| Nickname | Abre o jogo diretamente com um nome de 3 a 16 letras, números ou `_`. Não autentica uma conta Microsoft. A entrada no servidor depende de ele permitir esse modo. |
| Microsoft | Adiciona o perfil Hollow SMP ao **Minecraft Launcher oficial**, que faz o login e inicia o jogo. Exige acesso ao Minecraft Java na conta. |

Para Microsoft, instale o launcher oficial, faça login uma vez e feche-o antes de preparar o perfil no Hollow. Depois selecione **Hollow SMP** no programa oficial. O Hollow não coleta senhas nem implementa OAuth próprio. Os arquivos de perfis recebem backup antes da primeira alteração.

As regras de autenticação são definidas pelo servidor. Este projeto não altera a VPS nem desativa sua autenticação.

## Resetar

O botão **Resetar**, no topo, pede confirmação e apaga a pasta `%LOCALAPPDATA%\HollowSMP`, incluindo mods, configurações, mundos locais, screenshots, logs, Java e preferências. **Essa exclusão não pode ser desfeita.** Faça uma cópia dos mundos e screenshots que deseja guardar antes de confirmar.

Em seguida, o launcher baixa e instala a base do jogo novamente. O modpack será recebido na próxima conexão ao servidor. O reset não modifica o servidor nem remove os perfis e bibliotecas compartilhados do launcher oficial.

Feche o Minecraft e outros programas Java antes de resetar. O launcher bloqueia o reset enquanto houver processos `java` ou `javaw`, arquivos ocupados ou links de arquivos/pastas na instalação. Durante instalação e reset, os controles ficam desabilitados e a janela aguarda a conclusão para fechar.

## Requisitos

- Windows 10 ou 11 de 64 bits, com .NET Framework 4.8.
- Acesso à internet e espaço livre para o jogo e o modpack.
- RAM suficiente para o pack, mantendo memória livre para o Windows. A barra não detecta a RAM física; escolha um valor compatível com seu computador.
- Minecraft Launcher oficial para o modo Microsoft. Java é baixado automaticamente pelo Hollow.

## Compilar

Não é necessário instalar Node, Electron ou o SDK do .NET. O script utiliza o compilador do .NET Framework do Windows.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build.ps1
```

O executável será criado em `dist/HollowSMP-Launcher.exe`. O build confere o SHA256 do AutoModpack antes de incorporar o JAR.

```powershell
# Verificações locais, sem downloads do Minecraft
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1

# Pacote para distribuição com instruções e licenças
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package.ps1
```

## Estrutura

```text
src/         Interface Windows Forms, instalação e inicialização do jogo
assets/      Logo, ícone, fontes e bootstrap original do AutoModpack
scripts/     Compilação, verificações e pacote de distribuição
docs/        Preview, guia do jogador e validação
licenses/    Licenças das dependências distribuídas
dist/        Arquivos gerados, ignorados pelo Git
```

Versões do jogo e endereço do servidor ficam nas constantes de `Engine`, em `src/HollowLauncher.cs`. A disposição e os controles visuais ficam em `src/LauncherUI.cs`.

## Problemas e validação

Os logs ficam em `%LOCALAPPDATA%\HollowSMP`: `launcher-error.log`, `neoforge-install.log`, `game-launch.log` e `game\logs`. Uma instalação interrompida tenta reaproveitar downloads já verificados. Use reset quando precisar de uma instalação limpa.

Consulte [a validação](docs/VALIDACAO.md) para os testes realizados e limites. Login Microsoft e conexão completa com download do pack exigem validação com uma conta e com o servidor.

## Créditos

Monocraft é uma fonte **inspirada** no Minecraft, não a fonte oficial. AutoModpack e demais dependências mantêm suas licenças. Veja [THIRD-PARTY.txt](THIRD-PARTY.txt) e [licenses/](licenses/).

O código original e a identidade visual do Hollow SMP não têm uma licença de reutilização concedida neste repositório. As licenças de terceiros se aplicam aos respectivos componentes.

Projeto independente do Hollow SMP, sem vínculo oficial com Mojang ou Microsoft.
