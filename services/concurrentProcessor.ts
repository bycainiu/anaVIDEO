/**
 * 前端并发处理管理器
 * 支持同时处理多个视频的帧提取和AI分析
 */

export interface ProcessingTask {
  id: string;
  file: File;
  status: 'pending' | 'extracting' | 'analyzing' | 'saving' | 'completed' | 'failed';
  progress: number;
  error?: string;
  result?: any;
}

export type ProgressCallback = (taskId: string, status: string, progress: number, args?: any[]) => void;

export class ConcurrentProcessor {
  private concurrency: number;
  private runningTasks: Map<string, ProcessingTask>;
  private queue: ProcessingTask[];
  private onProgress: ProgressCallback;

  constructor(concurrency: number = 2, onProgress: ProgressCallback) {
    this.concurrency = concurrency;
    this.runningTasks = new Map();
    this.queue = [];
    this.onProgress = onProgress;
  }

  /**
   * 添加任务到队列
   */
  addTask(file: File): string {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const task: ProcessingTask = {
      id: taskId,
      file,
      status: 'pending',
      progress: 0
    };
    
    this.queue.push(task);
    this.processQueue();
    return taskId;
  }

  /**
   * 批量添加任务
   */
  addTasks(files: File[]): string[] {
    return files.map(file => this.addTask(file));
  }

  /**
   * 处理队列
   */
  private async processQueue() {
    // 如果已达到并发限制，等待
    if (this.runningTasks.size >= this.concurrency) {
      return;
    }

    // 如果队列为空，返回
    if (this.queue.length === 0) {
      return;
    }

    // 取出任务
    const task = this.queue.shift()!;
    this.runningTasks.set(task.id, task);

    try {
      // 这里会被外部处理函数调用
      // 任务的实际处理逻辑在外部定义
    } catch (error) {
      task.status = 'failed';
      task.error = (error as Error).message;
      this.onProgress(task.id, 'failed', 100, [task.file.name, task.error]);
    } finally {
      this.runningTasks.delete(task.id);
      // 继续处理队列中的下一个任务
      this.processQueue();
    }
  }

  /**
   * 更新任务状态
   */
  updateTask(taskId: string, updates: Partial<ProcessingTask>) {
    const task = this.runningTasks.get(taskId) || this.queue.find(t => t.id === taskId);
    if (task) {
      Object.assign(task, updates);
      if (updates.status && updates.progress !== undefined) {
        this.onProgress(taskId, updates.status, updates.progress);
      }
    }
  }

  /**
   * 标记任务完成
   */
  completeTask(taskId: string, result: any) {
    const task = this.runningTasks.get(taskId);
    if (task) {
      task.status = 'completed';
      task.progress = 100;
      task.result = result;
      this.runningTasks.delete(taskId);
      this.onProgress(taskId, 'completed', 100);
      // 继续处理队列
      this.processQueue();
    }
  }

  /**
   * 标记任务失败
   */
  failTask(taskId: string, error: string) {
    const task = this.runningTasks.get(taskId);
    if (task) {
      task.status = 'failed';
      task.error = error;
      this.runningTasks.delete(taskId);
      this.onProgress(taskId, 'failed', 100, [task.file.name, error]);
      // 继续处理队列
      this.processQueue();
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      running: this.runningTasks.size,
      queued: this.queue.length,
      concurrency: this.concurrency
    };
  }

  /**
   * 设置并发数
   */
  setConcurrency(concurrency: number) {
    this.concurrency = Math.max(1, Math.min(10, concurrency));
    // 触发队列处理
    while (this.runningTasks.size < this.concurrency && this.queue.length > 0) {
      this.processQueue();
    }
  }

  /**
   * 获取正在运行的任务
   */
  getRunningTasks(): ProcessingTask[] {
    return Array.from(this.runningTasks.values());
  }

  /**
   * 清空队列
   */
  clear() {
    this.queue = [];
  }
}
