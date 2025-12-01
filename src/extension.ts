import * as vscode from "vscode";
import * as path from "path";
import { EpubWebviewProvider } from "./epubViewProvider";

export function activate(context: vscode.ExtensionContext) {
	console.log("EPUB Reader: activate");
	const provider = new EpubWebviewProvider(context);
	let isOpening = false; // prevent re-entrance loop

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			"epubReader.sidebar",
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
						name:
							selectedUri.path.split("/").pop() ||
							selectedUri.path,
						base64,
					};
					provider.showBook(book);
					// Try to open the Activity Bar view first (if the view provider resolves quickly)
					let shown = false;
					try {
						// Execute the container command if available and then poll for readiness
						const containerCmd =
							"workbench.view.extension.epubReader.container";
						const commands = await vscode.commands.getCommands(
							true
						);
						if (commands.includes(containerCmd)) {
							await vscode.commands.executeCommand(containerCmd);
							// poll for provider readiness for up to 1s
							for (let i = 0; i < 10; i++) {
								if (provider.isReady && provider.isReady()) {
									await provider.reveal();
									shown = true;
									break;
								}
								await new Promise((r) => setTimeout(r, 100));
							}
						}
					} catch (err) {
						console.warn("Error trying to show sidebar view", err);
					}
					if (!shown) {
						// view not ready; open a fallback WebviewPanel so user can see the EPUB
						const panel = vscode.window.createWebviewPanel(
							"epubReaderFallback",
							`EPUB: ${book.name}`,
							vscode.ViewColumn.One,
							{
								enableScripts: true,
								localResourceRoots: [
									vscode.Uri.file(
										path.join(
											context.extensionPath,
											"media"
										)
									),
								],
							}
						);
						const scriptUri = panel.webview.asWebviewUri(
							vscode.Uri.file(
								path.join(
									context.extensionPath,
									"media",
									"webview.js"
								)
							)
						);
						const styleUri = panel.webview.asWebviewUri(
							vscode.Uri.file(
								path.join(
									context.extensionPath,
									"media",
									"webview.css"
								)
							)
						);
						const jszipUri =
							"https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
						const epubjsUri =
							"https://cdn.jsdelivr.net/npm/epubjs/dist/epub.min.js";
						panel.webview.html = `<!DOCTYPE html>
                        <html lang="pt-BR">
                            <head>
                                <meta charset="UTF-8" />
                                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                                <link rel="stylesheet" href="${styleUri}" />
                                <title>Epub Reader</title>
                                <script src="${jszipUri}"></script>
                                <script>
                                    if (typeof JSZip === 'undefined') {
                                        console.warn('JSZip not loaded in fallback webview; epub.js may fail');
                                    }
                                </script>
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
						// pass the book to the panel's webview once it's ready
						panel.webview.postMessage({
							command: "loadBook",
							book,
						});
						// handle incoming messages from the panel
						panel.webview.onDidReceiveMessage(async (m) => {
							if (m && m.command === 'openInSidebar') {
								console.log('extension: fallback panel requested openInSidebar');
								try {
									const commands = await vscode.commands.getCommands(true);
									const toggleSidebar = 'workbench.action.toggleSidebarVisibility';
									const focusSidebar = 'workbench.action.focusSideBar';
									const viewCmd = 'workbench.views.openView';
									const containerCmd = 'workbench.view.extension.epubReader.container';
									let executed = false;
									// First, ensure the sidebar is visible and focused
									if (commands.includes(toggleSidebar)) {
										try {
											console.log('extension: ensuring sidebar is visible');
											await vscode.commands.executeCommand(toggleSidebar);
											await new Promise((r) => setTimeout(r, 200));
										} catch (err) {
											console.warn('extension: toggleSidebar failed', err);
										}
									}
									if (commands.includes(focusSidebar)) {
										try {
											console.log('extension: focusing sidebar');
											await vscode.commands.executeCommand(focusSidebar);
											await new Promise((r) => setTimeout(r, 200));
										} catch (err) {
											console.warn('extension: focusSidebar failed', err);
										}
									}
									// Try to open specific view first with workbench.views.openView
									if (commands.includes(viewCmd)) {
										try {
											console.log('extension: executing workbench.views.openView', 'epubReader.sidebar');
											await vscode.commands.executeCommand(viewCmd, 'epubReader.sidebar');
											executed = true;
											await new Promise((r) => setTimeout(r, 200));
										} catch (err) {
											console.warn('extension: workbench.views.openView failed', err);
										}
									}
									// If not executed, try container command
									if (!executed && commands.includes(containerCmd)) {
										try {
											console.log('extension: executing container command', containerCmd);
											await vscode.commands.executeCommand(containerCmd);
											executed = true;
											await new Promise((r) => setTimeout(r, 200));
										} catch (err) {
											console.warn('extension: container command failed', err);
										}
									}
									if (!executed) {
										console.log('extension: no suitable command to open sidebar found');
										vscode.window.showInformationMessage('Epub Reader: a barra lateral não está disponível neste host. Abra manualmente a Activity Bar.');
										return;
									}
									// poll for provider readiness (up to ~3s)
									for (let i = 0; i < 30; i++) {
										if (provider.isReady && provider.isReady()) {
											console.log('extension: provider is ready, revealing');
											await provider.reveal();
											break;
										}
										await new Promise((r) => setTimeout(r, 100));
									}
									// ensure book is shown in sidebar as well
									provider.showBook(book);
									// send status back to panel
									try { panel.webview.postMessage({ command: 'status', status: 'opened' }); } catch (err) {}
								} catch (err) {
									console.warn('Error opening in sidebar', err);
									try { panel.webview.postMessage({ command: 'status', status: 'failed' }); } catch (err) {}
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
}

export function deactivate() {}
