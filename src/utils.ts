/**
 * 工具函数模块
 */

import * as fs from 'fs';
import * as path from 'path';
import { Frame, RecordingData, RecordingDataV2, OutputEvent, TerminalEvent, AnsiStyle, AnsiSegment } from './types';
import { defaultConfig } from './config';
import { VirtualTerminal } from './virtualTerminal';

/**
 * 确保目录存在
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
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
 * 保存录制文件 (支持 V1 和 V2 格式)
 */
export function saveRecording(filePath: string, data: RecordingData | RecordingDataV2): void {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 加载录制文件 (自动检测 V1 或 V2 格式)
 */
export function loadRecording(filePath: string): RecordingData {
  if (!fs.existsSync(filePath)) {
    throw new Error(`录制文件不存在: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);

  // 检测格式版本
  if (data.version === 2) {
    // V2 格式，转换为 V1 兼容格式（用于旧代码兼容）
    return convertV2ToV1(data as RecordingDataV2);
  }

  return data as RecordingData;
}

/**
 * 加载录制文件 (V2 原生格式)
 */
export function loadRecordingV2(filePath: string): RecordingDataV2 {
  if (!fs.existsSync(filePath)) {
    throw new Error(`录制文件不存在: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);

  if (data.version === 2) {
    return data as RecordingDataV2;
  }

  // V1 格式，转换为 V2
  return convertV1ToV2(data as RecordingData);
}

/**
 * 加载录制文件 (任意格式)
 */
export function loadRecordingAny(filePath: string): RecordingData | RecordingDataV2 {
  if (!fs.existsSync(filePath)) {
    throw new Error(`录制文件不存在：${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as RecordingData | RecordingDataV2;
}

/**
 * 检测录制文件格式
 */
export function detectRecordingVersion(filePath: string): 1 | 2 {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);
  return data.version === 2 ? 2 : 1;
}

/**
 * V2 转 V1 格式
 */
export function convertV2ToV1(v2: RecordingDataV2): RecordingData {
  // 使用虚拟终端重建帧（使用智能版本）
  const frames = eventsToFramesSmart(v2.events, v2.meta.cols, v2.meta.rows);

  return {
    name: v2.meta.title,
    version: '1.0',
    createdAt: new Date(v2.meta.createdAt).toISOString(),
    cols: v2.meta.cols,
    rows: v2.meta.rows,
    frames,
    config: {
      fontSize: v2.config?.fontSize || 14,
      fontFamily: v2.config?.fontFamily || 'monospace',
      colors: v2.config?.colors || {},
    },
  };
}

/**
 * V1 转 V2 格式
 */
export function convertV1ToV2(v1: RecordingData): RecordingDataV2 {
  // 从 V1 帧中提取事件（转换为新的 OutputEvent 格式）
  const events: OutputEvent[] = [];
  let lastTs = 0;

  for (const frame of v1.frames) {
    if (frame.data) {
      events.push({
        ts: frame.timestamp,
        type: 'output',  // 添加类型字段
        data: frame.data,
      });
    }
    lastTs = Math.max(lastTs, frame.timestamp);
  }

  return {
    version: 2,
    meta: {
      title: v1.name,
      cols: v1.cols,
      rows: v1.rows,
      duration: lastTs,
      createdAt: new Date(v1.createdAt).getTime(),
    },
    config: v1.config,
    events,
  };
}

/**
 * 事件流转帧序列（基础版本，仅处理 output 事件）
 * @deprecated 使用 eventsToFramesSmart 替代
 */
export function eventsToFrames(
  events: TerminalEvent[],  // 改为 TerminalEvent[] 以支持新格式
  cols: number,
  rows: number,
  options: {
    minFrameInterval?: number;
    onProgress?: (current: number, total: number) => void;
  } = {}
): Frame[] {
  const { minFrameInterval = 50, onProgress } = options;
  const frames: Frame[] = [];
  const vt = new VirtualTerminal(cols, rows);

  let lastFrameTs = -Infinity;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!event) continue;
    
    // 只处理 output 事件
    if (event.type === 'output') {
      vt.feed(event.data);
    }

    // 只在足够时间间隔后记录帧
    if (event.ts - lastFrameTs >= minFrameInterval || i === events.length - 1) {
      frames.push({
        timestamp: event.ts,
        content: vt.getSnapshot(),
      });
      lastFrameTs = event.ts;
    }

    if (onProgress && i % 100 === 0) {
      onProgress(i, events.length);
    }
  }

  // 确保至少有一帧
  if (frames.length === 0) {
    frames.push({
      timestamp: 0,
      content: vt.getSnapshot(),
    });
  }

  return frames;
}

/**
 * 智能事件流转帧序列
 * 只在内容变化时记录帧
 * 支持多种事件类型（output, resize, cursor 等）
 */
export function eventsToFramesSmart(
  events: TerminalEvent[],  // 支持所有事件类型
  cols: number,
  rows: number,
  options: {
    maxFrameInterval?: number;
    onProgress?: (current: number, total: number) => void;
  } = {}
): Frame[] {
  const { maxFrameInterval = 2000, onProgress } = options;
  const frames: Frame[] = [];
  const vt = new VirtualTerminal(cols, rows);

  let lastContent = '';
  let lastFrameTs = 0;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!event) continue;

    // 根据事件类型处理
    switch (event.type) {
      case 'output':
        // 输出事件：馈送到虚拟终端
        vt.feed(event.data);
        break;

      case 'resize':
        // 尺寸变化事件：调整虚拟终端大小
        {
          const [newCols, newRows] = event.data;
          vt.resize(newCols, newRows);
        }
        break;

      case 'cursor':
        // 光标事件：目前由虚拟终端自动处理，这里可以扩展
        // TODO: 实现光标显示/隐藏/样式变化的显式控制
        break;

      case 'input':
      case 'title':
      case 'theme':
        // 这些事件暂时不处理，可以扩展功能
        break;
    }

    const currentContent = vt.getSnapshot();
    const timeSinceLastFrame = event.ts - lastFrameTs;

    // 条件：内容变化 或 超过最大间隔
    if (currentContent !== lastContent || timeSinceLastFrame >= maxFrameInterval || i === events.length - 1) {
      frames.push({
        timestamp: event.ts,
        content: currentContent,
        delay: timeSinceLastFrame,
      });
      lastContent = currentContent;
      lastFrameTs = event.ts;
    }

    if (onProgress && i % 100 === 0) {
      onProgress(i, events.length);
    }
  }

  return frames;
}

/**
 * 解析 ANSI 颜色代码
 * 简化版本，提取颜色和样式信息
 */
export function parseAnsi(text: string): AnsiSegment[] {
  // ANSI SGR 转义序列正则 (颜色和样式)
  // eslint-disable-next-line no-control-regex
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
    const codes = match[1]?.split(';').map(Number) || [];
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

  // 移除所有 ANSI 控制序列和其他控制字符
  // 包括：CSI 序列 (\x1b[...), OSC 序列 (\x1b]...), 其他转义
  const cleanSegments = segments.map((seg) => ({
    ...seg,
    text: seg.text
      // 移除 CSI 序列 (大部分终端控制)
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
      // 移除 OSC 序列 (标题设置等)
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
      // 移除其他 ANSI 转义序列
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b[()][AB012]/g, '')
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b[78]/g, '')
      // 移除其他控制字符 (除换行和制表符外)
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''),
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
 * 计算帧延迟（根据时间戳差值）
 */
export function calculateDelays(frames: Frame[]): Frame[] {
  const result: Frame[] = [];
  let lastTimestamp = 0;

  for (const frame of frames) {
    const delay = frame.timestamp - lastTimestamp;
    result.push({
      ...frame,
      delay: Math.max(0, delay),
    });
    lastTimestamp = frame.timestamp;
  }

  return result;
}

/**
 * 优化帧序列（移除空闲帧）
 */
export function optimizeFrames(frames: Frame[], maxIdleTime: number = 2000): Frame[] {
  if (frames.length === 0) return frames;

  const result: Frame[] = [frames[0]!];
  let accumulatedDelay = 0;

  for (let i = 1; i < frames.length; i++) {
    const prevFrame = frames[i - 1]!;
    const currentFrame = frames[i]!;
    const delay = currentFrame.timestamp - prevFrame.timestamp;

    // 如果内容相同且延迟不超过最大空闲时间，合并
    if (currentFrame.content === prevFrame.content && delay <= maxIdleTime) {
      accumulatedDelay += delay;
    } else {
      // 添加新帧并更新延迟
      const newFrame = { ...currentFrame };
      if (accumulatedDelay > 0) {
        newFrame.delay = (newFrame.delay || 0) + accumulatedDelay;
        accumulatedDelay = 0;
      }
      result.push(newFrame);
    }
  }

  // 处理第一帧的延迟
  if (result.length > 0) {
    result[0]!.delay = frames[0]?.delay || 0;
  }

  return result;
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
export function printRecordingInfo(recording: RecordingData | RecordingDataV2): void {
  console.log('\n录制信息:');
  
  // 根据版本提取信息
  if ((recording as RecordingDataV2).version === 2) {
    const v2 = recording as RecordingDataV2;
    console.log(`  名称：${v2.meta.title}`);
    console.log(`  创建时间：${new Date(v2.meta.createdAt).toLocaleString()}`);
    console.log(`  终端尺寸：${v2.meta.cols}x${v2.meta.rows}`);
    console.log(`  时长：${formatTimestamp(v2.meta.duration)}`);
  } else {
    const v1 = recording as RecordingData;
    console.log(`  名称：${v1.name}`);
    console.log(`  创建时间：${new Date(v1.createdAt).toLocaleString()}`);
    console.log(`  帧数：${v1.frames.length}`);
    console.log(`  终端尺寸：${v1.cols}x${v1.rows}`);
    if (v1.frames.length > 0) {
      const duration = v1.frames[v1.frames.length - 1]?.timestamp ?? 0;
      console.log(`  时长：${formatTimestamp(duration)}`);
    }
  }
}
