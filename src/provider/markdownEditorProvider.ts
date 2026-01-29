import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { Handler } from '../common/handler';
import { buildPath, writeFile } from '../common/fileUtil';
import { organizeImages } from '../common/imageOrganizer';

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
    
    private readonly context: vscode.ExtensionContext;
    private readonly state: vscode.Memento;
    private text: { [key: string]: string } = {};

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.state = context.globalState;
    }

    private getFolders(): vscode.Uri[] {
        const folders: vscode.Uri[] = [];
        if (vscode.workspace.workspaceFolders) {
            folders.push(...vscode.workspace.workspaceFolders.map(folder => folder.uri));
        }
        return folders;
    }

    public async resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken): Promise<void> {
        const webview = webviewPanel.webview;
        const folderPath = vscode.Uri.joinPath(document.uri, "..");
        webview.options = {
            enableScripts: true,
            localResourceRoots: [...this.getFolders(), vscode.Uri.file(path.dirname(document.uri.fsPath)), vscode.Uri.file(`${this.context.extensionPath}/media`)],
        };
        this.text[document.uri.fsPath] = document.getText();
        const contextPath = `${this.context.extensionPath}/media`;
        const rootPath = webview
            .asWebviewUri(vscode.Uri.file(`${contextPath}`))
            .toString();
        const basePath = folderPath;
        const baseUrl = webview
            .asWebviewUri(basePath)
            .toString()
            .replace(/\?.+$/, "")
            .replace("https://git", "https://file");
        
        try {
            const indexHtmlPath = path.join(this.context.extensionPath, 'media', 'index.html');
            const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
            webview.html = buildPath(indexHtml
                .replace("{{rootPath}}", rootPath)
                .replace("{{baseUrl}}", baseUrl), webview, contextPath);
        } catch (error) {
            console.error('Failed to load index.html', error);
            webview.html = `<html><body><h1>Failed to load editor</h1><p>${error}</p></body></html>`;
        }

        const handler = Handler.bind(webviewPanel, document.uri);
        
        handler.on("init", () => {
            const scrollTop = this.state.get(`scrollTop_${document.uri.fsPath}`, 0);
            const config = vscode.workspace.getConfiguration("md-editor-pro");
            handler.emit("open", {
                title: path.basename(document.uri.fsPath),
                language: vscode.env.language,
                scrollTop,
                rootPath,
                content: this.text[document.uri.fsPath],
                config: {
                    lineNumbers: config.get("preview.lineNumbers"),
                    tab: config.get("tab"),
                    mathEngine: config.get("preview.math.engine"),
                },
            });
        });

        handler.on("change", (content: string) => {
            this.updateTextDocument(document, content);
        });

        // Auto update on file save
        const saveListener = vscode.workspace.onWillSaveTextDocument((e) => {
            if (e.document.uri.fsPath === document.uri.fsPath) {
                // Auto organize images
                try {
                    e.waitUntil(organizeImages(e.document));
                } catch (error) {
                    console.error('Failed to organize images:', error);
                }
            }
        });

        // Sync changes back to webview (if external edit happened)
        const changeListener = vscode.workspace.onDidChangeTextDocument((e) => {
             if (e.document.uri.fsPath === document.uri.fsPath) {
                const val = e.document.getText();
                if (this.text[document.uri.fsPath] !== val) {
                    this.text[document.uri.fsPath] = val;
                    handler.emit("setValue", val);
                }
             }
        });

        webviewPanel.onDidDispose(() => {
            saveListener.dispose();
            changeListener.dispose();
        });

        this.handleEvent(document, handler);
    }

    private handleEvent(document: vscode.TextDocument, handler: Handler): void {
        handler
            .on("openLink", (uri: string) => {
                const resReg = /https:\/\/file.*\.net/i;
                if (uri.match(resReg)) {
                    const localPath = uri.replace(resReg, "");
                    vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(localPath));
                }
                else {
                    vscode.env.openExternal(vscode.Uri.parse(uri));
                }
            })
            .on("img", async (message: any) => {
                const isLegacy = Buffer.isBuffer(message) || typeof message === 'string';
                const imgData = isLegacy ? message : message.data;
                const placeholder = isLegacy ? undefined : message.placeholder;

                const config = vscode.workspace.getConfiguration("md-editor-pro");
                const location = config.get<string>("uploads.location") || "images";
                const autoOrganize = config.get<boolean>("uploads.autoOrganize");
                
                // Use simple timestamp naming for initial upload
                let timestamp = new Date().getTime();
                if (placeholder) {
                    const match = /uploading-(\d+)/.exec(placeholder);
                    if (match) {
                        timestamp = parseInt(match[1]);
                    }
                }

                const ext = ".png"; // Assuming png for pasted images
                const fileName = `paste_${timestamp}`;
                
                // Determine target directory
                let relDir = location;
                // Normalize slashes
                relDir = relDir.replace(/\\/g, "/").replace(/\/\//g, "/");
                if (relDir.endsWith("/")) {relDir = relDir.slice(0, -1);}
                if (!relDir) {relDir = "images";}

                // Use tmp subdirectory for initial paste if autoOrganize is enabled
                const finalDir = autoOrganize ? `${relDir}/tmp` : relDir;
                const relPath = `${finalDir}/${fileName}${ext}`;
                const fullPath = path.join(path.dirname(document.uri.fsPath), relPath);

                await writeFile(fullPath, Buffer.from(imgData, "binary"));
                
                const cacheBuster = `?t=${timestamp}`;
                let markdown = `![${fileName}](${relPath}${cacheBuster})`;

                const align = config.get<string>("uploads.align") || "center";
                if (align !== "left") {
                    markdown = `<div align="${align}"><img src="${relPath}${cacheBuster}" alt="${fileName}" /></div>`;
                }

                if (placeholder) {
                    handler.emit("replaceValue", { oldVal: placeholder, newVal: markdown });
                } else {
                    handler.emit("insertValue", markdown);
                }
            })
            .on("scroll", ({ scrollTop }: { scrollTop: number }) => {
                this.state.update(`scrollTop_${document.uri.fsPath}`, scrollTop);
            })
            .on("editInVSCode", () => {
                vscode.commands.executeCommand("vscode.openWith", document.uri, "default", vscode.ViewColumn.Active);
            })
            .on("openSettings", () => {
                vscode.commands.executeCommand("workbench.action.openSettings", "md-editor-pro");
            })
            .on("reload", () => {
                const text = document.getText();
                const timestamp = new Date().getTime();
                // Inject timestamps for cache busting to ensure user sees latest state
                // This is only for the webview display, the actual document is not modified until save
                const bustedText = text
                    .replace(/(!\[.*?\]\()([^\)]+?)(\?t=\d+)?(\))/g, `$1$2?t=${timestamp}$4`)
                    .replace(/(<img[^>]*\ssrc=["'])((?!http).*?)(\?t=\d+)?(["'][^>]*>)/gi, `$1$2?t=${timestamp}$4`);
                
                handler.emit("setValue", bustedText);
            });
    }

    private updateTextDocument(document: vscode.TextDocument, content: string): Thenable<boolean> {
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );
        edit.replace(document.uri, fullRange, content);
        this.text[document.uri.fsPath] = content;
        return vscode.workspace.applyEdit(edit);
    }
}
