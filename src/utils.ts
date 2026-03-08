/**
 * 工具函数模块
 */

import * as fs from 'fs';
import * as path from 'path';
import { Frame, RecordingData, AnsiStyle, AnsiSegment } from './types';
import { defaultConfig } from './config';

/**
 * 确保目录存在
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 保存录制文件
 */
export function saveRecording(filePath: string, data: RecordingData): void {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 加载录制文件
 */
export function loadRecording(filePath: string): RecordingData {
  if (!fs.existsSync(filePath)) {
    throw new Error(`录制文件不存在: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as RecordingData;
}

/**
 * 检查录制文件是否存在
 */
export function recordingExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * 格式化时间戳为可读字符串
 */
export function formatTimestamp(timestamp: number): string {
  const seconds = Math.floor(timestamp / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const pad = (n: number): string => n.toString().padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${pad(minutes % 60)}:${pad(seconds % 60)}`;
  }
  return `${minutes}:${pad(seconds % 60)}`;
}

/**
 * 计算帧之间的延迟
 */
export function calculateDelays(frames: Frame[]): Frame[] {
  if (frames.length === 0) return [];

  return frames.map((frame, index) => {
    const delay = index === 0 ? 0 : frame.timestamp - frames[index - 1].timestamp;
    return {
      ...frame,
      delay: Math.max(0, delay),
    };
  });
}

/**
 * 优化帧序列（移除空闲帧）
 */
export function optimizeFrames(frames: Frame[], maxIdleTime?: number): Frame[] {
  const idleTime = maxIdleTime ?? defaultConfig.recording.maxIdleTime;
  if (frames.length === 0) return [];

  const result: Frame[] = [];
  let lastContent = '';

  for (const frame of frames) {
    // 如果内容有变化，保留帧
    if (frame.content !== lastContent) {
      result.push(frame);
      lastContent = frame.content;
    } else if (result.length > 0) {
      // 内容没变化，但可能需要更新延迟
      const lastFrame = result[result.length - 1];
      if (frame.delay && frame.delay > idleTime) {
        lastFrame.delay = idleTime;
      }
    }
  }

  return result;
}

/**
 * 解析 ANSI 颜色代码
 * 简化版本，提取颜色和样式信息
 */
export function parseAnsi(text: string): AnsiSegment[] {
  // ANSI 转义序列正则
  const ansiRegex = /\x1b\[([0-9;]*)m/g;

  const segments: AnsiSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  
  const defaultStyle: AnsiStyle = {
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    blink: false,
    inverse: false,
    hidden: false,
    strikethrough: false,
    fgColor: null,
    bgColor: null,
  };

  let currentStyle: AnsiStyle = { ...defaultStyle };

  // 保存当前文本段
  const saveSegment = (txt: string, style: AnsiStyle): void => {
    if (txt.length > 0) {
      segments.push({
        text: txt,
        style: { ...style },
      });
    }
  };

  while ((match = ansiRegex.exec(text)) !== null) {
    // 保存之前的文本
    const plainText = text.slice(lastIndex, match.index);
    saveSegment(plainText, currentStyle);

    // 解析 ANSI 代码
    const codes = match[1].split(';').map(Number);
    for (const code of codes) {
      if (code === 0) {
        // 重置所有样式
        currentStyle = { ...defaultStyle };
      } else if (code === 1) {
        currentStyle.bold = true;
      } else if (code === 2) {
        currentStyle.dim = true;
      } else if (code === 3) {
        currentStyle.italic = true;
      } else if (code === 4) {
        currentStyle.underline = true;
      } else if (code === 5) {
        currentStyle.blink = true;
      } else if (code === 7) {
        currentStyle.inverse = true;
      } else if (code === 8) {
        currentStyle.hidden = true;
      } else if (code === 9) {
        currentStyle.strikethrough = true;
      } else if (code >= 30 && code <= 37) {
        // 前景色 (标准 16 色)
        currentStyle.fgColor = code - 30;
      } else if (code >= 40 && code <= 47) {
        // 背景色 (标准 16 色)
        currentStyle.bgColor = code - 40;
      } else if (code >= 90 && code <= 97) {
        // 前景色 (亮色)
        currentStyle.fgColor = code - 90 + 8;
      } else if (code >= 100 && code <= 107) {
        // 背景色 (亮色)
        currentStyle.bgColor = code - 100 + 8;
      }
      // 256 色和真彩色简化处理，跳过
    }

    lastIndex = match.index + match[0].length;
  }

  // 保存剩余文本
  const remainingText = text.slice(lastIndex);
  saveSegment(remainingText, currentStyle);

  // 移除其他控制字符
  const cleanSegments = segments.map((seg) => ({
    ...seg,
    text: seg.text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, ''),
  }));

  return cleanSegments;
}

/**
 * 获取终端尺寸
 */
export function getTerminalSize(): { cols: number; rows: number } {
  return {
    cols: process.stdout.columns || defaultConfig.terminal.cols,
    rows: process.stdout.rows || defaultConfig.terminal.rows,
  };
}

/**
 * 延迟函数
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 转义正则表达式特殊字符
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 打印欢迎信息
 */
export function printWelcome(): void {
  console.log('\n  treminal2gif - 终端录制转 GIF 工具\n');
  console.log('  命令:');
  console.log('    record <session-name>  录制终端会话');
  console.log('    edit <session-name>    编辑录制内容');
  console.log('    render <session-name>  渲染为 GIF');
  console.log('    list                   列出所有录制');
  console.log('    config                 显示当前配置\n');
}

/**
 * 打印录制信息
 */
export function printRecordingInfo(recording: RecordingData): void {
  console.log('\n录制信息:');
  console.log(`  名称: ${recording.name}`);
  console.log(`  创建时间: ${new Date(recording.createdAt).toLocaleString()}`);
  console.log(`  帧数: ${recording.frames.length}`);
  console.log(`  终端尺寸: ${recording.cols}x${recording.rows}`);
  if (recording.frames.length > 0) {
    const duration = recording.frames[recording.frames.length - 1].timestamp;
    console.log(`  时长: ${formatTimestamp(duration)}`);
  }
}
