# treminal2gif - 终端录制转 GIF 工具

`terminal2gif` 是一个跨平台的终端录制工具，可以将终端会话录制并转换为动画 GIF，非常适合创建演示、教程或分享代码片段。

## 功能特性

- **跨平台支持**: 支持 Windows、macOS 和 Linux
- **终端录制**: 交互式录制或命令序列录制
- **主题支持**: 内置多种终端主题（默认、Dracula、Monokai、Solarized Dark 等）
- **编辑功能**: 编辑录制内容，调整延迟、帧范围等
- **高质量渲染**: 生成高质量的 GIF 动画
- **自定义配置**: 可自定义终端尺寸、字体、颜色等

## 安装

### 系统要求

- Node.js >= 16.0.0
- Windows 用户需要安装 GTK 运行时环境（用于 canvas 模块）

### 安装步骤

1. 克隆或下载项目
```bash
git clone <repository-url>
cd treminal2gif
```

2. 安装依赖（使用bun）
```bash
bun install
```

3. Windows 用户额外安装 GTK
   - 下载并安装 GTK: https://github.com/tschoonj/GTK-for-Windows-Runtime-Environment-Installer
   - 安装完成后，运行: `npm rebuild canvas`

## 快速开始

### 1. 录制终端会话

```bash
# 开始交互式录制
bun run start record my-session

# 指定终端尺寸
bun run start record my-session --cols 100 --rows 30

# 录制特定命令
bun run start record my-session --exec "ls -la && pwd"
```

录制完成后，按 `Ctrl+D` 或 `Ctrl+C` 结束录制。

### 2. 编辑录制内容

```bash
# 显示录制信息
bun run start edit my-session --info

# 设置所有帧的延迟
bun run start edit my-session --delay 100

# 更改主题
bun run start edit my-session --theme dracula

# 优化帧序列（移除空闲时间）
bun run start edit my-session --optimize

# 保留特定帧范围
bun run start edit my-session --keep 0-100

# 删除特定帧范围
bun run start edit my-session --delete 50-60
```

### 3. 渲染为 GIF

```bash
# 渲染为 GIF
bun run start render my-session

# 指定输出路径
bun run start render my-session --output ./output.gif

# 设置帧率
bun run start render my-session --fps 30

# 预览渲染（仅估算）
bun run start render my-session --estimate
```

### 4. 其他命令

```bash
# 列出所有录制
bun run start list

# 显示详细信息
bun run start list --detailed

# 显示当前配置
bun run start config

# 列出可用主题
bun run start config --themes

# 删除录制
bun run start delete my-session
```

## 命令详解

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

## 开发

### 构建项目

```bash
npm run build
```

### 运行测试

```bash
npm test
```

### 脚本命令

- `npm start`: 运行 CLI 工具
- `npm run build`: 编译 TypeScript
- `npm test`: 运行测试
- `npm run record`: 快速录制
- `npm run edit`: 快速编辑
- `npm run render`: 快速渲染
- `npm run list`: 快速列出录制
- `npm run config`: 快速显示配置

## 常见问题

1. **Canvas 模块错误**: Windows 用户需要安装 GTK 运行时环境并运行 `npm rebuild canvas`。

2. **node-pty 错误**: 运行 `npm rebuild node-pty`。

3. **录制文件过大**: 可以通过编辑工具优化帧序列或调整渲染质量。

## 贡献

欢迎提交问题和拉取请求！

## 许可证

ISC