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
import { getConfig, getOutputPath, getRecordingPath } from './config';
import { loadRecordingAny, parseAnsi, ensureDir, eventsToFramesSmart } from './utils';

// @napi-rs/canvas 类型定义
import sharp from 'sharp';

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
      // eslint-disable-next-line @typescript-eslint/no-require-imports
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

  // Windows 系统等宽字体路径（包含中文字体）
  const fontPaths = [
    // 中文优先：使用支持中文的等宽字体
    'C:\\Windows\\Fonts\\msyh.ttc', // 微软雅黑（支持中文）
    'C:\\Windows\\Fonts\\simsun.ttc', // 宋体（支持中文）
    'C:\\Windows\\Fonts\\simhei.ttf', // 黑体（支持中文）
    'C:\\Windows\\Fonts\\consola.ttf', // Consolas（仅英文）
    'C:\\Windows\\Fonts\\cour.ttf', // Courier New（仅英文）
    'C:\\Windows\\Fonts\\lucon.ttf', // Lucida Console（仅英文）

    // Linux 系统
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
    '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc', // Noto CJK（支持中文）

    // macOS 系统
    '/System/Library/Fonts/PingFang.ttc', // 苹方（支持中文）
    '/System/Library/Fonts/Menlo.ttc',
    '/System/Library/Fonts/STHeiti Light.ttc', // 华文黑体（支持中文）
  ];

  for (const fontPath of fontPaths) {
    if (fs.existsSync(fontPath)) {
      try {
        // 注册为 'monospace' 和 'sans-serif'
        GlobalFonts.registerFromPath(fontPath, 'monospace');
        GlobalFonts.registerFromPath(fontPath, 'sans-serif');
        fontRegistered = true;
        console.log(`[FONT] Registered: ${fontPath}`);
        break; // 使用第一个找到的字体
      } catch (err) {
        console.warn(`[WARN] Failed to register font: ${fontPath}，${err}`);
        // 尝试下一个字体
      }
    }
  }

  if (!fontRegistered) {
    console.warn('警告：未能注册字体，将使用系统默认字体');
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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
  get recording(): RecordingData | RecordingDataV2 | null {
    return this._recording;
  }
  get frames(): Frame[] {
    return this._frames;
  }
  get canvas(): Canvas | null {
    return this._canvas;
  }

  /**
   * 加载录制文件 (自动检测 V1/V2 格式)
   */
  load(filePath: string): RecordingData | RecordingDataV2 {
    this._recording = loadRecordingAny(filePath);

    // 如果是 V2 格式，转换为帧
    if ((this._recording as RecordingDataV2).version === 2) {
      const v2 = this._recording as RecordingDataV2;
      this._frames = eventsToFramesSmart(v2.events, v2.meta.cols, v2.meta.rows, {
        onProgress: this.options.recording.frameRate > 10 ? undefined : undefined,
      });
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
  private calculateCanvasSize(): {
    width: number;
    height: number;
    terminalWidth: number;
    terminalHeight: number;
  } {
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

    const {
      padding,
      borderRadius,
      shadowBlur,
      shadowColor,
      titleBarColor,
      titleBarHeight,
      showWindowTitle,
      windowTitle,
    } = this.options.rendering;

    // 确保背景色始终有效（关键修复）
    const backgroundColor =
      this._recording.config?.colors?.background || this.options.colors.background || '#000000'; // 默认黑色背景

    // 绘制阴影
    if (shadowBlur > 0) {
      this._ctx.shadowColor = shadowColor;
      this._ctx.shadowBlur = shadowBlur;
      this._ctx.shadowOffsetX = 5;
      this._ctx.shadowOffsetY = 5;
    }

    // 绘制主背景（使用确保有效的背景色）
    // console.log(
    //   '[BG] drawWindowBackground - color:',
    //   backgroundColor,
    //   'size:',
    //   `${width}x${height}`
    // );
    this._ctx.fillStyle = backgroundColor;
    // console.log('[BG] After setting fillStyle:', this._ctx.fillStyle);
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
      this._ctx.fillText(
        windowTitle || this.getRecordingTitle(),
        width / 2,
        titleBarHeight / 2 - 6
      );
      this._ctx.textAlign = 'left';
    }
  }

  /**
   * 绘制圆角矩形
   */
  private roundRect(
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
    fill: boolean,
    stroke: boolean
  ): void {
    if (!this._ctx) return;

    // console.log('[PATH] roundRect - params:', { x, y, w, h, radius, fill, stroke });

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

    if (fill) {
      // console.log('[PATH] Filling roundRect');
      this._ctx.fill();
    }
    if (stroke) this._ctx.stroke();
  }

  /**
   * 绘制顶部圆角矩形
   */
  private roundRectTop(
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
    fill: boolean
  ): void {
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

    // 确保背景色始终有效（关键修复）
    const backgroundColor =
      this._recording.config?.colors?.background || this.options.colors.background || '#000000'; // 默认黑色背景

    // // DEBUG: 输出终端内容调试信息
    // console.log('[DEBUG] drawTerminalContent:', {
    //   backgroundColor,
    //   contentLength: content.length,
    //   linesCount: content.split('\n').length,
    //   hasCtx: !!this._ctx,
    //   hasRecording: !!this._recording,
    //   recordingConfig: this._recording.config,
    // });

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

    // 用背景色重绘整个区域，清除上一帧的内容
    const terminalWidth = charWidth * cols;
    // console.log('[BG] drawTerminalContent - color:', backgroundColor, 'rows:', rows);

    // 分行绘制，每行都先填充背景色
    for (let row = 0; row < rows; row++) {
      const y = offsetY + row * lineHeight;
      // 填充行的背景（使用确保有效的背景色）
      this._ctx.fillStyle = backgroundColor;
      this._ctx.fillRect(offsetX, y, terminalWidth, lineHeight);
    }

    // 分行处理
    const lines = content.split('\n');

    for (let lineIndex = 0; lineIndex < lines.length && lineIndex < rows; lineIndex++) {
      const line: any = lines[lineIndex];
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
          fgColor = colors[colorName as keyof ColorScheme] || this.options.colors.foreground;
        }

        // 获取背景色
        let bgColor = colors.background || this.options.colors.background;
        if (segment.style.bgColor !== null) {
          const colorName = ANSI_COLORS[segment.style.bgColor];
          bgColor = colors[colorName as keyof ColorScheme] || this.options.colors.background;
        }

        // 处理 inverse 样式
        if (segment.style.inverse) {
          [fgColor, bgColor] = [bgColor, fgColor];
        }

        // 绘制背景
        if (bgColor !== (colors.background || this.options.colors.background)) {
          const textW = this.getTextWidth(text);
          this._ctx.fillStyle = bgColor;
          this._ctx.fillRect(x, y, textW, lineHeight);
        }

        // 绘制文本
        this._ctx.fillStyle = fgColor;
        this._ctx.fillText(text, x, y);

        // 处理粗体
        if (segment.style.bold) {
          this._ctx.fillText(text, x + 0.5, y);
        }

        // 处理下划线
        if (segment.style.underline) {
          const textW = this.getTextWidth(text);
          this._ctx.strokeStyle = fgColor;
          this._ctx.lineWidth = 1;
          this._ctx.beginPath();
          this._ctx.moveTo(x, y + lineHeight - 2);
          this._ctx.lineTo(x + textW, y + lineHeight - 2);
          this._ctx.stroke();
        }

        x += this.getTextWidth(text);
      }
    }

    // 绘制光标
    // if (this.options.terminal.cursorStyle !== 'none') {
    //   const { rows } = this.getRecordingSize();
    //   const cursorLine = Math.min(lines.length - 1, rows - 1);
    //   const lastLine = lines[cursorLine] || '';
    //   const cursorX = offsetX + this.getTextWidth(lastLine);
    //
    //   const cursorY = offsetY + cursorLine * lineHeight;
    //
    //   this._ctx.fillStyle =
    //     colors.cursor ||
    //     this.options.colors.cursor ||
    //     colors.foreground ||
    //     this.options.colors.foreground;
    //   this._ctx.fillRect(cursorX, cursorY, charWidth, lineHeight);
    // }
    // 光标渲染已禁用
  }

  /**
   * 渲染单帧
   */
  renderFrame(frame: Frame): void {
    // 使用 canvas 实际尺寸
    const width = this._canvas?.width || 0;
    const height = this._canvas?.height || 0;

    // console.log('[FRAME] renderFrame - canvas cleared?', !!this._canvas);

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
        const frame = frames[i]!;
        const delay = Math.max(minDelay, frame.delay || 100);
        frameDelays.push(Math.round(delay));

        // 渲染帧
        // console.log(`\n[FRAME] ========== Rendering frame ${i + 1}/${frames.length} ==========`);
        this.renderFrame(frame);

        // 保存为 PNG（@napi-rs/canvas 使用 encode 方法）
        const framePath = path.join(tempDir, `frame_${i.toString().padStart(6, '0')}.png`);

        // 关键修复：移除 alpha 通道，生成纯 RGB PNG
        // node-canvas 默认生成 RGBA PNG，会导致 FFmpeg 调色板处理时出现透明问题
        const buffer = await this._canvas!.encode('png');

        // 使用 sharp 移除 alpha 通道（如果安装了 sharp）
        try {
          const rgbBuffer = await sharp(buffer)
            .removeAlpha() // 移除 alpha 通道
            .png({ compressionLevel: 6 }) // 重新压缩为 PNG
            .toBuffer();
          fs.writeFileSync(framePath, rgbBuffer);
        } catch {
          // 如果没有 sharp，直接使用原始 buffer（可能仍有 alpha 问题）
          fs.writeFileSync(framePath, buffer);
          if (i === 0) {
            console.warn('[WARN] sharp 未安装，建议安装以获得更好的 GIF 质量：npm install sharp');
          }
        }

        // 检查 PNG 文件大小
        // const stats = fs.statSync(framePath);
        // console.log(`[PNG] Frame ${i + 1} saved: ${(stats.size / 1024).toFixed(2)} KB`);

        // 如果是前几帧和最后一帧，输出更多信息
        // if (i < 3 || i === frames.length - 1) {
        //   console.log(`[PNG] File: ${framePath}`);
        // }

        // 进度回调
        if (options.onProgress) {
          options.onProgress(i + 1, frames.length);
        }
      }

      // 添加 0.5 秒的结束帧（重复最后一帧）
      // console.log('[FRAME] Adding 0.5s end frame...');
      // const lastFrameIndex = frames.length - 1;
      const endFramePath = path.join(
        tempDir,
        `frame_${frames.length.toString().padStart(6, '0')}.png`
      );

      // 使用最后一帧的 canvas 状态，直接保存
      const endBuffer = await this._canvas!.encode('png');
      try {
        const rgbEndBuffer = await sharp(endBuffer)
          .removeAlpha()
          .png({ compressionLevel: 6 })
          .toBuffer();
        fs.writeFileSync(endFramePath, rgbEndBuffer);
      } catch {
        fs.writeFileSync(endFramePath, endBuffer);
      }

      // 添加 1500ms 的延迟
      frameDelays.push(1500);

      // 使用 ffmpeg 合成 GIF
      console.log('[FFMPEG] Starting GIF generation...');
      this.renderWithFfmpeg(tempDir, outputPath, frameDelays, frameRate);

      // 检查生成的 GIF 文件
      const gifStats = fs.statSync(outputPath);
      console.log(`[GIF] Generated: ${(gifStats.size / 1024 / 1024).toFixed(2)} MB`);

      return outputPath;
    } finally {
      // 清理临时文件
      this.cleanupTempDir(tempDir);
    }
  }

  /**
   * 使用 ffmpeg 合成 GIF
   */
  private renderWithFfmpeg(
    tempDir: string,
    outputPath: string,
    frameDelays: number[],
    _frameRate: number
  ): void {
    // Windows 下使用绝对路径调用 ffmpeg
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

    // 创建帧列表文件
    const listPath = path.join(tempDir, 'frames.txt');
    const listContent = frameDelays
      .map((delay, i) => {
        const duration = delay / 1000; // 转换为秒
        const frameFile = `frame_${i.toString().padStart(6, '0')}.png`;
        // 使用相对路径，避免 Windows 路径问题
        return `file '${frameFile}'\nduration ${duration}`;
      })
      .join('\n');
    // 最后一帧需要再列一次（ffmpeg concat 要求）
    const lastFrame = `frame_${(frameDelays.length - 1).toString().padStart(6, '0')}.png`;
    fs.writeFileSync(listPath, listContent + `\nfile '${lastFrame}'`);

    // 使用 palette 方式获得更高质量的 GIF

    // 生成调色板
    console.log('[FFMPEG] Generating palette...');
    const paletteCmd = `"${ffmpegPath}" -y -f concat -safe 0 -i "frames.txt" -vf "palettegen=stats_mode=full" -frames:v 1 "palette.png"`;
    try {
      execSync(paletteCmd, { cwd: tempDir, stdio: 'pipe' });

      // 检查调色板文件
      if (fs.existsSync(path.join(tempDir, 'palette.png'))) {
        const paletteStats = fs.statSync(path.join(tempDir, 'palette.png'));
        console.log(`[PALETTE] Generated: ${(paletteStats.size / 1024).toFixed(2)} KB`);
      }
    } catch (error) {
      throw new Error(`ffmpeg 调色板生成失败：${error}`);
    }

    // 使用调色板生成 GIF（使用绝对路径）
    console.log('[FFMPEG] Generating GIF with palette...');
    const absOutputPath = path.resolve(outputPath);
    const gifCmd = `"${ffmpegPath}" -y -f concat -safe 0 -i "frames.txt" -i "palette.png" -lavfi "paletteuse=dither=bayer:bayer_scale=5" "${absOutputPath}"`;
    try {
      execSync(gifCmd, { cwd: tempDir, stdio: 'pipe' });
    } catch (error) {
      throw new Error(`ffmpeg GIF 生成失败：${error}`);
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
    const bytesPerPixel = 0.5 - quality * 0.03;
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
async function renderGif(
  sessionName: string,
  outputPath?: string,
  options: RenderOptionsInternal = {}
): Promise<string> {
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
async function renderFramePreview(
  sessionName: string,
  frameIndex: number,
  outputPath: string
): Promise<string> {
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

export { Renderer, renderGif, renderFramePreview, isCanvasAvailable };
