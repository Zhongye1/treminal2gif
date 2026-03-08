/**
 * 虚拟终端模拟器
 * 解析 ANSI 转义序列，维护屏幕缓冲区状态
 */

import { Cell, CellStyle, CursorPosition, TerminalState } from './types';

/**
 * 默认单元格样式
 */
const DEFAULT_STYLE: CellStyle = {
  fg: -1,
  bg: -1,
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  blink: false,
  inverse: false,
  hidden: false,
  strikethrough: false,
};

/**
 * 创建空单元格
 */
function createEmptyCell(): Cell {
  return { char: ' ', style: { ...DEFAULT_STYLE } };
}

/**
 * 虚拟终端类
 */
export class VirtualTerminal {
  private state: TerminalState;
  private parseBuffer: string = '';

  constructor(cols: number = 80, rows: number = 24) {
    this.state = this.createInitialState(cols, rows);
  }

  /**
   * 创建初始状态
   */
  private createInitialState(cols: number, rows: number): TerminalState {
    const buffer: Cell[][] = [];
    for (let y = 0; y < rows; y++) {
      buffer.push(this.createEmptyRow(cols));
    }

    return {
      cols,
      rows,
      buffer,
      cursor: { x: 0, y: 0 },
      savedCursor: null,
      style: { ...DEFAULT_STYLE },
      scrollTop: 0,
      scrollBottom: rows - 1,
    };
  }

  /**
   * 创建空行
   */
  private createEmptyRow(cols: number): Cell[] {
    const row: Cell[] = [];
    for (let x = 0; x < cols; x++) {
      row.push(createEmptyCell());
    }
    return row;
  }

  /**
   * 获取终端尺寸
   */
  get size(): { cols: number; rows: number } {
    return { cols: this.state.cols, rows: this.state.rows };
  }

  /**
   * 获取光标位置
   */
  get cursor(): CursorPosition {
    return { ...this.state.cursor };
  }

  /**
   * 调整终端尺寸
   */
  resize(cols: number, rows: number): void {
    const oldRows = this.state.rows;
    const oldCols = this.state.cols;

    // 调整行数
    if (rows > oldRows) {
      for (let y = oldRows; y < rows; y++) {
        this.state.buffer.push(this.createEmptyRow(cols));
      }
    } else if (rows < oldRows) {
      this.state.buffer = this.state.buffer.slice(0, rows);
    }

    // 调整列数
    for (let y = 0; y < rows; y++) {
      const row = this.state.buffer[y];
      if (row) {
        if (cols > oldCols) {
          for (let x = oldCols; x < cols; x++) {
            row.push(createEmptyCell());
          }
        } else if (cols < oldCols) {
          row.length = cols;
        }
      }
    }

    this.state.cols = cols;
    this.state.rows = rows;
    this.state.scrollBottom = rows - 1;

    // 确保光标在有效范围内
    this.state.cursor.x = Math.min(this.state.cursor.x, cols - 1);
    this.state.cursor.y = Math.min(this.state.cursor.y, rows - 1);
  }

  /**
   * 输入数据到终端
   */
  feed(data: string): void {
    this.parseBuffer += data;
    this.parse();
  }

  /**
   * 解析输入缓冲区
   */
  private parse(): void {
    while (this.parseBuffer.length > 0) {
      // 检查是否有完整的转义序列
      const escIndex = this.parseBuffer.indexOf('\x1b');

      if (escIndex === -1) {
        // 没有转义序列，全部作为普通文本处理
        this.writeText(this.parseBuffer);
        this.parseBuffer = '';
        break;
      }

      if (escIndex > 0) {
        // 先处理转义序列前的普通文本
        this.writeText(this.parseBuffer.slice(0, escIndex));
        this.parseBuffer = this.parseBuffer.slice(escIndex);
      }

      // 尝试解析转义序列
      const parsed = this.parseEscapeSequence();
      if (!parsed) {
        // 序列不完整，等待更多数据
        break;
      }
    }
  }

  /**
   * 解析转义序列
   * @returns 是否成功解析
   */
  private parseEscapeSequence(): boolean {
    if (this.parseBuffer.length < 2) {
      return false; // 需要更多数据
    }

    const seq = this.parseBuffer;

    // CSI 序列: \x1b[...
    if (seq[1] === '[') {
      return this.parseCSI();
    }

    // OSC 序列: \x1b]...
    if (seq[1] === ']') {
      return this.parseOSC();
    }

    // 其他转义序列
    switch (seq[1]) {
      case '7': // 保存光标
        this.state.savedCursor = { ...this.state.cursor };
        this.parseBuffer = seq.slice(2);
        return true;
      case '8': // 恢复光标
        if (this.state.savedCursor) {
          this.state.cursor = { ...this.state.savedCursor };
        }
        this.parseBuffer = seq.slice(2);
        return true;
      case 'M': // 反向换行
        this.reverseIndex();
        this.parseBuffer = seq.slice(2);
        return true;
      case 'D': // 正向换行
        this.lineFeed();
        this.parseBuffer = seq.slice(2);
        return true;
      case 'E': // 下一行
        this.state.cursor.x = 0;
        this.lineFeed();
        this.parseBuffer = seq.slice(2);
        return true;
      case 'c': // 重置
        this.reset();
        this.parseBuffer = seq.slice(2);
        return true;
      default:
        // 未知序列，跳过
        this.parseBuffer = seq.slice(2);
        return true;
    }
  }

  /**
   * 解析 CSI 序列
   */
  private parseCSI(): boolean {
    const seq = this.parseBuffer;

    // 查找序列结束符 (0x40-0x7E)
    let end = 2;
    while (end < seq.length) {
      const c = seq.charCodeAt(end);
      if (c >= 0x40 && c <= 0x7e) {
        break;
      }
      end++;
    }

    if (end >= seq.length) {
      return false; // 需要更多数据
    }

    const params = seq.slice(2, end);
    const command = seq[end];
    this.parseBuffer = seq.slice(end + 1);

    if (command) {
      this.executeCSI(params, command);
    }
    return true;
  }

  /**
   * 执行 CSI 命令
   */
  private executeCSI(params: string, command: string): void {
    const args = this.parseCSIParams(params);

    switch (command) {
      case 'A': // 光标上移
        this.state.cursor.y = Math.max(0, this.state.cursor.y - (args[0] || 1));
        break;
      case 'B': // 光标下移
        this.state.cursor.y = Math.min(this.state.rows - 1, this.state.cursor.y + (args[0] || 1));
        break;
      case 'C': // 光标右移
        this.state.cursor.x = Math.min(this.state.cols - 1, this.state.cursor.x + (args[0] || 1));
        break;
      case 'D': // 光标左移
        this.state.cursor.x = Math.max(0, this.state.cursor.x - (args[0] || 1));
        break;
      case 'E': // 光标下移到行首
        this.state.cursor.x = 0;
        this.state.cursor.y = Math.min(this.state.rows - 1, this.state.cursor.y + (args[0] || 1));
        break;
      case 'F': // 光标上移到行首
        this.state.cursor.x = 0;
        this.state.cursor.y = Math.max(0, this.state.cursor.y - (args[0] || 1));
        break;
      case 'G': // 光标移动到指定列
        this.state.cursor.x = Math.min(this.state.cols - 1, Math.max(0, (args[0] || 1) - 1));
        break;
      case 'H': // 光标定位
      case 'f':
        this.state.cursor.y = Math.min(this.state.rows - 1, Math.max(0, (args[0] || 1) - 1));
        this.state.cursor.x = Math.min(this.state.cols - 1, Math.max(0, (args[1] || 1) - 1));
        break;
      case 'J': // 清屏
        this.clearScreen(args[0] || 0);
        break;
      case 'K': // 清行
        this.clearLine(args[0] || 0);
        break;
      case 'L': // 插入行
        this.insertLines(args[0] || 1);
        break;
      case 'M': // 删除行
        this.deleteLines(args[0] || 1);
        break;
      case 'P': // 删除字符
        this.deleteChars(args[0] || 1);
        break;
      case '@': // 插入字符
        this.insertChars(args[0] || 1);
        break;
      case 'X': // 删除字符（填充空格）
        this.eraseChars(args[0] || 1);
        break;
      case 'm': // 设置样式
        this.setSGR(args);
        break;
      case 'r': // 设置滚动区域
        this.state.scrollTop = Math.max(0, (args[0] || 1) - 1);
        this.state.scrollBottom = Math.min(this.state.rows - 1, (args[1] || this.state.rows) - 1);
        break;
      case 's': // 保存光标
        this.state.savedCursor = { ...this.state.cursor };
        break;
      case 'u': // 恢复光标
        if (this.state.savedCursor) {
          this.state.cursor = { ...this.state.savedCursor };
        }
        break;
      case 'd': // 光标移动到指定行
        this.state.cursor.y = Math.min(this.state.rows - 1, Math.max(0, (args[0] || 1) - 1));
        break;
      case 'h': // 设置模式
      case 'l': // 重置模式
        // 忽略模式设置
        break;
      default:
        // 忽略未知命令
        break;
    }
  }

  /**
   * 解析 CSI 参数
   */
  private parseCSIParams(params: string): number[] {
    if (!params) return [];

    // 移除前缀如 '?'
    const cleanParams = params.replace(/^[?;]/, '');

    return cleanParams.split(';').map(p => {
      const n = parseInt(p, 10);
      return isNaN(n) ? 0 : n;
    });
  }

  /**
   * 解析 OSC 序列
   */
  private parseOSC(): boolean {
    const seq = this.parseBuffer;

    // 查找结束符 (BEL 或 ST)
    let end = 2;
    let foundEnd = false;

    while (end < seq.length) {
      if (seq[end] === '\x07') {
        foundEnd = true;
        break;
      }
      // ST: \x1b\
      if (seq[end] === '\x1b' && end + 1 < seq.length && seq[end + 1] === '\\') {
        end++; // 包含 \
        foundEnd = true;
        break;
      }
      end++;
    }

    if (!foundEnd) {
      return false; // 需要更多数据
    }

    // OSC 序列主要用于设置标题等，我们忽略它们
    this.parseBuffer = seq.slice(end + 1);
    return true;
  }

  /**
   * 写入普通文本
   */
  private writeText(text: string): void {
    for (const char of text) {
      this.writeChar(char);
    }
  }

  /**
   * 写入单个字符
   */
  private writeChar(char: string): void {
    switch (char) {
      case '\r': // 回车
        this.state.cursor.x = 0;
        break;
      case '\n': // 换行
        this.lineFeed();
        break;
      case '\t': // 制表符
        this.tab();
        break;
      case '\b': // 退格
        if (this.state.cursor.x > 0) {
          this.state.cursor.x--;
        }
        break;
      case '\x07': // 响铃，忽略
        break;
      default:
        // 普通字符
        if (char >= ' ') {
          this.putChar(char);
        }
        break;
    }
  }

  /**
   * 在当前光标位置放置字符
   */
  private putChar(char: string): void {
    const { x, y } = this.state.cursor;
    const row = this.state.buffer[y];

    if (row && x < this.state.cols) {
      row[x] = {
        char,
        style: { ...this.state.style },
      };

      // 移动光标
      this.state.cursor.x++;
      if (this.state.cursor.x >= this.state.cols) {
        this.state.cursor.x = 0;
        this.lineFeed();
      }
    }
  }

  /**
   * 换行
   */
  private lineFeed(): void {
    const { y } = this.state.cursor;

    if (y === this.state.scrollBottom) {
      // 滚动
      this.scrollUp();
    } else if (y < this.state.rows - 1) {
      this.state.cursor.y++;
    }
  }

  /**
   * 反向换行
   */
  private reverseIndex(): void {
    const { y } = this.state.cursor;

    if (y === this.state.scrollTop) {
      this.scrollDown();
    } else if (y > 0) {
      this.state.cursor.y--;
    }
  }

  /**
   * 向上滚动
   */
  private scrollUp(): void {
    const { scrollTop, scrollBottom, buffer } = this.state;

    // 删除顶部行
    buffer.splice(scrollTop, 1);
    // 在底部插入空行
    buffer.splice(scrollBottom, 0, this.createEmptyRow(this.state.cols));
  }

  /**
   * 向下滚动
   */
  private scrollDown(): void {
    const { scrollTop, scrollBottom, buffer } = this.state;

    // 删除底部行
    buffer.splice(scrollBottom, 1);
    // 在顶部插入空行
    buffer.splice(scrollTop, 0, this.createEmptyRow(this.state.cols));
  }

  /**
   * 制表符
   */
  private tab(): void {
    const nextStop = Math.floor(this.state.cursor.x / 8 + 1) * 8;
    this.state.cursor.x = Math.min(nextStop, this.state.cols - 1);
  }

  /**
   * 清屏
   */
  private clearScreen(mode: number): void {
    switch (mode) {
      case 0: // 从光标到末尾
        this.clearFromCursorToEnd();
        break;
      case 1: // 从开头到光标
        this.clearFromStartToCursor();
        break;
      case 2: // 整个屏幕
      case 3: // 整个屏幕和回滚缓冲区
        this.clearAll();
        break;
    }
  }

  /**
   * 从光标清除到末尾
   */
  private clearFromCursorToEnd(): void {
    const { x, y } = this.state.cursor;
    const { buffer, cols, rows } = this.state;

    // 清除当前行剩余部分
    const currentRow = buffer[y];
    if (currentRow) {
      for (let i = x; i < cols; i++) {
        currentRow[i] = createEmptyCell();
      }
    }

    // 清除后续行
    for (let j = y + 1; j < rows; j++) {
      buffer[j] = this.createEmptyRow(cols);
    }
  }

  /**
   * 从开头清除到光标
   */
  private clearFromStartToCursor(): void {
    const { x, y } = this.state.cursor;
    const { buffer, cols } = this.state;

    // 清除之前行
    for (let j = 0; j < y; j++) {
      buffer[j] = this.createEmptyRow(cols);
    }

    // 清除当前行到光标
    const currentRow = buffer[y];
    if (currentRow) {
      for (let i = 0; i <= x; i++) {
        currentRow[i] = createEmptyCell();
      }
    }
  }

  /**
   * 清除所有
   */
  private clearAll(): void {
    const { buffer, cols, rows } = this.state;
    for (let j = 0; j < rows; j++) {
      buffer[j] = this.createEmptyRow(cols);
    }
    this.state.cursor = { x: 0, y: 0 };
  }

  /**
   * 清行
   */
  private clearLine(mode: number): void {
    const { x, y } = this.state.cursor;
    const { buffer, cols } = this.state;
    const row = buffer[y];

    if (!row) return;

    switch (mode) {
      case 0: // 从光标到行尾
        for (let i = x; i < cols; i++) {
          row[i] = createEmptyCell();
        }
        break;
      case 1: // 从行首到光标
        for (let i = 0; i <= x; i++) {
          row[i] = createEmptyCell();
        }
        break;
      case 2: // 整行
        buffer[y] = this.createEmptyRow(cols);
        break;
    }
  }

  /**
   * 插入行
   */
  private insertLines(count: number): void {
    const { buffer, cols, scrollBottom } = this.state;
    const y = this.state.cursor.y;

    for (let i = 0; i < count; i++) {
      if (y <= scrollBottom) {
        // 删除底部行
        buffer.splice(scrollBottom, 1);
        // 在当前位置插入空行
        buffer.splice(y, 0, this.createEmptyRow(cols));
      }
    }
  }

  /**
   * 删除行
   */
  private deleteLines(count: number): void {
    const { buffer, cols, scrollBottom } = this.state;
    const y = this.state.cursor.y;

    for (let i = 0; i < count; i++) {
      if (y <= scrollBottom) {
        // 删除当前行
        buffer.splice(y, 1);
        // 在滚动区域底部添加空行
        buffer.splice(scrollBottom, 0, this.createEmptyRow(cols));
      }
    }
  }

  /**
   * 删除字符
   */
  private deleteChars(count: number): void {
    const { buffer, cols } = this.state;
    const { x, y } = this.state.cursor;
    const row = buffer[y];
    if (!row) return;

    for (let i = x; i < cols; i++) {
      const srcIdx = i + count;
      const sourceCell = row[srcIdx];
      row[i] = srcIdx < cols && sourceCell ? { ...sourceCell } : createEmptyCell();
    }
  }

  /**
   * 插入字符
   */
  private insertChars(count: number): void {
    const { buffer, cols } = this.state;
    const { x, y } = this.state.cursor;
    const row = buffer[y];
    if (!row) return;

    for (let i = cols - 1; i >= x + count; i--) {
      const sourceCell = row[i - count];
      row[i] = sourceCell ? { ...sourceCell } : createEmptyCell();
    }
    for (let i = x; i < x + count && i < cols; i++) {
      row[i] = createEmptyCell();
    }
  }

  /**
   * 删除字符（填充空格）
   */
  private eraseChars(count: number): void {
    const { buffer, cols } = this.state;
    const { x, y } = this.state.cursor;
    const row = buffer[y];
    if (!row) return;

    for (let i = x; i < x + count && i < cols; i++) {
      row[i] = createEmptyCell();
    }
  }

  /**
   * 设置 SGR (Select Graphic Rendition)
   */
  private setSGR(args: number[]): void {
    if (args.length === 0) {
      args = [0];
    }

    let i = 0;
    while (i < args.length) {
      const code = args[i];

      switch (code) {
        case 0: // 重置
          this.state.style = { ...DEFAULT_STYLE };
          break;
        case 1:
          this.state.style.bold = true;
          break;
        case 2:
          this.state.style.dim = true;
          break;
        case 3:
          this.state.style.italic = true;
          break;
        case 4:
          this.state.style.underline = true;
          break;
        case 5:
        case 6:
          this.state.style.blink = true;
          break;
        case 7:
          this.state.style.inverse = true;
          break;
        case 8:
          this.state.style.hidden = true;
          break;
        case 9:
          this.state.style.strikethrough = true;
          break;
        case 22:
          this.state.style.bold = false;
          this.state.style.dim = false;
          break;
        case 23:
          this.state.style.italic = false;
          break;
        case 24:
          this.state.style.underline = false;
          break;
        case 25:
          this.state.style.blink = false;
          break;
        case 27:
          this.state.style.inverse = false;
          break;
        case 28:
          this.state.style.hidden = false;
          break;
        case 29:
          this.state.style.strikethrough = false;
          break;
        // 前景色 (30-37)
        case 30:
        case 31:
        case 32:
        case 33:
        case 34:
        case 35:
        case 36:
        case 37:
          this.state.style.fg = code - 30;
          break;
        // 前景色亮色 (90-97)
        case 90:
        case 91:
        case 92:
        case 93:
        case 94:
        case 95:
        case 96:
        case 97:
          this.state.style.fg = code - 90 + 8;
          break;
        // 背景色 (40-47)
        case 40:
        case 41:
        case 42:
        case 43:
        case 44:
        case 45:
        case 46:
        case 47:
          this.state.style.bg = code - 40;
          break;
        // 背景色亮色 (100-107)
        case 100:
        case 101:
        case 102:
        case 103:
        case 104:
        case 105:
        case 106:
        case 107:
          this.state.style.bg = code - 100 + 8;
          break;
        case 38: // 扩展前景色
          if (args[i + 1] === 5) {
            // 256色
            this.state.style.fg = args[i + 2] ?? -1;
            i += 2;
          } else if (args[i + 1] === 2) {
            // 真彩色，简化处理
            i += 4;
          }
          break;
        case 39: // 默认前景色
          this.state.style.fg = -1;
          break;
        case 48: // 扩展背景色
          if (args[i + 1] === 5) {
            this.state.style.bg = args[i + 2] ?? -1;
            i += 2;
          } else if (args[i + 1] === 2) {
            i += 4;
          }
          break;
        case 49: // 默认背景色
          this.state.style.bg = -1;
          break;
      }
      i++;
    }
  }

  /**
   * 重置终端
   */
  reset(): void {
    this.state = this.createInitialState(this.state.cols, this.state.rows);
  }

  /**
   * 获取屏幕快照（纯文本）
   */
  getSnapshot(): string {
    const lines: string[] = [];

    for (let y = 0; y < this.state.rows; y++) {
      const row = this.state.buffer[y];
      if (!row) continue;
      
      let line = '';
      for (let x = 0; x < this.state.cols; x++) {
        line += row[x]?.char || ' ';
      }
      // 移除尾部空格
      lines.push(line.trimEnd());
    }

    return lines.join('\n');
  }

  /**
   * 获取带样式的屏幕快照
   */
  getStyledSnapshot(): { text: string; cells: Cell[][] } {
    return {
      text: this.getSnapshot(),
      cells: this.state.buffer.map(row => row.map(cell => ({ ...cell }))),
    };
  }

  /**
   * 获取原始缓冲区
   */
  getBuffer(): Cell[][] {
    return this.state.buffer.map(row => row.map(cell => ({ ...cell })));
  }
}

export default VirtualTerminal;
