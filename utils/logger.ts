// 统一的日志工具
// 提供清晰的视觉分隔和阶段标记

const ENABLE_LOGS = true; // 全局开关

// 日志分类
export enum LogCategory {
  VIDEO_PROCESSING = 'VideoProcessing',
  STORAGE = 'Storage',
  UI = 'UI',
  API = 'API',
  SUBTITLE = 'Subtitle',
  GENERAL = 'General'
}

// 默认启用的分类（可在运行时修改）
const enabledCategories = new Set<LogCategory>([
  LogCategory.VIDEO_PROCESSING,
  LogCategory.SUBTITLE,
  LogCategory.API
]);

// 日志颜色
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

// 阶段标记
const stages = {
  UPLOAD: '📤 上传视频',
  EXTRACT_AUDIO: '🎵 提取音频',
  TRANSCRIBE: '🎙️ 语音转文本',
  GENERATE_SUBTITLES: '📝 生成字幕',
  INJECT_PROMPT: '💉 注入提示词',
  SEND_REQUEST: '🚀 发送模型请求',
  RECEIVE_RESPONSE: '📥 接收模型回复',
  PARSE_CONTENT: '🔍 解析内容',
  PLAY_VIDEO: '▶️ 播放视频',
  LOAD_SUBTITLES: '📺 加载字幕',
};

class Logger {
  private enabled: boolean = ENABLE_LOGS;
  private categories = enabledCategories;
  
  // 检查分类是否启用
  private isCategoryEnabled(category?: LogCategory): boolean {
    if (!this.enabled) return false;
    if (!category) return true; // 无分类的日志默认显示
    return this.categories.has(category);
  }

  // 阶段开始
  stageStart(stage: keyof typeof stages, details?: string, category?: LogCategory) {
    if (!this.isCategoryEnabled(category)) return;
    
    console.log('\n' + '='.repeat(80));
    console.log(`%c${stages[stage]}`, 'color: #00bfff; font-size: 16px; font-weight: bold;');
    if (details) {
      console.log(`%c${details}`, 'color: #888;');
    }
    console.log('='.repeat(80));
  }

  // 阶段信息
  info(message: string, data?: any, category?: LogCategory) {
    if (!this.isCategoryEnabled(category)) return;
    console.log(`%c[INFO] ${message}`, 'color: #4CAF50;', data || '');
  }

  // 阶段完成
  success(message: string, data?: any, category?: LogCategory) {
    if (!this.isCategoryEnabled(category)) return;
    console.log(`%c✅ ${message}`, 'color: #4CAF50; font-weight: bold;', data || '');
  }

  // 警告
  warn(message: string, data?: any, category?: LogCategory) {
    if (!this.isCategoryEnabled(category)) return;
    console.warn(`%c⚠️ ${message}`, 'color: #ff9800;', data || '');
  }

  // 错误（错误始终显示，不受分类限制）
  error(message: string, error?: any, category?: LogCategory) {
    if (!this.enabled) return;
    console.error(`%c❌ ${message}`, 'color: #f44336; font-weight: bold;', error || '');
  }

  // 详细数据（可折叠）
  detail(label: string, data: any) {
    if (!this.enabled) return;
    console.groupCollapsed(`%c📊 ${label}`, 'color: #2196F3;');
    console.log(data);
    console.groupEnd();
  }

  // 完整提示词（高亮显示）
  prompt(promptText: string) {
    if (!this.enabled) return;
    console.log('\n' + '─'.repeat(80));
    console.log('%c📝 完整提示词内容:', 'color: #9C27B0; font-size: 14px; font-weight: bold;');
    console.log('─'.repeat(80));
    console.log('%c' + promptText, 'color: #555; font-family: monospace; white-space: pre-wrap;');
    console.log('─'.repeat(80) + '\n');
  }

  // 字幕数据
  subtitles(subtitles: Array<{start: number, end: number, text: string}>) {
    if (!this.enabled) return;
    console.groupCollapsed(`%c📺 字幕内容 (${subtitles.length} 条)`, 'color: #FF5722;');
    subtitles.forEach((sub, i) => {
      console.log(`[${i + 1}] ${sub.start.toFixed(2)}s - ${sub.end.toFixed(2)}s: ${sub.text}`);
    });
    console.groupEnd();
  }

  // 分隔线
  separator() {
    if (!this.enabled) return;
    console.log('\n' + '━'.repeat(80) + '\n');
  }

  // 启用/禁用日志
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }
  
  // 启用某个分类
  enableCategory(category: LogCategory) {
    this.categories.add(category);
  }
  
  // 禁用某个分类
  disableCategory(category: LogCategory) {
    this.categories.delete(category);
  }
  
  // 只启用指定分类
  setCategories(categories: LogCategory[]) {
    this.categories.clear();
    categories.forEach(cat => this.categories.add(cat));
  }
  
  // 启用所有分类
  enableAll() {
    this.categories = new Set(Object.values(LogCategory));
  }
  
  // 禁用所有分类
  disableAll() {
    this.categories.clear();
  }
}

// 导出单例
export const logger = new Logger();

// 导出阶段常量
export { stages };
