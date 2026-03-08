/**
 * 录制编辑模块
 */

import {
  RecordingData,
  Frame,
  RecordingInfo,
  FrameSummary,
  Config,
  ColorScheme,
  ThemeName,
} from './types';
import { getConfig, getRecordingPath, getTheme } from './config';
import {
  loadRecording,
  saveRecording,
  calculateDelays,
  optimizeFrames,
  formatTimestamp,
} from './utils';

/**
 * 编辑器类
 */
class Editor {
  private readonly filePath: string;
  private _recording: RecordingData | null;
  private _frames: Frame[];
  private modified: boolean;
  options: Config;

  constructor(recordingPath: string, options: Partial<Config> = {}) {
    this.filePath = recordingPath;
    this.options = getConfig(options);
    this._recording = null;
    this._frames = [];
    this.modified = false;
  }

  // 公共访问器
  get recording(): RecordingData | null {
    return this._recording;
  }
  get frames(): Frame[] {
    return this._frames;
  }

  /**
   * 加载录制文件
   */
  load(): RecordingData {
    this._recording = loadRecording(this.filePath);
    this._frames = calculateDelays(this._recording.frames);
    return this._recording;
  }

  /**
   * 获取录制信息
   */
  getInfo(): RecordingInfo {
    if (!this._recording) {
      throw new Error('请先加载录制文件');
    }

    const duration = this._frames.length > 0 ? this._frames[this._frames.length - 1]!.timestamp : 0;

    return {
      name: this._recording.name,
      version: this._recording.version,
      createdAt: this._recording.createdAt,
      frameCount: this._frames.length,
      cols: this._recording.cols,
      rows: this._recording.rows,
      duration,
      durationFormatted: formatTimestamp(duration),
    };
  }

  /**
   * 设置帧延迟
   */
  setFrameDelay(frameIndex: number, delay: number): void {
    if (frameIndex < 0 || frameIndex >= this._frames.length) {
      throw new Error(`帧索引超出范围：${frameIndex}`);
    }
    this._frames[frameIndex]!.delay = Math.max(0, delay);
    this.modified = true;
  }

  /**
   * 设置所有帧的延迟
   */
  setAllDelays(delay: number): void {
    for (let i = 0; i < this._frames.length; i++) {
      this._frames[i]!.delay = Math.max(0, delay);
    }
    this.modified = true;
  }

  /**
   * 删除帧
   */
  deleteFrame(frameIndex: number): void {
    if (frameIndex < 0 || frameIndex >= this._frames.length) {
      throw new Error(`帧索引超出范围：${frameIndex}`);
    }
    this._frames.splice(frameIndex, 1);
    this.modified = true;
  }

  /**
   * 删除帧范围
   */
  deleteFrameRange(startIndex: number, endIndex: number): void {
    if (startIndex < 0 || endIndex >= this._frames.length || startIndex > endIndex) {
      throw new Error(`帧索引范围无效: ${startIndex}-${endIndex}`);
    }
    this._frames.splice(startIndex, endIndex - startIndex + 1);
    this.modified = true;
  }

  /**
   * 保留帧范围
   */
  keepFrameRange(startIndex: number, endIndex: number): void {
    if (startIndex < 0 || endIndex >= this._frames.length || startIndex > endIndex) {
      throw new Error(`帧索引范围无效: ${startIndex}-${endIndex}`);
    }
    this._frames = this._frames.slice(startIndex, endIndex + 1);
    this.modified = true;
  }

  /**
   * 优化帧序列
   */
  optimize(maxIdleTime?: number): void {
    this._frames = optimizeFrames(this._frames, maxIdleTime);
    this.modified = true;
  }

  /**
   * 设置主题
   */
  setTheme(themeName: string): void {
    const validThemes = ['default', 'dracula', 'monokai', 'solarizedDark', 'oneHalfDark'];
    const theme = getTheme(validThemes.includes(themeName) ? (themeName as ThemeName) : 'default');
    if (this._recording) {
      this._recording.config.colors = theme;
    }
    this.modified = true;
  }

  /**
   * 设置颜色方案
   */
  setColors(colors: Partial<ColorScheme>): void {
    if (this._recording) {
      this._recording.config.colors = { ...this._recording.config.colors, ...colors };
    }
    this.modified = true;
  }

  /**
   * 设置字体
   */
  setFont(fontFamily?: string, fontSize?: number): void {
    if (!this._recording) return;
    if (fontFamily) {
      this._recording.config.fontFamily = fontFamily;
    }
    if (fontSize) {
      this._recording.config.fontSize = fontSize;
    }
    this.modified = true;
  }

  /**
   * 设置终端尺寸
   */
  setSize(cols?: number, rows?: number): void {
    if (!this._recording) return;
    if (cols && cols > 0) {
      this._recording.cols = cols;
    }
    if (rows && rows > 0) {
      this._recording.rows = rows;
    }
    this.modified = true;
  }

  /**
   * 获取帧列表（摘要）
   */
  listFrames(start: number = 0, count: number = 20): FrameSummary[] {
    const result: FrameSummary[] = [];
    const end = Math.min(start + count, this._frames.length);

    for (let i = start; i < end; i++) {
      const frame = this._frames[i];
      result.push({
        index: i,
        timestamp: frame!.timestamp,
        delay: frame!.delay || 0,
        contentLength: frame!.content ? frame!.content.length : 0,
        preview: frame!.content ? frame!.content.slice(0, 50).replace(/\n/g, '\\n') : '',
      });
    }

    return result;
  }

  /**
   * 获取指定帧
   */
  getFrame(frameIndex: number): Frame {
    if (frameIndex < 0 || frameIndex >= this._frames.length) {
      throw new Error(`帧索引超出范围：${frameIndex}`);
    }
    return this._frames[frameIndex]!;
  }

  /**
   * 保存修改
   */
  save(outputPath?: string): boolean {
    if (!this.modified || !this._recording) {
      return false;
    }

    // 重新计算时间戳
    let timestamp = 0;
    for (const frame of this._frames) {
      timestamp += frame.delay || 0;
      frame.timestamp = timestamp;
    }

    this._recording.frames = this._frames;
    saveRecording(outputPath || this.filePath, this._recording);
    this.modified = false;
    return true;
  }

  /**
   * 另存为
   */
  saveAs(newName: string): string {
    const newPath = getRecordingPath(newName);
    if (this._recording) {
      this._recording.name = newName;
    }
    this.save(newPath);
    return newPath;
  }

  /**
   * 是否已修改
   */
  isModified(): boolean {
    return this.modified;
  }

  /**
   * 撤销修改
   */
  revert(): void {
    this.load();
    this.modified = false;
  }
}

/**
 * 快捷编辑函数
 */
function quickEdit(
  sessionName: string,
  edits: {
    delay?: number;
    theme?: string;
    fontFamily?: string;
    fontSize?: number;
    optimize?: boolean;
    maxIdleTime?: number;
    keepRange?: [number, number];
    deleteRange?: [number, number];
  } = {}
): RecordingData {
  const filePath = getRecordingPath(sessionName);
  const editor = new Editor(filePath);
  editor.load();

  // 应用编辑操作
  if (edits.delay !== undefined) {
    editor.setAllDelays(edits.delay);
  }

  if (edits.theme) {
    editor.setTheme(edits.theme);
  }

  if (edits.fontFamily || edits.fontSize) {
    editor.setFont(edits.fontFamily, edits.fontSize);
  }

  if (edits.optimize === true) {
    editor.optimize(edits.maxIdleTime);
  }

  if (edits.keepRange) {
    const [start, end] = edits.keepRange;
    editor.keepFrameRange(start, end);
  }

  if (edits.deleteRange) {
    const [start, end] = edits.deleteRange;
    editor.deleteFrameRange(start, end);
  }

  // 保存
  editor.save();

  return editor.recording!;
}

/**
 * 显示录制信息
 */
function showInfo(sessionName: string): RecordingData {
  const filePath = getRecordingPath(sessionName);
  const editor = new Editor(filePath);
  const info = editor.load();

  console.log('\n录制信息:');
  console.log(`  名称: ${info.name}`);
  console.log(`  创建时间: ${new Date(info.createdAt).toLocaleString()}`);
  console.log(`  帧数: ${editor.frames.length}`);
  console.log(`  终端尺寸: ${info.cols} x ${info.rows}`);
  console.log(
    `  时长：${formatTimestamp(editor.frames.length > 0 ? editor.frames[editor.frames.length - 1]!.timestamp : 0)}`
  );
  console.log(`  字体: ${info.config.fontSize}px ${info.config.fontFamily}`);

  return info;
}

export { Editor, quickEdit, showInfo };
