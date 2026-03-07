/**
 * 默认配置和主题设置
 */

const path = require('path');
const os = require('os');

// 默认终端配置
const defaultConfig = {
  // 终端设置
  terminal: {
    cols: 80,
    rows: 24,
    fontSize: 14,
    fontFamily: 'Monaco, Menlo, "Courier New", monospace',
    lineHeight: 1.4,
    cursorStyle: 'block', // 'block' | 'underline' | 'bar'
    cursorBlink: true,
  },

  // 颜色方案 (基于 xterm 默认颜色)
  colors: {
    // 前景色
    foreground: '#ffffff',
    // 背景色
    background: '#000000',
    // 光标色
    cursor: '#ffffff',
    // 16 种标准颜色
    black: '#2e3436',
    red: '#cc0000',
    green: '#4e9a06',
    yellow: '#c4a000',
    blue: '#3465a4',
    magenta: '#75507b',
    cyan: '#06989a',
    white: '#d3d7cf',
    brightBlack: '#555753',
    brightRed: '#ef2929',
    brightGreen: '#8ae234',
    brightYellow: '#fce94f',
    brightBlue: '#729fcf',
    brightMagenta: '#ad7fa8',
    brightCyan: '#34e2e2',
    brightWhite: '#eeeeec',
  },

  // 录制设置
  recording: {
    maxIdleTime: 2000, // 最大空闲时间 (ms)，超过此时间会跳过
    frameRate: 30, // 目标帧率
    quality: 10, // GIF 质量 (1-10)
  },

  // 渲染设置
  rendering: {
    padding: 10, // 终端窗口内边距
    borderRadius: 8, // 圆角半径
    shadowBlur: 20, // 阴影模糊
    shadowColor: 'rgba(0, 0, 0, 0.5)', // 阴影颜色
    windowTitle: 'Terminal', // 窗口标题
    showWindowTitle: true, // 是否显示窗口标题
    titleBarHeight: 28, // 标题栏高度
    titleBarColor: '#1e1e1e', // 标题栏背景色
    windowFrameColor: '#1e1e1e', // 窗口边框颜色
  },

  // 存储路径
  storage: {
    recordingsDir: path.join(os.homedir(), '.treminal2gif', 'recordings'),
    configFile: path.join(os.homedir(), '.treminal2gif', 'config.json'),
  },
};

// 内置主题
const themes = {
  default: defaultConfig.colors,
  dracula: {
    foreground: '#f8f8f2',
    background: '#282a36',
    cursor: '#f8f8f2',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff',
  },
  monokai: {
    foreground: '#f8f8f2',
    background: '#272822',
    cursor: '#f8f8f2',
    black: '#272822',
    red: '#f92672',
    green: '#a6e22e',
    yellow: '#f4bf75',
    blue: '#66d9ef',
    magenta: '#ae81ff',
    cyan: '#a1efe4',
    white: '#f8f8f2',
    brightBlack: '#75715e',
    brightRed: '#fd971f',
    brightGreen: '#a6e22e',
    brightYellow: '#e6db74',
    brightBlue: '#66d9ef',
    brightMagenta: '#ae81ff',
    brightCyan: '#a1efe4',
    brightWhite: '#f9f8f5',
  },
  solarizedDark: {
    foreground: '#839496',
    background: '#002b36',
    cursor: '#839496',
    black: '#073642',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#d33682',
    cyan: '#2aa198',
    white: '#eee8d5',
    brightBlack: '#002b36',
    brightRed: '#cb4b16',
    brightGreen: '#586e75',
    brightYellow: '#657b83',
    brightBlue: '#839496',
    brightMagenta: '#6c71c4',
    brightCyan: '#93a1a1',
    brightWhite: '#fdf6e3',
  },
  oneHalfDark: {
    foreground: '#dcdfe4',
    background: '#282c34',
    cursor: '#dcdfe4',
    black: '#282c34',
    red: '#e06c75',
    green: '#98c379',
    yellow: '#e5c07b',
    blue: '#61afef',
    magenta: '#c678dd',
    cyan: '#56b6c2',
    white: '#dcdfe4',
    brightBlack: '#5a6374',
    brightRed: '#e06c75',
    brightGreen: '#98c379',
    brightYellow: '#e5c07b',
    brightBlue: '#61afef',
    brightMagenta: '#c678dd',
    brightCyan: '#56b6c2',
    brightWhite: '#dcdfe4',
  },
};

/**
 * 深度合并配置
 */
function mergeConfig(base, override) {
  const result = { ...base };
  for (const key in override) {
    if (override[key] && typeof override[key] === 'object' && !Array.isArray(override[key])) {
      result[key] = mergeConfig(base[key] || {}, override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

/**
 * 获取配置
 */
function getConfig(userConfig = {}) {
  return mergeConfig(defaultConfig, userConfig);
}

/**
 * 获取主题颜色
 */
function getTheme(themeName) {
  return themes[themeName] || themes.default;
}

/**
 * 获取录制文件路径
 */
function getRecordingPath(sessionName) {
  const recordingsDir = defaultConfig.storage.recordingsDir;
  return path.join(recordingsDir, `${sessionName}.json`);
}

/**
 * 获取 GIF 输出路径
 */
function getOutputPath(sessionName, outputDir) {
  return path.join(outputDir || '.', `${sessionName}.gif`);
}

module.exports = {
  defaultConfig,
  themes,
  mergeConfig,
  getConfig,
  getTheme,
  getRecordingPath,
  getOutputPath,
};
