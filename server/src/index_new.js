import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdir, readdir, rm, rename } from 'fs/promises';
import { existsSync } from 'fs';
import { dbOperations, saveCompleteAnalysis } from './db.js';
import { extractFrames, imageToBase64, getVideoDuration, saveBase64Image } from './videoProcessor.js';
import taskQueue from './taskQueue.js';

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
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// 静态文件服务
app.use('/videos', express.static(VIDEOS_DIR));
app.use('/frames', express.static(FRAMES_DIR));

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }
});

// ============ API 路由 ============

/**
 * GET /api/health
 */
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    taskQueue: taskQueue.getStats()
  });
});

/**
 * GET /api/videos
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

    const result = videos.map(v => {
      const allFrames = dbOperations.getFramesByVideoId(v.id);
      const thumbnailFrames = [];
      const frameAnalyses = [];
      
      if (allFrames.length > 0) {
        const thumbnailIndices = [0, Math.floor(allFrames.length / 3), Math.floor(allFrames.length * 2 / 3), allFrames.length - 1];
        for (const idx of thumbnailIndices) {
          const frame = allFrames[idx];
          if (frame && frame.frame_path) {
            thumbnailFrames.push(`/frames/${v.id}/${frame.frame_path.split('/').pop()}`);
          }
        }
        
        allFrames.forEach(f => {
          frameAnalyses.push({
            timestamp: f.timestamp,
            personDescription: { en: '', cn: '' },
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
        analysis: {
          overallSummary: {
            en: v.overall_summary_en || '',
            cn: v.overall_summary_cn || ''
          },
          frameAnalyses
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
 * GET /api/videos/:id
 */
app.get('/api/videos/:id', (req, res) => {
  try {
    const { id } = req.params;
    const video = dbOperations.getVideoById(id);
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const frames = dbOperations.getFramesByVideoId(id);

    const result = {
      id: video.id,
      name: video.name,
      file_path: `/videos/${video.id}/${video.name}`,
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
      frames: frames.map(f => `/frames/${id}/${f.frame_path.split('/').pop()}`)
    };

    res.json(result);
  } catch (error) {
    console.error('Error fetching video:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/videos/upload (异步任务)
 */
app.post('/api/videos/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    const videoId = uuidv4();
    const videoName = req.file.originalname;
    const uploadedPath = req.file.path;
    
    // 添加到任务队列
    const taskId = taskQueue.addTask(
      async (progressCallback) => {
        const videoDir = join(VIDEOS_DIR, videoId);
        const frameDir = join(FRAMES_DIR, videoId);
        await mkdir(videoDir, { recursive: true });
        await mkdir(frameDir, { recursive: true });

        progressCallback(20);

        const finalVideoPath = join(videoDir, videoName);
        await rename(uploadedPath, finalVideoPath);

        progressCallback(40);

        const extractedFrames = await extractFrames(finalVideoPath, frameDir, 0.5);
        const framePaths = extractedFrames.filter(existsSync);

        if (framePaths.length === 0) {
          await rm(videoDir, { recursive: true, force: true });
          await rm(frameDir, { recursive: true, force: true });
          throw new Error('No frames extracted');
        }

        progressCallback(70);

        const framesData = [];
        for (let i = 0; i < framePaths.length; i++) {
          const base64Data = await imageToBase64(framePaths[i]);
          if (base64Data) {
            framesData.push({ timestamp: i * 2, base64Data });
          }
        }

        progressCallback(100);

        return { videoId, videoName, framesData, frameCount: framesData.length };
      },
      { videoId, videoName, type: 'video_upload' },
      0 // 普通优先级
    );

    // 立即返回任务ID
    res.json({
      taskId,
      videoId,
      videoName,
      message: 'Video upload queued for processing'
    });

  } catch (error) {
    console.error('Error queuing video upload:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tasks/:taskId
 */
app.get('/api/tasks/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = taskQueue.getTaskStatus(taskId);
  
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json({
    id: task.id,
    status: task.status,
    progress: task.progress,
    metadata: task.metadata,
    result: task.result,
    error: task.error,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt
  });
});

/**
 * GET /api/tasks
 */
app.get('/api/tasks', (req, res) => {
  res.json(taskQueue.getAllTasksStatus());
});

/**
 * POST /api/tasks/:taskId/cancel
 */
app.post('/api/tasks/:taskId/cancel', (req, res) => {
  const { taskId } = req.params;
  const cancelled = taskQueue.cancelTask(taskId);
  
  if (cancelled) {
    res.json({ message: 'Task cancelled successfully' });
  } else {
    res.status(400).json({ error: 'Task cannot be cancelled (not in queue or already running)' });
  }
});

/**
 * POST /api/videos/:id/analysis
 */
app.post('/api/videos/:id/analysis', async (req, res) => {
  try {
    const { id: videoId } = req.params;
    const { videoName, analysis, frames } = req.body;

    if (!videoName || !analysis) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const frameDir = join(FRAMES_DIR, videoId);
    await mkdir(frameDir, { recursive: true });
    
    const framePaths = [];
    if (frames && Array.isArray(frames)) {
      for (let i = 0; i < frames.length; i++) {
        const frameName = `frame_${String(i + 1).padStart(4, '0')}.jpg`;
        const framePath = join(frameDir, frameName);
        
        if (typeof frames[i] === 'string' && frames[i].startsWith('data:image')) {
          await saveBase64Image(frames[i], framePath);
        }
        
        framePaths.push(frameName);
      }
    } else {
      const existingFrames = await readdir(frameDir);
      framePaths.push(...existingFrames.filter(f => f.endsWith('.jpg')));
    }

    const videoDir = join(VIDEOS_DIR, videoId);
    const videoFiles = await readdir(videoDir);
    const videoFilePath = videoFiles.length > 0 ? videoFiles[0] : videoName;

    saveCompleteAnalysis(videoId, videoName, videoFilePath, analysis, framePaths);

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
 */
app.delete('/api/videos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    dbOperations.deleteVideo(id);

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
 * PUT /api/config/concurrency
 */
app.put('/api/config/concurrency', (req, res) => {
  const { concurrency } = req.body;
  
  if (!concurrency || concurrency < 1 || concurrency > 10) {
    return res.status(400).json({ error: 'Concurrency must be between 1 and 10' });
  }

  taskQueue.setConcurrency(concurrency);
  res.json({ message: `Concurrency set to ${concurrency}`, stats: taskQueue.getStats() });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║   anaVIDEO Server Running             ║
║   Port: ${PORT}                        ║
║   Storage: ${STORAGE_DIR}             ║
║   Task Queue: ${taskQueue.concurrency} concurrent tasks   ║
╚═══════════════════════════════════════╝
  `);
});

// 任务队列事件监听
taskQueue.on('taskCompleted', (task) => {
  console.log(`✓ Task completed: ${task.metadata.videoName || task.id}`);
});

taskQueue.on('taskFailed', ({ task, error }) => {
  console.error(`✗ Task failed: ${task.metadata.videoName || task.id} - ${error.message}`);
});
