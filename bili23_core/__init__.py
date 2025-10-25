"""
Bili23 Core - B站视频下载核心库
从Bili23-Downloader提取的核心功能，去除GUI依赖
支持视频解析、下载、认证等功能
"""

__version__ = "1.0.0"

from .parser import BiliParser
from .downloader import BiliDownloader
from .config import BiliConfig

__all__ = ['BiliParser', 'BiliDownloader', 'BiliConfig']
