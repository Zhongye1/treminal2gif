/**
 * treminal2gif - 终端录制转 GIF 工具
 * 主入口模块
 */

const { Recorder, recordInteractive, recordCommands, isPtyAvailable } = require('./recorder');
const { Editor, quickEdit, showInfo } = require('./editor');
const { Renderer, renderGif, renderFramePreview, isCanvasAvailable } = require('./renderer');
const { getConfig, getTheme, themes, defaultConfig } = require('./config');
const utils = require('./utils');

module.exports = {
  // 录制模块
  Recorder,
  recordInteractive,
  recordCommands,
  isPtyAvailable,

  // 编辑模块
  Editor,
  quickEdit,
  showInfo,

  // 渲染模块
  Renderer,
  renderGif,
  renderFramePreview,
  isCanvasAvailable,

  // 配置
  getConfig,
  getTheme,
  themes,
  defaultConfig,

  // 工具函数
  utils,
};
