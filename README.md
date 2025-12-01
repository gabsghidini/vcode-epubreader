# EPUB Reader para VS Code

Extensão que abre arquivos EPUB no painel Explorer do VS Code com tema escuro e persistência automática.

## ✨ Funcionalidades

- 📚 Leitor EPUB integrado no painel Explorer
- 💾 Salva automaticamente a posição de leitura
- 🔄 Reabre o último livro automaticamente
- ⚡ Navegação por teclado (← →)
- 📑 Seletor de capítulos
- 🎨 Tema escuro com letras brancas
- 📊 Barra de progresso visual

## 🚀 Como Instalar Localmente

### Opção 1: Instalar com VSCE (Recomendado)

1. Instale o VSCE globalmente:
```bash
npm install -g @vscode/vsce
```

2. Compile e empacote a extensão:
```bash
cd c:\SDK\epubreader
npm run build
vsce package
```

3. Instale o arquivo `.vsix` gerado:
   - Abra VS Code
   - Vá em Extensions (Ctrl+Shift+X)
   - Clique nos "..." no topo
   - Escolha "Install from VSIX..."
   - Selecione o arquivo `vscode-epub-reader-0.1.0.vsix`

### Opção 2: Modo Desenvolvimento

1. Abra a pasta do projeto no VS Code
2. Pressione `F5` para abrir uma nova janela com a extensão ativa
3. Use para desenvolvimento e testes

## 📖 Como Usar

1. Abra o painel Explorer (ícone de arquivos)
2. Expanda "EPUB Reader" na parte inferior
3. Clique em "Abrir EPUB" ou use o comando `Open EPUB File`
4. Navegue com as setas ou use ← → no teclado
5. Selecione capítulos no dropdown

## 🔧 Desenvolvimento

```bash
npm install
npm run build
npm run watch  # Para desenvolvimento contínuo
```

## 📝 Notas Técnicas

- Usa WebView com epub.js (CDN)
- Posição salva em `globalState`
- Tema personalizado aplicado via CSS
- Suporte a navegação por teclado
