/**
 * 默认配置和主题设置
 */

import * as path from 'path';
import * as os from 'os';
import { Config, ColorScheme, Themes, ThemeName } from './types';

// 默认终端配置
const defaultConfig: Config = {
  // 终端设置
  terminal: {
    cols: 80,
    rows: 24,
    fontSize: 14,
    fontFamily: 'Monaco, Menlo, "Courier New", monospace',
    lineHeight: 1.4,
    cursorStyle: 'block',
    cursorBlink: true,
  },

  // 颜色方案 (基于 xterm 默认颜色)
  colors: {
    foreground: '#ffffff',
    background: '#000000',
    cursor: '#ffffff',
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
    maxIdleTime: 2000,
    frameRate: 30,
    quality: 10,
  },

  // 渲染设置
  rendering: {
    padding: 10,
    borderRadius: 8,
    shadowBlur: 20,
    shadowColor: 'rgba(0, 0, 0, 0.5)',
    windowTitle: 'Terminal',
    showWindowTitle: true,
    titleBarHeight: 28,
    titleBarColor: '#1e1e1e',
    windowFrameColor: '#1e1e1e',
  },

  // 存储路径
  storage: {
    recordingsDir: path.join(os.homedir(), '.treminal2gif', 'recordings'),
    configFile: path.join(os.homedir(), '.treminal2gif', 'config.json'),
  },
};

// 内置主题
const themes: Themes = {
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
function mergeConfig<T extends object>(
  base: Config,
  override?: {
    terminal?: { cols?: number; rows?: number; fontSize?: number };
  }
): T {
  const result = { ...base } as T;
  if (!override) return result;

  for (const key in override) {
    if (Object.prototype.hasOwnProperty.call(override, key)) {
      const overrideValue = override[key as keyof typeof override];
      const baseValue = base[key as keyof Config];

      if (overrideValue !== undefined) {
        if (
          overrideValue &&
          typeof overrideValue === 'object' &&
          !Array.isArray(overrideValue) &&
          baseValue &&
          typeof baseValue === 'object'
        ) {
          result[key as keyof T] = mergeConfig(
            baseValue as unknown as Config,
            overrideValue as Partial<object>
          ) as T[Extract<keyof T, string>];
        } else {
          result[key as keyof T] = overrideValue as T[Extract<keyof T, string>];
        }
      }
    }
  }
  return result;
}

/**
 * 获取配置
 */
function getConfig(userConfig?: {
  terminal?: { cols?: number; rows?: number; fontSize?: number };
}): Config {
  return mergeConfig(defaultConfig, userConfig);
}

/**
 * 获取主题颜色
 */
function getTheme(themeName: ThemeName): ColorScheme {
  return themes[themeName] || themes.default;
}

/**
 * 获取录制文件路径
 */
function getRecordingPath(sessionName: string): string {
  const recordingsDir = defaultConfig.storage.recordingsDir;
  return path.join(recordingsDir, `${sessionName}.json`);
}

/**
 * 获取 GIF 输出路径
 */
function getOutputPath(sessionName: string, outputDir?: string): string {
  return path.join(outputDir || '.', `${sessionName}.gif`);
}

export { defaultConfig, themes, mergeConfig, getConfig, getTheme, getRecordingPath, getOutputPath };
