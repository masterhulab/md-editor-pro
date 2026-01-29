# Markdown Editor Pro ✨
中文 | [English](./README.md)

基于 Vditor 的所见即所得（WYSIWYG）Markdown 编辑器，专注于智能图片组织、对齐处理与工作区清理。

## ✨ 功能特性
- 🚀 即时预览：单视图实时渲染
- ✨ 所见即所得：Vditor 支持 WYSIWYG / IR / 分屏
- 🖼️ 图片智能管理：
  - 自动粘贴 → 保存到 `images/` 并带时间戳
  - 保存时自动整理 → 依据文档结构重命名（如 `1-1.png`）
  - 安全的 Staging 工作流 → 避免冲突/误覆盖
  - 保存后清理未使用图片
- 🔢 数学公式：KaTeX / MathJax
- ⚙️ 高度可配置：主题、行号、对齐等

## 🚀 使用方法
1. 打开任意 `.md` 文件
2. 右键标签或使用 “Open With…”
3. 选择 “Markdown Editor Pro”

## ⚙️ 配置项
在 VS Code 设置中搜索 “md-editor-pro”：
- `preview.lineNumbers`：显示代码块行号（默认 `true`）
- `tab`：编辑器制表符（默认 `  `）
- `preview.math.engine`：`KaTeX` 或 `MathJax`（默认 `KaTeX`）
- `uploads.location`：图片目录（相对当前文件，默认 `images`）
- `uploads.pattern`：默认 `${h1Index}-${imgIndex}`，支持 `${fileName}`、`${now}` 等
- `uploads.autoOrganize`：保存时自动重命名（默认 `true`）
- `uploads.align`：`left` | `center` | `right`（默认 `center`）

## 📚 参考与增强
参考优秀的 [Md Editor](https://marketplace.visualstudio.com/items?itemName=seepine.md-editor)，并作增强：
- 粘贴图片保存到临近 `images/` 目录
- 保存时按命名模式自动整理与重命名
- 稳健的 Staging 工作流，避免冲突与误覆盖
- 精准对齐处理：
  - 将居中/靠右的 Markdown 图片转为标准 HTML `<img>`
  - 需要时添加 `<div align="...">` 包裹
- 使用 `?t=timestamp` 强制刷新，保证 Webview 显示最新图片

## 🤝 贡献
欢迎提交 PR。

## 📄 许可证
MIT
