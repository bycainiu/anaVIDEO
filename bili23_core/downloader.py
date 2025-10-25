"""
B站视频下载器模块
支持多线程分片下载、断点续传等功能
"""
import os
import time
import threading
from typing import List, Dict, Callable, Optional
from pathlib import Path
import asyncio

from .config import BiliConfig
from .request import RequestUtils


class DownloadTask:
    """下载任务"""
    
    def __init__(self, url: str, file_path: str, file_type: str = "video"):
        self.url = url
        self.file_path = file_path
        self.file_type = file_type
        self.file_size = 0
        self.downloaded_size = 0
        self.thread_ranges = []
        self.status = "pending"  # pending, downloading, completed, failed
        
    def to_dict(self) -> Dict:
        return {
            "url": self.url,
            "file_path": self.file_path,
            "file_type": self.file_type,
            "file_size": self.file_size,
            "downloaded_size": self.downloaded_size,
            "progress": (self.downloaded_size / self.file_size * 100) if self.file_size > 0 else 0,
            "status": self.status
        }


class BiliDownloader:
    """B站视频下载器"""
    
    def __init__(self, progress_callback: Optional[Callable] = None):
        self.progress_callback = progress_callback
        self.download_tasks: List[DownloadTask] = []
        self.active_downloads = {}
        self.stop_events = {}
        self.download_locks = {}
        
    async def download_video(self, video_info: Dict, audio_info: Dict, 
                           output_dir: str, filename: str = None) -> Dict:
        """下载视频和音频"""
        if not filename:
            filename = self._sanitize_filename(video_info.get("title", "video"))
        
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        tasks = []
        
        # 创建视频下载任务
        if video_info.get("video_urls"):
            video_path = output_path / f"{filename}_video.m4s"
            video_task = DownloadTask(
                url=video_info["video_urls"][0],
                file_path=str(video_path),
                file_type="video"
            )
            tasks.append(video_task)
        
        # 创建音频下载任务
        if audio_info.get("audio_urls"):
            audio_path = output_path / f"{filename}_audio.m4a"
            audio_task = DownloadTask(
                url=audio_info["audio_urls"][0],
                file_path=str(audio_path),
                file_type="audio"
            )
            tasks.append(audio_task)
        
        # 执行下载
        results = []
        for task in tasks:
            try:
                result = await self._download_single_file(task)
                results.append(result)
            except Exception as e:
                results.append({
                    "file_type": task.file_type,
                    "status": "failed",
                    "error": str(e)
                })
        
        return {
            "results": results,
            "output_dir": str(output_path),
            "filename": filename
        }
    
    async def _download_single_file(self, task: DownloadTask) -> Dict:
        """下载单个文件"""
        try:
            # 获取文件大小
            print(f"\n获取文件大小: {task.url[:80]}...")
            file_size = await self._get_file_size(task.url)
            print(f"文件大小: {file_size} 字节 ({file_size / 1024 / 1024:.2f} MB)")
            
            task.file_size = file_size
            task.status = "downloading"
            
            # 计算分片范围
            ranges = self._calculate_ranges(file_size)
            print(f"分片数量: {len(ranges)}")
            task.thread_ranges = ranges
            
            # 创建空文件
            print(f"创建文件: {task.file_path}")
            self._create_empty_file(task.file_path, file_size)
            
            # 多线程下载
            print(f"开始多线程下载...")
            await self._multi_thread_download(task, ranges)
            print(f"下载完成: {task.downloaded_size}/{task.file_size} 字节")
            
            task.status = "completed"
            return task.to_dict()
            
        except Exception as e:
            task.status = "failed"
            return {
                "file_type": task.file_type,
                "status": "failed",
                "error": str(e)
            }
    
    async def _get_file_size(self, url: str) -> int:
        """获取文件大小"""
        # B站CDN不支持HEAD请求，使用Range请求获取文件大小
        headers = RequestUtils.get_headers(
            referer_url="https://www.bilibili.com/",
            range_header=[0, 0]  # 请求第一个字节
        )
        
        try:
            resp = RequestUtils.request_get(url, headers=headers, stream=True)
            resp.close()  # 立即关闭连接
            
            # 尝试从 Content-Range 获取总大小
            content_range = resp.headers.get('Content-Range')
            if content_range:
                # Content-Range: bytes 0-0/12345678
                total_size = content_range.split('/')[-1]
                print(f"Content-Range: {content_range}, 解析出大小: {total_size}")
                return int(total_size)
            
            # 如果没有Content-Range，尝试Content-Length
            content_length = resp.headers.get('Content-Length')
            if content_length:
                print(f"Content-Length: {content_length}")
                return int(content_length)
            
            print(f"警告: 无法获取文件大小，响应头: {dict(resp.headers)}")
            return 0
            
        except Exception as e:
            print(f"获取文件大小失败: {e}")
            return 0
    
    def _calculate_ranges(self, file_size: int, chunk_size: int = 10 * 1024 * 1024) -> List[tuple]:
        """计算下载分片范围"""
        ranges = []
        start = 0
        
        # 根据文件大小调整分片大小
        if file_size <= 100 * 1024 * 1024:  # 100MB以下
            chunk_size = 5 * 1024 * 1024  # 5MB
        elif file_size <= 1024 * 1024 * 1024:  # 1GB以下
            chunk_size = 20 * 1024 * 1024  # 20MB
        else:
            chunk_size = 50 * 1024 * 1024  # 50MB
        
        while start < file_size:
            end = min(start + chunk_size - 1, file_size - 1)
            ranges.append((start, end))
            start = end + 1
        
        return ranges
    
    def _create_empty_file(self, file_path: str, file_size: int):
        """创建空文件用于分片下载"""
        # 使用Path对象确保中文路径正确处理
        file_path = Path(file_path)
        if not file_path.exists():
            with open(file_path, 'wb') as f:
                if file_size > 0:
                    f.seek(file_size - 1)
                    f.write(b'\x00')
    
    async def _multi_thread_download(self, task: DownloadTask, ranges: List[tuple]):
        """多线程下载"""
        max_threads = min(len(ranges), BiliConfig.Download.max_download_count)
        
        # 创建停止事件
        stop_event = threading.Event()
        self.stop_events[task.file_path] = stop_event
        
        # 创建线程锁
        file_lock = threading.Lock()
        self.download_locks[task.file_path] = file_lock
        
        # 获取当前事件循环，如果不存在则创建
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        
        download_futures = []
        
        for i, (start, end) in enumerate(ranges):
            future = loop.run_in_executor(
                None, 
                self._download_range,
                task, start, end, stop_event, file_lock
            )
            download_futures.append(future)
            
            # 限制并发数
            if len(download_futures) >= max_threads:
                await asyncio.gather(*download_futures[:max_threads])
                download_futures = download_futures[max_threads:]
        
        # 等待剩余任务完成
        if download_futures:
            await asyncio.gather(*download_futures)
    
    def _download_range(self, task: DownloadTask, start: int, end: int, 
                       stop_event: threading.Event, file_lock: threading.Lock):
        """下载指定范围的数据"""
        try:
            headers = RequestUtils.get_headers(
                referer_url="https://www.bilibili.com/",
                range_header=[start, end]
            )
            
            resp = RequestUtils.request_get(task.url, headers=headers, stream=True)
            resp.raise_for_status()
            
            with open(task.file_path, 'r+b') as f:
                f.seek(start)
                
                for chunk in resp.iter_content(chunk_size=8192):
                    if stop_event.is_set():
                        break
                    
                    if chunk:
                        with file_lock:
                            f.write(chunk)
                            task.downloaded_size += len(chunk)
                            
                            # 调用进度回调（在线程中直接调用，不使用async）
                            if self.progress_callback:
                                try:
                                    progress = (task.downloaded_size / task.file_size * 100) if task.file_size > 0 else 0
                                    self.progress_callback({
                                        "file_type": task.file_type,
                                        "progress": progress,
                                        "downloaded": task.downloaded_size,
                                        "total": task.file_size,
                                        "speed": self._calculate_speed(task)
                                    })
                                except Exception as callback_error:
                                    # 忽略回调错误，不影响下载
                                    pass
        
        except Exception as e:
            print(f"下载分片失败 ({start}-{end}): {e}")
            raise
    
    def _calculate_speed(self, task: DownloadTask) -> str:
        """计算下载速度"""
        # 简单实现，实际应该基于时间窗口计算
        return f"{task.downloaded_size // 1024}KB/s"
    
    def _sanitize_filename(self, filename: str) -> str:
        """清理文件名中的非法字符"""
        invalid_chars = ['<', '>', ':', '"', '/', '\\\\', '|', '?', '*']
        for char in invalid_chars:
            filename = filename.replace(char, '_')
        return filename.strip()
    
    def stop_download(self, file_path: str):
        """停止指定文件的下载"""
        if file_path in self.stop_events:
            self.stop_events[file_path].set()
    
    def stop_all_downloads(self):
        """停止所有下载"""
        for stop_event in self.stop_events.values():
            stop_event.set()
    
    async def merge_video_audio(self, video_path: str, audio_path: str, 
                               output_path: str) -> bool:
        """合并视频和音频文件"""
        try:
            import subprocess
            import sys
            
            # 确保路径使用Path对象
            video_path = str(Path(video_path))
            audio_path = str(Path(audio_path))
            output_path = str(Path(output_path))
            
            cmd = [
                'ffmpeg', '-i', video_path, '-i', audio_path,
                '-c', 'copy', '-y', output_path
            ]
            
            # Windows下使用正确的编码
            if sys.platform == 'win32':
                # 在Windows上，使用CREATE_NO_WINDOW标志防止弹出窗口
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                process = subprocess.Popen(
                    cmd, 
                    stdout=subprocess.PIPE, 
                    stderr=subprocess.PIPE,
                    startupinfo=startupinfo,
                    encoding='utf-8',
                    errors='ignore'
                )
            else:
                process = subprocess.Popen(
                    cmd, 
                    stdout=subprocess.PIPE, 
                    stderr=subprocess.PIPE
                )
            
            stdout, stderr = process.communicate()
            
            if process.returncode != 0:
                print(f"FFmpeg错误: {stderr}")
            
            return process.returncode == 0
            
        except Exception as e:
            print(f"合并视频音频失败: {e}")
            import traceback
            print(traceback.format_exc())
            return False
