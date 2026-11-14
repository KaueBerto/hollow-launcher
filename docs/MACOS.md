# Averon Launcher no macOS

O instalador universal funciona em Macs Intel e em Macs com Apple Silicon (M1, M2, M3, M4 e posteriores).

## Instalar

1. Baixe o arquivo `.dmg` da versão mais recente em [Releases](https://github.com/KaueBerto/hollow-launcher/releases/latest).
2. Abra o `.dmg` e arraste **Averon Launcher** para **Aplicativos**.
3. Na primeira abertura, clique com o botão direito no aplicativo e escolha **Abrir**.
4. Confirme **Abrir** no aviso do macOS.

O projeto ainda não possui uma assinatura Apple Developer ID. Por isso, o Gatekeeper pode impedir a primeira abertura mesmo que o arquivo seja legítimo. Se **Abrir** não aparecer, tente abrir o app uma vez e depois use **Ajustes do Sistema > Privacidade e Segurança > Abrir Mesmo Assim**. Baixe somente da página oficial do projeto.

O launcher baixa seu próprio Java 21 para a arquitetura do Mac. Não é necessário instalar Java, Node.js ou Electron.

## Dados e atualização

Os dados ficam em `~/Library/Application Support/averon-launcher`. O `.zip` publicado junto do `.dmg` é usado pelo atualizador automático e não precisa ser instalado manualmente.

Para remover somente o aplicativo, apague **Averon Launcher** de **Aplicativos**. Isso não apaga o jogo nem as configurações na pasta de dados.
