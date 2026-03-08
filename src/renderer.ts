/**
 * GIF 渲染模块
 * 使用 @napi-rs/canvas 绘制终端帧，并通过 ffmpeg 导出 GIF
 * 支持 V1 和 V2 录制格式
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { Frame, Config, RecordingData, RecordingDataV2, ColorScheme, SizeEstimate } from './types';
import { getConfig, getOutputPath } from './config';
import { loadRecordingAny, parseAnsi, ensureDir, eventsToFramesSmart, detectRecordingVersion } from './utils';
import { VirtualTerminal } from './virtualTerminal';

// @napi-rs/canvas 类型定义
type CanvasTextAlign = 'left' | 'right' | 'center' | 'start' | 'end';
type CanvasTextBaseline = 'top' | 'hanging' | 'middle' | 'alphabetic' | 'ideographic' | 'bottom';

type CanvasRenderingContext2D = {
  font: string;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
};

interface Canvas {
  width: number;
  height: number;
  getContext(type: string): CanvasRenderingContext2D | null;
  toBuffer(format: string): Buffer;
  encode(format: string): Promise<Buffer>;
}

interface CanvasModule {
  createCanvas: (width: number, height: number) => Canvas;
  GlobalFonts: {
    registerFromPath(path: string, name?: string): boolean;
    has(name: string): boolean;
    families: { family: string }[];
  };
}

let canvasModule: CanvasModule | null = null;
let fontRegistered = false;

function getCanvas(): CanvasModule {
  if (!canvasModule) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      canvasModule = require('@napi-rs/canvas');
    } catch {
      throw new Error(
        '@napi-rs/canvas 模块未正确安装。\n' +
        '请运行: npm install @napi-rs/canvas\n\n' +
        '@napi-rs/canvas 是基于 Skia 的高性能 Canvas 库，预编译二进制，无需额外依赖。'
      );
    }
  }
  return canvasModule!;
}

/**
 * 注册等宽字体
 */
function registerFonts(): void {
  if (fontRegistered) return;
  
  const { GlobalFonts } = getCanvas();
  
  // Windows 系统等宽字体路径
  const fontPaths = [
    'C:\\Windows\\Fonts\\consola.ttf',      // Consolas
    'C:\\Windows\\Fonts\\cour.ttf',         // Courier New
    'C:\\Windows\\Fonts\\lucon.ttf',        // Lucida Console
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',  // Linux
    '/System/Library/Fonts/Menlo.ttc',      // macOS
  ];
  
  for (const fontPath of fontPaths) {
    if (fs.existsSync(fontPath)) {
      try {
        GlobalFonts.registerFromPath(fontPath, 'monospace');
        fontRegistered = true;
        break;
      } catch {
        // 尝试下一个字体
      }
    }
  }
  
  if (!fontRegistered) {
    console.warn('警告: 未能注册等宽字体，将使用默认字体');
    fontRegistered = true; // 标记为已尝试，避免重复警告
  }
}

// ANSI 颜色索引到标准颜色的映射
const ANSI_COLORS: (keyof ColorScheme)[] = [
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
 */
function isCanvasAvailable(): boolean {
  try {
    require.resolve('@napi-rs/canvas');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@napi-rs/canvas');
    return true;
  } catch {
    return false;
  }
}

/**
 * 渲染选项
 */
interface RenderOptionsInternal {
  frameRate?: number;
  quality?: number;
  outputDir?: string;
  onProgress?: (current: number, total: number) => void;
}

/**
 * 渲染器类
 */
class Renderer {
  private options: Config;
  private _recording: RecordingData | RecordingDataV2 | null;
  private _frames: Frame[];
  private _canvas: Canvas | null;
  private _ctx: CanvasRenderingContext2D | null;

  constructor(options: Partial<Config> = {}) {
    this.options = getConfig(options);
    this._recording = null;
    this._frames = [];
    this._canvas = null;
    this._ctx = null;
  }

  // 公共访问器
  get recording(): RecordingData | RecordingDataV2 | null { return this._recording; }
  get frames(): Frame[] { return this._frames; }
  get canvas(): Canvas | null { return this._canvas; }

  /**
   * 加载录制文件 (自动检测 V1/V2 格式)
   */
  load(filePath: string): RecordingData | RecordingDataV2 {
    this._recording = loadRecordingAny(filePath);
    
    // 如果是 V2 格式，转换为帧
    if ((this._recording as RecordingDataV2).version === 2) {
      const v2 = this._recording as RecordingDataV2;
      this._frames = eventsToFramesSmart(
        v2.events,
        v2.meta.cols,
        v2.meta.rows,
        { onProgress: this.options.recording.frameRate > 10 ? undefined : undefined }
      );
    } else {
      // V1 格式，直接使用帧
      const v1 = this._recording as RecordingData;
      this._frames = v1.frames;
    }
    
    return this._recording;
  }

  /**
   * 获取录制尺寸
   */
  private getRecordingSize(): { cols: number; rows: number } {
    if (!this._recording) return { cols: 80, rows: 24 };
    
    if ((this._recording as RecordingDataV2).version === 2) {
      const v2 = this._recording as RecordingDataV2;
      return { cols: v2.meta.cols, rows: v2.meta.rows };
    } else {
      const v1 = this._recording as RecordingData;
      return { cols: v1.cols, rows: v1.rows };
    }
  }

  /**
   * 初始化画布
   */
  initCanvas(width: number, height: number): void {
    // 注册字体
    registerFonts();
    
    const { createCanvas } = getCanvas();
    this._canvas = createCanvas(width, height);
    this._ctx = this._canvas.getContext('2d');

    // 设置字体（使用注册的 monospace 或系统默认等宽字体）
    if (this._ctx) {
      this._ctx.font = `${this.options.terminal.fontSize}px monospace`;
      this._ctx.textBaseline = 'top';
    }
  }

  /**
   * 计算文本宽度
   */
  private getTextWidth(text: string): number {
    return this._ctx?.measureText(text).width || 0;
  }

  /**
   * 获取字符宽度
   */
  private getCharWidth(): number {
    return this.getTextWidth('M');
  }

  /**
   * 获取行高
   */
  private getLineHeight(): number {
    return Math.round(this.options.terminal.fontSize * this.options.terminal.lineHeight);
  }

  /**
   * 计算画布尺寸
   */
  private calculateCanvasSize(): { width: number; height: number; terminalWidth: number; terminalHeight: number } {
    const padding = this.options.rendering.padding;
    const titleBarHeight = this.options.rendering.showWindowTitle
      ? this.options.rendering.titleBarHeight
      : 0;

    const fontSize = this.options.terminal.fontSize;
    
    // 如果 canvas 已初始化，使用 measureText 获取精确宽度
    // 否则使用估算值（等宽字体宽度约为字体大小的 0.6 倍）
    let charWidth: number;
    if (this._ctx) {
      charWidth = this._ctx.measureText('M').width;
    } else {
      charWidth = fontSize * 0.6;
    }
    
    const lineHeight = this.getLineHeight();

    const terminalWidth = Math.round(charWidth * this.getRecordingSize().cols);
    const terminalHeight = Math.round(lineHeight * this.getRecordingSize().rows);

    const width = terminalWidth + padding * 2;
    const height = terminalHeight + padding * 2 + titleBarHeight;

    return { width, height, terminalWidth, terminalHeight };
  }

  /**
   * 估算画布尺寸（无需 canvas）
   */
  estimateCanvasSize(): { width: number; height: number } {
    const padding = this.options.rendering.padding;
    const titleBarHeight = this.options.rendering.showWindowTitle
      ? this.options.rendering.titleBarHeight
      : 0;

    // 使用近似字符宽度（等宽字体）
    const fontSize = this.options.terminal.fontSize;
    const charWidth = fontSize * 0.6; // 近似值
    const lineHeight = Math.round(fontSize * this.options.terminal.lineHeight);

    const { cols, rows } = this.getRecordingSize();
    const terminalWidth = Math.round(charWidth * cols);
    const terminalHeight = Math.round(lineHeight * rows);

    const width = terminalWidth + padding * 2;
    const height = terminalHeight + padding * 2 + titleBarHeight;

    return { width, height };
  }

  /**
   * 获取录制标题
   */
  private getRecordingTitle(): string {
    if (!this._recording) return 'Terminal';
    
    if ((this._recording as RecordingDataV2).version === 2) {
      return (this._recording as RecordingDataV2).meta.title;
    } else {
      return (this._recording as RecordingData).name;
    }
  }

  /**
   * 绘制终端窗口背景
   */
  private drawWindowBackground(width: number, height: number): void {
    if (!this._ctx || !this._recording) return;

    const { padding, borderRadius, shadowBlur, shadowColor, titleBarColor, titleBarHeight, showWindowTitle, windowTitle } = this.options.rendering;
    const colors: ColorScheme = {
      ...this.options.colors,
      ...this._recording.config?.colors,
    };

    // 绘制阴影
    if (shadowBlur > 0) {
      this._ctx.shadowColor = shadowColor;
      this._ctx.shadowBlur = shadowBlur;
      this._ctx.shadowOffsetX = 5;
      this._ctx.shadowOffsetY = 5;
    }

    // 绘制主背景
    this._ctx.fillStyle = colors.background || this.options.colors.background;
    this.roundRect(0, 0, width, height, borderRadius, true, false);

    // 重置阴影
    this._ctx.shadowColor = 'transparent';
    this._ctx.shadowBlur = 0;
    this._ctx.shadowOffsetX = 0;
    this._ctx.shadowOffsetY = 0;

    // 绘制标题栏
    if (showWindowTitle) {
      this._ctx.fillStyle = titleBarColor;
      this.roundRectTop(0, 0, width, titleBarHeight, borderRadius, true);

      // 绘制窗口按钮
      const buttonY = titleBarHeight / 2;
      const buttonRadius = 6;
      const buttonSpacing = 12;
      const startX = padding + 10;

      // 关闭按钮 (红)
      this._ctx.fillStyle = '#ff5f56';
      this._ctx.beginPath();
      this._ctx.arc(startX, buttonY, buttonRadius, 0, Math.PI * 2);
      this._ctx.fill();

      // 最小化按钮 (黄)
      this._ctx.fillStyle = '#ffbd2e';
      this._ctx.beginPath();
      this._ctx.arc(startX + buttonSpacing, buttonY, buttonRadius, 0, Math.PI * 2);
      this._ctx.fill();

      // 最大化按钮 (绿)
      this._ctx.fillStyle = '#27c93f';
      this._ctx.beginPath();
      this._ctx.arc(startX + buttonSpacing * 2, buttonY, buttonRadius, 0, Math.PI * 2);
      this._ctx.fill();

      // 绘制标题
      this._ctx.fillStyle = '#888888';
      this._ctx.font = `12px sans-serif`;
      this._ctx.textAlign = 'center';
      this._ctx.fillText(windowTitle || this.getRecordingTitle(), width / 2, titleBarHeight / 2 - 6);
      this._ctx.textAlign = 'left';
    }
  }

  /**
   * 绘制圆角矩形
   */
  private roundRect(x: number, y: number, w: number, h: number, radius: number, fill: boolean, stroke: boolean): void {
    if (!this._ctx) return;
    this._ctx.beginPath();
    this._ctx.moveTo(x + radius, y);
    this._ctx.lineTo(x + w - radius, y);
    this._ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    this._ctx.lineTo(x + w, y + h - radius);
    this._ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    this._ctx.lineTo(x + radius, y + h);
    this._ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    this._ctx.lineTo(x, y + radius);
    this._ctx.quadraticCurveTo(x, y, x + radius, y);
    this._ctx.closePath();
    if (fill) this._ctx.fill();
    if (stroke) this._ctx.stroke();
  }

  /**
   * 绘制顶部圆角矩形
   */
  private roundRectTop(x: number, y: number, w: number, h: number, radius: number, fill: boolean): void {
    if (!this._ctx) return;
    this._ctx.beginPath();
    this._ctx.moveTo(x + radius, y);
    this._ctx.lineTo(x + w - radius, y);
    this._ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    this._ctx.lineTo(x + w, y + h);
    this._ctx.lineTo(x, y + h);
    this._ctx.lineTo(x, y + radius);
    this._ctx.quadraticCurveTo(x, y, x + radius, y);
    this._ctx.closePath();
    if (fill) this._ctx.fill();
  }

  /**
   * 绘制终端内容
   */
  private drawTerminalContent(content: string): void {
    if (!this._ctx || !this._recording) return;

    const { padding, titleBarHeight, showWindowTitle } = this.options.rendering;
    const colors: ColorScheme = {
      ...this.options.colors,
      ...this._recording.config?.colors,
    };

    const offsetX = padding;
    const offsetY = padding + (showWindowTitle ? titleBarHeight : 0);

    // 设置字体（使用 monospace）
    this._ctx.font = `${this.options.terminal.fontSize}px monospace`;

    const lineHeight = this.getLineHeight();
    const charWidth = this.getCharWidth();
    const { cols, rows } = this.getRecordingSize();

    // 清空终端区域
    const terminalWidth = charWidth * cols;
    const terminalHeight = lineHeight * rows;
    this._ctx.fillStyle = colors.background || this.options.colors.background;
    this._ctx.fillRect(offsetX, offsetY, terminalWidth, terminalHeight);

    // 分行处理
    const lines = content.split('\n');

    for (let lineIndex = 0; lineIndex < lines.length && lineIndex < rows; lineIndex++) {
      const line = lines[lineIndex];
      const y = offsetY + lineIndex * lineHeight;

      // 解析 ANSI 颜色
      const segments = parseAnsi(line);

      let x = offsetX;

      for (const segment of segments) {
        const text = segment.text;

        // 获取前景色
        let fgColor = colors.foreground || this.options.colors.foreground;
        if (segment.style.fgColor !== null) {
          const colorName = ANSI_COLORS[segment.style.fgColor];
          fgColor = colors[colorName] || this.options.colors.foreground;
        }

        // 获取背景色
        let bgColor = colors.background || this.options.colors.background;
        if (segment.style.bgColor !== null) {
          const colorName = ANSI_COLORS[segment.style.bgColor];
          bgColor = colors[colorName] || this.options.colors.background;
        }

        // 处理 inverse 样式
        if (segment.style.inverse) {
          [fgColor, bgColor] = [bgColor, fgColor];
        }

        // 绘制背景
        if (bgColor !== (colors.background || this.options.colors.background)) {
          const textW = this.getTextWidth(text);
          this._ctx!.fillStyle = bgColor;
          this._ctx!.fillRect(x, y, textW, lineHeight);
        }

        // 绘制文本
        this._ctx!.fillStyle = fgColor;
        this._ctx!.fillText(text, x, y);

        // 处理粗体
        if (segment.style.bold) {
          this._ctx!.fillText(text, x + 0.5, y);
        }

        // 处理下划线
        if (segment.style.underline) {
          const textW = this.getTextWidth(text);
          this._ctx!.strokeStyle = fgColor;
          this._ctx!.lineWidth = 1;
          this._ctx!.beginPath();
          this._ctx!.moveTo(x, y + lineHeight - 2);
          this._ctx!.lineTo(x + textW, y + lineHeight - 2);
          this._ctx!.stroke();
        }

        x += this.getTextWidth(text);
      }
    }

    // 绘制光标
    if (this.options.terminal.cursorStyle !== 'none') {
      const { rows } = this.getRecordingSize();
      const cursorLine = Math.min(lines.length - 1, rows - 1);
      const lastLine = lines[cursorLine] || '';
      const cursorX = offsetX + this.getTextWidth(lastLine);
      const cursorY = offsetY + cursorLine * lineHeight;

      this._ctx!.fillStyle = colors.cursor || this.options.colors.cursor || colors.foreground || this.options.colors.foreground;
      this._ctx!.fillRect(cursorX, cursorY, charWidth, lineHeight);
    }
  }

  /**
   * 渲染单帧
   */
  renderFrame(frame: Frame): void {
    // 使用 canvas 实际尺寸
    const width = this._canvas?.width || 0;
    const height = this._canvas?.height || 0;

    // 绘制背景
    this.drawWindowBackground(width, height);

    // 绘制终端内容
    this.drawTerminalContent(frame.content || '');
  }

  /**
   * 渲染 GIF
   */
  async render(outputPath: string, options: RenderOptionsInternal = {}): Promise<string> {
    if (!this._recording) {
      throw new Error('请先加载录制文件');
    }

    if (this._frames.length === 0) {
      throw new Error('录制文件没有帧数据');
    }

    const { width, height } = this.calculateCanvasSize();

    // 初始化画布
    this.initCanvas(width, height);

    // 确保输出目录存在
    const dir = path.dirname(outputPath);
    ensureDir(dir);

    // 创建临时目录存放帧
    const tempDir = path.join(os.tmpdir(), `treminal2gif-${Date.now()}`);
    ensureDir(tempDir);

    // 帧率设置
    const frameRate = options.frameRate || this.options.recording.frameRate;
    const minDelay = 1000 / frameRate;

    try {
      // 渲染帧并保存为 PNG
      const frames = this._frames;
      const frameDelays: number[] = [];

      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        const delay = Math.max(minDelay, frame.delay || 100);
        frameDelays.push(Math.round(delay));

        // 渲染帧
        this.renderFrame(frame);

        // 保存为 PNG（@napi-rs/canvas 使用 encode 方法）
        const framePath = path.join(tempDir, `frame_${i.toString().padStart(6, '0')}.png`);
        const buffer = await this._canvas!.encode('png');
        fs.writeFileSync(framePath, buffer);

        // 进度回调
        if (options.onProgress) {
          options.onProgress(i + 1, frames.length);
        }
      }

      // 使用 ffmpeg 合成 GIF
      await this.renderWithFfmpeg(tempDir, outputPath, frameDelays, frameRate);

      return outputPath;
    } finally {
      // 清理临时文件
      this.cleanupTempDir(tempDir);
    }
  }

  /**
   * 使用 ffmpeg 合成 GIF
   */
  private async renderWithFfmpeg(
    tempDir: string,
    outputPath: string,
    frameDelays: number[],
    frameRate: number
  ): Promise<void> {
    // Windows 下使用绝对路径调用 ffmpeg
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    
    // 创建帧列表文件
    const listPath = path.join(tempDir, 'frames.txt');
    const listContent = frameDelays.map((delay, i) => {
      const duration = delay / 1000; // 转换为秒
      const frameFile = `frame_${i.toString().padStart(6, '0')}.png`;
      // 使用相对路径，避免 Windows 路径问题
      return `file '${frameFile}'\nduration ${duration}`;
    }).join('\n');
    // 最后一帧需要再列一次（ffmpeg concat 要求）
    const lastFrame = `frame_${(frameDelays.length - 1).toString().padStart(6, '0')}.png`;
    fs.writeFileSync(listPath, listContent + `\nfile '${lastFrame}'`);

    // 使用 palette 方式获得更高质量的 GIF
    const palettePath = path.join(tempDir, 'palette.png');

    // 生成调色板
    const paletteCmd = `"${ffmpegPath}" -y -f concat -safe 0 -i "frames.txt" -vf "palettegen=stats_mode=full" "palette.png"`;
    try {
      execSync(paletteCmd, { cwd: tempDir, stdio: 'inherit' });
    } catch (error) {
      throw new Error(`ffmpeg 调色板生成失败: ${error}`);
    }

    // 使用调色板生成 GIF（使用绝对路径）
    const absOutputPath = path.resolve(outputPath);
    const gifCmd = `"${ffmpegPath}" -y -f concat -safe 0 -i "frames.txt" -i "palette.png" -lavfi "paletteuse=dither=bayer:bayer_scale=5" "${absOutputPath}"`;
    try {
      execSync(gifCmd, { cwd: tempDir, stdio: 'inherit' });
    } catch (error) {
      throw new Error(`ffmpeg GIF 生成失败: ${error}`);
    }
  }

  /**
   * 清理临时目录
   */
  private cleanupTempDir(tempDir: string): void {
    try {
      if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        for (const file of files) {
          fs.unlinkSync(path.join(tempDir, file));
        }
        fs.rmdirSync(tempDir);
      }
    } catch {
      // 忽略清理错误
    }
  }

  /**
   * 获取预估文件大小
   */
  estimateSize(): SizeEstimate {
    if (!this._recording) {
      throw new Error('请先加载录制文件');
    }

    const { width, height } = this.estimateCanvasSize();
    const frameCount = this._frames.length;
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
 */
async function renderGif(sessionName: string, outputPath?: string, options: RenderOptionsInternal = {}): Promise<string> {
  const { getRecordingPath } = require('./config');
  const recordingPath = getRecordingPath(sessionName);

  const renderer = new Renderer();
  renderer.load(recordingPath);

  const finalOutput = outputPath || getOutputPath(sessionName, options.outputDir);

  await renderer.render(finalOutput, options);
  console.log(`GIF 已保存到: ${finalOutput}`);
  return finalOutput;
}

/**
 * 预览渲染
 */
async function renderFramePreview(sessionName: string, frameIndex: number, outputPath: string): Promise<string> {
  const { getRecordingPath } = require('./config');
  const recordingPath = getRecordingPath(sessionName);

  const renderer = new Renderer();
  renderer.load(recordingPath);

  const { width, height } = renderer.estimateCanvasSize();
  renderer.initCanvas(width, height);

  const frame = renderer.frames[frameIndex];
  if (!frame) {
    throw new Error(`帧索引超出范围: ${frameIndex}`);
  }

  renderer.renderFrame(frame);

  // 保存为 PNG（@napi-rs/canvas 使用 encode 方法）
  const buffer = await renderer.canvas!.encode('png');
  fs.writeFileSync(outputPath, buffer);

  return outputPath;
}

export {
  Renderer,
  renderGif,
  renderFramePreview,
  isCanvasAvailable,
};
