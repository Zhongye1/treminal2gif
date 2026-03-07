/**
 * 终端录制模块
 * 使用 node-pty 捕获终端会话
 */

const pty = require('node-pty');
const path = require('path');
const os = require('os');
const { getConfig, getRecordingPath, defaultConfig } = require('./config');
const { saveRecording, getTerminalSize, delay } = require('./utils');

// 录制状态
let isRecording = false;
let recordingSession = null;

/**
 * 录制器类
 */
class Recorder {
  constructor(options = {}) {
    this.options = getConfig(options);
    this.frames = [];
    this.startTime = null;
    this.ptyProcess = null;
    this.currentContent = '';
    this.sessionName = null;
    this.isRecording = false;
    this.onFrame = null;
    this.onStop = null;
  }

  /**
   * 开始录制
   * @param {string} sessionName 会话名称
   */
  async start(sessionName) {
    if (this.isRecording) {
      throw new Error('已经在录制中');
    }

    this.sessionName = sessionName;
    this.frames = [];
    this.currentContent = '';
    this.startTime = Date.now();
    this.isRecording = true;

    // 获取终端尺寸
    const size = getTerminalSize();
    const cols = this.options.terminal.cols || size.cols;
    const rows = this.options.terminal.rows || size.rows;

    // 确定默认 shell
    let shell = process.env.SHELL || '/bin/bash';
    const args = [];

    if (os.platform() === 'win32') {
      shell = process.env.COMSPEC || 'cmd.exe';
    }

    // 创建伪终端进程
    this.ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.cwd(),
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
    });

    // 监听终端输出
    this.ptyProcess.onData((data) => {
      this.currentContent += data;
      this.recordFrame(data);
    });

    // 监听进程退出
    this.ptyProcess.onExit(({ exitCode }) => {
      this.stop();
    });

    return {
      name: sessionName,
      pid: this.ptyProcess.pid,
      cols,
      rows,
    };
  }

  /**
   * 记录一帧
   * @param {string} data 输出数据
   */
  recordFrame(data) {
    const frame = {
      timestamp: Date.now() - this.startTime,
      content: this.currentContent,
      data, // 原始输出数据
    };

    this.frames.push(frame);

    if (this.onFrame) {
      this.onFrame(frame);
    }
  }

  /**
   * 发送输入到终端
   * @param {string} data 输入数据
   */
  write(data) {
    if (this.ptyProcess && this.isRecording) {
      this.ptyProcess.write(data);
    }
  }

  /**
   * 调整终端大小
   * @param {number} cols 列数
   * @param {number} rows 行数
   */
  resize(cols, rows) {
    if (this.ptyProcess && this.isRecording) {
      this.ptyProcess.resize(cols, rows);
    }
  }

  /**
   * 停止录制并保存
   * @returns {Object} 录制数据
   */
  async stop() {
    if (!this.isRecording) {
      return null;
    }

    this.isRecording = false;

    // 关闭 PTY 进程
    if (this.ptyProcess) {
      try {
        this.ptyProcess.kill();
      } catch (e) {
        // 忽略已关闭的进程错误
      }
      this.ptyProcess = null;
    }

    // 构建录制数据
    const recording = {
      name: this.sessionName,
      version: '1.0',
      createdAt: new Date().toISOString(),
      cols: this.options.terminal.cols || 80,
      rows: this.options.terminal.rows || 24,
      frames: this.frames,
      config: {
        fontSize: this.options.terminal.fontSize,
        fontFamily: this.options.terminal.fontFamily,
        colors: this.options.colors,
      },
    };

    // 保存到文件
    const filePath = getRecordingPath(this.sessionName);
    saveRecording(filePath, recording);

    if (this.onStop) {
      this.onStop(recording);
    }

    return recording;
  }

  /**
   * 获取当前帧数
   * @returns {number}
   */
  getFrameCount() {
    return this.frames.length;
  }

  /**
   * 获取录制时长 (毫秒)
   * @returns {number}
   */
  getDuration() {
    if (this.frames.length === 0) return 0;
    return this.frames[this.frames.length - 1].timestamp;
  }
}

/**
 * 交互式录制
 * 直接在当前终端进行录制
 * @param {string} sessionName 会话名称
 * @param {Object} options 选项
 */
async function recordInteractive(sessionName, options = {}) {
  return new Promise((resolve, reject) => {
    const recorder = new Recorder(options);

    // 设置帧回调
    recorder.onFrame = (frame) => {
      // 实时输出到终端
      process.stdout.write(frame.data);
    };

    // 设置停止回调
    recorder.onStop = (recording) => {
      // 恢复 stdin 模式
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();

      resolve(recording);
    };

    // 监听用户输入
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.on('data', (data) => {
      // Ctrl+D 或 Ctrl+C 结束录制
      if (data[0] === 4 || data[0] === 3) {
        recorder.stop();
        return;
      }
      recorder.write(data);
    });

    // 监听终端大小变化
    process.stdout.on('resize', () => {
      const size = getTerminalSize();
      recorder.resize(size.cols, size.rows);
    });

    // 开始录制
    recorder.start(sessionName).catch(reject);
  });
}

/**
 * 录制命令序列
 * 自动执行命令并录制
 * @param {string} sessionName 会话名称
 * @param {Array<string>} commands 命令列表
 * @param {Object} options 选项
 */
async function recordCommands(sessionName, commands, options = {}) {
  return new Promise((resolve, reject) => {
    const recorder = new Recorder(options);

    recorder.onStop = (recording) => {
      resolve(recording);
    };

    // 开始录制
    recorder.start(sessionName).then(() => {
      // 逐个执行命令
      let commandIndex = 0;
      const executeNext = async () => {
        if (commandIndex >= commands.length) {
          // 所有命令执行完毕，等待一段时间后停止
          await delay(options.waitAfter || 1000);
          recorder.stop();
          return;
        }

        const command = commands[commandIndex];
        recorder.write(command + '\r');
        commandIndex++;

        // 等待命令执行
        await delay(options.delayBetween || 500);
        executeNext();
      };

      // 开始执行命令
      setTimeout(executeNext, options.initialDelay || 500);
    }).catch(reject);
  });
}

/**
 * 检查 node-pty 是否可用
 * @returns {boolean}
 */
function isPtyAvailable() {
  try {
    require.resolve('node-pty');
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  Recorder,
  recordInteractive,
  recordCommands,
  isPtyAvailable,
};
