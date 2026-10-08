# Verificador de atualização do modpack

As três classes nesta pasta são compiladas para Java 21. ReviewedUpdatePlan e ClientGenerationStore derivam do AutoModpack 5.0.0-rc.2, commit upstream dd5ba41, sob LGPL-3.0. As alterações só são carregadas pelo processo de verificação offline do launcher; o mod original permanece intacto.

- O launcher aguarda o jogo e seu helper encerrarem antes de retomar uma transação.
- Comentários, datas e ordem em config/*.properties podem variar se todas as propriedades continuarem idênticas. Mudanças de valores, caminhos e arquivos de mods continuam sendo rejeitadas.
- Um histórico sem políticas intermediárias pode avançar a partir do registro de propriedade da geração finalizada, validando a política de destino. A alternativa não permite retroceder ou misturar pacotes.

Para recompilar, use JDK 21 e as bibliotecas Gson 2.10.1 e Log4j API 2.22.1 da instalação do jogo. Na raiz do repositório:

```powershell
$libs = 'C:\caminho\game\libraries'
$cp = "assets\automodpack-5.0.0-rc.2.jar;$libs\com\google\code\gson\gson\2.10.1\gson-2.10.1.jar;$libs\org\apache\logging\log4j\log4j-api\2.22.1\log4j-api-2.22.1.jar"
javac --release 21 -cp $cp -d work/preflight-classes java/preflight/*.java
node scripts/package-preflight.cjs work/preflight-classes
```

O script empacota as classes e atualiza o hash usado pelo launcher. Para executar os testes Java, compile tests/java/*.java com o JAR gerado primeiro no classpath e acrescente Log4j Core 2.22.1. Cada teste recebe uma pasta de jogo vazia, diferente, e deve usar `-Dautomodpack.data.root=<pasta temporária diferente>` para não alterar o cache real. Execute também `npm test` e `npm run test:ui` antes de distribuir uma nova versão.
