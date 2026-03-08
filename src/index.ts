/**
 * treminal2gif - 终端录制转 GIF 工具
 * 主入口模块
 */

// 类型导出
export * from './types';

// 录制模块
export { Recorder, recordInteractive, recordCommands, isPtyAvailable } from './recorder';

// 编辑模块
export { Editor, quickEdit, showInfo } from './editor';

// 渲染模块
export { Renderer, renderGif, renderFramePreview, isCanvasAvailable } from './renderer';

// 配置
export { getConfig, getTheme, themes, defaultConfig } from './config';

// 工具函数
export * from './utils';
