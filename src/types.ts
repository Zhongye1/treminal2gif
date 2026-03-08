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

/**
 * 事件类型枚举
 */
export type TerminalEventType =
  | 'output'   // 终端输出 (stdout/stderr)
  | 'input'    // 用户输入（按键）
  | 'resize'   // 终端尺寸变化
  | 'cursor'   // 光标控制（显示/隐藏/样式）
  | 'title'    // 窗口标题变化
  | 'theme'    // 主题/颜色变化
  | 'wait';    // 显式等待（人为插入延迟）

/**
 * 基础事件接口
 */
export interface BaseEvent {
  /** 时间戳（毫秒，相对于录制开始） */
  ts: number;
  /** 事件类型 */
  type: TerminalEventType;
}

/**
 * 输出事件（记录原始终端输出）
 */
export interface OutputEvent extends BaseEvent {
  type: 'output';
  /** 原始输出数据（含 ANSI 转义序列） */
  data: string;
}

/**
 * 输入事件（记录用户按键，可选）
 */
export interface InputEvent extends BaseEvent {
  type: 'input';
  /** 按键内容 */
  data: string;
}

/**
 * 尺寸变化事件
 */
export interface ResizeEvent extends BaseEvent {
  type: 'resize';
  /** [列数，行数] */
  data: [number, number];
}

/**
 * 光标事件
 */
export interface CursorEvent extends BaseEvent {
  type: 'cursor';
  /** 光标状态 */
  data: 'show' | 'hide' | 'block' | 'underline' | 'bar';
}

/**
 * 标题事件
 */
export interface TitleEvent extends BaseEvent {
  type: 'title';
  /** 新标题 */
  data: string;
}

/**
 * 主题事件
 */
export interface ThemeEvent extends BaseEvent {
  type: 'theme';
  /** 颜色配置 */
  data: Partial<ColorScheme>;
}

/**
 * 联合事件类型
 */
export type TerminalEvent =
  | OutputEvent
  | InputEvent
  | ResizeEvent
  | CursorEvent
  | TitleEvent
  | ThemeEvent;

// 录制元数据（增强版）
export interface RecordingMeta {
  title: string;
  cols: number;
  rows: number;
  duration: number;
  createdAt: number;
  
  // 可选扩展字段
  shell?: string;                        // 使用的 shell
  env?: Record<string, string>;          // 环境变量 (TERM, SHELL 等)
  theme?: {                              // 颜色主题配置
    fg: string;
    bg: string;
    palette: string[];
  };
  fontFamily?: string;                   // 默认字体
  fontSize?: number;                     // 默认字号
  lineHeight?: number;                   // 行高倍数
  defaultFrameDelayMs?: number;          // 默认帧间隔（可被事件覆盖）
  cursorStyle?: 'block' | 'underline' | 'bar'; // 光标样式
  loop?: boolean;                        // GIF 是否循环
}

// V2 录制格式（事件流 - 支持多种事件类型）
export interface RecordingDataV2 {
  version: 2;
  meta: RecordingMeta;
  config?: {
    fontSize?: number;
    fontFamily?: string;
    colors?: Partial<ColorScheme>;
  };
  /** 事件流：支持输出、输入、控制等多种事件 */
  events: TerminalEvent[];
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
