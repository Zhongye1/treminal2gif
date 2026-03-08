#!/usr/bin/env node

/**
 * treminal2gif CLI 入口（JavaScript 包装器）
 * 用于全局安装时直接运行
 */

// 注册 ts-node 编译器钩子
require('ts-node').register({
  compilerOptions: {
    module: 'commonjs',
    resolveJsonModule: true,
    esModuleInterop: true
  }
});

// 然后加载 TypeScript 入口
require('../bin/cli.ts');
