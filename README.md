# treminal2gif - 终端录制转 GIF

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D16.0.0-green?logo=node.js&logoColor=white)](https://nodejs.org/)
[![npm](https://img.shields.io/npm/v/terminal2gif?logo=npm)](https://www.npmjs.com/package/terminal2gif)
[![Commander.js](https://img.shields.io/badge/Commander.js-red?logo=javascript&logoColor=white)](https://github.com/tj/commander.js)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://www.npmjs.com/package/terminal2gif)

`terminal2gif` 是一个跨平台的终端录制工具，可以将终端会话录制并转换为动画 GIF，可用于创建演示、教程或分享


- **跨平台支持**: 支持 Windows、macOS 和 Linux
- **终端录制**: 交互式录制或命令序列录制
- **编辑功能**: 编辑录制内容，调整延迟、帧范围等
- **主题支持**: 内置多种终端主题（默认、Dracula、Monokai、Solarized Dark 等）（TODO）


## 安装

- Node.js >= 16.0.0

### 方法一：全局安装（推荐）

```bash
npm install terminal2gif -g
```

安装完成后，可以直接使用 `terminal2gif` 命令：

```bash
$ terminal2gif
Usage: terminal2gif [options] [command]

跨平台终端录制工具，将终端会话转换为动画 GIF

Options:
  -V, --version                    output the version number
  -h, --help                       display help for command

Commands:
  record [options] <session-name>  录制终端会话
  edit [options] <session-name>    编辑录制内容
  render [options] <session-name>  将录制渲染为 GIF
  list [options]                   列出所有录制
  config [options]                 显示当前配置
  delete [options] <session-name>  删除录制
  help [command]                   display help for command
```

### 方法二：源码安装

1. 克隆或下载项目
```bash
git clone <repository-url>
cd treminal2gif
```

2. 安装依赖（使用 npm）
```bash
npm install
```

3. 通过 npm 脚本运行
```bash
npm start -- <command> [options]
```

## 快速开始

### 1. 录制终端会话

```bash
# 开始交互式录制
terminal2gif record my-session

# 指定终端尺寸
terminal2gif record my-session --cols 100 --rows 30

# 录制特定命令
terminal2gif record my-session --exec "ls -la && pwd"
```

> 如果使用源码开发，请将 `terminal2gif` 替换为 `npm start --`。

录制完成后，按 `Ctrl+D` 或 `Ctrl+C` 结束录制。

### 2. 编辑录制内容

```bash
# 显示录制信息
terminal2gif edit my-session --info

# 设置所有帧的延迟
terminal2gif edit my-session --delay 100

# 更改主题
terminal2gif edit my-session --theme dracula

# 优化帧序列（移除空闲时间）
terminal2gif edit my-session --optimize

# 保留特定帧范围
terminal2gif edit my-session --keep 0-100

# 删除特定帧范围
terminal2gif edit my-session --delete 50-60
```

### 3. 渲染为 GIF

```bash
# 渲染为 GIF
terminal2gif render my-session

# 指定输出路径
terminal2gif render my-session --output ./output.gif

# 设置帧率
terminal2gif render my-session --fps 30

# 预览渲染（仅估算）
terminal2gif render my-session --estimate
```

### 4. 其他命令

```bash
# 列出所有录制
terminal2gif list

# 显示详细信息
terminal2gif list --detailed

# 显示当前配置
terminal2gif config

# 列出可用主题
terminal2gif config --themes

# 删除录制
terminal2gif delete my-session
```

## 命令

### record 命令

录制终端会话。

选项:
- `-c, --cols <number>`: 终端列数
- `-r, --rows <number>`: 终端行数
- `--font-size <number>`: 字体大小
- `--theme <name>`: 主题名称
- `--exec <command>`: 执行命令并录制

### edit 命令

编辑录制内容。

选项:
- `-d, --delay <ms>`: 设置所有帧延迟 (毫秒)
- `-t, --theme <name>`: 设置主题
- `--font <family>`: 设置字体
- `--font-size <size>`: 设置字号
- `-o, --optimize`: 优化帧序列
- `--max-idle <ms>`: 最大空闲时间 (毫秒)
- `--keep <range>`: 保留帧范围 (如: 0-100)
- `--delete <range>`: 删除帧范围 (如: 50-60)
- `-i, --info`: 显示录制信息
- `-l, --list [count]`: 列出帧

### render 命令

将录制渲染为 GIF。

选项:
- `-o, --output <path>`: 输出文件路径
- `-f, --fps <number>`: 帧率
- `-q, --quality <number>`: GIF 质量 (1-20)
- `--preview`: 预览模式 (只渲染关键帧)
- `--estimate`: 估算文件大小

## 配置

工具会在 `~/.treminal2gif` 目录中存储录制文件和配置。

默认终端配置:
- 列数: 80
- 行数: 24
- 字体大小: 14px
- 字体家族: Monaco, Menlo, "Courier New", monospace

可用主题:
- default: 默认黑色主题
- dracula: Dracula 配色主题
- monokai: Monokai 配色主题
- solarizedDark: Solarized Dark 配色主题
- oneHalfDark: One Half Dark 配色主题

## 开发与构建

### 开发环境设置

```bash
# 克隆项目
git clone <repository-url>
cd treminal2gif

# 安装所有依赖
npm install
```

### 开发模式

```bash
# 使用 ts-node 直接运行源代码（无需编译）
npm start -- record my-session

# 监听模式开发（自动重新编译）
npm run dev
```

### 构建项目

```bash
# 编译 TypeScript 到 JavaScript
npm run build

```

编译输出目录为 `bin/`，包含编译后的 JS 文件和类型声明文件。


### 本地测试全局安装

```bash
# 本地链接包（模拟全局安装）
npm link

# 测试 CLI 命令
terminal2gif --version
terminal2gif --help

# 取消链接
npm unlink
```

### 发布打包

```bash
# 构建项目
npm run build

# 生成 npm 包（创建 .tgz 文件）
npm pack

# 全局安装本地包进行测试
npm install -g ./terminal2gif-*.tgz

# 验证安装
terminal2gif --version
```


## 贡献

欢迎提交问题和拉取请求！
