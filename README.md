# EPUB Reader — VS Code extension

Extensão simples que abre arquivos EPUB em um Webview na barra lateral (Activity Bar) e salva o último local lido para cada arquivo.

Como usar
- Clique no ícone "Epub Reader" na Activity Bar (barra lateral do VSCode) para abrir a visão; também é possível usar o comando "Open EPUB File" (Ctrl+Shift+P → Open EPUB File) ou clicar com o botão direito em um arquivo .epub no Explorer e selecionar "Open EPUB File".
- Abra um arquivo .epub do sistema. O leitor mostrará o conteúdo e salvará a posição atual de leitura. Ao reabrir o mesmo arquivo, a leitura será retomada do último local salvo.

Desenvolvimento
1. Instale dependências: `npm install`.
2. Compile: `npm run build`.
3. Pressione F5 no VS Code para abrir uma nova janela com a extensão em desenvolvimento.

Notas técnicas
- Usa um Webview View (barra lateral) para integração com a Activity Bar. A webview carrega epub.js para renderizar o arquivo EPUB.
- A posição de leitura é salva usando `context.globalState` por URI de arquivo.

Licença
MIT
# EPUB Reader VS Code Extension

Extensão para ler ePubs dentro do VS Code, usando `epub.js` dentro de um WebView, e salvando automaticamente o último local lido por arquivo.

Comandos:
- `Open EPUB` — Abre um epub

Como usar:
- Instale dependências: `npm install`
- Build: `npm run compile`
- Inicie a extensão com `F5` em um ambiente de extensão do VSCode

Observações:
- Usa `workspaceState` para salvar último local por URI do arquivo.
- Webview carrega `epub.js` por CDN.
