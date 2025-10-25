"""
B站下载API服务
使用FastAPI提供RESTful API接口
"""
import asyncio
import json
import uuid
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, HTMLResponse
from pydantic import BaseModel
import httpx
from bs4 import BeautifulSoup

from urllib.parse import urlparse

# 导入我们的bili23_core
from bili23_core import BiliParser, BiliDownloader, BiliConfig


# 可选依赖：yt_dlp 用于多站点解析/下载
try:
    import yt_dlp  # type: ignore
    HAS_YT_DLP = True
except Exception:
    yt_dlp = None
    HAS_YT_DLP = False

# 导入站点检测器
from site_detector import SiteDetector


# URL 辅助判断
def is_bilibili_url(url: str) -> bool:
    try:
        host = urlparse(url).netloc.lower()
        return 'bilibili.com' in host or 'b23.tv' in host
    except Exception:
        return False


def map_qn_to_ytdlp_format(qn: Optional[int]) -> str:
    """将B站清晰度QN映射为 yt-dlp 的 format 选择器。"""
    if not qn:
        return 'bv*+ba/best'
    mapping = {
        120: 2160,
        116: 1440,  # 1080P60/高码率，放宽到1440以拿到更高清
        112: 1080,
        80: 1080,
        64: 720,
        32: 480,
        16: 360,
    }
    h = mapping.get(qn, 1080)
    # 优先 mp4 容器，回退 best
    return f'bv*[height<={h}][ext=mp4]+ba[ext=m4a]/b[height<={h}][ext=mp4]/best'

# 数据模型
class LoginRequest(BaseModel):
    cookies: Dict[str, str]


class ParseRequest(BaseModel):
    url: str


class DownloadRequest(BaseModel):
    url: str
    quality: Optional[int] = 80  # 默认1080P
    output_dir: Optional[str] = "./downloads"
    filename: Optional[str] = None


class TaskResponse(BaseModel):
    task_id: str
    status: str
    message: Optional[str] = None


class VideoInfo(BaseModel):
    bvid: str
    title: str
    duration: int
    owner: Dict
    pic: Optional[str] = None  # 封面图
    quality_options: List[Dict]


# 全局变量
app = FastAPI(title="Bili23 Download API", version="1.0.0")
download_tasks = {}  # 任务状态管理
active_connections = []  # WebSocket连接管理
main_loop = None  # 主事件循环
upload_executor = ThreadPoolExecutor(max_workers=3, thread_name_prefix="upload")  # 上传线程池
download_processes = {}  # 存储下载进程，用于手动停止

# CORS设置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 在生产环境中应该限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConnectionManager:
    """WebSocket连接管理器"""

    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except:
                # 连接已断开，移除
                self.active_connections.remove(connection)


manager = ConnectionManager()


async def check_existing_video(bvid: str) -> Optional[dict]:
    """检查BVID是否已存在于数据库"""
    try:
        import requests

        print(f"[秒传检测] 查询BVID: {bvid}")

        # 调用Express服务器的查询API
        response = requests.get(
            f"http://localhost:3004/api/videos/check-bilibili/{bvid}",
            timeout=5
        )

        print(f"[秒传检测] 响应状态: {response.status_code}")

        if response.status_code == 200:
            result = response.json()
            print(f"[秒传检测] 响应数据: {result}")

            if result.get('exists'):
                print(f"[秒传检测] ✅ 找到已存在的视频: {result.get('video')}")
                return result.get('video')
            else:
                print(f"[秒传检测] ❌ 视频不存在，需要下载")

        return None

    except Exception as e:
        print(f"[秒传检测] ❗ 检查失败: {e}")
        import traceback
        print(traceback.format_exc())
        return None


def progress_callback(task_id: str, progress_data: dict):
    """下载进度回调（线程安全）"""
    try:
        download_tasks[task_id]["progress"] = progress_data
        download_tasks[task_id]["last_update"] = datetime.now()

        # 使用保存的主循环进行WebSocket广播
        if main_loop and not main_loop.is_closed():
            asyncio.run_coroutine_threadsafe(
                manager.broadcast({
                    "type": "progress",
                    "task_id": task_id,
                    "data": progress_data
                }),
                main_loop
            )
    except Exception as e:
        # 静默失败，不影响下载
        print(f"进度回调错误: {e}")


@app.post("/api/bili/login")
async def login(request: LoginRequest) -> dict:
    """设置B站登录Cookie"""
    try:
        print(f"\n=== 登录请求 ===")
        print(f"Cookie键: {list(request.cookies.keys())}")

        BiliConfig.set_cookies(request.cookies)

        # 验证Cookie有效性
        if not BiliConfig.validate_cookies():
            print(f"Cookie验证失败: SESSDATA={BiliConfig.User.SESSDATA[:20] if BiliConfig.User.SESSDATA else 'empty'}, DedeUserID={BiliConfig.User.DedeUserID}")
            raise HTTPException(status_code=400, detail="Cookie无效或不完整")

        print(f"登录成功! DedeUserID={BiliConfig.User.DedeUserID}\n")

        return {
            "success": True,
            "message": "登录成功",
            "user_id": BiliConfig.User.DedeUserID
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"登录异常: {e}")
        raise HTTPException(status_code=500, detail=f"登录失败: {str(e)}")


@app.post("/api/bili/parse")
async def parse_video(request: ParseRequest):
    """解析B站视频信息（支持单视频/空间/番剧）"""
    try:
        # 验证登录状态
        if not BiliConfig.validate_cookies():
            print(f"\n=== 解析请求被拒绝 ===")
            print(f"SESSDATA: {BiliConfig.User.SESSDATA[:20] if BiliConfig.User.SESSDATA else 'empty'}...")
            print(f"DedeUserID: {BiliConfig.User.DedeUserID}")
            print(f"validate_cookies(): {BiliConfig.validate_cookies()}\n")
            raise HTTPException(status_code=401, detail="请先登录B站账号")

        print(f"\n开始解析URL: {request.url}")
        parser = BiliParser()
        video_info = parser.parse_url(request.url)

        # 检查返回类型
        if isinstance(video_info, dict):
            result_type = video_info.get('type')

            # 如果是用户空间或番剧列表，直接返回
            if result_type in ['space', 'bangumi']:
                print(f"解析结果: {result_type}, 共 {video_info.get('total', 0)} 个视频")
                return video_info

        # 单个视频，获取画质选项
        print(f"视频信息获取成功: {video_info.get('title', 'Unknown')}")
        print(f"封面图: {video_info.get('pic', 'No pic')}")
        print(f"获取画质选项: BVID={video_info['bvid']}, CID={video_info['cid']}")
        quality_options = parser.get_quality_options(
            video_info["bvid"],
            video_info["cid"]
        )
        print(f"画质选项获取成功，共 {len(quality_options)} 个")

        return VideoInfo(
            bvid=video_info["bvid"],
            title=video_info["title"],
            duration=video_info["duration"],
            owner=video_info["owner"],
            pic=video_info.get("pic"),  # 封面图
            quality_options=quality_options
        )

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_detail = f"解析失败: {str(e)}\n{traceback.format_exc()}"
        print(error_detail)
        raise HTTPException(status_code=500, detail=error_detail)


@app.post("/api/bili/download")
async def start_download(request: DownloadRequest) -> TaskResponse:
    """开始下载视频"""
    try:
        # 验证登录状态
        if not BiliConfig.validate_cookies():
            raise HTTPException(status_code=401, detail="请先登录B站账号")

        # 生成任务ID
        task_id = str(uuid.uuid4())

        # 初始化任务状态
        download_tasks[task_id] = {
            "status": "queued",
            "url": request.url,
            "quality": request.quality,
            "output_dir": request.output_dir,
            "filename": request.filename,
            "progress": {},
            "created_at": datetime.now(),
            "last_update": datetime.now()
        }

        # 使用asyncio.create_task启动异步任务
        asyncio.create_task(download_video_task(
            task_id,
            request.url,
            request.quality,
            request.output_dir,
            request.filename
        ))

        return TaskResponse(
            task_id=task_id,
            status="queued",
            message="下载任务已加入队列"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建下载任务失败: {str(e)}")


class BatchDownloadRequest(BaseModel):
    bvids: List[str]
    quality: Optional[int] = 80
    output_dir: Optional[str] = "./downloads"


@app.post("/api/bili/batch-download")
async def start_batch_download(request: BatchDownloadRequest) -> dict:
    """批量下载视频"""
    try:
        # 验证登录状态
        if not BiliConfig.validate_cookies():
            raise HTTPException(status_code=401, detail="请先登录B站账号")

        task_ids = []

        for bvid in request.bvids:
            task_id = str(uuid.uuid4())
            url = f"https://www.bilibili.com/video/{bvid}"

            download_tasks[task_id] = {
                "status": "queued",
                "url": url,
                "quality": request.quality,
                "output_dir": request.output_dir,
                "filename": None,
                "progress": {},
                "created_at": datetime.now(),
                "last_update": datetime.now()
            }

            # 启动下载任务
            asyncio.create_task(download_video_task(
                task_id,
                url,
                request.quality,
                request.output_dir,
                None
            ))

            task_ids.append(task_id)

        return {
            "success": True,
            "task_ids": task_ids,
            "total": len(task_ids),
            "message": f"已创建 {len(task_ids)} 个下载任务"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"批量下载失败: {str(e)}")


@app.get("/api/bili/status/{task_id}")
async def get_download_status(task_id: str) -> dict:
    """获取下载任务状态"""
    if task_id not in download_tasks:
        raise HTTPException(status_code=404, detail="任务不存在")

    task = download_tasks[task_id]
    return {
        "task_id": task_id,
        "status": task["status"],
        "progress": task.get("progress", {}),
        "created_at": task["created_at"].isoformat(),
        "last_update": task["last_update"].isoformat()
    }


@app.get("/api/bili/tasks")
async def get_all_tasks() -> dict:
    """获取所有任务状态"""
    return {
        "tasks": [
            {
                "task_id": task_id,
                "status": task["status"],
                "url": task["url"],
                "progress": task.get("progress", {}),
                "result": task.get("result"),  # 添加result字段
                "created_at": task["created_at"].isoformat()
            }
            for task_id, task in download_tasks.items()
        ]
    }


# ===== 通用（多站点）下载：使用 yt-dlp =====
class UniversalDownloadRequest(BaseModel):
    url: str
    output_dir: Optional[str] = "./downloads"
    format: Optional[str] = None  # yt-dlp 格式选择表达式，可选


@app.post("/api/universal/parse")
async def universal_parse_video(request: ParseRequest) -> dict:
    """
    通用视频解析（支持多站点）
    返回与B站兼容的格式
    """
    if not HAS_YT_DLP:
        raise HTTPException(status_code=501, detail="服务器未安装 yt-dlp，请先安装：pip install yt-dlp")

    try:
        # 检测站点
        site_info = SiteDetector.detect(request.url)
        if not site_info:
            raise HTTPException(status_code=400, detail="不支持的视频网站")

        print(f"\n=== [Universal Parse] 解析视频 ===")
        print(f"URL: {request.url}")
        print(f"站点: {site_info.display_name} ({site_info.name})")
        print(f"支持画质选择: {site_info.supports_quality}")
        print(f"使用引擎: {'yt-dlp' if site_info.use_ytdlp else '自定义'}")

        # 使用yt-dlp提取信息(添加详细日志和反限制措施)
        ydl_opts = {
            'quiet': False,  # 改为False以查看详细输出
            'no_warnings': False,  # 改为False以查看警告
            'extract_flat': False,
            'noplaylist': True,  # ⭐ 只下载单个视频,忽略播放列表
            'socket_timeout': 30,  # 30秒超时
            'retries': 5,  # 增加重试次数到5次
            'fragment_retries': 5,
            'skip_unavailable_fragments': True,
            'ignoreerrors': False,
            'no_color': True,
            'verbose': False,  # 不需要过于详细的调试信息
            # 伪装成浏览器
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-us,en;q=0.5',
                'Sec-Fetch-Mode': 'navigate',
            },
        }
        
        # 如果有cookies文件,使用它(YouTube等站点需要)
        cookies_file = Path('./cookies.txt')
        if cookies_file.exists():
            ydl_opts['cookiefile'] = str(cookies_file)
            print(f"[yt-dlp] 使用cookies文件: {cookies_file}")
        else:
            print(f"[yt-dlp] 未找到cookies文件,建议创建 cookies.txt 以避免速率限制")

        print(f"[yt-dlp] 开始提取视频信息...")
        print(f"[yt-dlp] 配置: {ydl_opts}")
        
        # 直播平台列表
        LIVE_PLATFORMS = ['huya', 'douyu', 'twitch']
        is_live_platform = site_info.name in LIVE_PLATFORMS
        
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                print(f"[yt-dlp] 调用 extract_info()...")
                info = ydl.extract_info(request.url, download=False)
                print(f"[yt-dlp] ✅ extract_info() 完成")
                
                if not info:
                    raise Exception("yt-dlp返回了空的信息对象")
                    
                print(f"[yt-dlp] 视频ID: {info.get('id')}")
                print(f"[yt-dlp] 标题: {info.get('title')}")
                print(f"[yt-dlp] 格式数量: {len(info.get('formats', []))}")
                
        except Exception as e:
            error_str = str(e)
            print(f"[yt-dlp] ❌ 提取信息失败: {error_str}")
            import traceback
            traceback_str = traceback.format_exc()
            print(f"[yt-dlp] 详细错误:\n{traceback_str}")
            
            # 检测是否是yt-dlp的Huya提取器bug(离线直播间)
            if "huya.py" in traceback_str and "'NoneType' and 'float'" in error_str:
                friendly_msg = f"❌ {site_info.display_name}直播间当前离线(未开播)\n\n"
                friendly_msg += f"💡 提示:\n"
                friendly_msg += f"  • 该主播当前未开播，无法获取直播流\n"
                friendly_msg += f"  • 直播平台只能解析和下载正在直播的内容\n"
                friendly_msg += f"  • 请等待主播开播后再试\n\n"
                friendly_msg += f"⚠️ 技术详情: yt-dlp的虎牙提取器在处理离线直播间时存在bug"
                raise HTTPException(status_code=400, detail=friendly_msg)
            
            # 针对直播平台的通用错误提示
            if is_live_platform and ('offline' in error_str.lower() or 'not available' in error_str.lower()):
                friendly_msg = f"❌ {site_info.display_name}直播间当前离线(未开播或已结束)\n\n"
                friendly_msg += f"💡 提示:\n"
                friendly_msg += f"  • 直播平台只能解析和下载正在直播的内容\n"
                friendly_msg += f"  • 请确认主播是否正在直播\n"
                friendly_msg += f"  • 录播/重播内容暂不支持下载\n\n"
                friendly_msg += f"🔗 原始错误: {error_str}"
                raise HTTPException(status_code=400, detail=friendly_msg)
            
            raise
            
        print(f"[解析] 信息提取完成,开始处理...")

        # 转换为B站兼容格式
        print(f"[解析] 开始提取视频属性...")
        video_id = info.get('id', 'unknown')
        title = info.get('title', 'Unknown Title')
        # 安全处理duration，确保不为None
        raw_duration = info.get('duration')
        duration = int(raw_duration) if raw_duration is not None else 0
        uploader = info.get('uploader') or info.get('channel') or 'Unknown'
        thumbnail = info.get('thumbnail')
        
        print(f"[解析] 视频属性:")
        print(f"  - ID: {video_id}")
        print(f"  - 标题: {title}")
        print(f"  - 时长: {duration}秒")
        print(f"  - UP主: {uploader}")
        print(f"  - 封面: {thumbnail[:50] if thumbnail else 'N/A'}...")

        # 提取画质选项（如果支持）
        quality_options = []
        print(f"[画质] 开始提取画质选项...")
        print(f"[画质] 站点支持画质选择: {site_info.supports_quality}")
        
        if site_info.supports_quality and info.get('formats'):
            formats = info['formats']
            print(f"[画质] 找到 {len(formats)} 个格式")
            
            # 按高度分组去重
            height_map = {}
            for fmt in formats:
                height = fmt.get('height')
                format_id = fmt.get('format_id')
                vbr = fmt.get('vbr') or 0  # 处理None值
                ext = fmt.get('ext')
                
                if height and height > 0:
                    # 安全地比较vbr,处理None值
                    existing_vbr = height_map.get(height, {}).get('vbr') or 0
                    if height not in height_map or vbr > existing_vbr:
                        height_map[height] = fmt
                        print(f"[画质]   {height}P (format_id: {format_id}, vbr: {vbr}, ext: {ext})")

            print(f"[画质] 去重后有 {len(height_map)} 个画质选项")
            
            # 生成画质选项
            for height in sorted(height_map.keys(), reverse=True):
                fmt = height_map[height]
                quality_options.append({
                    'quality': height,
                    'description': f'{height}P',
                    'format_id': fmt.get('format_id'),
                })
        else:
            print(f"[画质] 不支持画质选择或没有格式信息,使用默认画质")

        print(f"[构建] 开始构建返回结果...")
        
        result = {
            'bvid': video_id,  # 使用video_id作为bvid
            'title': title,
            'duration': duration,  # duration已经安全处理为int
            'owner': {'name': uploader},
            'pic': thumbnail,
            'quality_options': quality_options if quality_options else [
                {'quality': 0, 'description': '默认画质', 'format_id': 'best'}
            ],
            'site_info': {
                'name': site_info.name,
                'display_name': site_info.display_name,
                'icon': site_info.icon,
                'color': site_info.color,
            },
        }

        print(f"\n=== [解析成功] ===")
        print(f"✅ 标题: {title}")
        print(f"✅ 时长: {duration}秒")
        print(f"✅ UP主: {uploader}")
        print(f"✅ 画质选项: {len(quality_options)}个")
        print(f"✅ 站点: {site_info.display_name}")
        print(f"==================\n")

        return result

    except Exception as e:
        import traceback
        error_msg = f"解析失败: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        raise HTTPException(status_code=500, detail=f"解析视频失败: {str(e)}")


@app.post("/api/universal/download")
async def universal_start_download(request: UniversalDownloadRequest) -> TaskResponse:
    if not HAS_YT_DLP:
        raise HTTPException(status_code=501, detail="服务器未安装 yt-dlp，请先安装：pip install yt-dlp")

    task_id = str(uuid.uuid4())
    download_tasks[task_id] = {
        "status": "queued",
        "url": request.url,
        "output_dir": request.output_dir,
        "progress": {},
        "created_at": datetime.now(),
        "last_update": datetime.now(),
        "source": "universal",
    }

    asyncio.create_task(universal_download_task(task_id, request.url, request.output_dir or "./downloads", request.format))

    return TaskResponse(task_id=task_id, status="queued", message="通用下载任务已加入队列")

@app.delete("/api/bili/tasks/{task_id}")
async def cancel_task(task_id: str) -> dict:
    """取消下载任务"""
    if task_id not in download_tasks:
        raise HTTPException(status_code=404, detail="任务不存在")

    task = download_tasks[task_id]
    if task["status"] in ["completed", "failed"]:
        del download_tasks[task_id]
        return {"message": "任务已删除"}
    else:
        # 标记为取消状态
        task["status"] = "cancelled"
        
        # 如果存在下载进程，尝试终止
        if task_id in download_processes:
            ydl_instance = download_processes[task_id]
            try:
                print(f"[{task_id}] 正在终止下载...")  
                # 对于 yt-dlp，我们只需设置取消标志，下载循环会检查并退出
                # yt-dlp 本身会在下次检查时停止
                if hasattr(ydl_instance, '_stop'):
                    ydl_instance._stop = True
                del download_processes[task_id]
                print(f"[{task_id}] 已发送取消信号")
            except Exception as e:
                print(f"[{task_id}] 终止下载失败: {e}")
        
        await manager.broadcast({"type": "status", "task_id": task_id, "status": "cancelled"})
        return {"message": "任务已取消"}


@app.websocket("/ws/progress")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket连接用于实时进度推送"""
    await manager.connect(websocket)
    try:
        while True:
            # 保持连接活跃
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


async def download_video_task(task_id: str, url: str, quality: int, output_dir: str, filename: str):
    """异步下载任务"""
    global main_loop
    if main_loop is None:
        main_loop = asyncio.get_running_loop()

    print(f"\n=== 下载任务开始 ===")
    print(f"Task ID: {task_id}")
    print(f"URL: {url}")
    print(f"Quality: {quality}")
    print(f"Output: {output_dir}")

    try:
        # 更新状态为解析中
        print(f"更新状态: parsing")
        download_tasks[task_id]["status"] = "parsing"
        await manager.broadcast({
            "type": "status",
            "task_id": task_id,
            "status": "parsing"
        })

        # 解析视频信息
        print("开始解析视频信息...")
        parser = BiliParser()
        video_info = parser.parse_url(url)
        bvid = video_info.get('bvid')
        title = video_info.get('title', 'Unknown')
        print(f"视频解析成功: {title} (BVID: {bvid})")

        # 检查是否已经下载过
        existing_video = await check_existing_video(bvid)
        if existing_video:
            print(f"⚡ 检测到已下载过的视频: {existing_video.get('video_id')}")

            # 直接返回已存在的结果
            download_tasks[task_id]["status"] = "completed"
            download_tasks[task_id]["result"] = {
                "from_cache": True,
                "bvid": bvid,
                "video_id": existing_video.get('video_id'),
                "title": title,
                "message": "视频已存在，秒传完成"
            }
            download_tasks[task_id]["video_id"] = existing_video.get('video_id')

            await manager.broadcast({
                "type": "completed",
                "task_id": task_id,
                "result": download_tasks[task_id]["result"]
            })

            print(f"✅ 秒传完成，跳过下载")
            return

        # 获取下载链接
        print(f"获取下载链接... BVID={video_info['bvid']}, CID={video_info['cid']}, Quality={quality}")
        download_urls = parser.get_download_urls(
            video_info["bvid"],
            video_info["cid"],
            quality
        )
        print(f"下载链接获取成功: 视频={len(download_urls.get('video_urls', []))}, 音频={len(download_urls.get('audio_urls', []))}")

        # 更新状态为下载中
        download_tasks[task_id]["status"] = "downloading"
        await manager.broadcast({
            "type": "status",
            "task_id": task_id,
            "status": "downloading"
        })

        # 创建下载器
        def callback(progress_data):
            progress_callback(task_id, progress_data)

        downloader = BiliDownloader(progress_callback=callback)

        # 分离视频和音频信息
        video_data = {
            "video_urls": download_urls.get("video_urls", []),
            "title": video_info.get("title", "video")
        }
        audio_data = {
            "audio_urls": download_urls.get("audio_urls", [])
        }

        # 开始下载
        print(f"开始下载视频: {filename or video_info.get('title', 'video')}")
        result = await downloader.download_video(
            video_data,
            audio_data,
            output_dir,
            filename or video_info.get("title", "video")
        )
        print(f"下载完成: {result}")

        # 如果是DASH格式，需要合并音视频
        if download_urls.get("format") == "dash" and len(result["results"]) == 2:
            # 更新状态为合并中
            download_tasks[task_id]["status"] = "merging"
            await manager.broadcast({
                "type": "status",
                "task_id": task_id,
                "status": "merging"
            })

            video_file = None
            audio_file = None

            for res in result["results"]:
                if res.get("file_type") == "video":
                    video_file = res.get("file_path")
                elif res.get("file_type") == "audio":
                    audio_file = res.get("file_path")

            if video_file and audio_file:
                # 使用 task_id 作为文件名，保持一致性
                output_file = Path(output_dir) / f"{task_id}.mp4"
                merge_success = await downloader.merge_video_audio(
                    video_file,
                    audio_file,
                    str(output_file)
                )

                if merge_success:
                    # 删除临时文件
                    try:
                        os.remove(video_file)
                        os.remove(audio_file)
                    except:
                        pass
                    result["final_file"] = str(output_file)

        # 添加BVID到结果中
        result["bvid"] = bvid
        result["title"] = title

        # 更新状态为完成
        download_tasks[task_id]["status"] = "completed"
        download_tasks[task_id]["result"] = result

        await manager.broadcast({
            "type": "completed",
            "task_id": task_id,
            "result": result
        })

        # 调用后续处理流程
        await trigger_post_processing(task_id, result)
    except Exception as e:
        import traceback
        error_msg = f"下载失败: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)

        download_tasks[task_id]["status"] = "failed"
        download_tasks[task_id]["error"] = str(e)

        await manager.broadcast({
            "type": "failed",
            "task_id": task_id,
            "error": str(e)
        })



async def universal_download_task(task_id: str, url: str, output_dir: str, format_select: Optional[str]):
    """
    通用下载任务（基于 yt-dlp）
    - 进度通过 WebSocket 与 download_tasks 同步，保持与B站下载一致的消息格式
    - 默认下载最佳画质并自动合并（需要本机 ffmpeg）
    """
    global main_loop
    if main_loop is None:
        main_loop = asyncio.get_running_loop()

    print(f"\n=== [Universal Download] 下载任务开始 ===")
    print(f"Task ID: {task_id}")
    print(f"URL: {url}")
    print(f"Output: {output_dir}")
    print(f"Format: {format_select or '默认'}")

    try:
        # 状态：parsing
        print(f"[{task_id}] 状态: parsing")
        download_tasks[task_id]["status"] = "parsing"
        await manager.broadcast({"type": "status", "task_id": task_id, "status": "parsing"})

        Path(output_dir).mkdir(parents=True, exist_ok=True)
        print(f"[{task_id}] 输出目录已创建: {output_dir}")

        def _progress_hook(d):
            try:
                status = d.get('status')
                if status == 'downloading':
                    downloaded = d.get('downloaded_bytes') or 0
                    total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                    speed = d.get('speed')
                    percent = (downloaded / total * 100) if total else None
                    progress = {
                        "file_type": "video",
                        "progress": round(percent, 2) if percent is not None else 0,
                        "downloaded": downloaded,
                        "total": total,
                        "speed": f"{speed/1024/1024:.2f} MB/s" if speed else None,
                    }
                    download_tasks[task_id]["progress"] = progress
                    download_tasks[task_id]["last_update"] = datetime.now()
                    
                    # 输出进度日志
                    if percent is not None:
                        print(f"[{task_id}] 下载进度: {percent:.1f}% ({downloaded}/{total}) {progress['speed'] or ''}")
                    
                    # 确保 WebSocket 广播在事件循环中执行
                    if main_loop and not main_loop.is_closed():
                        try:
                            asyncio.run_coroutine_threadsafe(
                                manager.broadcast({"type": "progress", "task_id": task_id, "data": progress}),
                                main_loop
                            )
                        except Exception as e:
                            print(f"[{task_id}] 警告: 无法广播进度: {e}")
                elif status == 'finished':
                    print(f"[{task_id}] 分段下载完成，切换到合并状态")
                    # 单个分段完成，切换状态提示
                    if main_loop and not main_loop.is_closed():
                        try:
                            asyncio.run_coroutine_threadsafe(
                                manager.broadcast({"type": "status", "task_id": task_id, "status": "merging"}),
                                main_loop
                            )
                        except Exception as e:
                            print(f"[{task_id}] 警告: 无法广播状态: {e}")
            except Exception as e:
                print(f"[{task_id}] 进度钩子错误: {e}")

        print(f"[{task_id}] 配置 yt-dlp 选项...")
        
        # 检测是否是直播平台
        is_live_platform = any(domain in url.lower() for domain in ['huya.com', 'douyu.com', 'twitch.tv'])
        
        # 基础HTTP头
        base_headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        }
        
        # 虎牙直播特殊配置 - 添加防盗链请求头
        is_huya = 'huya.com' in url.lower()
        if is_huya:
            base_headers.update({
                'Origin': 'https://www.huya.com',
                'Referer': 'https://www.huya.com/',
            })
            print(f"[{task_id}] 检测到虎牙直播，添加防盗链请求头: Origin & Referer")
        
        ydl_opts = {
            'outtmpl': str(Path(output_dir) / '%(title).200s-%(id)s.%(ext)s'),
            'noplaylist': True,
            'merge_output_format': 'mp4',
            'progress_hooks': [_progress_hook],
            'quiet': False,  # 显示输出
            'no_warnings': False,  # 显示警告
            'retries': 10,
            'fragment_retries': 10,
            'http_headers': base_headers,
        }
        
        # 虎牙直播特殊配置：不使用外部下载器，让yt-dlp原生处理防盗链
        if is_huya:
            print(f"[{task_id}] 虎牙直播使用 yt-dlp 原生下载器（不使用ffmpeg）")
            # 对于直播流，使用 http_chunk 下载器
            ydl_opts['downloader'] = 'http'
            # 增加缓冲区大小以处理直播流
            ydl_opts['http_chunk_size'] = 10485760  # 10MB chunks
            # 添加重连配置
            ydl_opts['socket_timeout'] = 30
        
        # 如果有cookies文件,使用它
        cookies_file = Path('./cookies.txt')
        if cookies_file.exists():
            ydl_opts['cookiefile'] = str(cookies_file)
            print(f"[{task_id}] 使用cookies文件: {cookies_file}")
        else:
            print(f"[{task_id}] 未找到cookies文件")
        if format_select:
            ydl_opts['format'] = format_select
            print(f"[{task_id}] 使用自定义格式: {format_select}")
        else:
            # 优先 bestvideo+bestaudio/mp4 其后回退 best
            ydl_opts['format'] = 'bv*[ext=mp4][vcodec~="(avc|h264|h265|hevc|av01)"]+ba[ext=m4a]/b[ext=mp4]/best'
            print(f"[{task_id}] 使用默认格式: {ydl_opts['format']}")

        print(f"[{task_id}] 开始提取视频信息...")
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = ydl.extract_info(url, download=False)
                print(f"[{task_id}] ✅ 视频信息提取成功")
            except Exception as e:
                print(f"[{task_id}] ❌ 提取视频信息失败: {str(e)}")
                raise
                
            title = info.get('title') or 'video'
            thumb = info.get('thumbnail')
            duration = info.get('duration')
            uploader = info.get('uploader')
            
            # ⭐ 关键：检查提取器返回的http_headers，并合并到下载配置中
            extractor_headers = info.get('http_headers', {})
            if extractor_headers:
                print(f"[{task_id}] 检测到提取器提供的HTTP头: {list(extractor_headers.keys())}")
                # 合并headers，提取器的headers优先级更高
                ydl_opts['http_headers'].update(extractor_headers)
                print(f"[{task_id}] 已合并headers: {list(ydl_opts['http_headers'].keys())}")
                
                # 虎牙直播不需要额外配置，yt-dlp会自动使用提取器返回的headers
                if is_huya:
                    print(f"[{task_id}] 虎牙直播已合并防盗链headers，使用原生下载器")
            
            print(f"[{task_id}] 视频信息:")
            print(f"  - 标题: {title}")
            print(f"  - UP主: {uploader}")
            print(f"  - 时长: {duration}秒")

            # 状态：downloading
            print(f"[{task_id}] 状态: downloading")
            download_tasks[task_id]["status"] = "downloading"
            await manager.broadcast({"type": "status", "task_id": task_id, "status": "downloading"})

            result_path = ydl.prepare_filename(info)
            print(f"[{task_id}] 开始下载到: {result_path}")
            
            # ⭐ 关键：使用更新后的headers重新创建YoutubeDL实例进行下载
            print(f"[{task_id}] 使用更新后headers重新初始化下载器...")
        
        # 在新的context中使用更新后的headers进行下载
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                # 检查任务是否被取消
                if download_tasks[task_id].get("status") == "cancelled":
                    print(f"[{task_id}] 任务已取消，停止下载")
                    raise Exception("任务已被用户取消")
                
                # 启动下载并存储yt-dlp实例供后续取消使用
                download_processes[task_id] = ydl
                ydl.download([url])
                
                # 下载完成后移除进程引用
                if task_id in download_processes:
                    del download_processes[task_id]
                
                print(f"[{task_id}] ✅ 下载完成")
            except Exception as e:
                # 清理进程引用
                if task_id in download_processes:
                    del download_processes[task_id]
                
                print(f"[{task_id}] ❌ 下载失败: {str(e)}")
                raise

        # 完成
        print(f"\n[{task_id}] === 下载任务完成 ===")
        print(f"[{task_id}] 文件: {result_path}")
        print(f"[{task_id}] 标题: {title}")
        
        download_tasks[task_id]["status"] = "completed"
        download_tasks[task_id]["result"] = {
            "final_file": result_path,
            "title": title,
            "thumbnail": thumb,
            "duration": duration,
            "uploader": uploader,
        }
        await manager.broadcast({"type": "completed", "task_id": task_id, "result": download_tasks[task_id]["result"]})

        # 可选：复用现有上传逻辑
        print(f"[{task_id}] 开始后续处理...")
        await trigger_post_processing(task_id, {
            "final_file": result_path,
            "bvid": "",
            "title": title,
        })

    except Exception as e:
        import traceback
        error_msg = f"[Universal Download] ❌ 下载失败: {str(e)}\n{traceback.format_exc()}"
        print(f"\n=== [{task_id}] 下载失败 ===")
        print(error_msg)
        print(f"==================\n")
        
        download_tasks[task_id]["status"] = "failed"
        download_tasks[task_id]["error"] = str(e)
        await manager.broadcast({"type": "failed", "task_id": task_id, "error": str(e)})





def upload_file_sync(final_file: str, task_id: str, bvid: str, title: str = None):
    """同步上传文件（在线程池中执行）"""
    import requests
    from requests_toolbelt.multipart.encoder import MultipartEncoder

    try:
        # 获取文件名（带扩展名）
        filename = os.path.basename(final_file)
        print(f"\n[线程池] 开始上传视频: {filename}")
        print(f"[线程池] 原始标题: {title or 'N/A'}")

        # 为了避免Windows上的编码问题，使用ASCII安全的文件名上传
        # 实际的标题通过title字段传递
        safe_filename = f"{task_id}.mp4"  # 使用task_id作为临时文件名

        with open(final_file, 'rb') as f:
            # 使用MultipartEncoder，确保所有字符串字段都是UTF-8编码
            # 注意：title字段需要显式编码为UTF-8字节串，然后解码
            title_utf8 = (title or '').encode('utf-8').decode('utf-8') if title else ''

            multipart_data = MultipartEncoder(
                fields={
                    'video': (safe_filename, f, 'video/mp4'),
                    'source': 'bilibili',
                    'task_id': task_id,
                    'bvid': bvid or '',
                    'title': title_utf8,  # 传递UTF-8编码的标题
                    'original_filename': filename,  # 传递原始文件名作为参考
                    'skip_analysis': 'true'
                }
            )

            response = requests.post(
                "http://localhost:3004/api/videos/upload",
                data=multipart_data,
                headers={
                    'Content-Type': multipart_data.content_type,
                    'Accept-Charset': 'utf-8'  # 明确告诉服务器使用UTF-8
                },
                timeout=300
            )

        if response.status_code == 200:
            result = response.json()
            print(f"[线程池] 上传成功: {result.get('videoId', 'Unknown')}")
            download_tasks[task_id]["upload_status"] = "success"
            download_tasks[task_id]["video_id"] = result.get('videoId')
            return True
        else:
            print(f"[线程池] 上传失败 [{response.status_code}]: {response.text}")
            download_tasks[task_id]["upload_status"] = "failed"
            download_tasks[task_id]["upload_error"] = response.text
            return False

    except Exception as e:
        import traceback
        print(f"[线程池] 上传异常: {str(e)}\n{traceback.format_exc()}")
        download_tasks[task_id]["upload_status"] = "failed"
        download_tasks[task_id]["upload_error"] = str(e)
        return False


async def trigger_post_processing(task_id: str, download_result: dict):
    """触发后续处理流程 - 在线程池中异步上传"""
    final_file = download_result.get("final_file")
    bvid = download_result.get("bvid")
    title = download_result.get("title")  # 获取原始标题

    if not final_file or not os.path.exists(final_file):
        print(f"警告: 最终文件不存在: {final_file}")
        return

    # 在全局线程池中执行上传，不阻塞事件循环
    loop = asyncio.get_running_loop()
    print(f"[异步] 提交上传任务到线程池: {task_id}")
    await loop.run_in_executor(
        upload_executor,
        upload_file_sync,
        final_file,
        task_id,
        bvid,
        title  # 传递原始标题
    )


@app.get("/")
async def root():
    """健康检查"""
    return {"message": "Bili23 Download API is running", "version": "1.0.0"}





# 极简HTML代理：仅用于在弹窗内保持跳转（不代理资源）
from fastapi import Query

ALLOWED_HOST_SUFFIX = ".bilibili.com"
ALLOWED_HOST = "bilibili.com"


def _is_allowed_bilibili_url(u: str) -> bool:
    try:
        p = urlparse(u)
        if p.scheme not in ("http", "https"):
            return False
        host = (p.hostname or "").lower()
        return host == ALLOWED_HOST or host.endswith(ALLOWED_HOST_SUFFIX)
    except Exception:
        return False


@app.get("/proxy")
async def proxy_html(request: Request, url: str = Query(None)):
    """
    极简代理：
    - 只代理HTML页面
    - 为所有链接注入“在当前窗口打开”的逻辑
    - 资源（img/js/css）直接从B站域名加载（通过<base>修正相对路径）
    限制：
    - 登录态等依赖cookie的功能不可用（页面来源非bilibili.com）
    """
    target_url = url or "https://www.bilibili.com/"

    if not _is_allowed_bilibili_url(target_url):
        return HTMLResponse("<h3>仅允许访问 bilibili.com 域名</h3>", status_code=400)

    headers = {
        "User-Agent": request.headers.get(
            "user-agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        ),
        "Accept-Language": request.headers.get("accept-language", "zh-CN,zh;q=0.9"),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    }

    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
        resp = await client.get(target_url, headers=headers)

    ct = resp.headers.get("content-type", "")

    # 非HTML内容，直接透传（一般不会命中，因为我们不改资源URL）
    if "text/html" not in ct:
        return Response(content=resp.content, media_type=ct or "application/octet-stream")

    html = resp.text

    try:
        soup = BeautifulSoup(html, "html.parser")

        # 基础：修正相对路径到B站域（避免资源请求到本地域）
        p = urlparse(str(resp.url))
        base_origin = f"{p.scheme}://{p.hostname}"
        base_tag = soup.new_tag("base", href=base_origin + "/")
        if soup.head:
            soup.head.insert(0, base_tag)
        else:
            head = soup.new_tag("head")
            head.append(base_tag)
            soup.insert(0, head)

        # 尽量移除 target=_blank，减少新开标签
        for a in soup.find_all("a"):
            if a.has_attr("target"):
                a["target"] = "_self"

        # 注入脚本：拦截所有链接点击 & 覆盖 window.open
        proxy_origin = str(request.base_url).rstrip("/")
        inject_js = f"""
<script>
(function(){{
  try {{
    var PROXY_PREFIX = '{proxy_origin}/proxy?url=';
    function abs(u) {{
      var a = document.createElement('a');
      a.href = u;
      return a.href;
    }}
    // 捕获阶段拦截所有<a>点击
    document.addEventListener('click', function(e) {{
      var t = e.target;
      while (t && t.tagName !== 'A') t = t.parentElement;
      if (!t) return;
      var href = t.getAttribute('href');
      if (!href || href.indexOf('javascript:') === 0) return;
      // 允许中键/新窗口快捷键自行处理
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.which === 2) return;
      e.preventDefault();
      var url = abs(href);
      window.location.href = PROXY_PREFIX + encodeURIComponent(url);
    }}, true);

    // 覆盖 window.open，使其在当前窗口内导航
    var _open = window.open;
    window.open = function(u, name, features) {{
      try {{
        if (u) {{
          var url = abs(u);
          window.location.href = PROXY_PREFIX + encodeURIComponent(url);
          return window;
        }}
      }} catch(_e) {{}}
      return _open.apply(this, arguments);
    }};
  }} catch(e) {{}}
}})();
</script>
"""
        if soup.body:
            soup.body.append(BeautifulSoup(inject_js, "html.parser"))
        else:
            html += inject_js
            return HTMLResponse(content=html, media_type="text/html")

        return HTMLResponse(content=str(soup), media_type="text/html")
    except Exception as e:
        # 解析失败则回退：简单注入脚本（不改DOM）
        fallback = f"""
{html}
<script>
(function(){{
  try {{
    var PROXY_PREFIX = '{proxy_origin}/proxy?url=';
    document.addEventListener('click', function(e) {{
      var t=e.target; while(t && t.tagName!=='A') t=t.parentElement; if(!t) return;
      var href=t.getAttribute('href'); if(!href||href.indexOf('javascript:')===0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.which === 2) return;
      e.preventDefault();
      var a=document.createElement('a'); a.href=href; var abs=a.href;
      window.location.href = PROXY_PREFIX + encodeURIComponent(abs);
    }}, true);
    var _open=window.open; window.open=function(u){{ try{{ if(u){{ var a=document.createElement('a'); a.href=u; var abs=a.href; window.location.href=PROXY_PREFIX+encodeURIComponent(abs); return window; }} }}catch(_e){{}} return _open.apply(this, arguments); }}
  }} catch(_e) {{}}
}})();
</script>
"""
        return HTMLResponse(content=fallback, media_type="text/html")



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "bili_api_server:app",
        host="0.0.0.0",
        port=8888,
        reload=True
    )
