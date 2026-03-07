/**
 * GIF 渲染模块
 * 使用 canvas 绘制终端帧，并通过 gifencoder 导出 GIF
 */

const GIFEncoder = require('gifencoder');
const fs = require('fs');
const path = require('path');
const { getConfig, getOutputPath } = require('./config');
const { loadRecording, parseAnsi, ensureDir } = require('./utils');

// 延迟加载 canvas
let canvasModule = null;

function getCanvas() {
  if (!canvasModule) {
    try {
      canvasModule = require('canvas');
    } catch (e) {
      throw new Error(
        'Canvas 模块未正确安装。\n' +
        '在 Windows 上需要安装 GTK 库:\n' +
        '1. 下载 GTK: https://github.com/tschoonj/GTK-for-Windows-Runtime-Environment-Installer\n' +
        '2. 安装后运行: npm rebuild canvas\n\n' +
        '或使用替代渲染方式（将录制导出为其他格式）'
      );
    }
  }
  return canvasModule;
}

// ANSI 颜色索引到标准颜色的映射
const ANSI_COLORS = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
];

/**
 * 检查 canvas 是否可用
 * @returns {boolean}
 */
function isCanvasAvailable() {
  try {
    require.resolve('canvas');
    require('canvas');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 渲染器类
 */
class Renderer {
  constructor(options = {}) {
    this.options = getConfig(options);
    this.recording = null;
    this.canvas = null;
    this.ctx = null;
    this.encoder = null;
  }

  /**
   * 加载录制文件
   * @param {string} filePath 文件路径
   */
  load(filePath) {
    this.recording = loadRecording(filePath);
    return this.recording;
  }

  /**
   * 初始化画布和编码器
   * @param {number} width 宽度
   * @param {number} height 高度
   */
  initCanvas(width, height) {
    const { createCanvas } = getCanvas();
    this.canvas = createCanvas(width, height);
    this.ctx = this.canvas.getContext('2d');

    // 设置字体
    this.ctx.font = `${this.options.terminal.fontSize}px ${this.options.terminal.fontFamily}`;
    this.ctx.textBaseline = 'top';
  }

  /**
   * 初始化 GIF 编码器
   * @param {number} width 宽度
   * @param {number} height 高度
   */
  initEncoder(width, height) {
    this.encoder = new GIFEncoder(width, height);

    // 设置 GIF 参数
    this.encoder.setRepeat(0); // 0 表示循环播放
    this.encoder.setQuality(this.options.recording.quality); // 质量 1-10，越小质量越高
    this.encoder.setTransparent(null); // 不使用透明
  }

  /**
   * 计算文本宽度
   * @param {string} text 文本
   * @returns {number}
   */
  getTextWidth(text) {
    return this.ctx.measureText(text).width;
  }

  /**
   * 获取字符宽度
   * @returns {number}
   */
  getCharWidth() {
    return this.getTextWidth('M');
  }

  /**
   * 获取行高
   * @returns {number}
   */
  getLineHeight() {
    return Math.round(this.options.terminal.fontSize * this.options.terminal.lineHeight);
  }

  /**
   * 计算画布尺寸
   * @returns {Object} { width, height }
   */
  calculateCanvasSize() {
    const padding = this.options.rendering.padding;
    const titleBarHeight = this.options.rendering.showWindowTitle
      ? this.options.rendering.titleBarHeight
      : 0;

    const charWidth = this.getCharWidth();
    const lineHeight = this.getLineHeight();

    const terminalWidth = Math.round(charWidth * this.recording.cols);
    const terminalHeight = Math.round(lineHeight * this.recording.rows);

    const width = terminalWidth + padding * 2;
    const height = terminalHeight + padding * 2 + titleBarHeight;

    return { width, height, terminalWidth, terminalHeight };
  }

  /**
   * 估算画布尺寸（无需 canvas）
   * @returns {Object} { width, height }
   */
  estimateCanvasSize() {
    const padding = this.options.rendering.padding;
    const titleBarHeight = this.options.rendering.showWindowTitle
      ? this.options.rendering.titleBarHeight
      : 0;

    // 使用近似字符宽度（等宽字体）
    const fontSize = this.options.terminal.fontSize;
    const charWidth = fontSize * 0.6; // 近似值
    const lineHeight = Math.round(fontSize * this.options.terminal.lineHeight);

    const terminalWidth = Math.round(charWidth * this.recording.cols);
    const terminalHeight = Math.round(lineHeight * this.recording.rows);

    const width = terminalWidth + padding * 2;
    const height = terminalHeight + padding * 2 + titleBarHeight;

    return { width, height, terminalWidth, terminalHeight };
  }

  /**
   * 绘制终端窗口背景
   * @param {number} width 宽度
   * @param {number} height 高度
   */
  drawWindowBackground(width, height) {
    const { padding, borderRadius, shadowBlur, shadowColor, titleBarColor, titleBarHeight, showWindowTitle, windowTitle } = this.options.rendering;
    const colors = this.recording.config?.colors || this.options.colors;

    // 绘制阴影
    if (shadowBlur > 0) {
      this.ctx.shadowColor = shadowColor;
      this.ctx.shadowBlur = shadowBlur;
      this.ctx.shadowOffsetX = 5;
      this.ctx.shadowOffsetY = 5;
    }

    // 绘制主背景
    this.ctx.fillStyle = colors.background;
    this.roundRect(0, 0, width, height, borderRadius, true, false);

    // 重置阴影
    this.ctx.shadowColor = 'transparent';
    this.ctx.shadowBlur = 0;
    this.ctx.shadowOffsetX = 0;
    this.ctx.shadowOffsetY = 0;

    // 绘制标题栏
    if (showWindowTitle) {
      this.ctx.fillStyle = titleBarColor;
      this.roundRectTop(0, 0, width, titleBarHeight, borderRadius, true);

      // 绘制窗口按钮
      const buttonY = titleBarHeight / 2;
      const buttonRadius = 6;
      const buttonSpacing = 12;
      const startX = padding + 10;

      // 关闭按钮 (红)
      this.ctx.fillStyle = '#ff5f56';
      this.ctx.beginPath();
      this.ctx.arc(startX, buttonY, buttonRadius, 0, Math.PI * 2);
      this.ctx.fill();

      // 最小化按钮 (黄)
      this.ctx.fillStyle = '#ffbd2e';
      this.ctx.beginPath();
      this.ctx.arc(startX + buttonSpacing, buttonY, buttonRadius, 0, Math.PI * 2);
      this.ctx.fill();

      // 最大化按钮 (绿)
      this.ctx.fillStyle = '#27c93f';
      this.ctx.beginPath();
      this.ctx.arc(startX + buttonSpacing * 2, buttonY, buttonRadius, 0, Math.PI * 2);
      this.ctx.fill();

      // 绘制标题
      this.ctx.fillStyle = '#888888';
      this.ctx.font = `12px ${this.options.terminal.fontFamily}`;
      this.ctx.textAlign = 'center';
      this.ctx.fillText(windowTitle || this.recording.name, width / 2, titleBarHeight / 2 - 6);
      this.ctx.textAlign = 'left';
    }
  }

  /**
   * 绘制圆角矩形
   */
  roundRect(x, y, width, height, radius, fill, stroke) {
    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.lineTo(x + width - radius, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.ctx.lineTo(x + width, y + height - radius);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    this.ctx.lineTo(x + radius, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    this.ctx.lineTo(x, y + radius);
    this.ctx.quadraticCurveTo(x, y, x + radius, y);
    this.ctx.closePath();
    if (fill) this.ctx.fill();
    if (stroke) this.ctx.stroke();
  }

  /**
   * 绘制顶部圆角矩形
   */
  roundRectTop(x, y, width, height, radius, fill) {
    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.lineTo(x + width - radius, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.ctx.lineTo(x + width, y + height);
    this.ctx.lineTo(x, y + height);
    this.ctx.lineTo(x, y + radius);
    this.ctx.quadraticCurveTo(x, y, x + radius, y);
    this.ctx.closePath();
    if (fill) this.ctx.fill();
  }

  /**
   * 绘制终端内容
   * @param {string} content 终端内容
   */
  drawTerminalContent(content) {
    const { padding, titleBarHeight, showWindowTitle } = this.options.rendering;
    const colors = this.recording.config?.colors || this.options.colors;

    const offsetX = padding;
    const offsetY = padding + (showWindowTitle ? titleBarHeight : 0);

    // 设置字体
    this.ctx.font = `${this.options.terminal.fontSize}px ${this.options.terminal.fontFamily}`;

    const lineHeight = this.getLineHeight();
    const charWidth = this.getCharWidth();

    // 清空终端区域
    const terminalWidth = charWidth * this.recording.cols;
    const terminalHeight = lineHeight * this.recording.rows;
    this.ctx.fillStyle = colors.background;
    this.ctx.fillRect(offsetX, offsetY, terminalWidth, terminalHeight);

    // 分行处理
    const lines = content.split('\n');

    for (let lineIndex = 0; lineIndex < lines.length && lineIndex < this.recording.rows; lineIndex++) {
      const line = lines[lineIndex];
      const y = offsetY + lineIndex * lineHeight;

      // 解析 ANSI 颜色
      const segments = parseAnsi(line);

      let x = offsetX;

      for (const segment of segments) {
        const text = segment.text;

        // 获取前景色
        let fgColor = colors.foreground;
        if (segment.style.fgColor !== null) {
          const colorName = ANSI_COLORS[segment.style.fgColor];
          fgColor = colors[colorName] || colors.foreground;
        }

        // 获取背景色
        let bgColor = colors.background;
        if (segment.style.bgColor !== null) {
          const colorName = ANSI_COLORS[segment.style.bgColor];
          bgColor = colors[colorName] || colors.background;
        }

        // 处理 inverse 样式
        if (segment.style.inverse) {
          [fgColor, bgColor] = [bgColor, fgColor];
        }

        // 绘制背景
        if (bgColor !== colors.background) {
          const textW = this.getTextWidth(text);
          this.ctx.fillStyle = bgColor;
          this.ctx.fillRect(x, y, textW, lineHeight);
        }

        // 绘制文本
        this.ctx.fillStyle = fgColor;
        this.ctx.fillText(text, x, y);

        // 处理粗体
        if (segment.style.bold) {
          this.ctx.fillText(text, x + 0.5, y);
        }

        // 处理下划线
        if (segment.style.underline) {
          const textW = this.getTextWidth(text);
          this.ctx.strokeStyle = fgColor;
          this.ctx.lineWidth = 1;
          this.ctx.beginPath();
          this.ctx.moveTo(x, y + lineHeight - 2);
          this.ctx.lineTo(x + textW, y + lineHeight - 2);
          this.ctx.stroke();
        }

        x += this.getTextWidth(text);
      }
    }

    // 绘制光标
    if (this.options.terminal.cursorStyle !== 'none') {
      const cursorLine = Math.min(lines.length - 1, this.recording.rows - 1);
      const lastLine = lines[cursorLine] || '';
      const cursorX = offsetX + this.getTextWidth(lastLine);
      const cursorY = offsetY + cursorLine * lineHeight;

      this.ctx.fillStyle = colors.cursor || colors.foreground;
      this.ctx.fillRect(cursorX, cursorY, charWidth, lineHeight);
    }
  }

  /**
   * 渲染单帧
   * @param {Object} frame 帧数据
   */
  renderFrame(frame) {
    const { width, height } = this.calculateCanvasSize();

    // 绘制背景
    this.drawWindowBackground(width, height);

    // 绘制终端内容
    this.drawTerminalContent(frame.content || '');
  }

  /**
   * 渲染 GIF
   * @param {string} outputPath 输出路径
   * @param {Object} options 渲染选项
   * @returns {string} 输出文件路径
   */
  async render(outputPath, options = {}) {
    if (!this.recording) {
      throw new Error('请先加载录制文件');
    }

    const { width, height } = this.calculateCanvasSize();

    // 初始化
    this.initCanvas(width, height);
    this.initEncoder(width, height);

    // 确保输出目录存在
    const dir = path.dirname(outputPath);
    ensureDir(dir);

    // 创建输出流
    const stream = fs.createWriteStream(outputPath);
    this.encoder.createReadStream().pipe(stream);

    // 开始编码
    this.encoder.start();

    // 帧率设置
    const frameRate = options.frameRate || this.options.recording.frameRate;
    const minDelay = 1000 / frameRate;

    // 渲染帧
    const frames = this.recording.frames;
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const delay = Math.max(minDelay, frame.delay || 100);

      // 添加帧到 GIF
      this.renderFrame(frame);
      this.encoder.setDelay(Math.round(delay));
      this.encoder.addFrame(this.ctx);

      // 进度回调
      if (options.onProgress) {
        options.onProgress(i + 1, frames.length);
      }
    }

    // 完成编码
    this.encoder.finish();

    // 等待文件写入完成
    return new Promise((resolve) => {
      stream.on('finish', () => {
        resolve(outputPath);
      });
    });
  }

  /**
   * 获取预估文件大小
   * @returns {Object}
   */
  estimateSize() {
    if (!this.recording) {
      throw new Error('请先加载录制文件');
    }

    const { width, height } = this.estimateCanvasSize();
    const frameCount = this.recording.frames.length;
    const quality = this.options.recording.quality;

    // 粗略估算 (GIF 压缩效率受内容影响较大)
    const bytesPerPixel = 0.5 - (quality * 0.03);
    const estimatedBytes = width * height * frameCount * bytesPerPixel;

    return {
      width,
      height,
      frameCount,
      estimatedSizeMB: (estimatedBytes / 1024 / 1024).toFixed(2),
    };
  }
}

/**
 * 快捷渲染函数
 * @param {string} sessionName 会话名称
 * @param {string} outputPath 输出路径
 * @param {Object} options 渲染选项
 * @returns {string} 输出文件路径
 */
async function renderGif(sessionName, outputPath, options = {}) {
  const { getRecordingPath } = require('./config');
  const recordingPath = getRecordingPath(sessionName);

  const renderer = new Renderer(options);
  renderer.load(recordingPath);

  const finalOutput = outputPath || getOutputPath(sessionName, options.outputDir);

  return renderer.render(finalOutput, options);
}

/**
 * 预览渲染
 * 渲染指定帧为 PNG 图片
 * @param {string} sessionName 会话名称
 * @param {number} frameIndex 帧索引
 * @param {string} outputPath 输出路径
 * @returns {string}
 */
function renderFramePreview(sessionName, frameIndex, outputPath) {
  const { getRecordingPath } = require('./config');
  const recordingPath = getRecordingPath(sessionName);

  const renderer = new Renderer();
  renderer.load(recordingPath);

  const { width, height } = renderer.calculateCanvasSize();
  renderer.initCanvas(width, height);

  const frame = renderer.recording.frames[frameIndex];
  if (!frame) {
    throw new Error(`帧索引超出范围: ${frameIndex}`);
  }

  renderer.renderFrame(frame);

  // 保存为 PNG
  const buffer = renderer.canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);

  return outputPath;
}

module.exports = {
  Renderer,
  renderGif,
  renderFramePreview,
  isCanvasAvailable,
};
