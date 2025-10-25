import React, { useState, useEffect } from 'react';

interface UploadRecoveryNoticeProps {
  onDismiss?: () => void;
}

/**
 * 当检测到刷新前有未完成的上传任务时显示的提示组件
 */
export const UploadRecoveryNotice: React.FC<UploadRecoveryNoticeProps> = ({ onDismiss }) => {
  const [show, setShow] = useState(false);
  const [queueInfo, setQueueInfo] = useState<{ fileNames: string[]; count: number } | null>(null);

  useEffect(() => {
    // 检查是否有未完成的队列
    const savedQueue = sessionStorage.getItem('processingQueue');
    const savedStatus = sessionStorage.getItem('currentStatus');
    
    if (savedQueue && savedStatus && savedStatus !== 'statusComplete' && savedStatus !== 'statusFailed') {
      try {
        const fileInfos: Array<{ name: string }> = JSON.parse(savedQueue);
        if (fileInfos.length > 0) {
          setQueueInfo({
            fileNames: fileInfos.map(f => f.name),
            count: fileInfos.length
          });
          setShow(true);
        }
      } catch (e) {
        console.warn('[UploadRecoveryNotice] Failed to parse queue info', e);
      }
    }
  }, []);

  const handleDismiss = () => {
    setShow(false);
    // 清理已保存的队列信息
    sessionStorage.removeItem('processingQueue');
    sessionStorage.removeItem('currentStatus');
    sessionStorage.removeItem('currentStatusArgs');
    sessionStorage.removeItem('totalQueueCount');
    onDismiss?.();
  };

  if (!show || !queueInfo) return null;

  return (
    <div className="fixed top-20 right-4 z-50 max-w-md animate-slide-in-right">
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg shadow-lg">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-yellow-800">
              检测到未完成的上传任务
            </h3>
            <div className="mt-2 text-sm text-yellow-700">
              <p className="mb-2">刷新前有 {queueInfo.count} 个视频正在上传队列中：</p>
              <ul className="list-disc list-inside space-y-1 max-h-32 overflow-y-auto">
                {queueInfo.fileNames.map((name, idx) => (
                  <li key={idx} className="truncate" title={name}>{name}</li>
                ))}
              </ul>
              <p className="mt-3 font-medium">
                由于浏览器安全限制，刷新后文件对象已丢失。如需继续上传，请重新选择这些视频文件。
              </p>
            </div>
          </div>
          <div className="ml-3 flex-shrink-0">
            <button
              onClick={handleDismiss}
              className="inline-flex text-yellow-400 hover:text-yellow-600 focus:outline-none"
            >
              <span className="sr-only">关闭</span>
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadRecoveryNotice;
