
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Chatbot from './components/Chatbot';
import ImageGenerator from './components/ImageGenerator';
import AdminView from './components/admin/AdminView';
import UserView from './components/user/UserView';
import { BotIcon, ImageIcon, LogoIcon, VideoIcon, SettingsIcon } from './components/common/Icons';
import { useLanguage } from './contexts/LanguageContext';
import { useSettings } from './contexts/SettingsContext';
import SettingsModal from './components/SettingsModal';
import MigrationTool from './components/MigrationTool';
import BackendStatusIndicator from './components/common/BackendStatusIndicator';
import VideoModal from './components/common/VideoModal';
import ErrorBoundary from './components/common/ErrorBoundary';
import { AnalyzedVideo, ApiProvider } from './types';
import * as hybridStorage from './services/hybridStorageService';
import { BilibiliDownloadPage } from './pages/BilibiliDownloadPage';
import { ProcessingContext } from './contexts/ProcessingContext';
import { getStructuredVideoAnalysis } from './services/apiService';
import { querySubtitlesAtTimestamp } from './services/subtitleService';
import { backendService } from './services/backendService';
import GlobalStatusBar from './components/common/GlobalStatusBar';
import StatusCenter from './components/common/StatusCenter';
import { logger } from './utils/logger';

type ActiveTab = 'chat' | 'image' | 'video' | 'bilibili';

// Token budget calculation for Grok-4 (grok-4-0729) with 128K context:
// - System + User prompt with corpus: ~2,000 tokens
// - Per frame (1024px JPEG 0.6): ~1,300 tokens  
// - Output buffer needed: ~10,000 tokens
// - Response size limit for stable decoding: ~15-20 frames safe
// - With deduplication (SIMILARITY_THRESHOLD=5), 24 potential → ~14-16 keyframes
const POTENTIAL_FRAMES_TO_EXTRACT = 24;  // Balanced: 1.5x original, stable responses
const HASH_SIZE = 8;
const SIMILARITY_THRESHOLD = 5;  // Results in ~25-30 keyframes after deduplication

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('video');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMigrationOpen, setIsMigrationOpen] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const { language, setLanguage, t } = useLanguage();
  const { settings, role, setRole, videoProvider } = useSettings();
  
  // --- STATE LIFTED FOR GLOBAL PROCESSING ---
  const [analyzedVideos, setAnalyzedVideos] = useState<Record<string, AnalyzedVideo>>({});
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  
  // 从 sessionStorage 恢复处理队列（文件信息）
  const [processingQueue, setProcessingQueue] = useState<File[]>(() => {
    try {
      const saved = sessionStorage.getItem('processingQueue');
      if (saved) {
        const fileInfos: Array<{name: string, size: number, type: string, lastModified: number}> = JSON.parse(saved);
        console.log('[App] 恢复队列信息，但无法恢复 File 对象（刷新后文件需要重新选择）');
        // 注意：无法直接恢复 File 对象，因为浏览器安全限制
        // 仅用于显示队列状态，实际文件需要用户重新选择
        return [];
      }
    } catch (e) {
      console.warn('[App] 恢复队列失败', e);
    }
    return [];
  });
  
  const [processingCount, setProcessingCount] = useState(0); // 替代isProcessing
  const [currentStatus, setCurrentStatus] = useState(() => {
    // 从 sessionStorage 恢复状态
    return sessionStorage.getItem('currentStatus') || 'statusAwaiting';
  });
  const [currentStatusArgs, setCurrentStatusArgs] = useState<any[]>(() => {
    const saved = sessionStorage.getItem('currentStatusArgs');
    return saved ? JSON.parse(saved) : [];
  });
  const totalQueueCountRef = useRef<number>(0);
  
  // 初始化时恢复 totalQueueCount
  useEffect(() => {
    const saved = sessionStorage.getItem('totalQueueCount');
    if (saved) {
      totalQueueCountRef.current = parseInt(saved, 10);
    }
  }, []);
  
  // 并发控制配置
  // 注意：设为1以避免重复上传，因为每个视频都会上传到后端生成字幕
  const MAX_CONCURRENT_VIDEOS = 1; // 保证按顺序处理

  // --- On initial load, populate state from hybrid storage ---
  useEffect(() => {
    const loadInitialData = async () => {
        try {
            const videos = await hybridStorage.getAllVideos();
            setAnalyzedVideos(videos);
            console.log('[App] Loaded videos, backend status:', hybridStorage.getBackendStatus());
        } catch (e) { 
            console.error("Failed to load data:", e); 
        } finally {
            setIsDataLoaded(true);
        }
    };
    loadInitialData();
  }, []);
  
  // 持久化处理状态和队列信息
  useEffect(() => {
    sessionStorage.setItem('currentStatus', currentStatus);
    sessionStorage.setItem('currentStatusArgs', JSON.stringify(currentStatusArgs));
    sessionStorage.setItem('totalQueueCount', totalQueueCountRef.current.toString());
    
    // 保存队列信息（仅元数据，不包括实际 File 对象）
    if (processingQueue.length > 0) {
      const fileInfos = processingQueue.map(f => ({
        name: f.name,
        size: f.size,
        type: f.type,
        lastModified: f.lastModified
      }));
      sessionStorage.setItem('processingQueue', JSON.stringify(fileInfos));
    } else {
      sessionStorage.removeItem('processingQueue');
    }
  }, [currentStatus, currentStatusArgs, processingQueue]);
  
  // 处理完成后清理状态
  useEffect(() => {
    if (processingCount === 0 && totalQueueCountRef.current > 0 && processingQueue.length === 0) {
      // 延迟清理，让用户能看到完成状态
      const timer = setTimeout(() => {
        sessionStorage.removeItem('currentStatus');
        sessionStorage.removeItem('currentStatusArgs');
        sessionStorage.removeItem('totalQueueCount');
        sessionStorage.removeItem('processingQueue');
      }, 5000); // 5秒后清理
      return () => clearTimeout(timer);
    }
  }, [processingCount, processingQueue.length]);

  // --- GLOBAL PROCESSING LOGIC ---
  const createPerceptualHash = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, width: number, height: number): string => {
      const smallSize = HASH_SIZE + 1;
      ctx.drawImage(canvas, 0, 0, width, height, 0, 0, smallSize, HASH_SIZE);
      const imageData = ctx.getImageData(0, 0, smallSize, HASH_SIZE);
      const grayPixels = [];
      for (let i = 0; i < imageData.data.length; i += 4) {
          const gray = imageData.data[i] * 0.299 + imageData.data[i + 1] * 0.587 + imageData.data[i + 2] * 0.114;
          grayPixels.push(gray);
      }
      let hash = '';
      for (let y = 0; y < HASH_SIZE; y++) {
          for (let x = 0; x < HASH_SIZE; x++) {
              hash += (grayPixels[y * smallSize + x] < grayPixels[y * smallSize + x + 1]) ? '1' : '0';
          }
      }
      return hash;
  };

  const calculateHammingDistance = (hash1: string, hash2: string): number => {
      let distance = 0;
      for (let i = 0; i < hash1.length; i++) if (hash1[i] !== hash2[i]) distance++;
      return distance;
  };

  useEffect(() => {
      // 并发控制逻辑: 从队列中取出视频进行处理
      if (processingCount >= MAX_CONCURRENT_VIDEOS || processingQueue.length === 0) {
          if (processingCount === 0 && totalQueueCountRef.current > 0 && processingQueue.length === 0) {
              setCurrentStatus('statusComplete');
              totalQueueCountRef.current = 0;
          }
          return;
      }

      // 🔑 关键修复：先从队列中取出要处理的文件，避免重复处理
      const availableSlots = Math.min(
          MAX_CONCURRENT_VIDEOS - processingCount,
          processingQueue.length
      );
      
      if (availableSlots <= 0) return;
      
      // 从队列头部取出文件
      const filesToProcess = processingQueue.slice(0, availableSlots);
      // 立即从队列中移除，防止重复处理
      setProcessingQueue(prev => prev.slice(availableSlots));
      
      // 为每个文件启动处理
      filesToProcess.forEach((fileToProcess, idx) => {
          processFile(fileToProcess, idx);
      });

      async function processFile(fileToProcess: File, indexInBatch: number) {
          setProcessingCount(prev => prev + 1); // 增加计数
          const currentCount = totalQueueCountRef.current - processingQueue.length - filesToProcess.length + indexInBatch + 1;
          const videoUrl = URL.createObjectURL(fileToProcess);
          
          // 为每个处理任务创建独立的video和canvas元素，避免并发冲突
          const video = document.createElement('video');
          const canvas = document.createElement('canvas');
          video.muted = true;
          video.playsInline = true;
          video.preload = 'metadata';
          
          try {
              await new Promise<void>((resolve, reject) => {
                  // 添加超时保护，防止某些视频永久卡住
                  const timeout = setTimeout(() => {
                      reject(new Error(`Video loading timeout after 30s: ${fileToProcess.name}`));
                  }, 30000);
                  
                  video.onloadedmetadata = async () => {
                      clearTimeout(timeout);
                      try {
                          const ctx = canvas.getContext('2d');
                          if (!ctx) return reject(new Error("Canvas context error"));

                          setCurrentStatus('statusProcessing');
                          setCurrentStatusArgs([fileToProcess.name, currentCount, totalQueueCountRef.current]);

                          setCurrentStatus('statusExtracting');
                          setCurrentStatusArgs([fileToProcess.name]);
                          const potentialFrames: { timestamp: number, base64Data: string, dataUrl: string, hash: string }[] = [];
                          const interval = video.duration / (POTENTIAL_FRAMES_TO_EXTRACT - 1);
                          for (let i = 0; i < POTENTIAL_FRAMES_TO_EXTRACT; i++) {
                              const time = (i === POTENTIAL_FRAMES_TO_EXTRACT - 1 && video.duration > 1) ? video.duration : interval * i;
                              video.currentTime = time;
                              await new Promise(res => { video.onseeked = () => res(true) });
                              
                              // Limit resolution to reduce payload size (max 1024px width)
                              const maxWidth = 1024;
                              const scale = Math.min(1, maxWidth / video.videoWidth);
                              const scaledWidth = Math.floor(video.videoWidth * scale);
                              const scaledHeight = Math.floor(video.videoHeight * scale);
                              
                              canvas.width = scaledWidth;
                              canvas.height = scaledHeight;
                              ctx.drawImage(video, 0, 0, scaledWidth, scaledHeight);
                              const hash = createPerceptualHash(ctx, canvas, scaledWidth, scaledHeight);
                              // Lower quality to 0.6 to reduce base64 size
                              const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                              potentialFrames.push({ timestamp: time, base64Data: dataUrl.split(',')[1], dataUrl, hash });
                          }
                          
                          setCurrentStatus('statusHashing');
                          setCurrentStatusArgs([potentialFrames.length]);

                          const keyframes = [];
                          if (potentialFrames.length > 0) {
                              let lastKeyframe = potentialFrames[0];
                              keyframes.push(lastKeyframe);
                              for (let i = 1; i < potentialFrames.length; i++) {
                                  if (calculateHammingDistance(potentialFrames[i].hash, lastKeyframe.hash) > SIMILARITY_THRESHOLD) {
                                      lastKeyframe = potentialFrames[i];
                                      keyframes.push(lastKeyframe);
                                  }
                              }
                          }
                          
                          setCurrentStatus('statusClustering');
                          setCurrentStatusArgs([keyframes.length]);
                          
                          setCurrentStatus('statusAnalyzing');
                          setCurrentStatusArgs([fileToProcess.name]);
                          
                          logger.stageStart('UPLOAD', `文件: ${fileToProcess.name} | 大小: ${(fileToProcess.size / 1024 / 1024).toFixed(2)} MB`);
                          logger.info(`关键帧数量: ${keyframes.length}`);
                          logger.info(`使用模型: ${videoProvider}`);
                          logger.detail('设置信息', settings);
                          
                          // 先上传视频生成字幕
                          let videoIdForSubtitles: string | null = null;
                          let subtitlesReady = false;
                          
                          try {
                              logger.info('正在上传视频到后端...');
                              const uploadResult = await backendService.uploadVideo(fileToProcess);
                              videoIdForSubtitles = uploadResult.videoId;
                              logger.success(`视频上传完成, ID: ${videoIdForSubtitles}`);
                              
                              logger.stageStart('EXTRACT_AUDIO', '后台异步进行中');
                              logger.info('正在从视频中提取音频...');
                              
                              logger.stageStart('TRANSCRIBE', '使用本地 Whisper 模型');
                              logger.info('音频转文本正在后台处理...');
                              logger.info('等待服务器实时推送字幕完成通知...');
                              
                              // 使用 SSE 等待字幕生成完成通知
                              const API_BASE_URL = (import.meta as any).env?.VITE_API_URL as string;
                              
                              subtitlesReady = await new Promise<boolean>((resolve) => {
                                  const eventSource = new EventSource(`${API_BASE_URL}/api/subtitles/${videoIdForSubtitles}/events`);
                                  let hasResolved = false;
                                  
                                  // 超时保护：最多等待 10 分钟（根据视频长度调整）
                                  const timeout = setTimeout(() => {
                                      if (!hasResolved) {
                                          hasResolved = true;
                                          logger.warn(`⚠️  字幕生成超时（10分钟），将不使用字幕继续分析`);
                                          logger.warn('提示：如视频较长，可能需要更多时间，请查看后端日志');
                                          eventSource.close();
                                          videoIdForSubtitles = null;
                                          resolve(false);
                                      }
                                  }, 600000); // 10 分钟超时
                                  
                                  // 监听连接成功
                                  eventSource.addEventListener('connected', (e) => {
                                      const data = JSON.parse(e.data);
                                      logger.info(`✨ 已连接到字幕服务，等待实时通知... (videoId: ${data.videoId})`);
                                  });
                                  
                                  // 监听字幕生成完成
                                  eventSource.addEventListener('subtitle-complete', (e) => {
                                      if (hasResolved) return;
                                      hasResolved = true;
                                      
                                      const data = JSON.parse(e.data);
                                      clearTimeout(timeout);
                                      eventSource.close();
                                      
                                      if (data.segmentCount > 0) {
                                          logger.success(`✅ 字幕生成完成！共 ${data.segmentCount} 个分段`);
                                          resolve(true);
                                      } else {
                                          logger.warn(`⚠️  字幕处理完成，但未检测到语音内容`);
                                          logger.warn('原因可能：1) 视频无声音  2) 音频质量差  3) VAD过滤过于严格');
                                          videoIdForSubtitles = null;
                                          resolve(false);
                                      }
                                  });
                                  
                                  // 监听字幕生成错误
                                  eventSource.addEventListener('subtitle-error', (e) => {
                                      if (hasResolved) return;
                                      hasResolved = true;
                                      
                                      const data = JSON.parse(e.data);
                                      clearTimeout(timeout);
                                      eventSource.close();
                                      
                                      logger.error(`❌ 字幕生成失败: ${data.error}`);
                                      videoIdForSubtitles = null;
                                      resolve(false);
                                  });
                                  
                                  // 监听进度更新（可选）
                                  eventSource.addEventListener('subtitle-progress', (e) => {
                                      const data = JSON.parse(e.data);
                                      logger.info(`🔄 ${data.status} (${data.progress}%)`);
                                  });
                                  
                                  // 监听连接错误
                                  eventSource.onerror = (err) => {
                                      if (hasResolved) return;
                                      hasResolved = true;
                                      
                                      clearTimeout(timeout);
                                      eventSource.close();
                                      
                                      logger.error('❌ SSE 连接错误，将不使用字幕', err);
                                      videoIdForSubtitles = null;
                                      resolve(false);
                                  };
                              });
                          } catch (error) {
                              logger.error('视频上传失败，将不使用字幕', error);
                          }
                          
                          // 为每个关键帧查询对应的字幕（前后 5 秒）
                          logger.stageStart('GENERATE_SUBTITLES', '查询各关键帧对应的字幕文本');
                          
                          const framesWithSubtitles = await Promise.all(
                              keyframes.map(async (frame, index) => {
                                  let subtitleContext = '';
                                  
                                  // 只有当字幕就绪时才查询
                                  if (videoIdForSubtitles && subtitlesReady) {
                                      try {
                                          const subtitles = await querySubtitlesAtTimestamp(
                                              videoIdForSubtitles,
                                              frame.timestamp,
                                              5 // 前后 5 秒范围
                                          );
                                          
                                          if (subtitles.length > 0) {
                                              subtitleContext = subtitles.map(s => s.text).join(' ');
                                              logger.info(`帧 ${index + 1} (${frame.timestamp.toFixed(1)}s) 字幕: ${subtitleContext.substring(0, 50)}${subtitleContext.length > 50 ? '...' : ''}`);
                                              logger.subtitles(subtitles);
                                          } else {
                                              logger.warn(`帧 ${index + 1} (${frame.timestamp.toFixed(1)}s) 无字幕`);
                                          }
                                      } catch (e) {
                                          logger.warn(`帧 ${index + 1} 字幕查询失败`, e);
                                      }
                                  }
                                  
                                  return {
                                      timestamp: frame.timestamp,
                                      base64Data: frame.base64Data,
                                      subtitleContext
                                  };
                              })
                          );
                          
                          logger.success(`共 ${framesWithSubtitles.length} 个关键帧已附加字幕`);
                          
                          logger.stageStart('INJECT_PROMPT', '构建包含字幕的完整提示词');
                          logger.info('字幕已注入到每个关键帧的上下文中');
                          logger.info('模型将结合画面和语音内容进行分析');
                          
                          logger.stageStart('SEND_REQUEST', `目标模型: ${videoProvider}`);
                          logger.info('正在发送请求...');
                          logger.detail('请求参数', {
                              provider: videoProvider,
                              frameCount: framesWithSubtitles.length,
                              withSubtitles: framesWithSubtitles.filter(f => f.subtitleContext).length
                          });
                          
                          const analysis = await getStructuredVideoAnalysis(videoProvider, settings, framesWithSubtitles);
                          
                          logger.stageStart('RECEIVE_RESPONSE', '模型回复已接收');
                          logger.success('分析完成');
                          logger.detail('分析结果', analysis);
                          
                          // Validate response structure
                          if (!analysis.overallSummary?.en && !analysis.overallSummary?.cn) {
                              console.warn('[Video Processing] Missing overallSummary in API response');
                          }
                          if (!analysis.frameAnalyses || !Array.isArray(analysis.frameAnalyses) || analysis.frameAnalyses.length === 0) {
                              console.error('[Video Processing] Invalid frameAnalyses:', analysis);
                              throw new Error('Missing or invalid frameAnalyses in API response');
                          }
                          console.log('[Video Processing] Validation passed, frameAnalyses count:', analysis.frameAnalyses.length);
                          
                          // 保存分析结果并获取实际使用的videoId（后端上传会返回新ID）
                          setCurrentStatus('statusSaving');
                          
                          // 使用生成的标题（如果有），否则使用原文件名
                          const videoName = analysis.videoTitle || fileToProcess.name;
                          console.log('[Video Processing] Using video name:', videoName);
                          if (analysis.videoTitle) {
                              console.log('[Video Processing] Title generated by AI:', analysis.videoTitle);
                          }
                          
                          setCurrentStatusArgs([videoName]);
                          
                          // 使用已上传的 videoId，避免重复上传
                          const actualVideoId = await hybridStorage.saveAnalysis(
                              videoIdForSubtitles || crypto.randomUUID(), // 优先使用已上传的ID
                              videoName,
                              analysis,
                              keyframes.map(f => f.dataUrl),
                              videoIdForSubtitles ? undefined : fileToProcess  // 如果已上传则不再传文件
                          );
                          
                          const newAnalyzedVideo: AnalyzedVideo = { 
                              id: actualVideoId, 
                              name: videoName, // 使用生成的标题或原文件名
                              analysis, 
                              frames: keyframes.map(f => f.dataUrl),
                          };

                          setAnalyzedVideos(prev => ({ ...prev, [actualVideoId]: newAnalyzedVideo }));
                          resolve();
                      } catch (err) { 
                          clearTimeout(timeout);
                          reject(err); 
                      }
                  };
                  
                  video.onerror = (e) => {
                      clearTimeout(timeout);
                      console.error('[Video Loading] Error loading video:', fileToProcess.name, e);
                      
                      // 提供更详细的错误信息和解决建议
                      let errorMessage = 'Unknown video loading error';
                      let userFriendlyMessage = '';
                      
                      if (video.error) {
                          const errorCode = video.error.code;
                          const errorDetail = video.error.message;
                          
                          switch (errorCode) {
                              case 1: // MEDIA_ERR_ABORTED
                                  errorMessage = 'Video loading was aborted';
                                  userFriendlyMessage = '视频加载被中止，请重试';
                                  break;
                              case 2: // MEDIA_ERR_NETWORK
                                  errorMessage = 'Network error during video loading';
                                  userFriendlyMessage = '网络错误，请检查网络连接';
                                  break;
                              case 3: // MEDIA_ERR_DECODE
                                  errorMessage = `Video decoding failed: ${errorDetail}`;
                                  userFriendlyMessage = '视频解码失败，文件可能已损坏或格式不支持。请尝试用视频转换工具（如 HandBrake）转换为 H.264/MP4 格式';
                                  break;
                              case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
                                  errorMessage = `Video format not supported: ${errorDetail}`;
                                  // 检测是否是 H.265/HEVC 编码问题
                                  if (errorDetail && (errorDetail.includes('HEVC') || errorDetail.includes('H265') || errorDetail.includes('hvc1'))) {
                                      userFriendlyMessage = '检测到 H.265/HEVC 编码，浏览器不支持。请使用视频转换工具（如 HandBrake）转换为 H.264 编码的 MP4 文件';
                                  } else {
                                      userFriendlyMessage = '视频格式不支持。请使用视频转换工具（如 HandBrake）转换为 H.264/MP4 格式。\n\n推荐设置：\n- 编码：H.264 (x264)\n- 容器：MP4\n- 帧率：30fps\n- 质量：CRF 23';
                                  }
                                  break;
                              default:
                                  errorMessage = `Video error code ${errorCode}: ${errorDetail}`;
                                  userFriendlyMessage = '视频加载失败，请检查文件格式';
                          }
                      }
                      
                      const fullErrorMessage = `${errorMessage}\n\n${userFriendlyMessage}\n\nFile: ${fileToProcess.name}`;
                      reject(new Error(fullErrorMessage));
                  };
                  
                  // 设置src触发加载（放在事件监听器之后）
                  video.src = videoUrl;
              });
          } catch (err: any) {
              console.error("Analysis failed:", err);
              setCurrentStatus('statusFailed');
              setCurrentStatusArgs([fileToProcess.name, err.message]);
          } finally {
              URL.revokeObjectURL(videoUrl);
              // 注意：队列已经在 useEffect 开始时移除了，这里不需要再次移除
              setProcessingCount(prev => prev - 1); // 减少计数
          }
      }
  }, [processingQueue, processingCount, settings, videoProvider]);

  const addToQueue = useCallback((files: File[]) => {
    setProcessingQueue(prev => {
      // 去重：检查是否已存在相同的文件（根据名称+大小）
      const existingKeys = new Set(prev.map(f => `${f.name}_${f.size}`));
      const newFiles = files.filter(f => {
        const key = `${f.name}_${f.size}`;
        return !existingKeys.has(key);
      });
      
      if (newFiles.length === 0) {
        console.warn('[App] 所有文件已在队列中，已跳过');
        return prev;
      }
      
      // 更新总数
      if (prev.length === 0) {
        totalQueueCountRef.current = newFiles.length;
      } else {
        totalQueueCountRef.current += newFiles.length;
      }
      
      console.log(`[App] 添加 ${newFiles.length} 个文件到队列`);
      return [...prev, ...newFiles];
    });
  }, []); // 移除依赖项，避免重新创建

  // 处理聊天中的视频点击
  const handleVideoClickFromChat = useCallback((videoId: string) => {
    console.log('[App] Video clicked from chat:', videoId);
    // 打开视频弹窗
    setSelectedVideoId(videoId);
  }, []);


  // --- UI RENDERING LOGIC ---
  const navItemClasses = (tabName: ActiveTab) =>
    `flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-colors duration-200 ${
      activeTab === tabName
        ? 'bg-blue-600 text-white'
        : 'hover:bg-gray-700 text-gray-300'
    }`;
  
  const langButtonClasses = (lang: 'en' | 'cn') =>
    `px-3 py-1 text-sm rounded-md transition-colors ${
        language === lang ? 'bg-blue-600 text-white' : 'bg-gray-500 hover:bg-gray-400'
    }`;
  
  const roleButtonClasses = (r: 'admin' | 'user') =>
    `px-3 py-1 text-sm rounded-md transition-colors ${
        role === r ? 'bg-green-600 text-white' : 'bg-gray-600 hover:bg-gray-500'
    }`;

  const renderAdminNav = () => (
    <>
      <button onClick={() => setActiveTab('video')} className={navItemClasses('video')}>
        <VideoIcon />
        <span>{t('videoManagement')}</span>
      </button>
      <button onClick={() => setActiveTab('bilibili')} className={navItemClasses('bilibili')}>
        <span>📺</span>
        <span>B站下载</span>
      </button>
      <button onClick={() => setActiveTab('chat')} className={navItemClasses('chat')}>
        <BotIcon />
        <span>{t('chat')}</span>
      </button>
      <button onClick={() => setActiveTab('image')} className={navItemClasses('image')}>
        <ImageIcon />
        <span>{t('imageGen')}</span>
      </button>
    </>
  );

  const renderUserNav = () => (
     <button onClick={() => setActiveTab('video')} className={navItemClasses('video')}>
        <VideoIcon />
        <span>{t('semanticSearch')}</span>
      </button>
  );

  return (
    <ProcessingContext.Provider value={{ isProcessing: processingCount > 0, status: currentStatus, statusArgs: currentStatusArgs, queueCount: processingQueue.length, totalCount: totalQueueCountRef.current, addToQueue }}>
      <div className="flex flex-col h-screen font-sans bg-gray-800 text-white">
        <header className="bg-gray-900 border-b border-gray-700 p-4 shadow-md z-10">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-3">
              <LogoIcon />
              <h1 className="text-xl font-bold tracking-wider">Gemini Creative Suite</h1>
              <BackendStatusIndicator />
            </div>
            <div className="flex items-center gap-4">
              <nav className="flex items-center gap-2 bg-gray-800 p-1 rounded-xl">
                {role === 'admin' ? renderAdminNav() : renderUserNav()}
              </nav>
              <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-gray-800 p-1 rounded-xl">
                      <button onClick={() => setLanguage('en')} className={langButtonClasses('en')}>EN</button>
                      <button onClick={() => setLanguage('cn')} className={langButtonClasses('cn')}>中文</button>
                  </div>
                  <div className="flex items-center gap-1 bg-gray-800 p-1 rounded-xl">
                      <button onClick={() => setRole('admin')} className={roleButtonClasses('admin')}>{t('admin')}</button>
                      <button onClick={() => setRole('user')} className={roleButtonClasses('user')}>{t('user')}</button>
                  </div>
                  {role === 'admin' && (
                    <>
                      <button onClick={() => setIsMigrationOpen(true)} className="px-3 py-2 rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium" title="数据迁移">
                          🚀 迁移
                      </button>
                      <button onClick={() => setIsSettingsOpen(true)} className="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Settings">
                          <SettingsIcon />
                      </button>
                    </>
                  )}
              </div>
            </div>
          </div>
        </header>

        <StatusCenter />
        <GlobalStatusBar />
        
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-900">
          <div className="max-w-7xl mx-auto h-full">
            <ErrorBoundary>
              {role === 'admin' ? (
                <>
                  {activeTab === 'chat' && <ErrorBoundary><Chatbot onVideoClick={handleVideoClickFromChat} /></ErrorBoundary>}
                  {activeTab === 'image' && <ErrorBoundary><ImageGenerator /></ErrorBoundary>}
                  {activeTab === 'video' && (
                    <ErrorBoundary>
                      <AdminView 
                        analyzedVideos={analyzedVideos}
                        setAnalyzedVideos={setAnalyzedVideos}
                        isDataLoaded={isDataLoaded}
                      />
                    </ErrorBoundary>
                  )}
                  {activeTab === 'bilibili' && (
                    <ErrorBoundary>
                      <BilibiliDownloadPage />
                    </ErrorBoundary>
                  )}
                </>
              ) : (
                <ErrorBoundary>
                  <UserView 
                    analyzedVideos={Object.values(analyzedVideos).sort((a,b) => {
                      // 按创建时间降序排列（最新的在前）
                      if (a.createdAt && b.createdAt) {
                        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                      }
                      // 如果没有创建时间，按名称排序
                      return a.name.localeCompare(b.name);
                    })}
                  />
                </ErrorBoundary>
              )}
            </ErrorBoundary>
          </div>
        </main>

        {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
        {isMigrationOpen && <MigrationTool onClose={() => setIsMigrationOpen(false)} />}
        {selectedVideoId && (
          <VideoModal
            videoId={selectedVideoId}
            onClose={() => setSelectedVideoId(null)}
          />
        )}
      </div>
    </ProcessingContext.Provider>
  );
};

export default App;
