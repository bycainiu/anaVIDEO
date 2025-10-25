"""
B站链接解析器模块
"""
import re
import json
from typing import Dict, List, Optional
from .config import BiliConfig
from .request import RequestUtils
from .wbi import WbiUtils


class BiliParser:
    """B站视频解析器"""
    
    def __init__(self):
        self.video_info = {}
        self.stream_info = {}
        
    def parse_url(self, url: str) -> Dict:
        """解析B站链接
        
        支持：
        - 单个视频: bilibili.com/video/BVxxx, bilibili.com/video/avxxx
        - 短链: b23.tv/xxx
        - 番剧: bilibili.com/bangumi/play/epxxx, bilibili.com/bangumi/play/ssxxx
        - 用户空间: space.bilibili.com/uid (提示用户选择视频)
        """
        
        # 1. 处理短链 b23.tv
        if re.search(r'b23\.tv|bili2233\.cn', url):
            url = self._resolve_short_url(url)
        
        # 2. 处理用户空间链接
        if match := re.search(r'space\.bilibili\.com/(\d+)', url):
            uid = match.group(1)
            return self._parse_space_videos(uid)
        
        # 3. 提取视频标识符
        if "BV" in url:
            bvid = self._extract_bvid(url)
            return self.get_video_info(bvid=bvid)
        elif "av" in url:
            aid = self._extract_aid(url)
            bvid = self._aid_to_bvid(aid)
            return self.get_video_info(bvid=bvid)
        elif "ep" in url or "ss" in url:
            # 番剧链接
            return self._parse_bangumi(url)
        else:
            raise ValueError("不支持的链接格式，请复制视频链接（包含BV或av）")
    
    def get_video_info(self, bvid: str, cid: Optional[int] = None) -> Dict:
        """获取视频基本信息"""
        # 更新WBI密钥
        img_key, sub_key = WbiUtils.get_nav_keys()
        BiliConfig.Auth.img_key = img_key
        BiliConfig.Auth.sub_key = sub_key
        
        # 构建请求参数
        params = {"bvid": bvid}
        url = f"https://api.bilibili.com/x/web-interface/wbi/view?{WbiUtils.encWbi(params, img_key, sub_key)}"
        
        try:
            headers = RequestUtils.get_headers(
                referer_url="https://www.bilibili.com/",
                sessdata=BiliConfig.User.SESSDATA
            )
            resp = RequestUtils.request_get(url, headers=headers)
            data = json.loads(resp.text)
            
            if data["code"] != 0:
                raise Exception(f"API请求失败: {data['message']}")
            
            video_data = data["data"]
            
            # 提取视频信息
            self.video_info = {
                "bvid": video_data["bvid"],
                "aid": video_data["aid"],
                "cid": cid or video_data["cid"],
                "title": video_data["title"],
                "desc": video_data["desc"],
                "duration": video_data["duration"],
                "pub_date": video_data["pubdate"],
                "pic": video_data.get("pic", ""),  # 封面图
                "owner": {
                    "mid": video_data["owner"]["mid"],
                    "name": video_data["owner"]["name"],
                    "face": video_data["owner"]["face"]
                },
                "stat": video_data["stat"],
                "pages": video_data.get("pages", [])
            }
            
            return self.video_info
            
        except Exception as e:
            raise Exception(f"解析视频信息失败: {str(e)}")
    
    def get_video_stream(self, bvid: str, cid: int, qn: int = 127) -> Dict:
        """获取视频流信息"""
        # 更新WBI密钥
        img_key, sub_key = WbiUtils.get_nav_keys()
        
        params = {
            "bvid": bvid,
            "cid": cid,
            "qn": qn,
            "fnver": 0,
            "fnval": 4048,  # 支持DASH格式
            "fourk": 1
        }
        
        url = f"https://api.bilibili.com/x/player/wbi/playurl?{WbiUtils.encWbi(params, img_key, sub_key)}"
        
        try:
            headers = RequestUtils.get_headers(
                referer_url="https://www.bilibili.com/",
                sessdata=BiliConfig.User.SESSDATA
            )
            resp = RequestUtils.request_get(url, headers=headers)
            data = json.loads(resp.text)
            
            if data["code"] != 0:
                raise Exception(f"获取视频流失败: {data['message']}")
            
            self.stream_info = data["data"]
            return self.stream_info
            
        except Exception as e:
            raise Exception(f"获取视频流失败: {str(e)}")
    
    def get_download_urls(self, bvid: str, cid: int, quality: int = 127) -> Dict:
        """获取下载链接"""
        stream_info = self.get_video_stream(bvid, cid, quality)
        
        result = {
            "video_urls": [],
            "audio_urls": [],
            "format": "dash"
        }
        
        if "dash" in stream_info:
            dash = stream_info["dash"]
            
            # 视频流
            if "video" in dash:
                for video in dash["video"]:
                    if video["id"] == quality:
                        result["video_urls"] = self._get_backup_urls(video)
                        break
                        
                # 如果没找到指定质量，取第一个
                if not result["video_urls"] and dash["video"]:
                    result["video_urls"] = self._get_backup_urls(dash["video"][0])
            
            # 音频流
            if "audio" in dash and dash["audio"]:
                result["audio_urls"] = self._get_backup_urls(dash["audio"][0])
        
        elif "durl" in stream_info:
            # FLV格式
            result["format"] = "flv"
            result["video_urls"] = []
            for durl in stream_info["durl"]:
                result["video_urls"].extend(self._get_backup_urls(durl))
        
        return result
    
    def get_quality_options(self, bvid: str, cid: int) -> List[Dict]:
        """获取可用画质选项"""
        stream_info = self.get_video_stream(bvid, cid)
        quality_options = []
        
        if "dash" in stream_info:
            dash = stream_info["dash"]
            if "video" in dash:
                for video in dash["video"]:
                    quality_id = video["id"]
                    quality_desc = self._get_quality_desc(quality_id)
                    quality_options.append({
                        "quality": quality_id,  # 使用 quality 字段
                        "description": quality_desc,
                        "codec": video.get("codecid", 7),
                        "width": video.get("width", 0),
                        "height": video.get("height", 0)
                    })
        
        # 去重并排序
        seen = set()
        unique_qualities = []
        for q in quality_options:
            if q["quality"] not in seen:
                unique_qualities.append(q)
                seen.add(q["quality"])
        
        return sorted(unique_qualities, key=lambda x: x["quality"], reverse=True)
    
    def _extract_bvid(self, url: str) -> str:
        """提取BVID"""
        match = re.search(r'BV[\w]+', url)
        if match:
            return match.group()
        raise ValueError("无法提取BVID")
    
    def _extract_aid(self, url: str) -> int:
        """提取AID"""
        match = re.search(r'av(\d+)', url)
        if match:
            return int(match.group(1))
        raise ValueError("无法提取AID")
    
    def _aid_to_bvid(self, aid: int) -> str:
        """AID转BVID"""
        XOR_CODE = 23442827791579
        MAX_AID = 1 << 51
        ALPHABET = "FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf"
        ENCODE_MAP = 8, 7, 0, 5, 1, 3, 2, 4, 6
        
        bvid = [""] * 9
        tmp = (MAX_AID | aid) ^ XOR_CODE
        
        for i in range(len(ENCODE_MAP)):
            bvid[ENCODE_MAP[i]] = ALPHABET[tmp % len(ALPHABET)]
            tmp //= len(ALPHABET)
        
        return "BV1" + "".join(bvid)
    
    def _resolve_short_url(self, url: str) -> str:
        """解析短链接，获取真实链接"""
        try:
            headers = RequestUtils.get_headers(
                referer_url="https://www.bilibili.com/"
            )
            resp = RequestUtils.request_get(url, headers=headers, allow_redirects=False)
            
            # 获取重定向链接
            if 'Location' in resp.headers:
                return resp.headers['Location']
            elif resp.status_code == 200:
                # 有些短链会直接返回内容而不是302
                match = re.search(r'window\.location\.href\s*=\s*["\']([^"\' ]+)', resp.text)
                if match:
                    return match.group(1)
            
            raise ValueError("无法解析短链接")
        except Exception as e:
            raise ValueError(f"短链接解析失败: {str(e)}")
    
    def _parse_space_videos(self, uid: str) -> Dict:
        """解析用户空间，获取视频列表"""
        try:
            from .wbi import WbiUtils
            
            # 获取WBI密钥
            img_key, sub_key = WbiUtils.get_nav_keys()
            
            # 获取用户信息（使用WBI签名）
            user_params = {"mid": uid}
            signed_params = WbiUtils.encWbi(user_params, img_key, sub_key)
            user_info_url = f"https://api.bilibili.com/x/space/wbi/acc/info?{signed_params}"
            
            headers = RequestUtils.get_headers(
                referer_url="https://www.bilibili.com/",
                sessdata=BiliConfig.User.SESSDATA
            )
            
            resp = RequestUtils.request_get(user_info_url, headers=headers)
            user_data = json.loads(resp.text)
            
            if user_data["code"] != 0:
                raise Exception(f"获取用户信息失败: {user_data['message']}")
            
            user_name = user_data["data"]["name"]
            
            # 获取用户视频列表（投稿视频）
            videos = []
            page_num = 1
            page_size = 30
            
            while True:
                # 使用WBI签名
                video_params = {"mid": uid, "ps": page_size, "pn": page_num}
                signed_params = WbiUtils.encWbi(video_params, img_key, sub_key)
                video_list_url = f"https://api.bilibili.com/x/space/wbi/arc/search?{signed_params}"
                
                resp = RequestUtils.request_get(video_list_url, headers=headers)
                data = json.loads(resp.text)
                
                if data["code"] != 0:
                    break
                
                video_list = data["data"]["list"]["vlist"]
                if not video_list:
                    break
                
                for video in video_list:
                    videos.append({
                        "bvid": video["bvid"],
                        "title": video["title"],
                        "duration": video["length"],
                        "pic": video["pic"],
                        "created": video["created"],
                        "play": video["play"],
                        "comment": video["comment"]
                    })
                
                # 只获取前3页（最多90个视频）
                if page_num >= 3:
                    break
                    
                page_num += 1
            
            return {
                "type": "space",
                "uid": uid,
                "user_name": user_name,
                "videos": videos,
                "total": len(videos)
            }
            
        except Exception as e:
            raise Exception(f"解析用户空间失败: {str(e)}")
    
    def _parse_bangumi(self, url: str) -> Dict:
        """解析番剧链接，获取分集列表"""
        try:
            # 提取season_id或ep_id
            ss_match = re.search(r'ss(\d+)', url)
            ep_match = re.search(r'ep(\d+)', url)
            md_match = re.search(r'md(\d+)', url)
            
            if ss_match:
                season_id = ss_match.group(1)
                api_url = f"https://api.bilibili.com/pgc/view/web/season?season_id={season_id}"
            elif ep_match:
                ep_id = ep_match.group(1)
                api_url = f"https://api.bilibili.com/pgc/view/web/season?ep_id={ep_id}"
            elif md_match:
                media_id = md_match.group(1)
                api_url = f"https://api.bilibili.com/pgc/review/user?media_id={media_id}"
            else:
                raise ValueError("无法识别番剧ID")
            
            headers = RequestUtils.get_headers(
                referer_url="https://www.bilibili.com/",
                sessdata=BiliConfig.User.SESSDATA
            )
            
            resp = RequestUtils.request_get(api_url, headers=headers)
            data = json.loads(resp.text)
            
            if data["code"] != 0:
                raise Exception(f"获取番剧信息失败: {data['message']}")
            
            result = data["result"]
            episodes = []
            
            # 解析分集列表
            for ep in result.get("episodes", []):
                episodes.append({
                    "ep_id": ep["ep_id"],
                    "cid": ep["cid"],
                    "bvid": ep.get("bvid", ""),
                    "title": ep["long_title"] or ep["title"],
                    "index": ep.get("title", ""),
                    "badge": ep.get("badge", ""),
                    "cover": ep["cover"]
                })
            
            return {
                "type": "bangumi",
                "season_id": result.get("season_id"),
                "title": result.get("title", ""),
                "cover": result.get("cover", ""),
                "episodes": episodes,
                "total": len(episodes)
            }
            
        except Exception as e:
            raise Exception(f"解析番剧失败: {str(e)}")
    
    def _get_backup_urls(self, stream_data: Dict) -> List[str]:
        """获取备用下载链接"""
        urls = []
        
        # 主链接
        if "base_url" in stream_data:
            urls.append(stream_data["base_url"])
        elif "url" in stream_data:
            urls.append(stream_data["url"])
        
        # 备用链接
        if "backup_url" in stream_data:
            urls.extend(stream_data["backup_url"])
        elif "backupUrl" in stream_data:
            urls.extend(stream_data["backupUrl"])
        
        return urls
    
    def _get_quality_desc(self, quality_id: int) -> str:
        """获取画质描述"""
        quality_map = {
            127: "8K 超高清",
            126: "杜比视界",
            125: "HDR 真彩色",
            120: "4K 超清",
            116: "1080P60 高清",
            112: "1080P+ 高清",
            80: "1080P 高清",
            74: "720P60 高清", 
            64: "720P 高清",
            48: "720P (MP4)",
            32: "480P 清晰",
            16: "360P 流畅"
        }
        return quality_map.get(quality_id, f"未知画质({quality_id})")