#!/usr/bin/env node

/**
 * terminal2gif CLI 入口
 * 终端录制转 GIF 工具
 */

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';

// 延迟加载 chalk 模块
let chalk: any;

async function initializeChalk() {
  const chalkModule = await import('chalk');
  chalk = chalkModule.default;
}

import { defaultConfig, getRecordingPath, themes } from '../src/config';
import { printWelcome, printRecordingInfo, recordingExists, loadRecording } from '../src';

// 版本信息
import packageJson from '../package.json';

// 设置程序信息

// 延迟加载 recorder 模块
import { isPtyAvailable, recordCommands, recordInteractive } from '../src/recorder';

const program = new Command();
program
  .name('terminal2gif')
  .description('跨平台终端录制工具，将终端会话转换为动画 GIF')
  .version(packageJson.version);

// record 命令
program
  .command('record <session-name>')
  .description('录制终端会话')
  .option('-c, --cols <number>', '终端列数', parseInt)
  .option('-r, --rows <number>', '终端行数', parseInt)
  .option('--font-size <number>', '字体大小', parseInt)
  .option('--theme <name>', '主题名称', 'default')
  .option('--exec <command>', '执行命令并录制')
  .action(
    async (
      sessionName: string,
      options: {
        cols?: number;
        rows?: number;
        fontSize?: number;
        theme?: string;
        exec?: string;
      }
    ) => {
      try {
        // 初始化 chalk
        await initializeChalk();

        // 检查 PTY 是否可用
        if (!isPtyAvailable()) {
          console.error(chalk.red('错误: node-pty 未正确安装，无法进行录制'));
          console.log(chalk.yellow('请尝试运行: npm rebuild node-pty'));
          process.exit(1);
        }

        // 检查会话名称
        const recordingPath = getRecordingPath(sessionName);
        if (recordingExists(recordingPath)) {
          console.error(chalk.red(`错误: 录制 "${sessionName}" 已存在`));
          console.log(chalk.yellow('使用 "treminal2gif edit ' + sessionName + '" 编辑现有录制'));
          process.exit(1);
        }

        console.log(chalk.cyan(`\n开始录制: ${sessionName}`));
        console.log(chalk.gray(`保存位置: ${recordingPath}`));
        console.log(chalk.yellow('\n按 Ctrl+D 或 Ctrl+C 结束录制\n'));

        // 准备选项
        const recordOptions: { terminal?: { cols?: number; rows?: number; fontSize?: number } } =
          {};
        if (options.cols)
          recordOptions.terminal = { ...recordOptions.terminal, cols: options.cols };
        if (options.rows)
          recordOptions.terminal = { ...recordOptions.terminal, rows: options.rows };
        if (options.fontSize)
          recordOptions.terminal = { ...recordOptions.terminal, fontSize: options.fontSize };

        // 执行命令录制或交互录制
        let recording;
        if (options.exec) {
          const commands = options.exec.includes('&&')
            ? options.exec.split('&&').map((c: string) => c.trim())
            : [options.exec];
          recording = await recordCommands(sessionName, commands, recordOptions);
        } else {
          recording = await recordInteractive(sessionName, recordOptions);
        }

        console.log(chalk.green('\n录制完成!'));
        printRecordingInfo(recording);

        // 自动渲染 GIF
        console.log(chalk.cyan('\n开始渲染 GIF...'));
        const outputPath = path.join('.', `${sessionName}.gif`);

        // 延迟加载 renderer 模块
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Renderer = require('../src/renderer').Renderer;
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const isCanvasAvailable = require('../src/renderer').isCanvasAvailable;

        // 检查 canvas 是否可用
        if (!isCanvasAvailable()) {
          console.error(chalk.red('错误: skia-canvas 模块未正确安装，无法进行渲染'));
          console.log(chalk.yellow('\n请运行: npm install skia-canvas'));
          console.log(chalk.gray('skia-canvas 是 node-canvas 的现代替代品，无需额外的系统依赖。'));
          console.log(chalk.gray(`\n使用 "terminal2gif render ${sessionName}" 单独渲染`));
          process.exit(1);
        }

        const renderer = new Renderer({});
        renderer.load(recordingPath);

        // 渲染进度
        let lastProgress = 0;

        const result = await renderer.render(outputPath, {
          onProgress: (current: number, total: number) => {
            const progress = Math.floor((current / total) * 100);
            if (progress > lastProgress) {
              process.stdout.write(`\r渲染进度: ${progress}% (${current}/${total} 帧)`);
              lastProgress = progress;
            }
          },
        });

        console.log(chalk.green('\n\n渲染完成!'));
        console.log(chalk.gray(`输出文件: ${result}`));

        // 显示文件大小
        const stats = fs.statSync(result);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        console.log(chalk.gray(`文件大小: ${sizeMB} MB`));
      } catch (error) {
        console.error(chalk.red('录制失败:'), (error as Error).message);
        process.exit(1);
      }
    }
  );

// edit 命令
program
  .command('edit <session-name>')
  .description('编辑录制内容')
  .option('-d, --delay <ms>', '设置所有帧延迟 (毫秒)', parseInt)
  .option('-t, --theme <name>', '设置主题')
  .option('--font <family>', '设置字体')
  .option('--font-size <size>', '设置字号', parseInt)
  .option('-o, --optimize', '优化帧序列')
  .option('--max-idle <ms>', '最大空闲时间 (毫秒)', parseInt)
  .option('--keep <range>', '保留帧范围 (如: 0-100)')
  .option('--delete <range>', '删除帧范围 (如: 50-60)')
  .option('-i, --info', '显示录制信息')
  .option('-l, --list [count]', '列出帧', parseInt)
  .action(
    async (
      sessionName: string,
      options: {
        delay?: number;
        theme?: string;
        font?: string;
        fontSize?: number;
        optimize?: boolean;
        maxIdle?: number;
        keep?: string;
        delete?: string;
        info?: boolean;
        list?: number | boolean;
      }
    ) => {
      try {
        // 初始化 chalk
        await initializeChalk();

        // 延迟加载 editor 模块
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Editor = require('../src/editor').Editor;

        const recordingPath = getRecordingPath(sessionName);

        if (!recordingExists(recordingPath)) {
          console.error(chalk.red(`错误: 录制 "${sessionName}" 不存在`));
          console.log(chalk.yellow('使用 "treminal2gif record ' + sessionName + '" 创建录制'));
          process.exit(1);
        }

        const editor = new Editor(recordingPath);
        editor.load();

        // 显示信息
        if (options.info) {
          const info = editor.getInfo();
          console.log(chalk.cyan('\n录制信息:'));
          console.log(`  名称: ${info.name}`);
          console.log(`  创建时间: ${new Date(info.createdAt).toLocaleString()}`);
          console.log(`  帧数: ${info.frameCount}`);
          console.log(`  时长: ${info.durationFormatted}`);
          console.log(`  尺寸: ${info.cols} x ${info.rows}`);
          return;
        }

        // 列出帧
        if (options.list !== undefined) {
          const count = typeof options.list === 'number' ? options.list : 20;
          const frames = editor.listFrames(0, count);
          console.log(chalk.cyan('\n帧列表:'));
          frames.forEach((f: { index: number; delay: number; contentLength: number }) => {
            console.log(`  [${f.index}] 延迟: ${f.delay}ms | 内容长度: ${f.contentLength}`);
          });
          return;
        }

        // 应用编辑
        let modified = false;

        if (options.delay !== undefined) {
          editor.setAllDelays(options.delay);
          modified = true;
          console.log(chalk.green(`已设置所有帧延迟: ${options.delay}ms`));
        }

        if (options.theme) {
          // 检查主题是否有效
          if (!Object.keys(themes).includes(options.theme)) {
            console.error(chalk.red(`未知主题：${options.theme}`));
            console.log(chalk.yellow('可用主题：' + Object.keys(themes).join(', ')));
            process.exit(1);
          }
          editor.setTheme(options.theme);
          modified = true;
          console.log(chalk.green(`已设置主题：${options.theme}`));
        }

        if (options.font) {
          editor.setFont(options.font, options.fontSize);
          modified = true;
          console.log(chalk.green(`已设置字体: ${options.font}`));
        }

        if (options.fontSize) {
          editor.setFont(null, options.fontSize);
          modified = true;
          console.log(chalk.green(`已设置字号: ${options.fontSize}px`));
        }

        if (options.optimize) {
          editor.optimize(options.maxIdle);
          modified = true;
          console.log(chalk.green('已优化帧序列'));
        }

        if (options.keep) {
          const [start, end] = options.keep.split('-').map(Number);
          editor.keepFrameRange(start, end);
          modified = true;
          console.log(chalk.green(`已保留帧范围: ${start}-${end}`));
        }

        if (options.delete) {
          const [start, end] = options.delete.split('-').map(Number);
          editor.deleteFrameRange(start, end);
          modified = true;
          console.log(chalk.green(`已删除帧范围: ${start}-${end}`));
        }

        if (modified) {
          editor.save();
          console.log(chalk.green('\n修改已保存'));
          const info = editor.getInfo();
          console.log(`当前帧数: ${info.frameCount}`);
        } else {
          console.log(chalk.yellow('没有指定任何编辑操作'));
        }
      } catch (error) {
        console.error(chalk.red('编辑失败:'), (error as Error).message);
        process.exit(1);
      }
    }
  );

// render 命令
program
  .command('render <session-name>')
  .description('将录制渲染为 GIF')
  .option('-o, --output <path>', '输出文件路径')
  .option('-f, --fps <number>', '帧率', parseInt)
  .option('-q, --quality <number>', 'GIF 质量 (1-20)', parseInt)
  .option('--preview', '预览模式 (只渲染关键帧)')
  .option('--estimate', '估算文件大小')
  .action(
    async (
      sessionName: string,
      options: {
        output?: string;
        fps?: number;
        quality?: number;
        preview?: boolean;
        estimate?: boolean;
      }
    ) => {
      try {
        // 初始化 chalk
        await initializeChalk();

        // 延迟加载 renderer 模块
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Renderer = require('../src/renderer').Renderer;
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const isCanvasAvailable = require('../src/renderer').isCanvasAvailable;

        const recordingPath = getRecordingPath(sessionName);

        if (!recordingExists(recordingPath)) {
          console.error(chalk.red(`错误: 录制 "${sessionName}" 不存在`));
          process.exit(1);
        }

        // 检查 canvas 是否可用
        if (!isCanvasAvailable()) {
          console.error(chalk.red('错误: skia-canvas 模块未正确安装，无法进行渲染'));
          console.log(chalk.yellow('\n请运行: npm install skia-canvas'));
          console.log(chalk.gray('skia-canvas 是 node-canvas 的现代替代品，无需额外的系统依赖。'));
          process.exit(1);
        }

        const renderOptions: { frameRate?: number; recording?: { quality: number } } = {};
        if (options.fps) renderOptions.frameRate = options.fps;
        if (options.quality) renderOptions.recording = { quality: options.quality };

        const renderer = new Renderer(renderOptions);
        renderer.load(recordingPath);

        // 估算大小
        if (options.estimate) {
          const estimate = renderer.estimateSize();
          console.log(chalk.cyan('\n渲染预估:'));
          console.log(`  尺寸: ${estimate.width} x ${estimate.height}`);
          console.log(`  帧数: ${estimate.frameCount}`);
          console.log(`  预估大小: ${estimate.estimatedSizeMB} MB`);
          return;
        }

        const outputPath = options.output || path.join('.', `${sessionName}.gif`);

        console.log(chalk.cyan(`\n正在渲染: ${sessionName}`));
        console.log(chalk.gray(`输出到: ${outputPath}`));

        // 渲染进度
        let lastProgress = 0;

        const result = await renderer.render(outputPath, {
          ...renderOptions,
          onProgress: (current: number, total: number) => {
            const progress = Math.floor((current / total) * 100);
            if (progress > lastProgress) {
              process.stdout.write(`\r渲染进度: ${progress}% (${current}/${total} 帧)`);
              lastProgress = progress;
            }
          },
        });

        console.log(chalk.green('\n\n渲染完成!'));
        console.log(chalk.gray(`输出文件: ${result}`));

        // 显示文件大小
        const stats = fs.statSync(result);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        console.log(chalk.gray(`文件大小: ${sizeMB} MB`));
      } catch (error) {
        console.error(chalk.red('渲染失败:'), (error as Error).message);
        process.exit(1);
      }
    }
  );

// list 命令
program
  .command('list')
  .description('列出所有录制')
  .option('-d, --detailed', '显示详细信息')
  .action(async (options: { detailed?: boolean }) => {
    try {
      // 初始化 chalk
      await initializeChalk();

      const recordingsDir = defaultConfig.storage.recordingsDir;

      if (!fs.existsSync(recordingsDir)) {
        console.log(chalk.yellow('暂无录制'));
        return;
      }

      const files = fs.readdirSync(recordingsDir).filter((f: string) => f.endsWith('.json'));

      if (files.length === 0) {
        console.log(chalk.yellow('暂无录制'));
        return;
      }

      console.log(chalk.cyan('\n录制列表:\n'));

      files.forEach((file: string, index: number) => {
        const name = file.replace('.json', '');

        console.log(`  ${index + 1}. ${chalk.green(name)}`);

        if (options.detailed) {
          try {
            const filePath = path.join(recordingsDir, file);
            const recording = loadRecording(filePath);
            const frameCount = recording.frames?.length || 0;
            const cols = recording.cols || 80;
            const rows = recording.rows || 24;
            const createdAt = new Date(recording.createdAt).toLocaleString();
            console.log(`     帧数: ${frameCount} | 尺寸: ${cols}x${rows} | 创建: ${createdAt}`);
          } catch {
            console.log(chalk.yellow('     (无法读取详情)'));
          }
        }
      });

      console.log();
    } catch (error) {
      console.error(chalk.red('列出失败:'), (error as Error).message);
      process.exit(1);
    }
  });

// config 命令
program
  .command('config')
  .description('显示当前配置')
  .option('--themes', '列出可用主题')
  .action(async (options: { themes?: boolean }) => {
    // 初始化 chalk
    await initializeChalk();

    console.log(chalk.cyan('\n当前配置:'));

    if (options.themes) {
      console.log('\n可用主题:');
      Object.keys(themes).forEach((name: string) => {
        console.log(`  - ${name}`);
      });
      return;
    }

    console.log('\n终端设置:');
    console.log(`  列数: ${defaultConfig.terminal.cols}`);
    console.log(`  行数: ${defaultConfig.terminal.rows}`);
    console.log(`  字体: ${defaultConfig.terminal.fontFamily}`);
    console.log(`  字号: ${defaultConfig.terminal.fontSize}px`);

    console.log('\n录制设置:');
    console.log(`  最大空闲时间: ${defaultConfig.recording.maxIdleTime}ms`);
    console.log(`  帧率: ${defaultConfig.recording.frameRate}`);
    console.log(`  质量: ${defaultConfig.recording.quality}`);

    console.log('\n存储位置:');
    console.log(`  录制目录: ${defaultConfig.storage.recordingsDir}`);
    console.log();
  });

// 删除命令
program
  .command('delete <session-name>')
  .description('删除录制')
  .option('-f, --force', '强制删除，不询问确认')
  .action(async (sessionName: string) => {
    try {
      // 初始化 chalk
      await initializeChalk();

      const recordingPath = getRecordingPath(sessionName);

      if (!recordingExists(recordingPath)) {
        console.error(chalk.red(`错误: 录制 "${sessionName}" 不存在`));
        process.exit(1);
      }

      fs.unlinkSync(recordingPath);
      console.log(chalk.green(`已删除录制: ${sessionName}`));
    } catch (error) {
      console.error(chalk.red('删除失败:'), (error as Error).message);
      process.exit(1);
    }
  });

// 解析命令行参数
program.parse(process.argv);

// 如果没有参数，显示帮助
if (process.argv.length === 2) {
  // 初始化 chalk 并显示欢迎信息
  (async () => {
    await initializeChalk();
    printWelcome();
    program.help();
  })();
}
