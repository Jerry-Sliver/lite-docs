# Lite Docs

本地优先的轻量文档管理原型，面向提示词工程、分镜表格、项目文档库和快速模板写作。

## Features

- 多级文档树，每篇文档都可以有子文档
- 独立项目库，文档可移动、归档到项目库
- 隐形未归档库，用于承接草稿和未来本地文件引用
- BlockNote 富文本编辑器
- 项目库封面上传、压缩和鼠标跟随预览
- 自定义模板和模板快速新建
- Tauri 桌面应用骨架

## Web Development

```bash
pnpm install
pnpm dev
```

## Web Build

```bash
pnpm build
pnpm lint
```

## Desktop Development

```bash
pnpm desktop:dev
```

## Desktop Build

```bash
pnpm desktop:build
```

Windows 桌面打包需要 Rust、WebView2、Visual Studio Build Tools C++ 工具链和 Windows SDK。
