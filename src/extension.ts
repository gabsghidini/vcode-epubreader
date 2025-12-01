import * as vscode from "vscode";
import * as path from "path";
import { EpubWebviewProvider } from "./epubViewProvider";

export function activate(context: vscode.ExtensionContext) {
	console.log("EPUB Reader: activate");
	const provider = new EpubWebviewProvider(context);
	let isOpening = false; // prevent re-entrance loop

	// Diagnostic: list container-related commands at activation
	vscode.commands.getCommands(true).then(cmds => {
		const containerCmds = cmds.filter(c => c.startsWith('workbench.view.extension.'));
		console.log('EPUB Reader: available container commands', containerCmds);
		if (!containerCmds.includes('workbench.view.extension.epubReader')) {
			console.warn('EPUB Reader: expected container command workbench.view.extension.epubReader NOT found. Right-click Activity Bar to ensure custom views are visible.');
		}
	});

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			"epubReader.sidebar",
			provider
		)
	);

	// Register the same provider for explorer fallback view
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			"epubReader.explorerView",
			provider
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"epubReader.openFile",
			async (uri?: vscode.Uri) => {
				if (isOpening) {
					console.log(
						"openFile: already opening, ignoring duplicate invocation"
					);
					return;
				}
				isOpening = true;
				try {
					provider.postStatus("opening");
				} catch (err) {
					console.warn(
						"Could not post opening status to webview",
						err
					);
				}
				console.log(
					"epubReader.openFile command invoked, uri:",
					uri && (uri.toString ? uri.toString() : ""),
					"activeEditor:",
					vscode.window.activeTextEditor?.document?.uri?.toString()
				);
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
					console.log(
						"openFile: no selectedUri after showOpenDialog, returning"
					);
					return;
				}
				console.log("openFile: selected uri", selectedUri.toString());
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
						const all = await vscode.commands.getCommands(true);
						console.log(
							"openFile: executing container command early",
							containerCmd,
							"commandsTotal=",
							all.length,
							"hasContainer=",
							all.includes(containerCmd)
						);
						await vscode.commands.executeCommand(containerCmd);
					} catch (err) {
						console.warn("openFile: container command execution failed", err);
					}
					// Attempt internal focusView command
					try { await vscode.commands.executeCommand(focusViewCmd); } catch (err) { console.warn("openFile: focusView internal command failed", err); }
					// Try direct openView first (may show QuickPick if view not found)
					try {
						console.log("openFile: attempting direct openView for epubReader.sidebar");
						await vscode.commands.executeCommand(openViewCmd, "epubReader.sidebar");
					} catch (err) {
						console.warn("openFile: openView command failed (may be normal)", err);
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
						console.log("openFile: provider ready, revealing + loading book");
						await provider.reveal();
						provider.showBook(book);
					} else {
						console.log("openFile: provider NOT ready after wait (10s), using fallback panel");
						const panel = vscode.window.createWebviewPanel(
							"epubReaderFallback",
							`EPUB: ${book.name}`,
							vscode.ViewColumn.One,
							{
								enableScripts: true,
								localResourceRoots: [
									vscode.Uri.file(path.join(context.extensionPath, "media")),
								],
							},
						);
						const scriptUri = panel.webview.asWebviewUri(
							vscode.Uri.file(path.join(context.extensionPath, "media", "webview.js"))
						);
						const styleUri = panel.webview.asWebviewUri(
							vscode.Uri.file(path.join(context.extensionPath, "media", "webview.css"))
						);
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
						<script>if (typeof JSZip === 'undefined') { console.warn('JSZip not loaded in fallback webview; epub.js may fail'); }</script>
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
								console.log("extension: fallback panel requested openInSidebar (early container exec)");
								try {
									try { await vscode.commands.executeCommand(containerCmd); } catch (err) { console.warn("fallback: container command failed", err); }
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
								} catch (err) {
									console.warn("fallback: error opening in sidebar", err);
									try { panel.webview.postMessage({ command: "status", status: "failed" }); } catch {}
								}
							}
						});
					}
				} finally {
					isOpening = false;
					try {
						provider.postStatus("ready");
					} catch (err) {
						console.warn("Error posting ready status", err);
					}
				}
			}
		)
	);

	// also add a command to open the active editor's file
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"epubReader.openActiveEditor",
			async () => {
				console.log("epubReader.openActiveEditor invoked");
				const editor = vscode.window.activeTextEditor;
				if (!editor) return;
				const doc = editor.document;
				if (!doc || !doc.uri || doc.uri.scheme !== "file") return;
				if (!doc.uri.path.endsWith(".epub")) {
					vscode.window.showInformationMessage(
						"Active file is not an EPUB."
					);
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
			}
		)
	);

	// internal focus command to attempt reveal programmatically
	context.subscriptions.push(
		vscode.commands.registerCommand("epubReader.focusView", async () => {
			console.log("epubReader.focusView invoked");
			try { await provider.reveal(); } catch (err) { console.warn("focusView: reveal failed", err); }
		})
	);
}

export function deactivate() {}
