"""
配置管理模块
简化版的配置系统，去除GUI相关配置
"""
import os


class BiliConfig:
    """B站下载配置类"""
    
    # 用户认证信息
    class User:
        SESSDATA: str = ""
        DedeUserID: str = ""
        DedeUserID__ckMd5: str = ""
        bili_jct: str = ""
        
    # 鉴权参数
    class Auth:
        buvid3: str = ""
        buvid4: str = ""
        buvid_fp: str = ""
        b_nut: str = ""
        bili_ticket: str = ""
        bili_ticket_expires: int = 0
        uuid: str = ""
        b_lsid: str = ""
        img_key: str = ""
        sub_key: str = ""
        
    # 下载配置
    class Download:
        path: str = "./downloads"
        max_download_count: int = 3  # 最大并发下载数
        video_quality_priority: list = [127, 120, 116, 112, 80, 64, 32, 16]  # 画质优先级
        audio_quality_priority: list = [30280, 30232, 30216, 30250]  # 音质优先级
        video_codec_priority: list = [13, 12, 7]  # 编码优先级 (AV1, HEVC, AVC)
        enable_speed_limit: bool = False
        speed_mbps: float = 10.0
        
    # 高级配置
    class Advanced:
        enable_switch_cdn: bool = True
        cdn_list: list = []
        retry_when_download_error: bool = True
        download_error_retry_count: int = 3
        retry_when_download_suspend: bool = True
        download_suspend_retry_interval: int = 10
        always_use_https_protocol: bool = True
        enable_ssl_verify: bool = True
        user_agent: str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        
    # 代理配置
    class Proxy:
        proxy_mode: int = 0  # 0: 禁用, 1: 跟随系统, 2: 自定义
        proxy_ip: str = ""
        proxy_port: int = 0
        enable_auth: bool = False
        auth_username: str = ""
        auth_password: str = ""
        
    @classmethod
    def set_cookies(cls, cookies_dict: dict):
        """设置用户Cookie"""
        cls.User.SESSDATA = cookies_dict.get("SESSDATA", "")
        cls.User.DedeUserID = cookies_dict.get("DedeUserID", "")
        cls.User.DedeUserID__ckMd5 = cookies_dict.get("DedeUserID__ckMd5", "")
        cls.User.bili_jct = cookies_dict.get("bili_jct", "")
        
        # 设置设备指纹
        if "buvid3" in cookies_dict:
            cls.Auth.buvid3 = cookies_dict["buvid3"]
        if "buvid4" in cookies_dict:
            cls.Auth.buvid4 = cookies_dict["buvid4"]
        if "buvid_fp" in cookies_dict:
            cls.Auth.buvid_fp = cookies_dict["buvid_fp"]
        if "b_nut" in cookies_dict:
            cls.Auth.b_nut = cookies_dict["b_nut"]
        if "bili_ticket" in cookies_dict:
            cls.Auth.bili_ticket = cookies_dict["bili_ticket"]
        if "_uuid" in cookies_dict:
            cls.Auth.uuid = cookies_dict["_uuid"]
            
    @classmethod
    def set_download_path(cls, path: str):
        """设置下载路径"""
        cls.Download.path = path
        os.makedirs(path, exist_ok=True)
        
    @classmethod
    def validate_cookies(cls) -> bool:
        """验证Cookie是否有效"""
        return bool(cls.User.SESSDATA and cls.User.DedeUserID)
