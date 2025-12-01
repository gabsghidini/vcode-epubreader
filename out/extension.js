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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const epubViewProvider_1 = require("./epubViewProvider");
function activate(context) {
    const provider = new epubViewProvider_1.EpubWebviewProvider(context);
    let isOpening = false; // prevent re-entrance loop
    context.subscriptions.push(vscode.window.registerWebviewViewProvider("epubReader.explorerView", provider, {
        webviewOptions: {
            retainContextWhenHidden: true,
        },
    }));
    context.subscriptions.push(vscode.commands.registerCommand("epubReader.openFile", async (uri) => {
        if (isOpening) {
            return;
        }
        isOpening = true;
        try {
            provider.postStatus("opening");
        }
        catch {
        }
        let selectedUri = uri;
        if (!selectedUri) {
            const uris = await vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: { "ePub file": ["epub"] },
            });
            if (!uris || uris.length === 0) {
                isOpening = false;
                return;
            }
            selectedUri = uris[0];
        }
        if (!selectedUri) {
            return;
        }
        const bytes = await vscode.workspace.fs.readFile(selectedUri);
        const base64 = Buffer.from(bytes).toString("base64");
        try {
            const book = {
                path: selectedUri.toString(),
                name: selectedUri.path.split("/").pop() || selectedUri.path,
                base64,
            };
            // Attempt to show container first BEFORE sending book (so pendingBook flows if needed)
            const containerCmd = "workbench.view.extension.epubReader";
            const openViewCmd = "workbench.views.openView";
            const focusViewCmd = "epubReader.focusView";
            try {
                await vscode.commands.executeCommand(containerCmd);
            }
            catch {
            }
            // Attempt internal focusView command
            try {
                await vscode.commands.executeCommand(focusViewCmd);
            }
            catch { }
            // Try direct openView first (may show QuickPick if view not found)
            try {
                await vscode.commands.executeCommand(openViewCmd, "epubReader.sidebar");
            }
            catch {
            }
            // Poll up to 10s for provider readiness
            let ready = false;
            for (let i = 0; i < 100; i++) {
                if (provider.isReady && provider.isReady()) {
                    ready = true;
                    break;
                }
                await new Promise((r) => setTimeout(r, 100));
            }
            if (ready) {
                await provider.reveal();
                provider.showBook(book);
            }
            else {
                const panel = vscode.window.createWebviewPanel("epubReaderFallback", `EPUB: ${book.name}`, vscode.ViewColumn.One, {
                    enableScripts: true,
                    localResourceRoots: [
                        vscode.Uri.file(path.join(context.extensionPath, "media")),
                    ],
                });
                const scriptUri = panel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, "media", "webview.js")));
                const styleUri = panel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, "media", "webview.css")));
                const jszipUri = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
                const epubjsUri = "https://cdn.jsdelivr.net/npm/epubjs/dist/epub.min.js";
                panel.webview.html = `<!DOCTYPE html>
						<html lang="pt-BR">
						<head>
						<meta charset="UTF-8" />
						<meta name="viewport" content="width=device-width, initial-scale=1.0" />
						<link rel="stylesheet" href="${styleUri}" />
						<title>Epub Reader</title>
						<script src="${jszipUri}"></script>
						<script>if (typeof JSZip === 'undefined') { /* JSZip missing */ }</script>
						<script src="${epubjsUri}"></script>
						</head>
						<body>
						<div id="toolbar">
							<button id="open">Abrir EPUB</button>
							<button id="openSidebar">Abrir na Barra Lateral</button>
							<span id="book-title">${book.name}</span>
						</div>
						<div id="viewer"></div>
						<script src="${scriptUri}"></script>
						</body>
						</html>`;
                panel.webview.postMessage({ command: "loadBook", book });
                panel.webview.onDidReceiveMessage(async (m) => {
                    if (m && m.command === "openInSidebar") {
                        try {
                            try {
                                await vscode.commands.executeCommand(containerCmd);
                            }
                            catch { }
                            // poll up to 3s
                            for (let i = 0; i < 50; i++) {
                                if (provider.isReady && provider.isReady()) {
                                    await provider.reveal();
                                    provider.showBook(book);
                                    panel.webview.postMessage({ command: "status", status: "opened" });
                                    panel.dispose();
                                    return;
                                }
                                await new Promise((r) => setTimeout(r, 100));
                            }
                            panel.webview.postMessage({ command: "status", status: "failed" });
                        }
                        catch {
                            try {
                                panel.webview.postMessage({ command: "status", status: "failed" });
                            }
                            catch { }
                        }
                    }
                });
            }
        }
        finally {
            isOpening = false;
            try {
                provider.postStatus("ready");
            }
            catch {
            }
        }
    }));
    // also add a command to open the active editor's file
    context.subscriptions.push(vscode.commands.registerCommand("epubReader.openActiveEditor", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const doc = editor.document;
        if (!doc || !doc.uri || doc.uri.scheme !== "file")
            return;
        if (!doc.uri.path.endsWith(".epub")) {
            vscode.window.showInformationMessage("Active file is not an EPUB.");
            return;
        }
        const bytes = await vscode.workspace.fs.readFile(doc.uri);
        const base64 = Buffer.from(bytes).toString("base64");
        provider.showBook({
            path: doc.uri.toString(),
            name: doc.uri.path.split("/").pop() || doc.uri.path,
            base64,
        });
        provider.reveal();
    }));
    // internal focus command to attempt reveal programmatically
    context.subscriptions.push(vscode.commands.registerCommand("epubReader.focusView", async () => {
        try {
            await provider.reveal();
        }
        catch { }
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map