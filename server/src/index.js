import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdir, readdir, stat, unlink, rm } from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import { dbOperations, saveCompleteAnalysis } from './db.js';
import { extractFrames, imageToBase64, getVideoDuration, calculateFileHash } from './videoProcessor.js';
import taskQueue from './taskQueue.js';
import { processVideosOnStartup } from './titleGenerationService.js';
import { processVideoSubtitles, getSubtitlesAtTimestamp } from './subtitleService.js';
import { analyzeBiliVideo } from './biliVideoAnalysisService.js';
import sseManager from './sseManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3004;

// 存储目录
const STORAGE_DIR = join(__dirname, '../storage');
const VIDEOS_DIR = join(STORAGE_DIR, 'videos');
const FRAMES_DIR = join(STORAGE_DIR, 'frames');
const UPLOADS_DIR = join(STORAGE_DIR, 'uploads');

// 确保存储目录存在
await mkdir(VIDEOS_DIR, { recursive: true });
await mkdir(FRAMES_DIR, { recursive: true });
await mkdir(UPLOADS_DIR, { recursive: true });

// 中间件
app.use(cors());
app.use(express.json({ limit: '2gb' }));
app.use(express.urlencoded({ extended: true, limit: '2gb' }));

// 静态文件服务
app.use('/videos', express.static(VIDEOS_DIR));
app.use('/frames', express.static(FRAMES_DIR));

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // 使用UUID作为文件名，避免中文编码问题
    // 实际的视频名称从req.body.title获取
    const ext = file.originalname.split('.').pop() || 'mp4';
    const uniqueName = `${uuidv4()}.${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB限制
});

// ============ API 路由 ============

/**
 * GET /api/videos
 * 获取所有视频或搜索视频
 */
app.get('/api/videos', (req, res) => {
  try {
    const { search } = req.query;
    
    let videos;
    if (search) {
      const searchPattern = `%${search}%`;
      videos = dbOperations.searchVideos(
        searchPattern, searchPattern, searchPattern,
        searchPattern, searchPattern, searchPattern, searchPattern
      );
    } else {
      videos = dbOperations.getAllVideos();
    }

    // 转换为前端格式
    const result = videos.map(v => {
      // 获取所有帧数据
      let allFrames = dbOperations.getFramesByVideoId(v.id);
      const thumbnailFrames = [];
      const frameAnalyses = [];
      
      // 降级方案：如果数据库没有帧数据，直接从文件系统读取
      if (allFrames.length === 0) {
        const frameDir = join(FRAMES_DIR, v.id);
        if (existsSync(frameDir)) {
          try {
            const files = readdirSync(frameDir);
            const jpgFiles = files.filter(f => f.endsWith('.jpg')).sort();
            
            // 构造虚拟帧数据（假设每2秒一帧）
            allFrames = jpgFiles.map((fileName, index) => ({
              frame_path: fileName,
              timestamp: index * 2,
              keywords_en: '[]',
              keywords_cn: '[]',
              expanded_keywords_en: '[]',
              expanded_keywords_cn: '[]'
            }));
          } catch (err) {
            console.error(`读取帧目录失败 ${v.id}:`, err.message);
          }
        }
      }
      
      if (allFrames.length > 0) {
        // 选择第1、中间1/3、中间2/3、最后一帧用于缩略图
        const thumbnailIndices = [
          0,
          Math.floor(allFrames.length / 3),
          Math.floor(allFrames.length * 2 / 3),
          allFrames.length - 1
        ];
        
        for (const idx of thumbnailIndices) {
          const frame = allFrames[idx];
          if (frame && frame.frame_path) {
            const frameName = frame.frame_path.split('/').pop().split('\\').pop();
            thumbnailFrames.push(`/frames/${v.id}/${frameName}`);
          }
        }
        
        // 转换所有帧分析数据(包含关键词)
        allFrames.forEach(f => {
          frameAnalyses.push({
            timestamp: f.timestamp,
            personDescription: { en: '', cn: '' }, // 列表视图不需要描述
            clothingDescription: { en: '', cn: '' },
            actionDescription: { en: '', cn: '' },
            inferredBehavior: { en: '', cn: '' },
            keywords: {
              en: JSON.parse(f.keywords_en || '[]'),
              cn: JSON.parse(f.keywords_cn || '[]')
            },
            expandedKeywords: {
              en: JSON.parse(f.expanded_keywords_en || '[]'),
              cn: JSON.parse(f.expanded_keywords_cn || '[]')
            }
          });
        });
      }
      
      return {
        id: v.id,
        name: v.name,
        file_path: v.file_path, // 返回实际文件路径(用于播放)
        analysis: {
          overallSummary: {
            en: v.overall_summary_en || '',
            cn: v.overall_summary_cn || ''
          },
          frameAnalyses // 返回包含关键词的帧数据
        },
        frames: thumbnailFrames
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/videos/context
 * 获取所有视频的详细上下文数据(用于聊天助手)
 * 注意: 必须在 /api/videos/:id 之前定义,否则 context 会被当作 id
 */
app.get('/api/videos/context', (req, res) => {
  try {
    const { search } = req.query;
    
    let videos;
    if (search) {
      const searchPattern = `%${search}%`;
      videos = dbOperations.searchVideos(
        searchPattern, searchPattern, searchPattern,
        searchPattern, searchPattern, searchPattern, searchPattern
      );
    } else {
      videos = dbOperations.getAllVideos();
    }

    // 返回包含完整数据的视频信息
    const result = videos.map(v => {
      const frames = dbOperations.getFramesByVideoId(v.id);
      
      return {
        id: v.id,
        name: v.name,
        overall_summary_en: v.overall_summary_en || '',
        overall_summary_cn: v.overall_summary_cn || '',
        frames: frames.map(f => {
          // 安全处理关键词字段，确保返回有效的JSON字符串
          const safeJsonField = (field) => {
            if (!field || field === 'null' || field.trim() === '') return '[]';
            try {
              // 验证是否为有效JSON
              JSON.parse(field);
              return field;
            } catch (e) {
              return '[]';
            }
          };
          
          return {
            id: f.id,
            timestamp: f.timestamp,
            action_description_en: f.action_description_en || '',
            action_description_cn: f.action_description_cn || '',
            keywords_en: safeJsonField(f.keywords_en),
            keywords_cn: safeJsonField(f.keywords_cn),
            expanded_keywords_en: safeJsonField(f.expanded_keywords_en),
            expanded_keywords_cn: safeJsonField(f.expanded_keywords_cn)
          };
        })
      };
    });

    console.log(`[API] Returning context for ${result.length} videos`);
    res.json(result);
  } catch (error) {
    console.error('Error fetching video context:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/videos/:id
 * 获取单个视频的完整信息
 */
app.get('/api/videos/:id', (req, res) => {
  try {
    const { id } = req.params;
    const video = dbOperations.getVideoById(id);
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    let frames = dbOperations.getFramesByVideoId(id);

    // 降级方案：如果数据库没有帧数据，直接从文件系统读取
    if (frames.length === 0) {
      const frameDir = join(FRAMES_DIR, id);
      if (existsSync(frameDir)) {
        try {
          const files = readdirSync(frameDir);
          const jpgFiles = files.filter(f => f.endsWith('.jpg')).sort();
          
          // 构造虚拟帧数据（假设每2秒一帧）
          frames = jpgFiles.map((fileName, index) => ({
            frame_path: fileName,
            timestamp: index * 2,
            person_description_en: '',
            person_description_cn: '',
            clothing_description_en: '',
            clothing_description_cn: '',
            action_description_en: '',
            action_description_cn: '',
            inferred_behavior_en: '',
            inferred_behavior_cn: '',
            keywords_en: '[]',
            keywords_cn: '[]',
            expanded_keywords_en: '[]',
            expanded_keywords_cn: '[]'
          }));
        } catch (err) {
          console.error(`读取帧目录失败 ${id}:`, err.message);
        }
      }
    }

    // 转换为前端格式
    const result = {
      id: video.id,
      name: video.name,
      file_path: video.file_path, // 返回文件名,前端会拼接完整路径
      analysis: {
        overallSummary: {
          en: video.overall_summary_en || '',
          cn: video.overall_summary_cn || ''
        },
        frameAnalyses: frames.map(f => ({
          timestamp: f.timestamp,
          personDescription: {
            en: f.person_description_en || '',
            cn: f.person_description_cn || ''
          },
          clothingDescription: {
            en: f.clothing_description_en || '',
            cn: f.clothing_description_cn || ''
          },
          actionDescription: {
            en: f.action_description_en || '',
            cn: f.action_description_cn || ''
          },
          inferredBehavior: {
            en: f.inferred_behavior_en || '',
            cn: f.inferred_behavior_cn || ''
          },
          keywords: {
            en: JSON.parse(f.keywords_en || '[]'),
            cn: JSON.parse(f.keywords_cn || '[]')
          },
          expandedKeywords: {
            en: JSON.parse(f.expanded_keywords_en || '[]'),
            cn: JSON.parse(f.expanded_keywords_cn || '[]')
          }
        }))
      },
      frames: frames.map(f => {
        const frameName = f.frame_path.split('/').pop().split('\\').pop();
        return `/frames/${id}/${frameName}`;
      })
    };

    res.json(result);
  } catch (error) {
    console.error('Error fetching video:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/videos/check-hash
 * 检查文件哈希值是否已存在（秒传功能）
 */
app.post('/api/videos/check-hash', async (req, res) => {
  try {
    const { fileHash, fileName, fileSize } = req.body;
    
    if (!fileHash) {
      return res.status(400).json({ error: 'File hash is required' });
    }
    
    // 查找是否存在相同哈希的视频
    const existingVideo = dbOperations.getVideoByHash(fileHash);
    
    if (existingVideo) {
      console.log(`[Hash Check] File already exists: ${fileHash}, video ID: ${existingVideo.id}`);
      
      // 获取该视频的帧数据
      const frames = dbOperations.getFramesByVideoId(existingVideo.id);
      
      res.json({
        exists: true,
        videoId: existingVideo.id,
        videoName: existingVideo.name,
        frameCount: frames.length,
        message: 'File already exists, instant upload completed'
      });
    } else {
      console.log(`[Hash Check] File not found: ${fileHash}, upload required`);
      res.json({
        exists: false,
        message: 'File does not exist, please proceed with upload'
      });
    }
  } catch (error) {
    console.error('[Hash Check] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/videos/check-bilibili/:bvid
 * 检查B站视频是否已存在
 */
app.get('/api/videos/check-bilibili/:bvid', (req, res) => {
  try {
    const { bvid } = req.params;
    
    // 从video表中查询是否存在该BVID
    // 检查数据库是否有bilibili_bvid字段
    let video = null;
    try {
      const stmt = dbOperations.db.prepare('SELECT id, name, file_hash FROM videos WHERE bilibili_bvid = ?');
      video = stmt.get(bvid);
    } catch (dbError) {
      // 字段不存在，返回不存在
      console.warn('[Bilibili Check] bilibili_bvid column does not exist:', dbError.message);
      return res.json({ exists: false });
    }
    
    if (video) {
      res.json({
        exists: true,
        video: {
          video_id: video.id,
          name: video.name,
          file_hash: video.file_hash
        }
      });
    } else {
      res.json({ exists: false });
    }
  } catch (error) {
    console.error('Error checking bilibili video:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/videos/upload
 * 上传视频文件
 */
app.post('/api/videos/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    const videoId = uuidv4();
    
    // 获取视频标题 - 优先使用body.title（B站下载的中文标题）
    const titleFromForm = req.body.title;
    const originalFilename = req.body.original_filename || req.file.originalname;
    
    // 确保标题正确解码（处理可能的编码问题）
    let videoName;
    if (titleFromForm && titleFromForm.trim()) {
      // 如果title存在，使用它作为视频名称
      videoName = Buffer.from(titleFromForm, 'utf-8').toString('utf-8');
      console.log(`[Upload] Using title from form: ${videoName}`);
    } else if (originalFilename) {
      // 否则使用原始文件名（去掉扩展名）
      videoName = originalFilename.replace(/\.[^/.]+$/, '');
      console.log(`[Upload] Using original filename: ${videoName}`);
    } else {
      // 最后使用UUID
      videoName = videoId;
      console.log(`[Upload] Using video ID as name: ${videoName}`);
    }
    
    const uploadedPath = req.file.path;
    const fileSize = req.file.size;
    const bvid = req.body.bvid || null;  // 获取B站BVID（可选）
    const skipAnalysis = req.body.skip_analysis === 'true';  // 是否跳过字幕生成

    console.log(`[Upload] Video name: ${videoName}`);
    console.log(`[Upload] BVID: ${bvid || 'N/A'}`);
    console.log(`[Upload] File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`[Upload] Uploaded file: ${req.file.filename}`);

    // 计算文件哈希值
    console.log(`[Upload] Calculating file hash for ${videoName}...`);
    const fileHash = await calculateFileHash(uploadedPath);
    console.log(`[Upload] File hash: ${fileHash}`);

    // 服务端去重：如果哈希已存在，则删除临时上传并直接返回已有视频信息
    const existingByHash = dbOperations.getVideoByHash(fileHash);
    if (existingByHash) {
      console.log(`[Upload] Duplicate upload detected by hash, videoId=${existingByHash.id}`);
      await unlink(uploadedPath).catch(() => {});
      
      // 检查是否已有字幕
      const subtitles = dbOperations.getSubtitlesByVideoId(existingByHash.id);
      const frames = dbOperations.getFramesByVideoId(existingByHash.id);
      
      if (subtitles.length === 0) {
        console.log(`[Upload] ⚠️  Duplicate video found but no subtitles, generating now...`);
        // 获取原视频路径
        const videoDir = join(VIDEOS_DIR, existingByHash.id);
        const videoFiles = await readdir(videoDir).catch(() => []);
        const videoFile = videoFiles.find(f => /\.(mp4|mov|mkv|webm|avi)$/i.test(f));
        
        if (videoFile) {
          const existingVideoPath = join(videoDir, videoFile);
          console.log(`[Upload] Starting subtitle generation for existing video ${existingByHash.id}...`);
          
          // 异步生成字幕
          processVideoSubtitles(existingVideoPath, existingByHash.id)
            .then(result => {
              console.log(`[Upload] ✅ Subtitles generated for duplicate video ${existingByHash.id}`);
              
              // 保存字幕 - 增强错误处理
              try {
                console.log(`[Upload] Saving subtitles for duplicate video...`);
                
                dbOperations.saveSubtitle(
                  existingByHash.id,
                  'zh',
                  'srt',
                  result.srt,
                  JSON.stringify(result.transcription),
                  result.duration,
                  result.segmentCount
                );
                
                dbOperations.saveSubtitle(
                  existingByHash.id,
                  'zh',
                  'vtt',
                  result.vtt,
                  JSON.stringify(result.transcription),
                  result.duration,
                  result.segmentCount
                );
                
                console.log(`[Upload] ✅ Subtitles saved for duplicate video ${existingByHash.id}`);
                sseManager.notifySubtitleComplete(existingByHash.id, result);
                
              } catch (saveError) {
                console.error(`[Upload] ❌ Failed to save subtitles for duplicate:`, saveError);
                // 即使保存失败也通知前端
                sseManager.notifySubtitleComplete(existingByHash.id, {
                  ...result,
                  warning: `Database save failed: ${saveError.message}`
                });
              }
            })
            .catch(err => {
              console.error(`[Upload] ❌ Failed to generate subtitles for duplicate: ${err.message}`);
              sseManager.notifySubtitleError(existingByHash.id, err.message);
            });
        }
      } else {
        console.log(`[Upload] Duplicate video already has subtitles: ${subtitles.length} found`);
      }
      
      return res.json({
        videoId: existingByHash.id,
        videoName: existingByHash.name,
        framesData: [],
        frameCount: frames.length,
        fileHash: existingByHash.file_hash,
        fileSize: existingByHash.file_size,
        deduped: true,
        hasSubtitles: subtitles.length > 0
      });
    }

    // 创建视频专属目录
    const videoDir = join(VIDEOS_DIR, videoId);
    const frameDir = join(FRAMES_DIR, videoId);
    await mkdir(videoDir, { recursive: true });
    await mkdir(frameDir, { recursive: true });

    // 移动视频文件到最终位置
    // 使用安全的文件名（避免中文编码问题）：{videoId}.mp4
    const ext = req.file.filename.split('.').pop() || 'mp4';
    const safeFilename = `${videoId}.${ext}`;
    const finalVideoPath = join(videoDir, safeFilename);
    const { rename, stat } = await import('fs/promises');
    await rename(uploadedPath, finalVideoPath);

    // 提前写入视频主记录，避免后续流程失败导致数据库缺失（影响秒传）
    try {
      // name使用中文标题，file_path使用安全的文件名
      dbOperations.saveOrUpdateVideo(videoId, videoName, safeFilename, fileHash, fileSize, bvid);
      console.log(`[Upload] Video record persisted: ${videoId}`);
      console.log(`[Upload] - Name (display): ${videoName}`);
      console.log(`[Upload] - File (storage): ${safeFilename}`);
    } catch (e) {
      console.warn(`[Upload] Failed to persist video record early: ${e.message}`);
    }

    // 1. 生成中文字幕（异步，不阻塞帧提取）
    const isFromBilibili = bvid && bvid.length > 0;
    
    if (!skipAnalysis) {
      console.log(`[Upload] Starting subtitle generation for video ${videoId}...`);
      processVideoSubtitles(finalVideoPath, videoId)
      .then(result => {
        console.log(`[Upload] ===== Subtitle Generation Success =====`);
        console.log(`[Upload] Video ID: ${videoId}`);
        console.log(`[Upload] Segments: ${result.segmentCount}`);
        console.log(`[Upload] Duration: ${result.duration}s`);
        console.log(`[Upload] Language: ${result.language}`);
        console.log(`[Upload] Processing time: ${result.processingTime}s`);
        console.log(`[Upload] First 3 segments:`);
        if (result.transcription && result.transcription.segments) {
          result.transcription.segments.slice(0, 3).forEach((seg, i) => {
            console.log(`  [${i+1}] ${seg.start.toFixed(2)}s - ${seg.end.toFixed(2)}s: ${seg.text.substring(0, 50)}...`);
          });
        }
        
        // 保存字幕到数据库 - 增强错误处理
        console.log(`[Upload] Saving subtitles to database...`);
        
        try {
          // 保存SRT格式
          console.log(`[Upload] Saving SRT format...`);
          dbOperations.saveSubtitle(
            videoId,
            'zh',
            'srt',
            result.srt,
            JSON.stringify(result.transcription),
            result.duration,
            result.segmentCount
          );
          
          // 保存VTT格式
          console.log(`[Upload] Saving VTT format...`);
          dbOperations.saveSubtitle(
            videoId,
            'zh',
            'vtt',
            result.vtt,
            JSON.stringify(result.transcription),
            result.duration,
            result.segmentCount
          );
          
                console.log(`[Upload] ✅ Subtitles saved successfully for ${videoId}`);
                console.log(`[Upload] =========================================`);
                
                // 通过 SSE 推送字幕生成完成事件
                sseManager.notifySubtitleComplete(videoId, result);
                
                // 如果是B站视频，自动触发AI分析
                if (isFromBilibili) {
                  console.log(`[Upload] 🎬 B站视频检测，启动自动AI分析...`);
                  analyzeBiliVideo(finalVideoPath, videoId, videoName, bvid)
                    .then(analysisResult => {
                      console.log(`[Upload] ✅ B站视频分析完成: ${analysisResult.frameCount} frames`);
                    })
                    .catch(analysisError => {
                      console.error(`[Upload] ❌ B站视频分析失败: ${analysisError.message}`);
                    });
                }
          
        } catch (saveError) {
          console.error(`[Upload] ❌ Failed to save subtitles to database:`, saveError);
          console.error(`[Upload] VideoId: ${videoId}`);
          console.error(`[Upload] SRT length: ${result.srt?.length}, VTT length: ${result.vtt?.length}`);
          
          // 即使保存失败，也通知前端完成（并附带警告）
          sseManager.notifySubtitleComplete(videoId, {
            ...result,
            warning: `Subtitles generated but database save failed: ${saveError.message}`
          });
        }
      })
      .catch(err => {
        console.error(`[Upload] ❌ Subtitle generation failed for ${videoId}:`, err.message);
        console.error(`[Upload] Error stack:`, err.stack);
        
        // 通过 SSE 推送错误通知
        sseManager.notifySubtitleError(videoId, err.message);
      });
    } else {
      console.log(`[Upload] Skipping subtitle generation (skip_analysis=true)`);
    }

    // 2. 提取帧
    console.log(`[Upload] Extracting frames from video ${videoId}...`);
    let framePaths = [];
    try {
      const extractedFrames = await extractFrames(finalVideoPath, frameDir, 0.5);
      
      // 验证并过滤实际存在的帧
      for (const framePath of extractedFrames) {
        if (existsSync(framePath)) {
          framePaths.push(framePath);
        }
      }

      if (framePaths.length === 0) {
        throw new Error('No frames were extracted from the video');
      }
    } catch (error) {
      console.error('[Upload] Frame extraction failed:', error);
      // 清理已创建的目录
      await rm(videoDir, { recursive: true, force: true });
      await rm(frameDir, { recursive: true, force: true });
      return res.status(500).json({ error: `Frame extraction failed: ${error.message}` });
    }

    // 准备帧数据（转为base64供AI分析）
    const framesData = [];
    const duration = await getVideoDuration(finalVideoPath).catch(() => framePaths.length * 2);
    
    for (let i = 0; i < framePaths.length; i++) {
      const base64Data = await imageToBase64(framePaths[i]);
      if (base64Data) {
        framesData.push({
          timestamp: i * 2, // 假设每2秒一帧
          base64Data
        });
      }
    }

    console.log(`[Upload] Video uploaded successfully: ${videoId}, frames: ${framesData.length}`);
    res.json({
      videoId,
      videoName,
      framesData,
      frameCount: framesData.length,
      fileHash,
      fileSize
    });
  } catch (error) {
    console.error('[Upload] Error uploading video:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/videos/:id/analysis
 * 保存视频分析结果
 */
app.post('/api/videos/:id/analysis', async (req, res) => {
  try {
    const { id: videoId } = req.params;
    const { videoName, analysis, frames, fileHash, fileSize } = req.body;

    if (!videoName || !analysis) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 保存帧图片（如果是base64格式）
    const frameDir = join(FRAMES_DIR, videoId);
    await mkdir(frameDir, { recursive: true });
    
    const framePaths = [];
    if (frames && Array.isArray(frames)) {
      for (let i = 0; i < frames.length; i++) {
        const frameName = `frame_${String(i + 1).padStart(4, '0')}.jpg`;
        const framePath = join(frameDir, frameName);
        
        // 如果frames包含base64数据，保存它
        if (typeof frames[i] === 'string' && frames[i].startsWith('data:image')) {
          const { saveBase64Image } = await import('./videoProcessor.js');
          await saveBase64Image(frames[i], framePath);
        }
        
        framePaths.push(frameName);
      }
    } else {
      // 使用已提取的帧
      const existingFrames = await readdir(frameDir);
      framePaths.push(...existingFrames.filter(f => f.endsWith('.jpg')));
    }

    // 获取视频文件路径
    const videoDir = join(VIDEOS_DIR, videoId);
    let videoFilePath = videoName;
    
    // 检查视频目录是否存在
    try {
      if (existsSync(videoDir)) {
        const videoFiles = await readdir(videoDir);
        videoFilePath = videoFiles.length > 0 ? videoFiles[0] : videoName;
      } else {
        console.warn(`[SaveAnalysis] Video directory not found: ${videoDir}`);
        console.warn('[SaveAnalysis] This video was processed on frontend only, saving metadata only');
      }
    } catch (error) {
      console.warn(`[SaveAnalysis] Error reading video directory: ${error.message}`);
    }

    // 保存到数据库
    saveCompleteAnalysis(videoId, videoName, videoFilePath, analysis, framePaths, fileHash, fileSize);

    res.json({ 
      success: true,
      videoId,
      message: 'Analysis saved successfully' 
    });
  } catch (error) {
    console.error('Error saving analysis:', error);
    res.status(500).json({ error: error.message });
  }
});


/**
 * DELETE /api/videos/:id
 * 删除视频及其所有数据
 */
app.delete('/api/videos/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 从数据库删除
    dbOperations.deleteVideo.run(id);

    // 删除文件
    const videoDir = join(VIDEOS_DIR, id);
    const frameDir = join(FRAMES_DIR, id);
    
    await rm(videoDir, { recursive: true, force: true }).catch(e => console.error(e));
    await rm(frameDir, { recursive: true, force: true }).catch(e => console.error(e));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting video:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/health
 * 健康检查
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ 对话管理 API ============

/**
 * GET /api/conversations
 * 获取所有对话列表
 */
app.get('/api/conversations', (req, res) => {
  try {
    const conversations = dbOperations.getAllConversations();
    res.json(conversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/conversations/:id
 * 获取单个对话和其消息
 */
app.get('/api/conversations/:id', (req, res) => {
  try {
    const { id } = req.params;
    const conversation = dbOperations.getConversationById(id);
    
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    const messages = dbOperations.getMessagesByConversationId(id);
    
    res.json({
      ...conversation,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        created_at: m.created_at
      }))
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/conversations
 * 创建或更新对话
 */
app.post('/api/conversations', (req, res) => {
  try {
    const { id, title, provider } = req.body;
    
    if (!id || !provider) {
      return res.status(400).json({ error: 'Missing required fields: id, provider' });
    }
    
    dbOperations.saveConversation(id, title || 'New Conversation', provider);
    
    res.json({ success: true, id });
  } catch (error) {
    console.error('Error saving conversation:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/conversations/:id/messages
 * 添加消息到对话
 */
app.post('/api/conversations/:id/messages', (req, res) => {
  try {
    const { id } = req.params;
    const { role, content } = req.body;
    
    if (!role || !content) {
      return res.status(400).json({ error: 'Missing required fields: role, content' });
    }
    
    // 检查对话是否存在
    const conversation = dbOperations.getConversationById(id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    dbOperations.saveMessage(id, role, content);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving message:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/conversations/:id
 * 删除对话
 */
app.delete('/api/conversations/:id', (req, res) => {
  try {
    const { id } = req.params;
    dbOperations.deleteConversation(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/conversations/:id/messages
 * 清空对话消息
 */
app.delete('/api/conversations/:id/messages', (req, res) => {
  try {
    const { id } = req.params;
    dbOperations.clearConversationMessages(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing messages:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/videos/generate-titles
 * 手动触发标题生成（可从前端传递 OpenAI 兼容配置）
 */
app.post('/api/videos/generate-titles', async (req, res) => {
  try {
    const { apiKey: bodyKey, baseUrl: bodyBase, model: bodyModel, maxConcurrent } = req.body || {};

    const titleGenConfig = {
      apiKey: (bodyKey || process.env.OPENAI_API_KEY || '').trim(),
      baseUrl: (bodyBase || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').trim(),
      model: (bodyModel || process.env.OPENAI_MODEL || 'gpt-4o').trim(),
      maxConcurrent: Math.max(1, Math.min(5, Number(maxConcurrent) || 3))
    };
    
    if (!titleGenConfig.apiKey) {
      return res.status(400).json({ 
        error: 'API key missing',
        message: 'Provide apiKey in request body or set OPENAI_API_KEY in server/.env'
      });
    }
    
    console.log('[API] Manual title generation triggered');
    console.log('[API] Using model:', titleGenConfig.model);
    console.log('[API] Base URL:', titleGenConfig.baseUrl);
    
    // 异步执行，立即返回响应
    processVideosOnStartup(titleGenConfig).catch(err => {
      console.error('[API] Title generation failed:', err);
    });
    
    res.json({ 
      success: true, 
      message: 'Title generation started. Check server logs for progress.',
      config: {
        model: titleGenConfig.model,
        baseUrl: titleGenConfig.baseUrl
      }
    });
  } catch (error) {
    console.error('Error triggering title generation:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/transcribe
 * 上传视频/音频并生成字幕
 */
app.post('/api/transcribe', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    const { videoId } = req.body;
    const videoPath = req.file.path;

    console.log(`[Subtitle API] Processing Chinese transcription for ${videoId || 'new video'}`);

    // 处理字幕（仅中文）
    const result = await processVideoSubtitles(videoPath, videoId || uuidv4());

    // 如果提供了videoId，保存到数据库
    if (videoId) {
      dbOperations.saveSubtitle(
        videoId,
        'zh',  // 固定中文
        'srt',
        result.srt,
        JSON.stringify(result.transcription),
        result.duration,
        result.segmentCount
      );
      dbOperations.saveSubtitle(
        videoId,
        'zh',  // 固定中文
        'vtt',
        result.vtt,
        JSON.stringify(result.transcription),
        result.duration,
        result.segmentCount
      );
    }

    // 清理上传的临时文件
    if (!videoId) {
      await unlink(videoPath).catch(() => {});
    }

    res.json({
      success: true,
      videoId: videoId,
      language: result.language,
      duration: result.duration,
      segmentCount: result.segmentCount,
      srt: result.srt,
      vtt: result.vtt,
      transcription: result.transcription
    });
  } catch (error) {
    console.error('[Subtitle API] Transcription error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/subtitles/:videoId
 * 获取视频的所有字幕
 */
app.get('/api/subtitles/:videoId', (req, res) => {
  try {
    const { videoId } = req.params;
    const subtitles = dbOperations.getSubtitlesByVideoId(videoId);
    
    res.json({
      success: true,
      subtitles: subtitles.map(sub => ({
        id: sub.id,
        language: sub.language,
        format: sub.format,
        duration: sub.duration,
        segmentCount: sub.segment_count,
        createdAt: sub.created_at
      }))
    });
  } catch (error) {
    console.error('[Subtitle API] Get subtitles error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/subtitles/:videoId/:language/:format
 * 获取特定格式的字幕内容
 */
app.get('/api/subtitles/:videoId/:language/:format', (req, res) => {
  try {
    const { videoId, language, format } = req.params;
    const subtitle = dbOperations.getSubtitle(videoId, language, format);
    
    if (!subtitle) {
      return res.status(404).json({ error: 'Subtitle not found' });
    }

    // 设置正确的 Content-Type
    if (format === 'srt') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    } else if (format === 'vtt') {
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    }

    res.send(subtitle.content);
  } catch (error) {
    console.error('[Subtitle API] Get subtitle content error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/subtitles/:videoId/status
 * 检查字幕是否已生成完成
 */
app.get('/api/subtitles/:videoId/status', (req, res) => {
  try {
    const { videoId } = req.params;
    const subtitles = dbOperations.getSubtitlesByVideoId(videoId);
    
    const isReady = subtitles.length > 0;
    const segmentCount = isReady ? subtitles[0].segment_count : 0;
    
    // 区分三种状态：
    // 1. 处理中 (length === 0)
    // 2. 已完成但无内容 (length > 0 && segmentCount === 0)
    // 3. 已完成且有内容 (length > 0 && segmentCount > 0)
    const status = !isReady ? 'processing' : 
                   (segmentCount === 0 ? 'completed_empty' : 'completed');
    
    res.json({
      success: true,
      ready: isReady,  // 只要数据库有记录就认为完成
      segmentCount,
      status,
      message: isReady ? 
        (segmentCount === 0 ? 'Subtitles generated but no speech detected' : 'Subtitles are ready') : 
        'Subtitles are being generated'
    });
  } catch (error) {
    console.error('[Subtitle API] Status check error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/subtitles/:videoId/debug
 * 获取字幕详细信息（调试用）
 */
app.get('/api/subtitles/:videoId/debug', (req, res) => {
  try {
    const { videoId } = req.params;
    
    // 获取所有字幕
    const subtitles = dbOperations.getSubtitlesByVideoId(videoId);
    
    if (subtitles.length === 0) {
      return res.json({
        success: false,
        message: 'No subtitles found for this video',
        videoId
      });
    }
    
    // 解析字幕数据
    const result = subtitles.map(sub => {
      let transcription = null;
      try {
        transcription = JSON.parse(sub.transcription_data);
      } catch (e) {
        console.error('[Debug] Failed to parse transcription data:', e);
      }
      
      return {
        id: sub.id,
        language: sub.language,
        format: sub.format,
        duration: sub.duration,
        segmentCount: sub.segment_count,
        createdAt: sub.created_at,
        firstSegments: transcription?.segments?.slice(0, 5).map(s => ({
          start: s.start,
          end: s.end,
          text: s.text
        })) || [],
        srtPreview: sub.content.substring(0, 500) + '...'
      };
    });
    
    res.json({
      success: true,
      videoId,
      subtitles: result
    });
  } catch (error) {
    console.error('[Debug API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/bili/image-proxy
 * B站图片代理，绕过防盗链
 */
app.get('/api/bili/image-proxy', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    const https = await import('https');
    const http = await import('http');
    const { URL } = await import('url');
    
    const imageUrl = new URL(url);
    const protocol = imageUrl.protocol === 'https:' ? https : http;
    
    protocol.get(url, {
      headers: {
        'Referer': 'https://www.bilibili.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }, (imageRes) => {
      res.setHeader('Content-Type', imageRes.headers['content-type'] || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      imageRes.pipe(res);
    }).on('error', (err) => {
      console.error('[Image Proxy] Error:', err);
      res.status(500).json({ error: 'Failed to fetch image' });
    });
  } catch (error) {
    console.error('[Image Proxy] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/subtitles/:videoId/events
 * SSE 端点：客户端订阅字幕生成事件
 */
app.get('/api/subtitles/:videoId/events', (req, res) => {
  const { videoId } = req.params;
  
  console.log(`[SSE] Client connecting to subscribe events for video ${videoId}`);
  
  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // 发送初始连接确认
  res.write(`event: connected\ndata: ${JSON.stringify({ videoId, timestamp: new Date().toISOString() })}\n\n`);
  
  // 注册到 SSE 管理器
  sseManager.addConnection(videoId, res);
  
  // 客户端断开时的清理已在 sseManager 中处理
});

/**
 * POST /api/subtitles/:videoId/query
 * 根据时间戳查询相关字幕
 */
app.post('/api/subtitles/:videoId/query', (req, res) => {
  try {
    const { videoId } = req.params;
    const { timestamp, contextWindow = 5 } = req.body;  // 移除 language 参数

    if (timestamp === undefined) {
      return res.status(400).json({ error: 'Timestamp is required' });
    }

    // 获取字幕数据（固定中文）
    const subtitle = dbOperations.getSubtitle(videoId, 'zh', 'srt');
    if (!subtitle || !subtitle.transcription_data) {
      return res.json({ success: true, subtitles: [] });
    }

    const transcription = JSON.parse(subtitle.transcription_data);
    const subtitles = getSubtitlesAtTimestamp(transcription, timestamp, contextWindow);

    res.json({
      success: true,
      timestamp,
      contextWindow,
      subtitles
    });
  } catch (error) {
    console.error('[Subtitle API] Query subtitles error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 启动服务器
async function reconcileOrphanVideos() {
  try {
    console.log('[Reconcile] Scanning for orphan videos on disk...');
    const videoDirs = await readdir(VIDEOS_DIR).catch(() => []);
    for (const vid of videoDirs) {
      const dirPath = join(VIDEOS_DIR, vid);
      try {
        const st = await stat(dirPath);
        if (!st.isDirectory()) continue;
        // 如果数据库没有该视频记录，或缺少哈希，进行补全
        const existing = dbOperations.getVideoById(vid);
        const files = await readdir(dirPath);
        const videoFile = files.find(f => /\.(mp4|mov|mkv|webm|avi)$/i.test(f));
        if (!videoFile) continue;
        const filePath = join(dirPath, videoFile);
        const fileSt = await stat(filePath);
        const fileSize = fileSt.size;

        // 若无记录或无哈希，计算并写入
        if (!existing || !existing.file_hash) {
          const hash = await calculateFileHash(filePath).catch(() => null);
          dbOperations.saveOrUpdateVideo(vid, existing?.name || videoFile, videoFile, hash, fileSize);
          console.log(`[Reconcile] Upserted video ${vid} (hash=${hash?.slice(0,16) || 'n/a'})`);
        }
      } catch (e) {
        console.warn(`[Reconcile] Skip ${vid}: ${e.message}`);
      }
    }
    console.log('[Reconcile] Completed scanning.');
  } catch (err) {
    console.warn('[Reconcile] Failed:', err.message);
  }
}

app.listen(PORT, async () => {
  console.log(`
╔═══════════════════════════════════════╗
║   anaVIDEO Server Running             ║
║   Port: ${PORT}                        ║
║   Storage: ${STORAGE_DIR}             ║
╚═══════════════════════════════════════╝
  `);
  
  // 启动时自动为默认标题的视频生成标题
  // 从环境变量读取 API 配置
  const titleGenConfig = {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    maxConcurrent: 3
  };
  
  if (titleGenConfig.apiKey) {
    console.log('[Server] Starting title generation for videos with default names...');
    // 延迟启动,避免影响服务器启动
    setTimeout(() => {
      processVideosOnStartup(titleGenConfig).catch(err => {
        console.error('[Server] Title generation failed:', err);
      });
    }, 5000); // 5秒后启动
  } else {
    console.log('[Server] No OPENAI_API_KEY found, skipping automatic title generation');
    console.log('[Server] Set OPENAI_API_KEY, OPENAI_BASE_URL, and OPENAI_MODEL env vars to enable title generation');
  }

  // 启动后后台自愈：扫描磁盘与数据库差异，补全缺失记录与哈希值
  setTimeout(() => {
    reconcileOrphanVideos().catch(() => {});
  }, 8000);
});
