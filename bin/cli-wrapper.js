#!/usr/bin/env node

/**
 * treminal2gif CLI 入口（JavaScript 包装器）
 * 用于全局安装时直接运行
 */

// 检测是否处于开发模式
const isDevMode = __dirname.includes('node_modules') === false;

if (isDevMode) {
  // 开发模式：使用 ts-node 直接运行 TypeScript
  try {
    require('ts-node').register({
      compilerOptions: {
        module: 'commonjs',
        resolveJsonModule: true,
        esModuleInterop: true,
      },
    });

    // 然后加载 TypeScript 入口
    require('./cli.ts');
  } catch (error) {
    console.error('ts-node is required for development mode.');
    console.error('Install it with: npm install -g ts-node');
    process.exit(1);
  }
} else {
  // 生产模式：直接运行编译后的 JavaScript
  try {
    require('../dist/bin/cli.js');
  } catch (error) {
    console.error('Compiled CLI not found. Please run `npm run build` first.');
    process.exit(1);
  }
}
