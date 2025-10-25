import FormData from 'form-data';
import { createReadStream, existsSync, statSync } from 'fs';
import { basename } from 'path';
import axios from 'axios';

/**
 * zh_recogn 桥接服务
 * 调用 zh_recogn API 进行中文语音识别
 */

const DEFAULT_ZH_RECOGN_URL = 'http://127.0.0.1:9933';

/**
 * 调用 zh_recogn 服务进行音频转录
 * @param {string} audioPath - 音频文件路径
 * @param {string} zhRecognUrl - zh_recogn 服务地址
 * @returns {Promise<Object>} 转录结果
 */
export async function transcribeWithZhRecogn(audioPath, zhRecognUrl = DEFAULT_ZH_RECOGN_URL) {
  try {
    console.log(`[zh_recogn Bridge] Starting Chinese transcription`);
    console.log(`[zh_recogn Bridge] Audio file: ${audioPath}`);
    console.log(`[zh_recogn Bridge] API URL: ${zhRecognUrl}`);
    
    // 检查文件是否存在
    if (!existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }
    
    const stats = statSync(audioPath);
    console.log(`[zh_recogn Bridge] Audio file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    
    // 创建表单数据
    const form = new FormData();
    const fileStream = createReadStream(audioPath);
    
    form.append('audio', fileStream, {
      filename: basename(audioPath),
      contentType: 'audio/wav',
      knownLength: stats.size
    });
    
    // 发送请求
    const apiUrl = `${zhRecognUrl}/api/recognize`;
    console.log(`[zh_recogn Bridge] Sending request to: ${apiUrl}`);
    console.log(`[zh_recogn Bridge] Request method: POST, Content-Type: multipart/form-data`);
    
    const startTime = Date.now();
    
    // 使用 axios 上传，比 fetch 更好地支持 FormData
    // 根据文件大小动态计算超时时间
    const estimatedTime = Math.max(
      1200000,  // 最少20分钟
      (stats.size / 1024 / 1024) * 10000  // 每MB约10秒，大文件更长
    );
    
    console.log(`[zh_recogn Bridge] Estimated timeout: ${(estimatedTime / 1000 / 60).toFixed(1)} minutes`);
    
    const response = await axios.post(apiUrl, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: estimatedTime,  // 动态超时
      
      // 添加上传进度监听
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          if (percent % 10 === 0 || percent === 100) {  // 每10%打印一次
            console.log(`[zh_recogn Bridge] Upload progress: ${percent}%`);
          }
        }
      }
    });
    
    const result = response.data;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`[zh_recogn Bridge] Response received, code: ${result.code}, success: ${result.success}`);
    
    // 检查响应格式
    if (!result.success || result.code !== 0) {
      console.error(`[zh_recogn Bridge] Recognition failed:`, result);
      throw new Error(result.msg || 'Recognition failed');
    }
    
    console.log(`[zh_recogn Bridge] ✅ Transcription completed in ${elapsed}s`);
    console.log(`[zh_recogn Bridge] Segments: ${result.segmentCount}, Duration: ${result.duration}s`);
    
    return {
      success: true,
      transcription: result.transcription,
      srt: result.srt,
      vtt: result.vtt,
      duration: result.duration,
      segmentCount: result.segmentCount,
      language: result.language || 'zh',
      processingTime: parseFloat(elapsed)
    };
    
  } catch (error) {
    console.error(`[zh_recogn Bridge] Error: ${error.message}`);
    if (error.response) {
      console.error(`[zh_recogn Bridge] Response status: ${error.response.status}`);
      console.error(`[zh_recogn Bridge] Response data:`, error.response.data);
    }
    throw new Error(`zh_recogn transcription failed: ${error.message}`);
  }
}

/**
 * 检查 zh_recogn 服务是否可用
 * @param {string} zhRecognUrl - zh_recogn 服务地址
 * @returns {Promise<boolean>} 是否可用
 */
export async function checkZhRecognAvailable(zhRecognUrl = DEFAULT_ZH_RECOGN_URL) {
  try {
    const response = await fetch(`${zhRecognUrl}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000) // 3秒超时
    });
    
    if (!response.ok) {
      return false;
    }
    
    const result = await response.json();
    return result.status === 'ok';
    
  } catch (error) {
    console.warn(`[zh_recogn Bridge] Health check failed: ${error.message}`);
    return false;
  }
}

/**
 * 使用 SSE 流式转录（可选）
 * @param {string} audioPath - 音频文件路径
 * @param {string} zhRecognUrl - zh_recogn 服务地址
 * @param {Function} progressCallback - 进度回调函数
 * @returns {Promise<Object>} 转录结果
 */
export async function transcribeWithZhRecognStream(
  audioPath, 
  zhRecognUrl = DEFAULT_ZH_RECOGN_URL,
  progressCallback = null
) {
  try {
    console.log(`[zh_recogn Bridge] Starting streaming transcription`);
    
    const form = new FormData();
    form.append('audio', createReadStream(audioPath), {
      filename: basename(audioPath)
    });
    
    const apiUrl = `${zhRecognUrl}/api/recognize/stream`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`Stream API error: ${response.status}`);
    }
    
    // 处理 SSE 流
    const reader = response.body;
    let buffer = '';
    let lastResult = null;
    
    for await (const chunk of reader) {
      buffer += chunk.toString('utf8');
      
      // 解析 SSE 消息
      const lines = buffer.split('\n\n');
      buffer = lines.pop(); // 保留不完整的行
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        const eventMatch = line.match(/^event: (.+)\ndata: (.+)$/);
        if (!eventMatch) continue;
        
        const [, event, dataStr] = eventMatch;
        const data = JSON.parse(dataStr);
        
        if (event === 'progress' && progressCallback) {
          progressCallback(data);
        } else if (event === 'complete') {
          lastResult = data;
        } else if (event === 'error') {
          throw new Error(data.error || 'Stream error');
        }
      }
    }
    
    if (!lastResult) {
      throw new Error('No result received from stream');
    }
    
    console.log(`[zh_recogn Bridge] Stream completed: ${lastResult.segmentCount} segments`);
    return lastResult;
    
  } catch (error) {
    console.error(`[zh_recogn Bridge] Stream error: ${error.message}`);
    throw error;
  }
}
