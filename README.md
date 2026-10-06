<p align="center"><img src="assets/logo_smp.png" alt="Hollow SMP" width="260"></p>
<h1 align="center">Hollow Launcher</h1>
<p align="center">Launcher Electron do Hollow SMP para Windows.<br>Instalação automática, visual pixelado e modpack pelo AutoModpack.</p>
<p align="center"><img alt="Electron" src="https://img.shields.io/badge/Electron-44.5.1-8b2de2"> <img alt="Minecraft" src="https://img.shields.io/badge/Minecraft-1.21.1-bb55ff"> <img alt="Launcher" src="https://img.shields.io/badge/Launcher-2.0.1-8b2de2"></p>

![Interface do Hollow Launcher](docs/launcher.png)

## Baixar e jogar

Baixe o ZIP na página de [Releases](https://github.com/KaueBerto/hollow-launcher/releases/latest), extraia e abra `HollowSMP-Launcher.exe`. Também é possível baixar o executável portátil da release diretamente.

1. Escolha **Nickname** ou **Microsoft** e ajuste a memória.
2. Clique em **Instalar e jogar** e aguarde a preparação inicial.
3. Abra **Multijogador** e entre no **Hollow SMP**.
4. Confirme o download do modpack pelo AutoModpack. Se ele pedir reinício, feche o Minecraft, abra pelo launcher e conecte novamente.

A primeira preparação baixa Java 21, Minecraft 1.21.1, NeoForge 21.1.253 e recursos do jogo. Pode levar vários minutos. Nas próximas aberturas, o launcher reutiliza a instalação. O modpack é recebido **dentro do Minecraft**, ao entrar no servidor; a barra do launcher mostra a preparação da base.

O repositório é privado. Para jogadores sem acesso ao GitHub, compartilhe o ZIP por seu canal de downloads.

## Versão Electron

A versão 2.0 substitui a interface Windows Forms por HTML, CSS e JavaScript, com motor de instalação em Node.js. Não usa um executável C# como backend.

- Cores roxas da logo, fonte Monocraft em negrito e controles superiores sem borda.
- Flutuação suave da logo com animação CSS por `transform`, pausada ao ocultar a janela. Respeita a preferência do sistema por movimento reduzido.
- Memória de 2 a 24 GB por arraste ou teclado.
- Reset com confirmação e preparação automática da nova instalação.
- Downloads HTTPS, hashes, tentativas automáticas e até 12 recursos em paralelo.
- Janela isolada: Node desabilitado na interface, sandbox e API limitada no preload.

A pasta `%LOCALAPPDATA%\HollowSMP` e as preferências da versão 1.x são reaproveitadas. **Feche o launcher antigo antes de usar o novo.** O Electron inclui Chromium: o executável e o consumo de memória são maiores que na versão C#.

## Contas

| Modo | Funcionamento |
| --- | --- |
| Nickname | Inicia diretamente com um nome de 3 a 16 letras, números ou `_`. Não autentica uma conta Microsoft; a entrada depende de o servidor permitir esse modo. |
| Microsoft | Cria o perfil Hollow SMP no **Minecraft Launcher oficial**, que faz o login e inicia o jogo. Exige acesso ao Minecraft Java na conta. |

Para Microsoft, instale o programa oficial, faça login uma vez e feche-o. Depois prepare o perfil pelo Hollow e selecione **Hollow SMP** no launcher oficial. Os arquivos de perfis recebem backup antes da primeira alteração. O Hollow não coleta senhas nem implementa OAuth próprio.

A autenticação do servidor é responsabilidade da configuração da VPS. Este projeto não altera essas regras.

## Resetar

O botão **Resetar** pede confirmação e apaga `%LOCALAPPDATA%\HollowSMP`, incluindo mods, configurações, mundos locais, screenshots, logs, Java e preferências. **A exclusão não pode ser desfeita.** Faça backup do que deseja guardar.

Depois, a base do jogo é preparada novamente. Entre no servidor para receber o modpack. O reset preserva o servidor e os perfis e bibliotecas compartilhados do launcher oficial.

Feche Minecraft e outros programas Java antes. O reset recusa processos `java`/`javaw`, arquivos ocupados e links de arquivos ou pastas. Os controles ficam desabilitados durante instalação e reset.

## Requisitos

- Windows 10 ou 11 de 64 bits.
- Internet, espaço para o jogo/modpack e memória suficiente para o pack.
- Minecraft Launcher oficial para Microsoft.

O jogador não precisa instalar Node.js, Electron, Java ou um SDK. A barra de RAM não verifica a capacidade física: deixe memória livre para Windows e outros programas.

## Desenvolver e compilar

Use Node.js 24 LTS e npm em Windows x64. As versões de dependências são fixadas no `package-lock.json`.

```powershell
npm ci
npm start
npm test
npm run test:ui
npm run build
npm run package
```

`build` gera `dist/HollowSMP-Launcher-2.0.1.exe`, um executável portátil. `package` gera `dist/HollowSMP-Launcher-Windows.zip`, instruções, licenças e `SHA256.txt`. O empacotamento usa electron-builder e não exige Visual Studio ou compilador C#.

O executável não possui certificado de assinatura de código do Hollow. Para uma distribuição assinada, configure seu certificado no electron-builder.

## Estrutura

```text
src/main.cjs       Janela Electron, estado e IPC
src/preload.cjs    API limitada exposta à interface
src/engine.cjs     Instalação, reset, perfis e inicialização do jogo
renderer/         HTML, CSS, eventos e animação
assets/           Logo, ícone, fontes e AutoModpack original
scripts/          Smoke test, integração opcional e distribuição
tests/           Testes isolados do motor (sem dados do jogador)
licenses/         Licenças de dependências distribuídas
docs/             Guia, preview e validação
dist/             Arquivos gerados, ignorados pelo Git
```

Versões do jogo e servidor ficam em `src/engine.cjs`. O layout está em `renderer/style.css`. As versões C# anteriores continuam disponíveis nas tags 1.x do GitHub.

## Verificações e problemas

`npm test` verifica UUID, manifestos, caminhos, preferências, reset, arquivos ocupados, junctions, ZIPs, downloads e preservação de perfis Microsoft. `npm run test:ui` abre a interface em renderização isolada, testa os controles e gera screenshots. Todos os dados de teste ficam em `dist/`.

A integração opcional `node scripts/verify-engine.cjs <pasta>` prepara o jogo e abre um cliente de teste. Ela exige uma pasta isolada chamada `electron-install-test` ou `runtime-download-test`, e encerra apenas o cliente que iniciou. Não use a instalação do jogador.

Logs: `%LOCALAPPDATA%\HollowSMP\launcher-error.log`, `neoforge-install.log`, `game-launch.log` e `game\logs`. Instalações interrompidas reaproveitam arquivos verificados quando você tenta novamente. Consulte [a validação](docs/VALIDACAO.md) para os testes e limites.

## Créditos

Monocraft é inspirada no Minecraft, **não a fonte oficial**. AutoModpack, Electron, Chromium e adm-zip mantêm suas licenças; veja [THIRD-PARTY.txt](THIRD-PARTY.txt) e [licenses/](licenses/). O pacote também inclui os avisos de terceiros do Chromium.

O código original e a identidade visual do Hollow SMP não recebem licença de reutilização neste repositório. As licenças de terceiros se aplicam aos respectivos componentes.

Projeto independente do Hollow SMP, sem vínculo oficial com Mojang ou Microsoft.