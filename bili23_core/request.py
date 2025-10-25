"""
HTTP请求工具模块
"""
import requests
from typing import Optional, List
from .config import BiliConfig


class RequestUtils:
    """HTTP请求工具类"""
    session = requests.Session()
    
    @classmethod
    def request_get(cls, url: str, headers=None, proxies=None, stream=False, timeout=10, allow_redirects=True):
        """GET请求"""
        headers, proxies = cls._get_params(headers, proxies)
        return cls.session.get(
            url, 
            headers=headers, 
            proxies=proxies, 
            stream=stream,
            verify=BiliConfig.Advanced.enable_ssl_verify,
            timeout=timeout,
            allow_redirects=allow_redirects
        )
    
    @classmethod
    def request_post(cls, url: str, headers=None, proxies=None, json=None, timeout=10):
        """POST请求"""
        headers, proxies = cls._get_params(headers, proxies)
        return cls.session.post(
            url,
            headers=headers,
            json=json,
            proxies=proxies,
            verify=BiliConfig.Advanced.enable_ssl_verify,
            timeout=timeout
        )
    
    @classmethod
    def request_head(cls, url: str, headers=None, timeout=10):
        """HEAD请求"""
        headers, proxies = cls._get_params(headers, None)
        return cls.session.head(
            url,
            headers=headers,
            proxies=proxies,
            verify=BiliConfig.Advanced.enable_ssl_verify,
            timeout=timeout
        )
    
    @classmethod
    def _get_params(cls, headers=None, proxies=None):
        """获取请求参数"""
        if headers is None:
            headers = cls.get_headers()
        if proxies is None:
            proxies = cls.get_proxies()
        return headers, proxies
    
    @staticmethod
    def get_headers(referer_url: Optional[str] = None, 
                    sessdata: Optional[str] = None, 
                    range_header: Optional[List[int]] = None) -> dict:
        """构建请求头"""
        headers = {
            "User-Agent": BiliConfig.Advanced.user_agent,
        }
        
        cookies = {
            "CURRENT_FNVAL": "4048",
            "_uuid": BiliConfig.Auth.uuid or "",
            "buvid_fp": BiliConfig.Auth.buvid_fp or ""
        }
        
        # 添加可选Cookie
        if BiliConfig.Auth.buvid3:
            cookies["buvid3"] = BiliConfig.Auth.buvid3
            cookies["b_nut"] = BiliConfig.Auth.b_nut
        
        if BiliConfig.Auth.bili_ticket:
            cookies["bili_ticket"] = BiliConfig.Auth.bili_ticket
            
        if BiliConfig.Auth.buvid4:
            cookies["buvid4"] = BiliConfig.Auth.buvid4
        
        # Referer
        if referer_url:
            headers["Referer"] = referer_url
        
        # 用户登录Cookie
        if sessdata or BiliConfig.User.SESSDATA:
            cookies["SESSDATA"] = BiliConfig.User.SESSDATA
            cookies["DedeUserID"] = BiliConfig.User.DedeUserID
            cookies["DedeUserID__ckMd5"] = BiliConfig.User.DedeUserID__ckMd5
            cookies["bili_jct"] = BiliConfig.User.bili_jct
        
        # Range头
        if range_header:
            headers["Range"] = f"bytes={range_header[0]}-{range_header[1]}"
        
        # 过滤空值
        cookies = {k: v for k, v in cookies.items() if v}
        headers["Cookie"] = ";".join([f"{k}={v}" for k, v in cookies.items()])
        
        return headers
    
    @staticmethod
    def get_proxies() -> dict:
        """获取代理配置"""
        if BiliConfig.Proxy.proxy_mode == 0:
            return {}
        elif BiliConfig.Proxy.proxy_mode == 1:
            return None
        elif BiliConfig.Proxy.proxy_mode == 2:
            proxy_url = f"{BiliConfig.Proxy.proxy_ip}:{BiliConfig.Proxy.proxy_port}"
            return {
                "http": proxy_url,
                "https": proxy_url
            }
        return {}