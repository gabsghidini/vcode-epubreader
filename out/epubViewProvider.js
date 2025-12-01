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
        console.log('EpubWebviewProvider: reveal invoked');
        // If view already created, try direct show first
        if (this._view && typeof this._view.show === 'function') {
            try {
                this._view.show(true);
                return;
            }
            catch (err) {
                console.warn('EpubWebviewProvider: direct show failed', err);
            }
        }
        // Always attempt container command (does nothing if already visible)
        try {
            // Try direct openView first
            try {
                console.log('EpubWebviewProvider: attempting workbench.views.openView epubReader.sidebar');
                await vscode.commands.executeCommand('workbench.views.openView', 'epubReader.sidebar');
            }
            catch (err) {
                console.warn('EpubWebviewProvider: openView failed (may be benign)', err);
            }
            await vscode.commands.executeCommand('workbench.view.extension.epubReader');
            // After executing, if still not ready, give a short grace period
            if (!this._view) {
                for (let i = 0; i < 5; i++) {
                    await new Promise(r => setTimeout(r, 100));
                    if (this._view)
                        break;
                }
            }
            if (this._view && typeof this._view.show === 'function') {
                try {
                    this._view.show(true);
                }
                catch { }
                return;
            }
        }
        catch (err) {
            console.warn('EpubWebviewProvider: container command failed', err);
        }
        vscode.window.showInformationMessage('EPUB Reader: não foi possível revelar a view automaticamente. Abra a Activity Bar e clique em "Epub Reader".');
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