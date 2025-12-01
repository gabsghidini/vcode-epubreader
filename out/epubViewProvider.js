"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.EpubWebviewProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
class EpubWebviewProvider {
    constructor(context) {
        this._context = context;
    }
    resolveWebviewView(webviewView) {
        console.log('EpubWebviewProvider: resolveWebviewView');
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this._context.extensionPath, 'media'))
            ]
        };
        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(async (message) => {
            console.log('EpubWebviewProvider: received message', message);
            switch (message.command) {
                case 'openFile':
                    vscode.commands.executeCommand('epubReader.openFile');
                    break;
                case 'saveLocation':
                    const uri = message.path || this._currentBookUri;
                    if (uri) {
                        const key = this.getKeyForBook(uri);
                        await this._context.globalState.update(key, message.location);
                    }
                    break;
            }
        });
        // if we had a pending book to load, do it now
        if (this._pendingBook) {
            const saved = this._context.globalState.get(this.getKeyForBook(this._pendingBook.path));
            this._view.webview.postMessage({ command: 'loadBook', book: this._pendingBook, lastLocation: saved });
            this._pendingBook = undefined;
        }
    }
    async showBook(book) {
        console.log('EpubWebviewProvider: showBook', book.path);
        this._currentBookUri = book.path;
        if (!this._view) {
            this._pendingBook = book;
            return;
        }
        const msg = {
            command: 'loadBook',
            book
        };
        const saved = this._context.globalState.get(this.getKeyForBook(book.path));
        if (saved) {
            msg.lastLocation = saved;
        }
        this._view.webview.postMessage(msg);
    }
    postStatus(status) {
        if (!this._view)
            return;
        this._view.webview.postMessage({ command: 'status', status });
    }
    async reveal() {
        // Prefer showing the view if we already have it
        try {
            if (this._view && typeof this._view.show === 'function') {
                this._view.show(true);
                return;
            }
        }
        catch (err) {
            console.warn('Error showing WebviewView directly:', err);
        }
        // Try a few possible commands that may be available in different VS Code versions.
        // Avoid triggering commands that open a Quick Pick (workbench.action.openView)
        // Instead, only run the container command if it exists in the commands list.
        try {
            const commands = await vscode.commands.getCommands(true);
            const containerCmd = 'workbench.view.extension.epubReader.container';
            if (commands.includes(containerCmd)) {
                await vscode.commands.executeCommand(containerCmd);
                return;
            }
        }
        catch (err) {
            console.warn('Error while attempting to reveal view with container command', err);
        }
        // No reveal command worked — provide an actionable message
        vscode.window.showInformationMessage('Epub Reader: a view não está visível. Abra-a pela paleta (View: Show View → Epub Reader).');
    }
    isReady() {
        return !!this._view;
    }
    getKeyForBook(uri) {
        return `epubReader:lastLocation:${uri}`;
    }
    getHtmlForWebview(webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.file(path.join(this._context.extensionPath, 'media', 'webview.js')));
        const jszipUri = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        const epubjsUri = 'https://cdn.jsdelivr.net/npm/epubjs/dist/epub.min.js';
        const styleUri = webview.asWebviewUri(vscode.Uri.file(path.join(this._context.extensionPath, 'media', 'webview.css')));
        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Epub Reader</title>
  <script src="${jszipUri}"></script>
  <script>
    // Ensure JSZip is available for epub.js
    if (typeof JSZip === 'undefined') {
      console.warn('JSZip not loaded; epub.js may fail to parse epubs');
    }
  </script>
  <script src="${epubjsUri}"></script>
</head>
<body>
  <div id="toolbar">
    <button id="open">Abrir EPUB</button>
    <span id="book-title">Nenhum livro aberto</span>
  </div>
  <div id="viewer"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
    }
}
exports.EpubWebviewProvider = EpubWebviewProvider;
//# sourceMappingURL=epubViewProvider.js.map