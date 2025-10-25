#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
zh_recogn API Server - 纯API服务,无网页UI
支持SSE实时进度推送
"""

from funasr import AutoModel
from flask import Flask, request, jsonify, Response
import os
import logging
import time
import warnings
import json
import sys
from logging.handlers import RotatingFileHandler
from waitress import serve

warnings.filterwarnings('ignore')

# 导入原有的库
import lib
from lib import cfg, tool
from lib.cfg import ROOT_DIR

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# 全局模型实例(懒加载)
model_instance = None
model_lock = None

def get_model():
    """获取或初始化模型实例"""
    global model_instance
    if model_instance is None:
        logger.info("[Model] Loading zh_recogn model...")
        sets = cfg.parse_ini()
        model_instance = AutoModel(
            model="paraformer-zh", model_revision="v2.0.4",
            vad_model="fsmn-vad", vad_model_revision="v2.0.4",
            punc_model="ct-punc-c", punc_model_revision="v2.0.4",
            local_files_only=sets.get('only_local', False)
        )
        logger.info("[Model] Model loaded successfully")
    return model_instance


def convert_to_srt(raw_subtitles):
    """转换为SRT格式"""
    srt_lines = []
    for i, sub in enumerate(raw_subtitles, 1):
        srt_lines.append(str(i))
        srt_lines.append(sub['time'])
        srt_lines.append(sub['text'])
        srt_lines.append("")  # 空行
    return "\n".join(srt_lines)


def convert_to_vtt(raw_subtitles):
    """转换为VTT格式"""
    vtt_lines = ["WEBVTT", ""]
    for sub in raw_subtitles:
        # VTT使用.而不是,
        vtt_time = sub['time'].replace(',', '.')
        vtt_lines.append(vtt_time)
        vtt_lines.append(sub['text'])
        vtt_lines.append("")  # 空行
    return "\n".join(vtt_lines)


@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查"""
    return jsonify({
        "status": "ok",
        "service": "zh_recogn",
        "version": lib.version_str if hasattr(lib, 'version_str') else "1.0.0",
        "timestamp": time.time()
    })


@app.route('/api/recognize', methods=['POST'])
def recognize():
    """
    中文语音识别API
    接收音频/视频文件,返回SRT/VTT格式字幕
    """
    start_time = time.time()
    wav_file = None
    video_file = None
    
    try:
        # 检查文件
        if 'audio' not in request.files:
            return jsonify({"code": 1, "msg": "No audio file provided", "success": False}), 400
        
        audio_file = request.files['audio']
        if audio_file.filename == '':
            return jsonify({"code": 1, "msg": "Empty filename", "success": False}), 400
        
        logger.info(f"[API] Received file: {audio_file.filename}")
        
        # 获取文件扩展名
        noextname, ext = os.path.splitext(audio_file.filename)
        ext = ext.lower()
        
        # 准备临时文件
        os.makedirs(cfg.TMP_DIR, exist_ok=True)
        wav_file = os.path.join(cfg.TMP_DIR, f'{time.time()}.wav')
        
        # 处理不同格式
        if ext in ['.mp4', '.mov', '.avi', '.mkv', '.mpeg', '.mp3', '.flac']:
            # 视频或非WAV音频,需要转换
            video_file = os.path.join(cfg.TMP_DIR, f'{noextname}_{time.time()}{ext}')
            audio_file.save(video_file)
            
            logger.info(f"[API] Converting {ext} to WAV...")
            params = ["-i", video_file]
            if ext not in ['.mp3', '.flac']:
                params.append('-vn')  # 只提取音频
            params.append(wav_file)
            
            rs = tool.runffmpeg(params)
            if rs != 'ok':
                return jsonify({"code": 1, "msg": "Failed to convert audio format", "success": False}), 500
            
            logger.info("[API] Audio conversion completed")
            
        elif ext == '.wav':
            audio_file.save(wav_file)
            logger.info("[API] WAV file saved directly")
        else:
            return jsonify({"code": 1, "msg": f"Unsupported format: {ext}", "success": False}), 400
        
        # 加载模型
        logger.info("[API] Loading model...")
        model = get_model()
        
        # 执行识别
        logger.info("[API] Starting recognition with VAD...")
        
        res = model.generate(
            input=wav_file,
            return_raw_text=True,
            is_final=True,
            sentence_timestamp=True,
            batch_size_s=100
        )
        
        logger.info("[API] ✅ Recognition completed")
        
        # 处理结果
        raw_subtitles = []
        segments = []
        
        for it in res[0]['sentence_info']:
            start_ms = it['start']
            end_ms = it['end']
            text = it['text'].strip()
            
            raw_subtitles.append({
                "line": len(raw_subtitles) + 1,
                "text": text,
                "start_time": start_ms,
                "end_time": end_ms,
                "time": f'{tool.ms_to_time_string(ms=start_ms)} --> {tool.ms_to_time_string(ms=end_ms)}'
            })
            
            segments.append({
                "id": len(segments),
                "start": start_ms / 1000.0,  # 转为秒
                "end": end_ms / 1000.0,
                "text": text
            })
        
        # 生成字幕格式
        srt_content = convert_to_srt(raw_subtitles)
        vtt_content = convert_to_vtt(raw_subtitles)
        
        # 计算总时长
        duration = segments[-1]['end'] if segments else 0
        
        elapsed = time.time() - start_time
        logger.info(f"[API] ✅ Success: {len(segments)} segments, {duration:.2f}s duration, {elapsed:.2f}s elapsed")
        
        # 返回结果
        result = {
            "success": True,
            "code": 0,
            "msg": "ok",
            "data": raw_subtitles,
            "transcription": {
                "text": " ".join([s['text'] for s in segments]),
                "language": "zh",
                "duration": duration,
                "segments": segments
            },
            "srt": srt_content,
            "vtt": vtt_content,
            "segmentCount": len(segments),
            "duration": duration,
            "language": "zh",
            "processingTime": elapsed
        }
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"[API] Error: {e}", exc_info=True)
        return jsonify({
            "code": 2,
            "msg": str(e),
            "success": False
        }), 500
        
    finally:
        # 清理临时文件
        if wav_file and os.path.exists(wav_file):
            try:
                os.remove(wav_file)
                logger.info(f"[Cleanup] Removed temp wav: {wav_file}")
            except:
                pass
        if video_file and os.path.exists(video_file):
            try:
                os.remove(video_file)
                logger.info(f"[Cleanup] Removed temp video: {video_file}")
            except:
                pass


@app.route('/api/recognize/stream', methods=['POST'])
def recognize_stream():
    """
    流式识别API (SSE)
    实时推送识别进度
    """
    def generate():
        wav_file = None
        video_file = None
        
        try:
            # 发送连接确认
            yield f"event: connected\ndata: {json.dumps({'status': 'connected'})}\n\n"
            
            # 检查文件
            if 'audio' not in request.files:
                yield f"event: error\ndata: {json.dumps({'error': 'No audio file'})}\n\n"
                return
            
            audio_file = request.files['audio']
            noextname, ext = os.path.splitext(audio_file.filename)
            ext = ext.lower()
            
            # 保存文件
            yield f"event: progress\ndata: {json.dumps({'stage': 'upload', 'percent': 10})}\n\n"
            
            os.makedirs(cfg.TMP_DIR, exist_ok=True)
            wav_file = os.path.join(cfg.TMP_DIR, f'{time.time()}.wav')
            
            # 转换格式
            if ext in ['.mp4', '.mov', '.avi', '.mkv', '.mpeg', '.mp3', '.flac']:
                video_file = os.path.join(cfg.TMP_DIR, f'{noextname}_{time.time()}{ext}')
                audio_file.save(video_file)
                
                yield f"event: progress\ndata: {json.dumps({'stage': 'converting', 'percent': 30})}\n\n"
                
                params = ["-i", video_file]
                if ext not in ['.mp3', '.flac']:
                    params.append('-vn')
                params.append(wav_file)
                
                rs = tool.runffmpeg(params)
                if rs != 'ok':
                    yield f"event: error\ndata: {json.dumps({'error': 'Conversion failed'})}\n\n"
                    return
                    
            elif ext == '.wav':
                audio_file.save(wav_file)
            else:
                yield f"event: error\ndata: {json.dumps({'error': f'Unsupported format: {ext}'})}\n\n"
                return
            
            # 加载模型
            yield f"event: progress\ndata: {json.dumps({'stage': 'loading_model', 'percent': 50})}\n\n"
            model = get_model()
            
            # 识别
            yield f"event: progress\ndata: {json.dumps({'stage': 'recognizing', 'percent': 70})}\n\n"
            res = model.generate(
                input=wav_file,
                return_raw_text=True,
                is_final=True,
                sentence_timestamp=True,
                batch_size_s=100
            )
            
            # 处理结果
            yield f"event: progress\ndata: {json.dumps({'stage': 'processing', 'percent': 90})}\n\n"
            
            segments = []
            for it in res[0]['sentence_info']:
                segments.append({
                    "id": len(segments),
                    "start": it['start'] / 1000.0,
                    "end": it['end'] / 1000.0,
                    "text": it['text'].strip()
                })
            
            duration = segments[-1]['end'] if segments else 0
            
            # 发送完成事件
            result = {
                "segmentCount": len(segments),
                "duration": duration,
                "language": "zh"
            }
            yield f"event: complete\ndata: {json.dumps(result)}\n\n"
            
        except Exception as e:
            logger.error(f"[Stream] Error: {e}")
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
            
        finally:
            # 清理
            if wav_file and os.path.exists(wav_file):
                try:
                    os.remove(wav_file)
                except:
                    pass
            if video_file and os.path.exists(video_file):
                try:
                    os.remove(video_file)
                except:
                    pass
    
    return Response(generate(), mimetype='text/event-stream')


if __name__ == '__main__':
    try:
        host = cfg.web_address.split(':')
        port = int(host[1])
        
        logger.info("=" * 60)
        logger.info("  zh_recogn API Server (No Web UI)")
        logger.info(f"  API Endpoint: http://{cfg.web_address}/api/recognize")
        logger.info(f"  Health Check: http://{cfg.web_address}/api/health")
        logger.info("=" * 60)
        
        # 不自动打开浏览器
        serve(app, host=host[0], port=port)
        
    except Exception as e:
        logger.error(f"Failed to start server: {e}")
        sys.exit(1)
