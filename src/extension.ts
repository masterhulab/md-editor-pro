import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './provider/markdownEditorProvider';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            "masterhulab.md-editor-pro",
            new MarkdownEditorProvider(context),
            {
                webviewOptions: {
                    retainContextWhenHidden: true,
                },
            }
        )
    );
}

export function deactivate() { }
