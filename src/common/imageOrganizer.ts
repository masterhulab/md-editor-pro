import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Configuration for image organization
 */
interface OrganizerConfig {
    autoOrganize: boolean;
    location: string;
    pattern: string;
    align: string;
}

/**
 * Represents an image reference found in the document
 */
interface ImageRef {
    id: string;             // Unique internal ID for tracking
    originalPath: string;   // The raw path in the src/href
    originalAlt: string;    // The alt text
    range: vscode.Range;    // The range of the image tag/link in the document
    isHtml: boolean;        // Whether it's an HTML <img> tag
    isPlaceholder: boolean; // Whether it's a "uploading-xxx" placeholder
    timestamp?: string;     // Timestamp for placeholders
    sourceUri?: vscode.Uri; // Resolved absolute path to the current file
    isTmp: boolean;         // Whether the source is in the temp directory
    
    // Context for text replacement
    lineText: string;       // The full text of the line containing this image
    fullMatch: string;      // The full matched string
}

/**
 * Represents a planned file operation
 */
interface FileOperation {
    ref: ImageRef;
    finalSourceUri: vscode.Uri; // Where to copy FROM (Staging or Tmp)
    targetUri: vscode.Uri;      // Where to copy TO
    targetRelativePath: string; // Path relative to document (for link update)
    targetBaseName: string;     // Filename only
}

export async function organizeImages(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
    const config = getConfiguration();
    if (!config.autoOrganize) {
        return [];
    }

    const ctx = new OrganizationContext(document, config);
    
    // 1. Validation & Setup
    if (!await ctx.ensureDirectories()) {
        return [];
    }

    // 2. Scan Document
    const refs = ctx.scanDocument();
    if (refs.length === 0) {
        return [];
    }

    // 3. Prepare Staging (Global Staging Strategy)
    // Moves all current images to a staging directory to allow "clean rebuild"
    const stagingDir = await ctx.prepareStaging();

    // 4. Resolve Operations
    // Determines target names and resolves conflicts
    const operations = ctx.resolveOperations(refs, stagingDir);

    // 5. Execute File Operations
    // Copies used images from Staging/Tmp -> Target
    await ctx.executeFileOperations(operations);

    // 6. Generate Text Edits
    // Updates links in the document
    const edits = ctx.generateEdits(operations);

    // 7. Cleanup
    await ctx.cleanup(stagingDir);

    return edits;
}

function getConfiguration(): OrganizerConfig {
    const config = vscode.workspace.getConfiguration("md-editor-pro");
    return {
        autoOrganize: config.get<boolean>("uploads.autoOrganize") || false,
        location: config.get<string>("uploads.location") || "images",
        pattern: config.get<string>("uploads.pattern") || "${h1Index}-${imgIndex}",
        align: config.get<string>("uploads.align") || "center"
    };
}

class OrganizationContext {
    private docDir: vscode.Uri;
    private imagesDir: vscode.Uri;
    private tmpDir: vscode.Uri;
    private imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg']);

    constructor(
        private document: vscode.TextDocument,
        private config: OrganizerConfig
    ) {
        this.docDir = vscode.Uri.file(path.dirname(document.uri.fsPath));
        this.imagesDir = vscode.Uri.joinPath(this.docDir, config.location);
        this.tmpDir = vscode.Uri.joinPath(this.imagesDir, 'tmp');
    }

    async ensureDirectories(): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(this.imagesDir);
            // Ensure tmp dir exists (create if missing, ignore if exists)
            try { await vscode.workspace.fs.createDirectory(this.tmpDir); } catch {}
            return true;
        } catch {
            // If images dir doesn't exist, we skip organization
            return false;
        }
    }

    scanDocument(): ImageRef[] {
        const refs: ImageRef[] = [];
        const text = this.document.getText();
        const lines = text.split(/\r?\n/);
        
        for (let i = 0; i < lines.length; i++) {
            const lineText = lines[i];
            const lineOffset = this.document.offsetAt(new vscode.Position(i, 0));

            // Regex for Markdown and HTML images
            const regexes = [
                { regex: /!\[(.*?)\]\((.*?)\)/g, isHtml: false },
                { regex: /<img[^>]*\ssrc=["'](.*?)["'][^>]*>/gi, isHtml: true }
            ];

            for (const { regex, isHtml } of regexes) {
                let match;
                while ((match = regex.exec(lineText)) !== null) {
                    const fullMatch = match[0];
                    const rawPath = isHtml ? match[1] : match[2];
                    const originalAlt = isHtml ? this.extractHtmlAlt(fullMatch) : match[1];
                    
                    const range = new vscode.Range(
                        this.document.positionAt(lineOffset + match.index),
                        this.document.positionAt(lineOffset + match.index + fullMatch.length)
                    );

                    const ref = this.parseImageRef(rawPath, originalAlt, range, isHtml, lineText, fullMatch);
                    if (ref) {
                        refs.push(ref);
                    }
                }
            }
        }
        return refs;
    }

    private extractHtmlAlt(htmlTag: string): string {
        const match = /alt=["'](.*?)["']/.exec(htmlTag);
        return match ? match[1] : "";
    }

    private parseImageRef(
        rawPath: string, 
        originalAlt: string, 
        range: vscode.Range, 
        isHtml: boolean,
        lineText: string,
        fullMatch: string
    ): ImageRef | null {
        // 1. Placeholder check
        if (!isHtml && rawPath === "" && originalAlt.startsWith("uploading-")) {
            const parts = originalAlt.split('-');
            if (parts.length === 2 && /^\d+$/.test(parts[1])) {
                const timestamp = parts[1];
                return {
                    id: `placeholder:${timestamp}`,
                    originalPath: rawPath,
                    originalAlt,
                    range,
                    isHtml,
                    isPlaceholder: true,
                    timestamp,
                    sourceUri: vscode.Uri.joinPath(this.tmpDir, `paste_${timestamp}.png`),
                    isTmp: true,
                    lineText,
                    fullMatch
                };
            }
        }

        // 2. Valid path check
        if (!rawPath || rawPath.startsWith('http') || path.isAbsolute(rawPath)) {
            return null;
        }

        const cleanPath = rawPath.split('?')[0];
        const ext = path.extname(cleanPath).toLowerCase();
        if (!this.imageExtensions.has(ext)) {
            return null;
        }

        // 3. Resolve URI
        let normalizedPath = cleanPath.replace(/\\/g, '/');
        if (normalizedPath.startsWith('./')) { normalizedPath = normalizedPath.substring(2); }
        
        const currentUri = vscode.Uri.file(path.resolve(this.docDir.fsPath, normalizedPath));
        
        // 4. Location check (must be in images dir or tmp)
        const currentPath = this.toKey(currentUri);
        const imagesPath = this.toKey(this.imagesDir);
        
        if (!currentPath.startsWith(imagesPath)) {
            return null;
        }

        const isTmp = currentPath.startsWith(this.toKey(this.tmpDir));

        return {
            id: rawPath, // Use raw path as ID for standard images
            originalPath: rawPath,
            originalAlt,
            range,
            isHtml,
            isPlaceholder: false,
            sourceUri: currentUri,
            isTmp,
            lineText,
            fullMatch
        };
    }

    async prepareStaging(): Promise<vscode.Uri> {
        const stagingDirName = `.staging-${Date.now()}`;
        const stagingDir = vscode.Uri.joinPath(this.imagesDir, stagingDirName);

        try {
            await vscode.workspace.fs.createDirectory(stagingDir);
            const entries = await vscode.workspace.fs.readDirectory(this.imagesDir);

            for (const [name, type] of entries) {
                if (type !== vscode.FileType.File) { continue; } // Skip subdirs like 'tmp'

                const src = vscode.Uri.joinPath(this.imagesDir, name);
                const dest = vscode.Uri.joinPath(stagingDir, name);

                try {
                    // Copy to staging
                    await vscode.workspace.fs.copy(src, dest, { overwrite: true });
                    // Delete original (Empty the directory)
                    await vscode.workspace.fs.delete(src);
                } catch (e) {
                    console.warn(`Failed to move ${name} to staging`, e);
                }
            }
        } catch (e) {
            console.error("Staging preparation failed", e);
        }

        return stagingDir;
    }

    resolveOperations(refs: ImageRef[], stagingDir: vscode.Uri): FileOperation[] {
        const operations: FileOperation[] = [];
        const usedNames = new Set<string>();
        const headers: { [key: string]: number } = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
        let imgIndex = 0;

        // Reset header counts
        const text = this.document.getText();
        const lines = text.split(/\r?\n/);
        let currentLine = 0;

        // Sort refs by position to ensure correct naming order
        refs.sort((a, b) => a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character);

        for (const ref of refs) {
            // Update headers up to this image
            while (currentLine <= ref.range.start.line) {
                const lineText = lines[currentLine];
                if (lineText.match(/^#\s/)) { headers.h1++; imgIndex = 0; }
                else if (lineText.match(/^##\s/)) { headers.h2++; }
                else if (lineText.match(/^###\s/)) { headers.h3++; }
                // ... can expand for deeper headers if needed
                currentLine++;
            }
            imgIndex++;

            // Calculate base target name
            let ext = path.extname(ref.sourceUri!.fsPath);
            let targetName = this.generateTargetName(headers, imgIndex, ext);

            // Ensure uniqueness
            targetName = this.ensureUnique(targetName, usedNames);

            // Determine source URI (Staging or Tmp)
            let finalSourceUri: vscode.Uri;
            if (ref.isTmp) {
                finalSourceUri = ref.sourceUri!; // Tmp files stay in tmp until moved
            } else {
                // Regular files are now in staging
                const baseName = path.basename(ref.sourceUri!.fsPath);
                finalSourceUri = vscode.Uri.joinPath(stagingDir, baseName);
            }

            operations.push({
                ref,
                finalSourceUri,
                targetUri: vscode.Uri.joinPath(this.imagesDir, targetName),
                targetRelativePath: `${this.config.location}/${targetName}`,
                targetBaseName: targetName
            });
        }

        return operations;
    }

    private generateTargetName(headers: any, imgIndex: number, ext: string): string {
        let name = this.config.pattern;
        const docName = path.basename(this.document.uri.fsPath, path.extname(this.document.uri.fsPath));
        
        name = name.replace('${fileName}', docName)
                   .replace('${h1Index}', headers.h1.toString())
                   .replace('${h2Index}', headers.h2.toString())
                   .replace('${h3Index}', headers.h3.toString())
                   .replace('${h4Index}', headers.h4.toString())
                   .replace('${h5Index}', headers.h5.toString())
                   .replace('${h6Index}', headers.h6.toString())
                   .replace('${imgIndex}', imgIndex.toString());

        name = name.replace(/\$\{[^}]+\}/g, ''); // Remove unresolved vars

        if (!name.toLowerCase().endsWith(ext.toLowerCase())) {
            name += ext;
        }
        return name;
    }

    private ensureUnique(name: string, usedNames: Set<string>): string {
        let uniqueName = name;
        let counter = 2;
        const parsed = path.parse(name);
        
        while (usedNames.has(uniqueName.toLowerCase())) {
            uniqueName = `${parsed.name}-${counter}${parsed.ext}`;
            counter++;
        }
        usedNames.add(uniqueName.toLowerCase());
        return uniqueName;
    }

    async executeFileOperations(ops: FileOperation[]): Promise<void> {
        for (const op of ops) {
            try {
                // Check if source exists
                await vscode.workspace.fs.stat(op.finalSourceUri);
                // Copy to target
                await vscode.workspace.fs.copy(op.finalSourceUri, op.targetUri, { overwrite: true });
            } catch (e) {
                console.warn(`Failed to process image: ${op.finalSourceUri.fsPath} -> ${op.targetUri.fsPath}`, e);
            }
        }
    }

    generateEdits(ops: FileOperation[]): vscode.TextEdit[] {
        const edits: vscode.TextEdit[] = [];
        const timestamp = Date.now();

        for (const op of ops) {
            const newPath = `${op.targetRelativePath}?t=${timestamp}`;
            const ref = op.ref;

            // Determine Alt Text
            let newAlt = ref.originalAlt;
            const oldBaseName = path.basename(ref.originalPath.split('?')[0], path.extname(ref.originalPath));
            const newBaseName = path.basename(op.targetBaseName, path.extname(op.targetBaseName));

            // Auto-update alt text if it looks like a filename or placeholder
            if (newAlt === oldBaseName || newAlt.startsWith('paste_') || /^\d+$/.test(newAlt) || newAlt === "") {
                newAlt = newBaseName;
            }

            if (ref.isHtml) {
                this.generateHtmlEdit(ref, newPath, newAlt, edits);
            } else {
                this.generateMarkdownEdit(ref, newPath, newAlt, edits);
            }
        }
        return edits;
    }

    private generateHtmlEdit(ref: ImageRef, newPath: string, newAlt: string, edits: vscode.TextEdit[]) {
        // 1. Update src
        const srcMatch = /src=(["'])(.*?)\1/i.exec(ref.fullMatch);
        if (srcMatch) {
            const srcVal = srcMatch[2];
            const startOffset = ref.range.start.character + srcMatch.index + srcMatch[0].indexOf(srcVal);
            const range = new vscode.Range(
                new vscode.Position(ref.range.start.line, startOffset),
                new vscode.Position(ref.range.start.line, startOffset + srcVal.length)
            );
            edits.push(vscode.TextEdit.replace(range, newPath));
        }

        // 2. Update alt
        const altMatch = /alt=(["'])(.*?)\1/i.exec(ref.fullMatch);
        if (altMatch) {
            const altVal = altMatch[2];
            if (altVal !== newAlt) {
                const startOffset = ref.range.start.character + altMatch.index + altMatch[0].indexOf(altVal);
                const range = new vscode.Range(
                    new vscode.Position(ref.range.start.line, startOffset),
                    new vscode.Position(ref.range.start.line, startOffset + altVal.length)
                );
                edits.push(vscode.TextEdit.replace(range, newAlt));
            }
        }
    }

    private generateMarkdownEdit(ref: ImageRef, newPath: string, newAlt: string, edits: vscode.TextEdit[]) {
        let replacement = "";
        let useHtmlTag = false;
        let shouldWrap = false;

        if (this.config.align === 'center' || this.config.align === 'right') {
            const pre = ref.lineText.substring(0, ref.range.start.character);
            const post = ref.lineText.substring(ref.range.end.character);

            const wrapperRegex = new RegExp(`<div\\s+align=["']${this.config.align}["']\\s*>$`, 'i');
            const closeRegex = /^<\/div>/i;
            const isWrapped = wrapperRegex.test(pre.trimEnd()) && closeRegex.test(post.trimStart());

            if (isWrapped) {
                useHtmlTag = true;
            } else if (pre.trim() === '' && post.trim() === '') {
                shouldWrap = true;
                useHtmlTag = true;
            }
        }

        if (useHtmlTag) {
            replacement = `<img src="${newPath}" alt="${newAlt}" />`;
            if (shouldWrap) {
                replacement = `<div align="${this.config.align}">${replacement}</div>`;
            }
        } else {
            replacement = `![${newAlt}](${newPath})`;
        }

        edits.push(vscode.TextEdit.replace(ref.range, replacement));
    }

    async cleanup(stagingDir: vscode.Uri) {
        try {
            await vscode.workspace.fs.delete(stagingDir, { recursive: true, useTrash: false });
        } catch { }
    }

    private toKey(uri: vscode.Uri): string {
        return uri.fsPath.replace(/\\/g, '/').toLowerCase();
    }
}
