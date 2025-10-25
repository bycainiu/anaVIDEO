"""
多站点视频链接检测器
自动识别支持的视频网站并返回站点信息
"""
import re
from typing import Optional, Dict, List
from dataclasses import dataclass


@dataclass
class SiteInfo:
    """站点信息"""
    name: str  # 站点名称
    display_name: str  # 显示名称
    icon: str  # 图标emoji
    color: str  # 主题色
    supports_quality: bool  # 是否支持画质选择
    use_ytdlp: bool  # 是否使用yt-dlp


class SiteDetector:
    """站点检测器"""
    
    # 站点配置：按优先级排序
    SITES = [
        # 中文视频站点
        {
            'name': 'bilibili',
            'display_name': 'B站',
            'icon': '📺',
            'color': '#00a1d6',
            'patterns': [
                r'bilibili\.com',
                r'b23\.tv',
                r'bili2233\.cn',
            ],
            'supports_quality': True,
            'use_ytdlp': False,  # 使用自定义bili23_core
        },
        {
            'name': 'douyin',
            'display_name': '抖音',
            'icon': '🎵',
            'color': '#000000',
            'patterns': [r'douyin\.com'],
            'supports_quality': False,
            'use_ytdlp': True,
        },
        {
            'name': 'tiktok',
            'display_name': 'TikTok',
            'icon': '🎵',
            'color': '#000000',
            'patterns': [r'tiktok\.com'],
            'supports_quality': False,
            'use_ytdlp': True,
        },
        {
            'name': 'youtube',
            'display_name': 'YouTube',
            'icon': '▶️',
            'color': '#ff0000',
            'patterns': [
                r'youtube\.com',
                r'youtu\.be',
                r'm\.youtube\.com',
            ],
            'supports_quality': True,
            'use_ytdlp': True,
        },
        {
            'name': 'twitter',
            'display_name': 'Twitter/X',
            'icon': '🐦',
            'color': '#1da1f2',
            'patterns': [
                r'twitter\.com',
                r'x\.com',
                r't\.co',
            ],
            'supports_quality': False,
            'use_ytdlp': True,
        },
        {
            'name': 'instagram',
            'display_name': 'Instagram',
            'icon': '📷',
            'color': '#e4405f',
            'patterns': [r'instagram\.com'],
            'supports_quality': False,
            'use_ytdlp': True,
        },
        {
            'name': 'facebook',
            'display_name': 'Facebook',
            'icon': '👥',
            'color': '#1877f2',
            'patterns': [
                r'facebook\.com',
                r'fb\.watch',
            ],
            'supports_quality': False,
            'use_ytdlp': True,
        },
        {
            'name': 'weibo',
            'display_name': '微博',
            'icon': '🔴',
            'color': '#e6162d',
            'patterns': [r'weibo\.com'],
            'supports_quality': False,
            'use_ytdlp': True,
        },
        {
            'name': 'xiaohongshu',
            'display_name': '小红书',
            'icon': '📕',
            'color': '#ff2442',
            'patterns': [
                r'xiaohongshu\.com',
                r'xhslink\.com',
            ],
            'supports_quality': False,
            'use_ytdlp': True,
        },
        # 国际视频站点
        {
            'name': 'vimeo',
            'display_name': 'Vimeo',
            'icon': '🎬',
            'color': '#1ab7ea',
            'patterns': [r'vimeo\.com'],
            'supports_quality': True,
            'use_ytdlp': True,
        },
        {
            'name': 'twitch',
            'display_name': 'Twitch',
            'icon': '🎮',
            'color': '#9146ff',
            'patterns': [r'twitch\.tv'],
            'supports_quality': True,
            'use_ytdlp': True,
        },
        {
            'name': 'reddit',
            'display_name': 'Reddit',
            'icon': '🤖',
            'color': '#ff4500',
            'patterns': [
                r'reddit\.com',
                r'redd\.it',
            ],
            'supports_quality': False,
            'use_ytdlp': True,
        },
        # 日韩站点
        {
            'name': 'niconico',
            'display_name': 'niconico',
            'icon': '📹',
            'color': '#231815',
            'patterns': [
                r'nicovideo\.jp',
                r'nico\.ms',
            ],
            'supports_quality': False,
            'use_ytdlp': True,
        },
        {
            'name': 'afreecatv',
            'display_name': 'AfreecaTV',
            'icon': '🎥',
            'color': '#0064ff',
            'patterns': [r'afreecatv\.com'],
            'supports_quality': False,
            'use_ytdlp': True,
        },
        # 音频平台
        {
            'name': 'soundcloud',
            'display_name': 'SoundCloud',
            'icon': '🎧',
            'color': '#ff5500',
            'patterns': [r'soundcloud\.com'],
            'supports_quality': False,
            'use_ytdlp': True,
        },
        # 更多视频平台
        {
            'name': 'dailymotion',
            'display_name': 'Dailymotion',
            'icon': '🎥',
            'color': '#0066dc',
            'patterns': [r'dailymotion\.com', r'dai\.ly'],
            'supports_quality': True,
            'use_ytdlp': True,
        },
        # 直播平台
        {
            'name': 'huya',
            'display_name': '虎牙直播',
            'icon': '🐯',
            'color': '#ff7f00',
            'patterns': [r'huya\.com'],
            'supports_quality': True,
            'use_ytdlp': True,
        },
        {
            'name': 'douyu',
            'display_name': '斗鱼直播',
            'icon': '🐟',
            'color': '#ff6600',
            'patterns': [r'douyu\.com'],
            'supports_quality': True,
            'use_ytdlp': True,
        },
        # 学习平台
        {
            'name': 'coursera',
            'display_name': 'Coursera',
            'icon': '🎓',
            'color': '#0056d2',
            'patterns': [r'coursera\.org'],
            'supports_quality': True,
            'use_ytdlp': True,
        },
        {
            'name': 'udemy',
            'display_name': 'Udemy',
            'icon': '🎓',
            'color': '#a435f0',
            'patterns': [r'udemy\.com'],
            'supports_quality': True,
            'use_ytdlp': True,
        },
        {
            'name': 'ted',
            'display_name': 'TED',
            'icon': '💡',
            'color': '#e62b1e',
            'patterns': [r'ted\.com'],
            'supports_quality': True,
            'use_ytdlp': True,
        },
        # 新闻媒体
        {
            'name': 'cnn',
            'display_name': 'CNN',
            'icon': '📰',
            'color': '#cc0000',
            'patterns': [r'cnn\.com'],
            'supports_quality': True,
            'use_ytdlp': True,
        },
        {
            'name': 'bbc',
            'display_name': 'BBC',
            'icon': '📰',
            'color': '#000000',
            'patterns': [r'bbc\.co\.uk', r'bbc\.com'],
            'supports_quality': True,
            'use_ytdlp': True,
        },
        # 体育平台
        {
            'name': 'espn',
            'display_name': 'ESPN',
            'icon': '⚽',
            'color': '#d50a0a',
            'patterns': [r'espn\.com'],
            'supports_quality': True,
            'use_ytdlp': True,
        },
        # 其他热门平台
        {
            'name': 'vk',
            'display_name': 'VK',
            'icon': '🔵',
            'color': '#4680c2',
            'patterns': [r'vk\.com'],
            'supports_quality': True,
            'use_ytdlp': True,
        },
        {
            'name': 'ok',
            'display_name': 'OK.ru',
            'icon': '🟠',
            'color': '#ee8208',
            'patterns': [r'ok\.ru'],
            'supports_quality': True,
            'use_ytdlp': True,
        },
        {
            'name': 'rutube',
            'display_name': 'RuTube',
            'icon': '🎬',
            'color': '#00a8e8',
            'patterns': [r'rutube\.ru'],
            'supports_quality': True,
            'use_ytdlp': True,
        },
        {
            'name': 'streamable',
            'display_name': 'Streamable',
            'icon': '📹',
            'color': '#0e7ac4',
            'patterns': [r'streamable\.com'],
            'supports_quality': True,
            'use_ytdlp': True,
        },
        {
            'name': 'imgur',
            'display_name': 'Imgur',
            'icon': '🖼️',
            'color': '#1bb76e',
            'patterns': [r'imgur\.com'],
            'supports_quality': False,
            'use_ytdlp': True,
        },
        {
            'name': 'gfycat',
            'display_name': 'Gfycat',
            'icon': '🐱',
            'color': '#00ccff',
            'patterns': [r'gfycat\.com'],
            'supports_quality': True,
            'use_ytdlp': True,
        },
        {
            'name': 'bandcamp',
            'display_name': 'Bandcamp',
            'icon': '🎵',
            'color': '#629aa9',
            'patterns': [r'bandcamp\.com'],
            'supports_quality': False,
            'use_ytdlp': True,
        },
        {
            'name': 'mixcloud',
            'display_name': 'Mixcloud',
            'icon': '🎵',
            'color': '#314359',
            'patterns': [r'mixcloud\.com'],
            'supports_quality': False,
            'use_ytdlp': True,
        },
        {
            'name': 'spotify',
            'display_name': 'Spotify',
            'icon': '🎵',
            'color': '#1db954',
            'patterns': [r'spotify\.com'],
            'supports_quality': False,
            'use_ytdlp': True,
        },
        {
            'name': 'linkedin',
            'display_name': 'LinkedIn',
            'icon': '💼',
            'color': '#0077b5',
            'patterns': [r'linkedin\.com'],
            'supports_quality': True,
            'use_ytdlp': True,
        },
        {
            'name': 'pinterest',
            'display_name': 'Pinterest',
            'icon': '📌',
            'color': '#e60023',
            'patterns': [r'pinterest\.com'],
            'supports_quality': False,
            'use_ytdlp': True,
        },
        {
            'name': 'tumblr',
            'display_name': 'Tumblr',
            'icon': '📝',
            'color': '#35465c',
            'patterns': [r'tumblr\.com'],
            'supports_quality': False,
            'use_ytdlp': True,
        },
        {
            'name': 'flickr',
            'display_name': 'Flickr',
            'icon': '📸',
            'color': '#0063dc',
            'patterns': [r'flickr\.com'],
            'supports_quality': True,
            'use_ytdlp': True,
        },
        {
            'name': 'vine',
            'display_name': 'Vine',
            'icon': '🌿',
            'color': '#00b488',
            'patterns': [r'vine\.co'],
            'supports_quality': False,
            'use_ytdlp': True,
        },
        {
            'name': 'periscope',
            'display_name': 'Periscope',
            'icon': '📡',
            'color': '#40a4c4',
            'patterns': [r'periscope\.tv', r'pscp\.tv'],
            'supports_quality': True,
            'use_ytdlp': True,
        },
        {
            'name': 'liveleak',
            'display_name': 'LiveLeak',
            'icon': '📹',
            'color': '#d32f2f',
            'patterns': [r'liveleak\.com'],
            'supports_quality': False,
            'use_ytdlp': True,
        },
        {
            'name': 'metacafe',
            'display_name': 'Metacafe',
            'icon': '🎬',
            'color': '#e8530f',
            'patterns': [r'metacafe\.com'],
            'supports_quality': False,
            'use_ytdlp': True,
        },
        {
            'name': 'break',
            'display_name': 'Break',
            'icon': '💥',
            'color': '#ff0000',
            'patterns': [r'break\.com'],
            'supports_quality': False,
            'use_ytdlp': True,
        },
        {
            'name': 'vevo',
            'display_name': 'Vevo',
            'icon': '🎵',
            'color': '#ff0000',
            'patterns': [r'vevo\.com'],
            'supports_quality': True,
            'use_ytdlp': True,
        },
        {
            'name': 'crunchyroll',
            'display_name': 'Crunchyroll',
            'icon': '🍥',
            'color': '#f47521',
            'patterns': [r'crunchyroll\.com'],
            'supports_quality': True,
            'use_ytdlp': True,
        },
        {
            'name': 'funimation',
            'display_name': 'Funimation',
            'icon': '🎌',
            'color': '#5b0bb5',
            'patterns': [r'funimation\.com'],
            'supports_quality': True,
            'use_ytdlp': True,
        },
        {
            'name': 'vrv',
            'display_name': 'VRV',
            'icon': '📺',
            'color': '#ff8500',
            'patterns': [r'vrv\.co'],
            'supports_quality': True,
            'use_ytdlp': True,
        },
    ]
    
    @classmethod
    def detect(cls, url: str) -> Optional[SiteInfo]:
        """
        检测URL对应的站点
        
        Args:
            url: 视频链接
            
        Returns:
            SiteInfo对象，如果无法识别则返回None
        """
        if not url:
            return None
            
        url_lower = url.lower()
        
        for site_config in cls.SITES:
            for pattern in site_config['patterns']:
                if re.search(pattern, url_lower):
                    return SiteInfo(
                        name=site_config['name'],
                        display_name=site_config['display_name'],
                        icon=site_config['icon'],
                        color=site_config['color'],
                        supports_quality=site_config['supports_quality'],
                        use_ytdlp=site_config['use_ytdlp'],
                    )
        
        return None
    
    @classmethod
    def is_bilibili(cls, url: str) -> bool:
        """判断是否为B站链接"""
        site = cls.detect(url)
        return site is not None and site.name == 'bilibili'
    
    @classmethod
    def get_supported_sites(cls) -> List[Dict]:
        """获取所有支持的站点列表"""
        return [
            {
                'name': site['name'],
                'display_name': site['display_name'],
                'icon': site['icon'],
                'color': site['color'],
                'supports_quality': site['supports_quality'],
            }
            for site in cls.SITES
        ]
    
    @classmethod
    def format_site_badge(cls, url: str) -> str:
        """
        生成站点徽章文本
        
        Args:
            url: 视频链接
            
        Returns:
            格式化的徽章文本，如 "📺 B站"
        """
        site = cls.detect(url)
        if site:
            return f"{site.icon} {site.display_name}"
        return "🌐 未知站点"


# 测试代码
if __name__ == '__main__':
    test_urls = [
        'https://www.bilibili.com/video/BV1xx411c7mD',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://twitter.com/user/status/123456',
        'https://www.tiktok.com/@user/video/123456',
        'https://www.instagram.com/p/ABC123/',
        'https://example.com/video',
    ]
    
    print("站点检测测试：\n")
    for url in test_urls:
        site = SiteDetector.detect(url)
        if site:
            print(f"✅ {url}")
            print(f"   站点: {site.display_name} ({site.name})")
            print(f"   图标: {site.icon}")
            print(f"   颜色: {site.color}")
            print(f"   画质选择: {'支持' if site.supports_quality else '不支持'}")
            print(f"   引擎: {'yt-dlp' if site.use_ytdlp else '自定义'}")
        else:
            print(f"❌ {url} - 不支持")
        print()

