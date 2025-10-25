import React, { useState, useEffect } from 'react';
import * as storageService from '../services/storageService';

const API_BASE_URL: string = (import.meta as any).env?.VITE_API_URL;

interface MigrationStats {
  total: number;
  success: number;
  failed: number;
}

export const MigrationTool: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [videoCount, setVideoCount] = useState(0);
  const [isChecking, setIsChecking] = useState(true);
  const [isMigrating, setIsMigrating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<MigrationStats>({ total: 0, success: 0, failed: 0 });
  const [logs, setLogs] = useState<Array<{ message: string; type: 'info' | 'success' | 'error' }>>([]);

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [...prev, { message, type }]);
  };

  useEffect(() => {
    checkData();
  }, []);

  const checkData = async () => {
    try {
      const videos = await storageService.loadAllAnalyses();
      const count = Object.keys(videos).length;
      setVideoCount(count);
      addLog(`检测到 ${count} 个视频数据`, count > 0 ? 'success' : 'info');
    } catch (error) {
      addLog('读取本地数据失败: ' + (error as Error).message, 'error');
    } finally {
      setIsChecking(false);
    }
  };

  const startMigration = async () => {
    setIsMigrating(true);
    setLogs([]);
    
    try {
      // 检查服务器连接
      addLog('正在连接后端服务器...', 'info');
const healthCheck = await fetch(`${(API_BASE_URL || apiUrl)}/api/health`);
      if (!healthCheck.ok) throw new Error('服务器响应异常');
      addLog('✓ 服务器连接成功', 'success');

      // 读取所有视频数据
      addLog('正在读取本地数据...', 'info');
      const videos = await storageService.loadAllAnalyses();
      const videoList = Object.values(videos);

      if (videoList.length === 0) {
        addLog('未找到需要迁移的数据', 'info');
        return;
      }

      addLog(`找到 ${videoList.length} 个视频需要迁移`, 'success');
      setStats({ total: videoList.length, success: 0, failed: 0 });

      let successCount = 0;
      let failCount = 0;

      // 逐个迁移视频
      for (let i = 0; i < videoList.length; i++) {
        const video = videoList[i];
        addLog(`正在迁移: ${video.name} (${i + 1}/${videoList.length})`, 'info');

        try {
          // 读取视频文件
          const videoFile = await storageService.loadVideoFile(video.id);

          // 上传视频文件
          const formData = new FormData();
          if (videoFile) {
            formData.append('video', videoFile);
          } else {
            // 如果没有原始文件，创建占位文件
            const dummyBlob = new Blob([''], { type: 'video/mp4' });
            const dummyFile = new File([dummyBlob], video.name, { type: 'video/mp4' });
            formData.append('video', dummyFile);
          }

          addLog(`  上传视频文件...`, 'info');
const uploadResponse = await fetch(`${(API_BASE_URL || apiUrl)}/api/videos/upload`, {
            method: 'POST',
            body: formData
          });

          if (!uploadResponse.ok) {
            throw new Error('视频上传失败');
          }

          const uploadResult = await uploadResponse.json();
          addLog(`  ✓ 视频上传成功`, 'success');

          // 保存分析结果
          addLog(`  保存分析结果...`, 'info');
const analysisResponse = await fetch(`${(API_BASE_URL || apiUrl)}/api/videos/${uploadResult.videoId}/analysis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              videoName: video.name,
              analysis: video.analysis,
              frames: video.frames || []
            })
          });

          if (!analysisResponse.ok) {
            throw new Error('分析结果保存失败');
          }

          addLog(`  ✓ ${video.name} 迁移完成`, 'success');
          successCount++;
        } catch (error) {
          addLog(`  ✗ ${video.name} 迁移失败: ${(error as Error).message}`, 'error');
          failCount++;
        }

        setProgress(Math.round(((i + 1) / videoList.length) * 100));
        setStats({ total: videoList.length, success: successCount, failed: failCount });
      }

      addLog(`迁移完成！成功: ${successCount}, 失败: ${failCount}`, 'success');
      alert(`迁移完成！\n成功: ${successCount}\n失败: ${failCount}`);

    } catch (error) {
      addLog('迁移过程出错: ' + (error as Error).message, 'error');
      alert('迁移过程出错: ' + (error as Error).message);
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">🚀 数据迁移工具</h2>
            <button 
              onClick={onClose} 
              className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition"
              disabled={isMigrating}
            >
              ✕
            </button>
          </div>
          <p className="text-purple-100 mt-2">将浏览器中的数据迁移到后端服务器</p>
        </div>

        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 180px)' }}>
          {/* 信息提示 */}
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded">
            <p className="text-blue-800 text-sm">
              <strong>使用说明：</strong><br />
              1. 确保后端服务器正在运行 (http://localhost:3004)<br />
              2. 点击"开始迁移"按钮<br />
              3. 迁移过程中请保持页面打开
            </p>
          </div>

          {/* 数据统计 */}
          {isChecking ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
              <p className="text-gray-600 mt-4">正在检测本地数据...</p>
            </div>
          ) : (
            <>
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <p className="text-center text-gray-700">
                  检测到 <span className="text-2xl font-bold text-purple-600">{videoCount}</span> 个视频数据
                </p>
              </div>

              {/* 开始按钮 */}
              {videoCount > 0 && (
                <button
                  onClick={startMigration}
                  disabled={isMigrating}
                  className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isMigrating ? '迁移中...' : '开始迁移'}
                </button>
              )}

              {/* 进度显示 */}
              {isMigrating && (
                <div className="mt-6">
                  {/* 进度条 */}
                  <div className="w-full bg-gray-200 rounded-full h-8 mb-4 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-purple-600 to-blue-600 h-full flex items-center justify-center text-white font-semibold text-sm transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    >
                      {progress}%
                    </div>
                  </div>

                  {/* 统计 */}
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="bg-gray-100 p-3 rounded text-center">
                      <div className="text-2xl font-bold text-gray-700">{stats.total}</div>
                      <div className="text-xs text-gray-600">总视频数</div>
                    </div>
                    <div className="bg-green-100 p-3 rounded text-center">
                      <div className="text-2xl font-bold text-green-700">{stats.success}</div>
                      <div className="text-xs text-green-600">成功迁移</div>
                    </div>
                    <div className="bg-red-100 p-3 rounded text-center">
                      <div className="text-2xl font-bold text-red-700">{stats.failed}</div>
                      <div className="text-xs text-red-600">失败</div>
                    </div>
                  </div>
                </div>
              )}

              {/* 日志 */}
              {logs.length > 0 && (
                <div className="mt-4 bg-gray-900 rounded-lg p-4 max-h-64 overflow-y-auto">
                  {logs.map((log, index) => (
                    <div 
                      key={index} 
                      className={`text-xs font-mono mb-1 ${
                        log.type === 'success' ? 'text-green-400' :
                        log.type === 'error' ? 'text-red-400' :
                        'text-blue-300'
                      }`}
                    >
                      [{new Date().toLocaleTimeString()}] {log.message}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MigrationTool;
