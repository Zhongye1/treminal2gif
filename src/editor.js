/**
 * 录制编辑模块
 * 支持调整帧延迟、删除帧、修改主题等操作
 */

const { getConfig, getRecordingPath, getTheme, mergeConfig } = require('./config');
const { loadRecording, saveRecording, calculateDelays, optimizeFrames, formatTimestamp } = require('./utils');

/**
 * 编辑器类
 */
class Editor {
  constructor(recordingPath, options = {}) {
    this.filePath = recordingPath;
    this.options = getConfig(options);
    this.recording = null;
    this.frames = [];
    this.modified = false;
  }

  /**
   * 加载录制文件
   */
  load() {
    this.recording = loadRecording(this.filePath);
    this.frames = calculateDelays(this.recording.frames);
    return this.recording;
  }

  /**
   * 获取录制信息
   * @returns {Object}
   */
  getInfo() {
    if (!this.recording) {
      throw new Error('请先加载录制文件');
    }

    const duration = this.frames.length > 0 ? this.frames[this.frames.length - 1].timestamp : 0;

    return {
      name: this.recording.name,
      version: this.recording.version,
      createdAt: this.recording.createdAt,
      frameCount: this.frames.length,
      cols: this.recording.cols,
      rows: this.recording.rows,
      duration,
      durationFormatted: formatTimestamp(duration),
    };
  }

  /**
   * 设置帧延迟
   * @param {number} frameIndex 帧索引
   * @param {number} delay 延迟 (毫秒)
   */
  setFrameDelay(frameIndex, delay) {
    if (frameIndex < 0 || frameIndex >= this.frames.length) {
      throw new Error(`帧索引超出范围: ${frameIndex}`);
    }
    this.frames[frameIndex].delay = Math.max(0, delay);
    this.modified = true;
  }

  /**
   * 设置所有帧的延迟
   * @param {number} delay 延迟 (毫秒)
   */
  setAllDelays(delay) {
    for (let i = 0; i < this.frames.length; i++) {
      this.frames[i].delay = Math.max(0, delay);
    }
    this.modified = true;
  }

  /**
   * 删除帧
   * @param {number} frameIndex 帧索引
   */
  deleteFrame(frameIndex) {
    if (frameIndex < 0 || frameIndex >= this.frames.length) {
      throw new Error(`帧索引超出范围: ${frameIndex}`);
    }
    this.frames.splice(frameIndex, 1);
    this.modified = true;
  }

  /**
   * 删除帧范围
   * @param {number} startIndex 开始索引
   * @param {number} endIndex 结束索引
   */
  deleteFrameRange(startIndex, endIndex) {
    if (startIndex < 0 || endIndex >= this.frames.length || startIndex > endIndex) {
      throw new Error(`帧索引范围无效: ${startIndex}-${endIndex}`);
    }
    this.frames.splice(startIndex, endIndex - startIndex + 1);
    this.modified = true;
  }

  /**
   * 保留帧范围
   * @param {number} startIndex 开始索引
   * @param {number} endIndex 结束索引
   */
  keepFrameRange(startIndex, endIndex) {
    if (startIndex < 0 || endIndex >= this.frames.length || startIndex > endIndex) {
      throw new Error(`帧索引范围无效: ${startIndex}-${endIndex}`);
    }
    this.frames = this.frames.slice(startIndex, endIndex + 1);
    this.modified = true;
  }

  /**
   * 优化帧序列（移除重复帧）
   * @param {number} maxIdleTime 最大空闲时间
   */
  optimize(maxIdleTime) {
    this.frames = optimizeFrames(this.frames, maxIdleTime);
    this.modified = true;
  }

  /**
   * 设置主题
   * @param {string} themeName 主题名称
   */
  setTheme(themeName) {
    const theme = getTheme(themeName);
    this.recording.config.colors = theme;
    this.modified = true;
  }

  /**
   * 设置颜色方案
   * @param {Object} colors 颜色配置
   */
  setColors(colors) {
    this.recording.config.colors = mergeConfig(this.recording.config.colors, colors);
    this.modified = true;
  }

  /**
   * 设置字体
   * @param {string} fontFamily 字体
   * @param {number} fontSize 字号
   */
  setFont(fontFamily, fontSize) {
    if (fontFamily) {
      this.recording.config.fontFamily = fontFamily;
    }
    if (fontSize) {
      this.recording.config.fontSize = fontSize;
    }
    this.modified = true;
  }

  /**
   * 设置终端尺寸
   * @param {number} cols 列数
   * @param {number} rows 行数
   */
  setSize(cols, rows) {
    if (cols > 0) {
      this.recording.cols = cols;
    }
    if (rows > 0) {
      this.recording.rows = rows;
    }
    this.modified = true;
  }

  /**
   * 获取帧列表（摘要）
   * @param {number} start 开始索引
   * @param {number} count 数量
   * @returns {Array}
   */
  listFrames(start = 0, count = 20) {
    const result = [];
    const end = Math.min(start + count, this.frames.length);

    for (let i = start; i < end; i++) {
      const frame = this.frames[i];
      result.push({
        index: i,
        timestamp: frame.timestamp,
        delay: frame.delay,
        contentLength: frame.content ? frame.content.length : 0,
        preview: frame.content ? frame.content.slice(0, 50).replace(/\n/g, '\\n') : '',
      });
    }

    return result;
  }

  /**
   * 获取指定帧
   * @param {number} frameIndex 帧索引
   * @returns {Object}
   */
  getFrame(frameIndex) {
    if (frameIndex < 0 || frameIndex >= this.frames.length) {
      throw new Error(`帧索引超出范围: ${frameIndex}`);
    }
    return this.frames[frameIndex];
  }

  /**
   * 保存修改
   * @param {string} outputPath 输出路径（可选）
   */
  save(outputPath) {
    if (!this.modified) {
      return false;
    }

    // 重新计算时间戳
    let timestamp = 0;
    for (const frame of this.frames) {
      timestamp += frame.delay;
      frame.timestamp = timestamp;
    }

    this.recording.frames = this.frames;
    saveRecording(outputPath || this.filePath, this.recording);
    this.modified = false;
    return true;
  }

  /**
   * 另存为
   * @param {string} newName 新名称
   */
  saveAs(newName) {
    const newPath = getRecordingPath(newName);
    this.recording.name = newName;
    this.save(newPath);
    return newPath;
  }

  /**
   * 是否已修改
   * @returns {boolean}
   */
  isModified() {
    return this.modified;
  }

  /**
   * 撤销修改（重新加载）
   */
  revert() {
    this.load();
    this.modified = false;
  }
}

/**
 * 快捷编辑函数
 * @param {string} sessionName 会话名称
 * @param {Object} edits 编辑操作
 * @returns {Object} 编辑后的录制数据
 */
function quickEdit(sessionName, edits = {}) {
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

  return editor.recording;
}

/**
 * 显示录制信息
 * @param {string} sessionName 会话名称
 */
function showInfo(sessionName) {
  const filePath = getRecordingPath(sessionName);
  const editor = new Editor(filePath);
  const info = editor.load();

  console.log('\n录制信息:');
  console.log(`  名称: ${info.name}`);
  console.log(`  创建时间: ${new Date(info.createdAt).toLocaleString()}`);
  console.log(`  帧数: ${editor.frames.length}`);
  console.log(`  终端尺寸: ${info.cols} x ${info.rows}`);
  console.log(`  时长: ${formatTimestamp(editor.frames.length > 0 ? editor.frames[editor.frames.length - 1].timestamp : 0)}`);
  console.log(`  字体: ${info.config.fontSize}px ${info.config.fontFamily}`);

  return info;
}

module.exports = {
  Editor,
  quickEdit,
  showInfo,
};
