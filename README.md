# Markdown Editor Pro ✨
English | [中文](./README.zh-CN.md)

WYSIWYG Markdown editor for VS Code, powered by Vditor. Focused on smart image organization, alignment handling, and keeping your workspace clean.

## ✨ Features

- 🚀 Instant Preview: edit with real-time rendering in a single view
- ✨ WYSIWYG: Vditor supports WYSIWYG / IR / Split modes
- 🖼️ Smart Images:
  - Auto-paste → saved to `images/` with timestamp
  - Auto-organize on save → rename by document structure (e.g., `1-1.png`)
  - Safe staging workflow → avoid conflicts/overwrites
  - Clean up unused images on save
- 🔢 Math: KaTeX / MathJax
- ⚙️ Configurable: themes, line numbers, alignment, and more

## 🚀 Usage

1. Open any `.md` file
2. Right-click the tab or use “Open With…”
3. Select “Markdown Editor Pro”

## ⚙️ Configuration

Open VS Code Settings and search “md-editor-pro”:
- `preview.lineNumbers`: show code block line numbers (default `true`)
- `tab`: tab characters (default `  `)
- `preview.math.engine`: `KaTeX` or `MathJax` (default `KaTeX`)
- `uploads.location`: image directory relative to the file (default `images`)
- `uploads.pattern`: `${h1Index}-${imgIndex}` (default), supports `${fileName}`, `${now}`, etc.
- `uploads.autoOrganize`: auto rename on save (default `true`)
- `uploads.align`: `left` | `center` | `right` (default `center`)

## ⌨️ Shortcuts

- `Ctrl+S` / `Cmd+S`: save and auto-organize (if enabled)
- Standard Markdown shortcuts via Vditor

## 📚 Reference & Enhancements

Inspired by the excellent [Md Editor](https://marketplace.visualstudio.com/items?itemName=seepine.md-editor), with enhancements:

- Paste images and save to an `images` folder near the Markdown file
- Automatic reorganization on save with a configurable naming pattern
- Robust staging workflow to avoid file conflicts and accidental overwrites
- Precise alignment handling:
  - Convert centered/right-aligned Markdown images to HTML `<img>`
  - Optionally wrap with `<div align="...">...</div>` when appropriate
- Cache busting (`?t=timestamp`) to ensure webview always shows the latest image

Our goal: stability, safety, and maintainability—while keeping behavior familiar.

## 🤝 Contributing

Contributions welcome—please open a PR.

## 📄 License

[MIT](LICENSE)
