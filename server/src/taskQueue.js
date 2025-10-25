import EventEmitter from 'events';

/**
 * 高性能任务队列管理器
 * 支持并发处理、优先级队列、进度跟踪
 */
class TaskQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    this.concurrency = options.concurrency || 3; // 并发数
    this.queue = []; // 待处理任务队列
    this.running = new Map(); // 正在运行的任务
    this.completed = new Map(); // 已完成的任务
    this.failed = new Map(); // 失败的任务
    this.taskIdCounter = 0;
  }

  /**
   * 添加任务到队列
   * @param {Function} taskFn - 任务函数
   * @param {Object} metadata - 任务元数据
   * @param {number} priority - 优先级（数字越大优先级越高）
   * @returns {string} taskId
   */
  addTask(taskFn, metadata = {}, priority = 0) {
    const taskId = `task_${++this.taskIdCounter}_${Date.now()}`;
    const task = {
      id: taskId,
      fn: taskFn,
      metadata,
      priority,
      status: 'pending',
      progress: 0,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      error: null,
      result: null
    };

    // 按优先级插入队列
    const insertIndex = this.queue.findIndex(t => t.priority < priority);
    if (insertIndex === -1) {
      this.queue.push(task);
    } else {
      this.queue.splice(insertIndex, 0, task);
    }

    this.emit('taskAdded', task);
    console.log(`[TaskQueue] Task added: ${taskId}, Queue size: ${this.queue.length}`);

    // 尝试处理队列
    this.processQueue();

    return taskId;
  }

  /**
   * 处理队列中的任务
   */
  async processQueue() {
    // 如果已达到并发限制，不处理
    if (this.running.size >= this.concurrency) {
      return;
    }

    // 如果队列为空，不处理
    if (this.queue.length === 0) {
      return;
    }

    // 从队列中取出任务
    const task = this.queue.shift();
    task.status = 'running';
    task.startedAt = Date.now();
    this.running.set(task.id, task);

    this.emit('taskStarted', task);
    console.log(`[TaskQueue] Task started: ${task.id}, Running: ${this.running.size}/${this.concurrency}`);

    try {
      // 执行任务
      const result = await task.fn((progress) => {
        // 进度回调
        task.progress = progress;
        this.emit('taskProgress', { taskId: task.id, progress, metadata: task.metadata });
      });

      // 任务完成
      task.status = 'completed';
      task.completedAt = Date.now();
      task.result = result;
      task.progress = 100;

      this.running.delete(task.id);
      this.completed.set(task.id, task);

      this.emit('taskCompleted', task);
      console.log(`[TaskQueue] Task completed: ${task.id}, Duration: ${task.completedAt - task.startedAt}ms`);

    } catch (error) {
      // 任务失败
      task.status = 'failed';
      task.completedAt = Date.now();
      task.error = error.message;

      this.running.delete(task.id);
      this.failed.set(task.id, task);

      this.emit('taskFailed', { task, error });
      console.error(`[TaskQueue] Task failed: ${task.id}, Error: ${error.message}`);
    }

    // 继续处理队列中的下一个任务
    setImmediate(() => this.processQueue());
  }

  /**
   * 获取任务状态
   * @param {string} taskId
   * @returns {Object|null}
   */
  getTaskStatus(taskId) {
    if (this.running.has(taskId)) {
      return this.running.get(taskId);
    }
    if (this.completed.has(taskId)) {
      return this.completed.get(taskId);
    }
    if (this.failed.has(taskId)) {
      return this.failed.get(taskId);
    }
    
    // 在队列中查找
    const queuedTask = this.queue.find(t => t.id === taskId);
    if (queuedTask) {
      return queuedTask;
    }

    return null;
  }

  /**
   * 获取所有任务状态
   * @returns {Object}
   */
  getAllTasksStatus() {
    return {
      pending: this.queue.map(t => ({
        id: t.id,
        status: t.status,
        metadata: t.metadata,
        createdAt: t.createdAt
      })),
      running: Array.from(this.running.values()).map(t => ({
        id: t.id,
        status: t.status,
        progress: t.progress,
        metadata: t.metadata,
        startedAt: t.startedAt
      })),
      completed: Array.from(this.completed.values()).slice(-20).map(t => ({
        id: t.id,
        status: t.status,
        metadata: t.metadata,
        completedAt: t.completedAt,
        duration: t.completedAt - t.startedAt
      })),
      failed: Array.from(this.failed.values()).slice(-20).map(t => ({
        id: t.id,
        status: t.status,
        metadata: t.metadata,
        error: t.error,
        completedAt: t.completedAt
      })),
      stats: {
        queueSize: this.queue.length,
        running: this.running.size,
        completed: this.completed.size,
        failed: this.failed.size,
        concurrency: this.concurrency
      }
    };
  }

  /**
   * 取消任务
   * @param {string} taskId
   * @returns {boolean}
   */
  cancelTask(taskId) {
    // 只能取消队列中的任务
    const index = this.queue.findIndex(t => t.id === taskId);
    if (index !== -1) {
      const task = this.queue.splice(index, 1)[0];
      task.status = 'cancelled';
      this.emit('taskCancelled', task);
      console.log(`[TaskQueue] Task cancelled: ${taskId}`);
      return true;
    }
    return false;
  }

  /**
   * 清空已完成和失败的任务历史
   */
  clearHistory() {
    this.completed.clear();
    this.failed.clear();
    console.log('[TaskQueue] History cleared');
  }

  /**
   * 设置并发数
   * @param {number} concurrency
   */
  setConcurrency(concurrency) {
    this.concurrency = Math.max(1, concurrency);
    console.log(`[TaskQueue] Concurrency set to: ${this.concurrency}`);
    // 触发队列处理
    this.processQueue();
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    const totalProcessed = this.completed.size + this.failed.size;
    const avgDuration = totalProcessed > 0
      ? Array.from(this.completed.values())
          .reduce((sum, t) => sum + (t.completedAt - t.startedAt), 0) / this.completed.size
      : 0;

    return {
      concurrency: this.concurrency,
      queueSize: this.queue.length,
      running: this.running.size,
      completed: this.completed.size,
      failed: this.failed.size,
      totalProcessed,
      avgDuration: Math.round(avgDuration),
      successRate: totalProcessed > 0 ? ((this.completed.size / totalProcessed) * 100).toFixed(2) : 0
    };
  }
}

// 创建全局任务队列实例
const globalTaskQueue = new TaskQueue({
  concurrency: 3 // 默认并发数为3
});

export default globalTaskQueue;
export { TaskQueue };
