import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 调用 Python Whisper 服务进行音频转录
 * @param {string} audioPath - 音频文件路径
 * @param {string} modelSize - 模型大小 (tiny, base, small, medium, large-v2, large-v3)
 * @param {string} device - 设备类型 ('cpu' 或 'cuda')
 * @returns {Promise<Object>} 转录结果
 */
export async function transcribeWithWhisper(audioPath, modelSize = 'medium', device = 'cpu') {
  return new Promise((resolve, reject) => {
    const pythonScript = join(__dirname, '../whisper_service.py');
    
    console.log(`[Whisper Bridge] Starting transcription with ${modelSize} model on ${device}`);
    console.log(`[Whisper Bridge] Audio file: ${audioPath}`);
    
    // 启动 Python 子进程，设置 UTF-8 编码
    const pythonProcess = spawn('python', [pythonScript, audioPath, modelSize, device], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });
    
    let stdoutData = '';
    let stderrData = '';
    
    // 收集标准输出（JSON 结果），使用 UTF-8 解码
    pythonProcess.stdout.on('data', (data) => {
      stdoutData += data.toString('utf8');
    });
    
    // 收集标准错误（日志信息），使用 UTF-8 解码
    pythonProcess.stderr.on('data', (data) => {
      const message = data.toString('utf8');
      stderrData += message;
      
      // 实时输出日志
      if (message.includes('[Whisper]')) {
        console.log(message.trim());
      }
    });
    
    // 进程结束
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`[Whisper Bridge] Process exited with code ${code}`);
        console.error(`[Whisper Bridge] stderr: ${stderrData}`);
        
        // 尝试解析错误信息
        try {
          const errorJson = JSON.parse(stdoutData);
          reject(new Error(errorJson.error || 'Whisper transcription failed'));
        } catch {
          reject(new Error(`Whisper process failed with code ${code}: ${stderrData}`));
        }
        return;
      }
      
      // 解析 JSON 结果
      try {
        const result = JSON.parse(stdoutData);
        
        if (!result.success) {
          reject(new Error(result.error || 'Transcription failed'));
          return;
        }
        
        console.log(`[Whisper Bridge] Transcription completed: ${result.segmentCount} segments, ${result.duration}s`);
        resolve(result);
      } catch (error) {
        console.error(`[Whisper Bridge] Failed to parse result: ${error.message}`);
        console.error(`[Whisper Bridge] stdout: ${stdoutData}`);
        reject(new Error(`Failed to parse transcription result: ${error.message}`));
      }
    });
    
    // 进程错误
    pythonProcess.on('error', (error) => {
      console.error(`[Whisper Bridge] Failed to start Python process: ${error.message}`);
      reject(new Error(`Failed to start Whisper service: ${error.message}`));
    });
  });
}

/**
 * 检查 Whisper 服务是否可用
 * @returns {Promise<boolean>} 是否可用
 */
export async function checkWhisperAvailable() {
  return new Promise((resolve) => {
    const pythonProcess = spawn('python', ['-c', 'from faster_whisper import WhisperModel; print("OK")']);
    
    let output = '';
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      resolve(code === 0 && output.includes('OK'));
    });
    
    pythonProcess.on('error', () => {
      resolve(false);
    });
    
    // 超时处理
    setTimeout(() => {
      pythonProcess.kill();
      resolve(false);
    }, 5000);
  });
}

/**
 * 获取推荐的模型大小（速度优先，适合长音频）
 * @returns {string} 推荐的模型大小
 */
export function getRecommendedModelSize() {
  // 根据系统内存推荐模型（偏向速度）
  const totalMemory = os.totalmem() / (1024 * 1024 * 1024); // GB
  
  console.log(`[Whisper Bridge] System memory: ${totalMemory.toFixed(2)}GB`);
  
  if (totalMemory < 4) {
    console.log(`[Whisper Bridge] Recommended model: tiny (< 4GB RAM) - Fast`);
    return 'tiny';   // < 4GB RAM
  } else if (totalMemory < 8) {
    console.log(`[Whisper Bridge] Recommended model: base (4-8GB RAM) - Fast`);
    return 'base';   // 4-8GB RAM
  } else {
    // 8GB+ 内存，统一使用 medium，平衡速度和精度
    console.log(`[Whisper Bridge] Recommended model: medium (>= 8GB RAM) - Balanced speed/accuracy for long audio`);
    return 'medium';
  }
}

/**
 * 检测是否有可用的 CUDA GPU
 * @returns {Promise<boolean>} 是否有 GPU
 */
export async function checkCudaAvailable() {
  return new Promise((resolve) => {
    const pythonProcess = spawn('python', ['-c', 'import torch; print(torch.cuda.is_available())']);
    
    let output = '';
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      resolve(code === 0 && output.trim() === 'True');
    });
    
    pythonProcess.on('error', () => {
      resolve(false);
    });
    
    setTimeout(() => {
      pythonProcess.kill();
      resolve(false);
    }, 3000);
  });
}
