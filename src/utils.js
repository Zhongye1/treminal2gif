/**
 * 工具函数模块
 */

const fs = require('fs');
const path = require('path');
const { defaultConfig } = require('./config');

/**
 * 确保目录存在
 * @param {string} dirPath 目录路径
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 保存录制文件
 * @param {string} filePath 文件路径
 * @param {Object} data 录制数据
 */
function saveRecording(filePath, data) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 加载录制文件
 * @param {string} filePath 文件路径
 * @returns {Object} 录制数据
 */
function loadRecording(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`录制文件不存在: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * 检查录制文件是否存在
 * @param {string} filePath 文件路径
 * @returns {boolean}
 */
function recordingExists(filePath) {
  return fs.existsSync(filePath);
}

/**
 * 格式化时间戳为可读字符串
 * @param {number} timestamp 时间戳 (毫秒)
 * @returns {string}
 */
function formatTimestamp(timestamp) {
  const seconds = Math.floor(timestamp / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const pad = (n) => n.toString().padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${pad(minutes % 60)}:${pad(seconds % 60)}`;
  }
  return `${minutes}:${pad(seconds % 60)}`;
}

/**
 * 计算帧之间的延迟
 * @param {Array} frames 帧数组
 * @returns {Array} 带延迟的帧数组
 */
function calculateDelays(frames) {
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
 * @param {Array} frames 帧数组
 * @param {number} maxIdleTime 最大空闲时间 (ms)
 * @returns {Array}
 */
function optimizeFrames(frames, maxIdleTime = defaultConfig.recording.maxIdleTime) {
  if (frames.length === 0) return [];

  const result = [];
  let lastContent = '';

  for (const frame of frames) {
    // 如果内容有变化，保留帧
    if (frame.content !== lastContent) {
      result.push(frame);
      lastContent = frame.content;
    } else if (result.length > 0) {
      // 内容没变化，但可能需要更新延迟
      const lastFrame = result[result.length - 1];
      if (frame.delay > maxIdleTime) {
        lastFrame.delay = maxIdleTime;
      }
    }
  }

  return result;
}

/**
 * 解析 ANSI 颜色代码
 * 简化版本，提取颜色和样式信息
 * @param {string} text 包含 ANSI 代码的文本
 * @returns {Object} 解析后的数据
 */
function parseAnsi(text) {
  // ANSI 转义序列正则
  const ansiRegex = /\x1b\[([0-9;]*)m/g;

  const segments = [];
  let lastIndex = 0;
  let match;
  let currentStyle = {
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

  // 保存当前文本段
  const saveSegment = (text, style) => {
    if (text.length > 0) {
      segments.push({
        text,
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
        currentStyle = {
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
      } else if (code === 38 || code === 48) {
        // 256 色或真彩色 (简化处理)
        // 跳过后续参数
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // 保存剩余文本
  const remainingText = text.slice(lastIndex);
  saveSegment(remainingText, currentStyle);

  // 移除其他控制字符
  const cleanSegments = segments.map((seg) => ({
    ...seg,
    text: seg.text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, ''), // 移除其他 ANSI 序列
  }));

  return cleanSegments;
}

/**
 * 获取终端尺寸
 * @returns {Object} { cols, rows }
 */
function getTerminalSize() {
  return {
    cols: process.stdout.columns || defaultConfig.terminal.cols,
    rows: process.stdout.rows || defaultConfig.terminal.rows,
  };
}

/**
 * 延迟函数
 * @param {number} ms 毫秒
 * @returns {Promise}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 转义正则表达式特殊字符
 * @param {string} str 字符串
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 打印欢迎信息
 */
function printWelcome() {
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
 * @param {Object} recording 录制数据
 */
function printRecordingInfo(recording) {
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

module.exports = {
  ensureDir,
  saveRecording,
  loadRecording,
  recordingExists,
  formatTimestamp,
  calculateDelays,
  optimizeFrames,
  parseAnsi,
  getTerminalSize,
  delay,
  escapeRegex,
  printWelcome,
  printRecordingInfo,
};
