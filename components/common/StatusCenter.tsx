import React, { useState, useEffect } from 'react';
import { useProcessing } from '../../contexts/ProcessingContext';
import { useLanguage } from '../../contexts/LanguageContext';

interface BiliTask {
  task_id: string;
  status: 'queued' | 'parsing' | 'downloading' | 'merging' | 'completed' | 'failed' | 'cancelled';
  url: string;
  progress?: {
    file_type?: string;
    progress?: number;
    downloaded?: number;
    total?: number;
    speed?: string;
  };
  error?: string;
}

interface StatusCenterProps {
  biliTasks?: BiliTask[];
}

export const StatusCenter: React.FC<StatusCenterProps> = ({ biliTasks = [] }) => {
  const { isProcessing, status, statusArgs, queueCount, totalCount } = useProcessing();
  const { t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(true);
  const [hasUnfinishedQueue, setHasUnfinishedQueue] = useState(false);
  const [queueFileNames, setQueueFileNames] = useState<string[]>([]);

  // 检查是否有未完成的上传队列（刷新后恢复）
  useEffect(() => {
    const savedQueue = sessionStorage.getItem('processingQueue');
    const savedStatus = sessionStorage.getItem('currentStatus');
    
    if (savedQueue && savedStatus && savedStatus !== 'statusComplete' && savedStatus !== 'statusFailed') {
      try {
        const fileInfos: Array<{name: string}> = JSON.parse(savedQueue);
        if (fileInfos.length > 0) {
          setHasUnfinishedQueue(true);
          setQueueFileNames(fileInfos.map(f => f.name));
        }
      } catch (e) {
        console.warn('[StatusCenter] Failed to parse queue info', e);
      }
    }
  }, []);

  const handleDismissUnfinished = () => {
    setHasUnfinishedQueue(false);
    sessionStorage.removeItem('processingQueue');
    sessionStorage.removeItem('currentStatus');
    sessionStorage.removeItem('currentStatusArgs');
    sessionStorage.removeItem('totalQueueCount');
  };

  // 获取视频上传状态
  const getUploadStatus = () => {
    if (!isProcessing && !hasUnfinishedQueue) return null;

    const statusText = status ? t(status, ...statusArgs) : t('statusAwaiting');
    const progress = totalCount > 0 ? Math.round(((totalCount - queueCount) / totalCount) * 100) : 0;

    return {
      type: 'upload',
      isActive: isProcessing,
      statusText,
      progress,
      current: totalCount - queueCount,
      total: totalCount,
      hasUnfinished: hasUnfinishedQueue
    };
  };

  // 获取B站下载状态
  const getBiliStatus = () => {
    if (!biliTasks || biliTasks.length === 0) return null;

    const activeTasks = biliTasks.filter(t => 
      !['completed', 'failed', 'cancelled'].includes(t.status)
    );

    if (activeTasks.length === 0) return null;

    const completedCount = biliTasks.filter(t => t.status === 'completed').length;
    const progress = biliTasks.length > 0 
      ? Math.round((completedCount / biliTasks.length) * 100) 
      : 0;

    return {
      type: 'bili',
      isActive: activeTasks.length > 0,
      statusText: `正在下载 ${activeTasks.length} 个视频`,
      progress,
      current: completedCount,
      total: biliTasks.length,
      tasks: activeTasks
    };
  };

  const uploadStatus = getUploadStatus();
  const biliStatus = getBiliStatus();

  // 如果没有任何活动状态，不显示
  if (!uploadStatus && !biliStatus) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96">
      <div className="bg-gray-800/95 backdrop-blur-sm rounded-xl shadow-2xl border border-gray-700 overflow-hidden">
        {/* 头部 */}
        <div 
          className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-700/50 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
              <div className="absolute inset-0 w-3 h-3 bg-blue-500 rounded-full animate-ping opacity-75"></div>
            </div>
            <h3 className="text-white font-semibold">状态中心</h3>
            <span className="text-xs text-gray-400 bg-gray-700/50 px-2 py-1 rounded-full">
              {(uploadStatus?.isActive ? 1 : 0) + (biliStatus?.isActive ? 1 : 0)} 个活动任务
            </span>
          </div>
          <button className="text-gray-400 hover:text-white transition-colors">
            <svg 
              className={`w-5 h-5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* 内容区域 */}
        {isExpanded && (
          <div className="border-t border-gray-700">
            {/* 未完成队列提示 */}
            {hasUnfinishedQueue && (
              <div className="p-4 bg-yellow-900/20 border-b border-yellow-700/50">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-yellow-200 font-medium mb-1">检测到未完成的上传任务</p>
                    <p className="text-xs text-yellow-300/80 mb-2">刷新后文件对象已丢失 ({queueFileNames.length} 个文件)</p>
                    {queueFileNames.length > 0 && (
                      <div className="max-h-20 overflow-y-auto text-xs text-yellow-300/60 space-y-1">
                        {queueFileNames.map((name, idx) => (
                          <div key={idx} className="truncate">• {name}</div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleDismissUnfinished}
                    className="text-yellow-400 hover:text-yellow-300 flex-shrink-0"
                    title="关闭提示"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* 视频上传状态 */}
            {uploadStatus && uploadStatus.isActive && (
              <div className="p-4 border-b border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-blue-500/20 rounded-lg">
                      <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 13H11V9.413l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13H5.5z" />
                      </svg>
                    </div>
                    <span className="text-white font-medium">视频上传</span>
                  </div>
                  <span className="text-sm text-gray-400 font-mono">
                    {uploadStatus.current} / {uploadStatus.total}
                  </span>
                </div>
                
                <p className="text-sm text-gray-300 mb-3 line-clamp-2">{uploadStatus.statusText}</p>
                
                {/* 进度条 */}
                <div className="relative w-full h-2.5 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${uploadStatus.progress}%` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
                  </div>
                </div>
                
                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs text-gray-400">进度</span>
                  <span className="text-xs font-bold text-blue-400">{uploadStatus.progress}%</span>
                </div>
              </div>
            )}

            {/* B站下载状态 */}
            {biliStatus && biliStatus.isActive && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-pink-500/20 rounded-lg">
                      <svg className="w-4 h-4 text-pink-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <span className="text-white font-medium">B站下载</span>
                  </div>
                  <span className="text-sm text-gray-400 font-mono">
                    {biliStatus.current} / {biliStatus.total}
                  </span>
                </div>
                
                <p className="text-sm text-gray-300 mb-3">{biliStatus.statusText}</p>
                
                {/* 总体进度条 */}
                <div className="relative w-full h-2.5 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-pink-600 to-pink-400 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${biliStatus.progress}%` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
                  </div>
                </div>
                
                <div className="flex justify-between items-center mt-2 mb-4">
                  <span className="text-xs text-gray-400">总体进度</span>
                  <span className="text-xs font-bold text-pink-400">{biliStatus.progress}%</span>
                </div>

                {/* 活动任务列表 */}
                {biliStatus.tasks && biliStatus.tasks.length > 0 && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {biliStatus.tasks.slice(0, 5).map((task) => (
                      <div key={task.task_id} className="bg-gray-700/30 hover:bg-gray-700/50 rounded-lg p-3 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-gray-300 truncate flex-1 font-medium">
                            {task.url.includes('/video/') 
                              ? task.url.split('/video/')[1]?.split('?')[0] 
                              : task.task_id.slice(0, 10)}
                          </span>
                          <span className={`text-xs ml-2 px-2 py-0.5 rounded-full ${getTaskStatusStyle(task.status)}`}>
                            {getTaskStatusText(task.status)}
                          </span>
                        </div>
                        
                        {task.progress && task.progress.progress !== undefined && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-gray-600 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-pink-500 to-pink-400 rounded-full transition-all duration-300"
                                  style={{ width: `${task.progress.progress}%` }}
                                ></div>
                              </div>
                              <span className="text-xs text-gray-400 font-mono whitespace-nowrap w-10 text-right">
                                {task.progress.progress?.toFixed(0)}%
                              </span>
                            </div>
                            
                            {task.progress.speed && (
                              <div className="flex items-center justify-between text-xs text-gray-500">
                                <span>{task.progress.file_type || '未知'}</span>
                                <span>{task.progress.speed}</span>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {task.error && (
                          <p className="text-xs text-red-400 mt-1 truncate" title={task.error}>
                            ❌ {task.error}
                          </p>
                        )}
                      </div>
                    ))}
                    
                    {biliStatus.tasks.length > 5 && (
                      <p className="text-xs text-center text-gray-500 pt-2">
                        还有 {biliStatus.tasks.length - 5} 个任务...
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// 辅助函数：获取任务状态文本
function getTaskStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    'queued': '排队中',
    'parsing': '解析中',
    'downloading': '下载中',
    'merging': '合并中',
    'completed': '已完成',
    'failed': '失败',
    'cancelled': '已取消'
  };
  return statusMap[status] || status;
}

// 辅助函数：获取任务状态样式
function getTaskStatusStyle(status: string): string {
  const styleMap: Record<string, string> = {
    'queued': 'bg-gray-600 text-gray-300',
    'parsing': 'bg-blue-600 text-blue-100',
    'downloading': 'bg-green-600 text-green-100',
    'merging': 'bg-purple-600 text-purple-100',
    'completed': 'bg-green-600 text-green-100',
    'failed': 'bg-red-600 text-red-100',
    'cancelled': 'bg-gray-600 text-gray-300'
  };
  return styleMap[status] || 'bg-gray-600 text-gray-300';
}

export default StatusCenter;
