/**
 * 类型定义文件
 */

// 帧数据
export interface Frame {
  timestamp: number;
  content: string;
  data?: string;
  delay?: number;
}

// 颜色方案
export interface ColorScheme {
  foreground: string;
  background: string;
  cursor: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

// 终端配置
export interface TerminalConfig {
  cols: number;
  rows: number;
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  cursorStyle: 'block' | 'underline' | 'bar' | 'none';
  cursorBlink: boolean;
}

// 录制配置
export interface RecordingConfig {
  maxIdleTime: number;
  frameRate: number;
  quality: number;
}

// 渲染配置
export interface RenderingConfig {
  padding: number;
  borderRadius: number;
  shadowBlur: number;
  shadowColor: string;
  windowTitle: string;
  showWindowTitle: boolean;
  titleBarHeight: number;
  titleBarColor: string;
  windowFrameColor: string;
}

// 存储配置
export interface StorageConfig {
  recordingsDir: string;
  configFile: string;
}

// 完整配置
export interface Config {
  terminal: TerminalConfig;
  colors: ColorScheme;
  recording: RecordingConfig;
  rendering: RenderingConfig;
  storage: StorageConfig;
}

// 录制会话数据
export interface RecordingData {
  name: string;
  version: string;
  createdAt: string;
  cols: number;
  rows: number;
  frames: Frame[];
  config: {
    fontSize: number;
    fontFamily: string;
    colors: Partial<ColorScheme>;
  };
}

// 录制信息（摘要）
export interface RecordingInfo {
  name: string;
  version: string;
  createdAt: string;
  frameCount: number;
  cols: number;
  rows: number;
  duration: number;
  durationFormatted: string;
}

// 帧摘要
export interface FrameSummary {
  index: number;
  timestamp: number;
  delay: number;
  contentLength: number;
  preview: string;
}

// 渲染选项
export interface RenderOptions {
  frameRate?: number;
  quality?: number;
  outputDir?: string;
  onProgress?: (current: number, total: number) => void;
}

// 编辑选项
export interface EditOptions {
  delay?: number;
  theme?: string;
  fontFamily?: string;
  fontSize?: number;
  optimize?: boolean;
  maxIdleTime?: number;
  keepRange?: [number, number];
  deleteRange?: [number, number];
}

// ANSI 样式
export interface AnsiStyle {
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  blink: boolean;
  inverse: boolean;
  hidden: boolean;
  strikethrough: boolean;
  fgColor: number | null;
  bgColor: number | null;
}

// ANSI 解析后的文本段
export interface AnsiSegment {
  text: string;
  style: AnsiStyle;
}

// 尺寸估算
export interface SizeEstimate {
  width: number;
  height: number;
  frameCount: number;
  estimatedSizeMB: string;
}

// 主题名称
export type ThemeName = 'default' | 'dracula' | 'monokai' | 'solarizedDark' | 'oneHalfDark';

// 主题映射
export type Themes = Record<ThemeName, ColorScheme>;

// ============ V2 格式：事件流 ============

// 输出事件（记录原始终端输出）
export interface OutputEvent {
  /** 时间戳（毫秒，相对于录制开始） */
  ts: number;
  /** 原始输出数据（含 ANSI 转义序列） */
  data: string;
}

// 录制元数据
export interface RecordingMeta {
  title: string;
  cols: number;
  rows: number;
  duration: number;
  createdAt: number;
  shell?: string;
  env?: Record<string, string>;
}

// V2 录制格式（事件流）
export interface RecordingDataV2 {
  version: 2;
  meta: RecordingMeta;
  config?: {
    fontSize?: number;
    fontFamily?: string;
    colors?: Partial<ColorScheme>;
  };
  /** 事件流：只记录原始输出 */
  events: OutputEvent[];
}

// 统一录制数据类型（支持 V1 和 V2）
export type RecordingDataAny = RecordingData | RecordingDataV2;

// ============ 虚拟终端 ============

// 单元格样式
export interface CellStyle {
  fg: number;        // 前景色索引 (0-15)，-1 表示默认
  bg: number;        // 背景色索引 (0-15)，-1 表示默认
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  blink: boolean;
  inverse: boolean;
  hidden: boolean;
  strikethrough: boolean;
}

// 终端单元格
export interface Cell {
  char: string;
  style: CellStyle;
}

// 光标位置
export interface CursorPosition {
  x: number;
  y: number;
}

// 虚拟终端状态
export interface TerminalState {
  cols: number;
  rows: number;
  buffer: Cell[][];
  cursor: CursorPosition;
  savedCursor: CursorPosition | null;
  style: CellStyle;
  scrollTop: number;
  scrollBottom: number;
}
