"""
WBI签名工具模块
B站API防护机制的签名工具
"""
import time
import urllib.parse
from hashlib import md5
from functools import reduce

# WBI混淆表
mixinKeyEncTab = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52
]


class WbiUtils:
    """WBI签名工具类"""
    
    @staticmethod
    def encWbi(params: dict, img_key: str = "", sub_key: str = "") -> str:
        """生成WBI签名参数"""
        def getMixinKey(orig: str):
            return reduce(lambda s, i: s + orig[i], mixinKeyEncTab, '')[:32]
        
        mixin_key = getMixinKey(img_key + sub_key)
        curr_time = round(time.time())
        
        params['wts'] = curr_time
        params = dict(sorted(params.items()))
        params = {
            k: ''.join(filter(lambda chr: chr not in "!'()*", str(v)))
            for k, v in params.items()
        }
        
        query = urllib.parse.urlencode(params)
        params["w_rid"] = md5((query + mixin_key).encode()).hexdigest()
        
        return urllib.parse.urlencode(params)
    
    @staticmethod
    def get_nav_keys():
        """获取nav接口的img_key和sub_key"""
        from .request import RequestUtils
        from .config import BiliConfig
        import json
        
        try:
            headers = RequestUtils.get_headers(
                referer_url="https://www.bilibili.com/",
                sessdata=BiliConfig.User.SESSDATA
            )
            resp = RequestUtils.request_get("https://api.bilibili.com/x/web-interface/nav", headers=headers)
            data = json.loads(resp.text)
            
            if data["code"] == 0:
                wbi_img = data["data"]["wbi_img"]
                img_url = wbi_img["img_url"]
                sub_url = wbi_img["sub_url"]
                
                # 提取key
                img_key = img_url.split('/')[-1].split('.')[0]
                sub_key = sub_url.split('/')[-1].split('.')[0]
                
                return img_key, sub_key
        except Exception as e:
            print(f"获取WBI密钥失败: {e}")
            
        return "", ""