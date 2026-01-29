import * as vscode from 'vscode';

export function buildPath(data: string, webview: vscode.Webview, contextPath: string): string {
    return data
        .replace(/((src|href)=("|')?)(\/\/)/gi, "$1http://")
        .replace(
            /((src|href)=("|'))((?!(http|#)).+?["'])/gi,
            "$1" + webview.asWebviewUri(vscode.Uri.file(`${contextPath}`)) + "/$4"
        );
}

export async function writeFile(fsPath: string, buffer: Buffer): Promise<void> {
    const fileUri = vscode.Uri.file(fsPath);
    const dirUri = vscode.Uri.joinPath(fileUri, '..');
    try {
        await vscode.workspace.fs.stat(dirUri);
    } catch {
        await vscode.workspace.fs.createDirectory(dirUri);
    }
    await vscode.workspace.fs.writeFile(fileUri, buffer);
}
