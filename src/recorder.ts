/**
 * 终端录制模块
 * 使用 node-pty 捕获终端会话
 */

import * as pty from 'node-pty';
import * as path from 'path';
import * as os from 'os';
import { RecordingData, Frame, Config } from './types';
import { getConfig, getRecordingPath } from './config';
import { saveRecording, getTerminalSize, delay } from './utils';

/**
 * 录制器类
 */
class Recorder {
  private options: Config;
  private frames: Frame[];
  private startTime: number;
  private ptyProcess: pty.IPty | null;
  private currentContent: string;
  private sessionName: string | null;
  private _isRecording: boolean;
  public onFrame: ((frame: Frame) => void) | null;
  public onStop: ((recording: RecordingData) => void) | null;

  constructor(options: Partial<Config> = {}) {
    this.options = getConfig(options);
    this.frames = [];
    this.startTime = 0;
    this.ptyProcess = null;
    this.currentContent = '';
    this.sessionName = null;
    this._isRecording = false;
    this.onFrame = null;
    this.onStop = null;
  }

  /**
   * 开始录制
   */
  async start(sessionName: string): Promise<{ name: string; pid: number; cols: number; rows: number }> {
    if (this._isRecording) {
      throw new Error('已经在录制中');
    }

    this.sessionName = sessionName;
    this.frames = [];
    this.currentContent = '';
    this.startTime = Date.now();
    this._isRecording = true;

    // 获取终端尺寸
    const size = getTerminalSize();
    const cols = this.options.terminal.cols || size.cols;
    const rows = this.options.terminal.rows || size.rows;

    // 确定默认 shell
    let shell: string = process.env.SHELL || '/bin/bash';
    const args: string[] = [];

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
      } as { [key: string]: string },
    });

    // 监听终端输出
    this.ptyProcess.onData((data: string) => {
      this.currentContent += data;
      this.recordFrame(data);
    });

    // 监听进程退出
    this.ptyProcess.onExit(() => {
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
   */
  private recordFrame(data: string): void {
    const frame: Frame = {
      timestamp: Date.now() - this.startTime,
      content: this.currentContent,
      data,
    };

    this.frames.push(frame);

    if (this.onFrame) {
      this.onFrame(frame);
    }
  }

  /**
   * 发送输入到终端
   */
  write(data: string | Buffer): void {
    if (this.ptyProcess && this._isRecording) {
      this.ptyProcess.write(data.toString());
    }
  }

  /**
   * 调整终端大小
   */
  resize(cols: number, rows: number): void {
    if (this.ptyProcess && this._isRecording) {
      this.ptyProcess.resize(cols, rows);
    }
  }

  /**
   * 停止录制并保存
   */
  async stop(): Promise<RecordingData | null> {
    if (!this._isRecording) {
      return null;
    }

    this._isRecording = false;

    // 关闭 PTY 进程
    if (this.ptyProcess) {
      try {
        this.ptyProcess.kill();
      } catch {
        // 忽略已关闭的进程错误
      }
      this.ptyProcess = null;
    }

    // 构建录制数据
    const recording: RecordingData = {
      name: this.sessionName || 'unnamed',
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
    const filePath = getRecordingPath(this.sessionName || 'unnamed');
    saveRecording(filePath, recording);

    if (this.onStop) {
      this.onStop(recording);
    }

    return recording;
  }

  /**
   * 获取当前帧数
   */
  getFrameCount(): number {
    return this.frames.length;
  }

  /**
   * 获取录制时长 (毫秒)
   */
  getDuration(): number {
    if (this.frames.length === 0) return 0;
    return this.frames[this.frames.length - 1].timestamp;
  }

  /**
   * 是否正在录制
   */
  isRecording(): boolean {
    return this._isRecording;
  }
}

/**
 * 交互式录制
 */
async function recordInteractive(sessionName: string, options: Partial<Config> = {}): Promise<RecordingData> {
  return new Promise((resolve, reject) => {
    const recorder = new Recorder(options);

    // 设置帧回调
    recorder.onFrame = (frame: Frame) => {
      // 实时输出到终端
      if (frame.data) {
        process.stdout.write(frame.data);
      }
    };

    // 设置停止回调
    recorder.onStop = (recording: RecordingData) => {
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
    process.stdin.on('data', (data: Buffer) => {
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
 */
async function recordCommands(
  sessionName: string,
  commands: string[],
  options: Partial<Config> & {
    waitAfter?: number;
    delayBetween?: number;
    initialDelay?: number;
  } = {}
): Promise<RecordingData> {
  return new Promise((resolve, reject) => {
    const recorder = new Recorder(options);

    recorder.onStop = (recording: RecordingData) => {
      resolve(recording);
    };

    // 开始录制
    recorder.start(sessionName).then(() => {
      // 逐个执行命令
      let commandIndex = 0;
      const executeNext = async (): Promise<void> => {
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
        await executeNext();
      };

      // 开始执行命令
      setTimeout(() => executeNext(), options.initialDelay || 500);
    }).catch(reject);
  });
}

/**
 * 检查 node-pty 是否可用
 */
function isPtyAvailable(): boolean {
  try {
    require.resolve('node-pty');
    return true;
  } catch {
    return false;
  }
}

export {
  Recorder,
  recordInteractive,
  recordCommands,
  isPtyAvailable,
};
