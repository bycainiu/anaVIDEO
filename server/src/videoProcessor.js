import { spawn } from 'child_process';
import { writeFile, mkdir } from 'fs/promises';
import { createReadStream } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 从视频中提取关键帧
 * @param {string} videoPath - 视频文件路径
 * @param {string} outputDir - 输出目录
 * @param {number} fps - 每秒提取的帧数（默认0.5，即每2秒一帧）
 * @returns {Promise<string[]>} - 提取的帧文件路径数组
 */
export async function extractFrames(videoPath, outputDir, fps = 0.5) {
  await mkdir(outputDir, { recursive: true });

  const outputPattern = join(outputDir, 'frame_%04d.jpg');

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', videoPath,
      '-vf', `fps=${fps}`,
      '-q:v', '2',
      outputPattern
    ]);

    let stderr = '';
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg failed: ${stderr}`));
      } else {
        // 解析输出的帧文件
        const frameRegex = /frame_(\d{4})\.jpg/g;
        const frames = [];
        let match;
        while ((match = frameRegex.exec(stderr)) !== null) {
          frames.push(join(outputDir, `frame_${match[1]}.jpg`));
        }
        
        // 如果从stderr无法获取，直接构造路径
        if (frames.length === 0) {
          // 估算帧数（假设最多120秒的视频）
          for (let i = 1; i <= 60; i++) {
            const framePath = join(outputDir, `frame_${String(i).padStart(4, '0')}.jpg`);
            frames.push(framePath);
          }
        }
        
        resolve(frames);
      }
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to start FFmpeg: ${err.message}`));
    });
  });
}

/**
 * 将图片文件转换为base64
 * @param {string} imagePath - 图片文件路径
 * @returns {Promise<string>} - base64编码的图片数据
 */
export async function imageToBase64(imagePath) {
  const { readFile } = await import('fs/promises');
  try {
    const buffer = await readFile(imagePath);
    return buffer.toString('base64');
  } catch (error) {
    console.error(`Failed to read image ${imagePath}:`, error);
    return '';
  }
}

/**
 * 获取视频时长
 * @param {string} videoPath - 视频文件路径
 * @returns {Promise<number>} - 视频时长（秒）
 */
export async function getVideoDuration(videoPath) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath
    ]);

    let stdout = '';
    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        reject(new Error('Failed to get video duration'));
      } else {
        resolve(parseFloat(stdout.trim()));
      }
    });

    ffprobe.on('error', (err) => {
      reject(new Error(`Failed to start FFprobe: ${err.message}`));
    });
  });
}

/**
 * 保存base64图片到文件
 * @param {string} base64Data - base64编码的图片数据
 * @param {string} outputPath - 输出文件路径
 */
export async function saveBase64Image(base64Data, outputPath) {
  // 移除data:image/xxx;base64,前缀（如果有）
  const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');
  await writeFile(outputPath, buffer);
}

/**
 * 检测视频编码格式
 * @param {string} videoPath - 视频文件路径
 * @returns {Promise<{codec: string, isSupported: boolean}>}
 */
export async function detectVideoCodec(videoPath) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,codec_tag_string',
      '-of', 'json',
      videoPath
    ]);

    let stdout = '';
    let stderr = '';

    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFprobe failed: ${stderr}`));
      } else {
        try {
          const data = JSON.parse(stdout);
          const codec = data.streams?.[0]?.codec_name || 'unknown';
          const codecTag = data.streams?.[0]?.codec_tag_string || '';
          
          // 浏览器通用支持的编码: H.264 (avc1), VP8, VP9
          const supportedCodecs = ['h264', 'avc1', 'vp8', 'vp9'];
          const isSupported = supportedCodecs.includes(codec.toLowerCase()) || 
                            supportedCodecs.some(c => codecTag.toLowerCase().includes(c));
          
          console.log(`[Codec Detection] File: ${videoPath}, Codec: ${codec}, Tag: ${codecTag}, Supported: ${isSupported}`);
          resolve({ codec, codecTag, isSupported });
        } catch (err) {
          reject(new Error(`Failed to parse ffprobe output: ${err.message}`));
        }
      }
    });

    ffprobe.on('error', (err) => {
      reject(new Error(`Failed to start FFprobe: ${err.message}`));
    });
  });
}

/**
 * 计算文件的MD5哈希值（用于秒传功能）
 * @param {string} filePath - 文件路径
 * @returns {Promise<string>} - 文件的MD5哈希值
 */
export async function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('md5');
    const stream = createReadStream(filePath);
    
    stream.on('data', (data) => {
      hash.update(data);
    });
    
    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });
    
    stream.on('error', (err) => {
      reject(new Error(`Failed to calculate file hash: ${err.message}`));
    });
  });
}

/**
 * 转码视频为浏览器兼容格式 (H.264/AAC/MP4)
 * @param {string} inputPath - 输入视频路径
 * @param {string} outputPath - 输出视频路径
 * @param {Function} progressCallback - 进度回调函数
 * @returns {Promise<void>}
 */
export async function transcodeVideo(inputPath, outputPath, progressCallback) {
  return new Promise((resolve, reject) => {
    console.log(`[Transcode] Starting transcoding: ${inputPath} -> ${outputPath}`);
    
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-c:v', 'libx264',           // H.264 视频编码
      '-preset', 'medium',         // 编码速度预设（平衡速度和质量）
      '-crf', '23',                // 恒定质量因子（18-28，23是默认）
      '-c:a', 'aac',               // AAC 音频编码
      '-b:a', '128k',              // 音频比特率
      '-movflags', '+faststart',   // 优化网络播放（将moov atom移到文件开头）
      '-pix_fmt', 'yuv420p',       // 像素格式（兼容性最好）
      '-y',                        // 覆盖输出文件
      outputPath
    ]);

    let stderr = '';
    let duration = 0;

    ffmpeg.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;

      // 提取视频总时长
      if (!duration) {
        const durationMatch = text.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (durationMatch) {
          duration = parseInt(durationMatch[1]) * 3600 + 
                    parseInt(durationMatch[2]) * 60 + 
                    parseFloat(durationMatch[3]);
        }
      }

      // 提取当前进度
      const timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (timeMatch && duration > 0) {
        const currentTime = parseInt(timeMatch[1]) * 3600 + 
                          parseInt(timeMatch[2]) * 60 + 
                          parseFloat(timeMatch[3]);
        const progress = Math.min((currentTime / duration) * 100, 100);
        if (progressCallback) {
          progressCallback(progress);
        }
      }
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        console.error(`[Transcode] Failed with code ${code}:`, stderr);
        reject(new Error(`Transcoding failed: ${stderr}`));
      } else {
        console.log(`[Transcode] Successfully transcoded to: ${outputPath}`);
        resolve();
      }
    });

    ffmpeg.on('error', (err) => {
      console.error('[Transcode] FFmpeg error:', err);
      reject(new Error(`Failed to start FFmpeg: ${err.message}`));
    });
  });
}
