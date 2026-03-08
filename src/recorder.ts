/**
 * 终端录制模块
 * 使用 node-pty 捕获终端会话
 * V2 格式：记录原始事件流，更高效
 */

import * as pty from 'node-pty';
import * as os from 'os';
import {
  RecordingDataV2,
  OutputEvent,
  TerminalEvent,
  InputEvent,
  ResizeEvent,
  Config,
} from './types';
import { getConfig, getRecordingPath } from './config';
import { saveRecording, getTerminalSize, delay } from './utils';

/**
 * 录制器类 (V2)
 */
class Recorder {
  private options: Config;
  private events: TerminalEvent[]; // 支持多种事件类型
  private startTime: number;
  private ptyProcess: pty.IPty | null;
  private sessionName: string | null;
  private _isRecording: boolean;
  private cols: number;
  private rows: number;
  public onOutput: ((data: string, ts: number) => void) | null;
  public onStop: ((recording: RecordingDataV2) => void) | null;

  constructor(options?: { terminal?: { cols?: number; rows?: number; fontSize?: number } }) {
    this.options = getConfig(options);
    this.events = [];
    this.startTime = 0;
    this.ptyProcess = null;
    this.sessionName = null;
    this._isRecording = false;
    this.cols = 80;
    this.rows = 24;
    this.onOutput = null;
    this.onStop = null;
  }

  /**
   * 开始录制
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async start(
    sessionName: string
  ): Promise<{ name: string; pid: number; cols: number; rows: number }> {
    if (this._isRecording) {
      throw new Error('已经在录制中');
    }

    this.sessionName = sessionName;
    this.events = [];
    this.startTime = Date.now();
    this._isRecording = true;

    // 获取终端尺寸
    const size = getTerminalSize();
    this.cols = this.options.terminal.cols || size.cols;
    this.rows = this.options.terminal.rows || size.rows;

    // 确定默认 shell
    let shell: string = process.env.SHELL || '/bin/bash';
    const args: string[] = [];

    if (os.platform() === 'win32') {
      shell = process.env.COMSPEC || 'cmd.exe';
    }

    // 创建伪终端进程
    this.ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: this.cols,
      rows: this.rows,
      cwd: process.cwd(),
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      } as { [key: string]: string },
    });

    // 监听终端输出
    this.ptyProcess.onData((data: string) => {
      this.recordEvent(data);
    });

    // 监听进程退出
    this.ptyProcess.onExit(() => {
      this.stop();
    });

    return {
      name: sessionName,
      pid: this.ptyProcess.pid,
      cols: this.cols,
      rows: this.rows,
    };
  }

  /**
   * 记录输出事件
   */
  private recordEvent(data: string): void {
    const ts = Date.now() - this.startTime;

    const event: OutputEvent = {
      ts,
      type: 'output',
      data,
    };

    this.events.push(event);

    if (this.onOutput) {
      this.onOutput(data, ts);
    }
  }

  /**
   * 记录输入事件（可选）
   */
  private recordInput(data: string): void {
    const ts = Date.now() - this.startTime;

    const event: InputEvent = {
      ts,
      type: 'input',
      data,
    };

    this.events.push(event);
  }

  /**
   * 记录尺寸变化事件
   */
  private recordResize(cols: number, rows: number): void {
    const ts = Date.now() - this.startTime;

    const event: ResizeEvent = {
      ts,
      type: 'resize',
      data: [cols, rows],
    };

    this.events.push(event);
  }

  /**
   * 发送输入到终端（并记录输入事件）
   */
  write(data: string | Buffer): void {
    if (this.ptyProcess && this._isRecording) {
      const str = data.toString();
      this.ptyProcess.write(str);

      // 记录输入事件
      this.recordInput(str);
    }
  }

  /**
   * 调整终端大小
   */
  resize(cols: number, rows: number): void {
    if (this.ptyProcess && this._isRecording) {
      this.ptyProcess.resize(cols, rows);
      this.cols = cols;
      this.rows = rows;

      // 记录尺寸变化事件
      this.recordResize(cols, rows);
    }
  }

  /**
   * 停止录制并保存 (V2 格式)
   */
  async stop(): Promise<RecordingDataV2 | null> {
    if (!this._isRecording) {
      return Promise.resolve(null);
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

    const duration = this.events.length > 0 ? (this.events[this.events.length - 1]?.ts ?? 0) : 0;

    // 构建 V2 格式录制数据
    const recording: RecordingDataV2 = {
      version: 2,
      meta: {
        title: this.sessionName || 'unnamed',
        cols: this.cols,
        rows: this.rows,
        duration,
        createdAt: Date.now(),
      },
      config: {
        fontSize: this.options.terminal.fontSize,
        fontFamily: this.options.terminal.fontFamily,
        colors: this.options.colors,
      },
      events: this.events,
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
   * 获取事件数量
   */
  getEventCount(): number {
    return this.events.length;
  }

  /**
   * 获取录制时长 (毫秒)
   */
  getDuration(): number {
    if (this.events.length === 0) return 0;
    return this.events[this.events.length - 1]?.ts ?? 0;
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
async function recordInteractive(
  sessionName: string,
  options?: { terminal?: { cols?: number; rows?: number; fontSize?: number } }
): Promise<RecordingDataV2> {
  return new Promise((resolve, reject) => {
    const recorder = new Recorder(options);

    // 设置输出回调
    recorder.onOutput = (data: string) => {
      // 实时输出到终端
      process.stdout.write(data);
    };

    // 设置停止回调
    recorder.onStop = (recording: RecordingDataV2) => {
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
  options?: {
    terminal?: { cols?: number; rows?: number; fontSize?: number };
    waitAfter?: number;
    delayBetween?: number;
    initialDelay?: number;
  }
): Promise<RecordingDataV2> {
  return new Promise((resolve, reject) => {
    const recorder = new Recorder(options);

    recorder.onStop = (recording: RecordingDataV2) => {
      resolve(recording);
    };

    // 开始录制
    recorder
      .start(sessionName)
      .then(() => {
        // 逐个执行命令
        let commandIndex = 0;
        const executeNext = async (): Promise<void> => {
          if (commandIndex >= commands.length) {
            // 所有命令执行完毕，等待一段时间后停止
            await delay(options?.waitAfter || 1000);
            recorder.stop();
            return;
          }

          const command = commands[commandIndex];
          recorder.write(command + '\r');
          commandIndex++;

          // 等待命令执行
          await delay(options?.delayBetween || 500);
          await executeNext();
        };

        // 开始执行命令
        setTimeout(() => {
          executeNext().catch(reject);
        }, options?.initialDelay || 500);
      })
      .catch(reject);
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

export { Recorder, recordInteractive, recordCommands, isPtyAvailable };
