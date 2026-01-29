import { EventEmitter } from 'events';
import * as vscode from 'vscode';

export class Handler {
    private panel: vscode.WebviewPanel;
    private eventEmitter: EventEmitter;

    constructor(panel: vscode.WebviewPanel, eventEmitter: EventEmitter) {
        this.panel = panel;
        this.eventEmitter = eventEmitter;
    }

    public on(event: string, callback: (content: any) => void): this {
        if (event !== 'init') {
            const listens = this.eventEmitter.listeners(event);
            if (listens.length >= 1) {
                this.eventEmitter.removeListener(event, listens[0] as (...args: any[]) => void);
            }
        }
        this.eventEmitter.on(event, async (content: any) => {
            try {
                await callback(content);
            } catch (error: any) {
                vscode.window.showErrorMessage(error.message);
            }
        });
        return this;
    }

    public emit(event: string, content?: any): this {
        this.panel.webview.postMessage({ type: event, content });
        return this;
    }

    public static bind(panel: vscode.WebviewPanel, uri: vscode.Uri): Handler {
        const eventEmitter = new EventEmitter();

        const fileWatcher = vscode.workspace.createFileSystemWatcher(uri.fsPath);
        fileWatcher.onDidChange(e => {
            eventEmitter.emit("fileChange", e);
        });

        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === uri.toString() && e.contentChanges.length > 0) {
                eventEmitter.emit("externalUpdate", e);
            }
        });

        panel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
            eventEmitter.emit("dispose");
            fileWatcher.dispose();
        });

        // bind from webview
        panel.webview.onDidReceiveMessage((message: { type: string; content: any }) => {
            eventEmitter.emit(message.type, message.content);
        });

        return new Handler(panel, eventEmitter);
    }
}
