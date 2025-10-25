import React from 'react';

interface Site {
  name: string;
  display_name: string;
  icon: string;
  color: string;
  supports_quality: boolean;
  website?: string;  // 官网地址
  example?: string;  // 示例URL
}

interface SupportedSitesModalProps {
  onClose: () => void;
}

// 所有58个支持的站点,按分类组织
const SUPPORTED_SITES = [
  {
    category: '🇨🇳 中文视频平台',
    sites: [
      { name: 'bilibili', display_name: 'B站', icon: '📺', color: '#00a1d6', supports_quality: true, website: 'https://www.bilibili.com', example: 'https://www.bilibili.com/video/BV1xx411c7mD' },
      { name: 'douyin', display_name: '抖音', icon: '🎵', color: '#000000', supports_quality: false, website: 'https://www.douyin.com', example: 'https://www.douyin.com/video/xxx' },
      { name: 'weibo', display_name: '微博', icon: '🔴', color: '#e6162d', supports_quality: false, website: 'https://weibo.com', example: 'https://weibo.com/tv/show/xxx' },
      { name: 'xiaohongshu', display_name: '小红书', icon: '📕', color: '#ff2442', supports_quality: false, website: 'https://www.xiaohongshu.com', example: 'https://www.xiaohongshu.com/explore/xxx' },
      { name: 'huya', display_name: '虎牙直播', icon: '🐯', color: '#ff7f00', supports_quality: true, website: 'https://www.huya.com', example: 'https://www.huya.com/xxx' },
      { name: 'douyu', display_name: '斗鱼直播', icon: '🐟', color: '#ff6600', supports_quality: true, website: 'https://www.douyu.com', example: 'https://www.douyu.com/xxx' },
    ]
  },
  {
    category: '🌍 国际主流平台',
    sites: [
      { name: 'youtube', display_name: 'YouTube', icon: '▶️', color: '#ff0000', supports_quality: true, website: 'https://www.youtube.com', example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      { name: 'tiktok', display_name: 'TikTok', icon: '🎵', color: '#000000', supports_quality: false, website: 'https://www.tiktok.com', example: 'https://www.tiktok.com/@user/video/xxx' },
      { name: 'twitter', display_name: 'Twitter/X', icon: '🐦', color: '#1da1f2', supports_quality: false, website: 'https://twitter.com', example: 'https://twitter.com/user/status/xxx' },
      { name: 'instagram', display_name: 'Instagram', icon: '📷', color: '#e4405f', supports_quality: false, website: 'https://www.instagram.com', example: 'https://www.instagram.com/p/xxx/' },
      { name: 'facebook', display_name: 'Facebook', icon: '👥', color: '#1877f2', supports_quality: false, website: 'https://www.facebook.com', example: 'https://www.facebook.com/watch/?v=xxx' },
      { name: 'vimeo', display_name: 'Vimeo', icon: '🎬', color: '#1ab7ea', supports_quality: true, website: 'https://vimeo.com', example: 'https://vimeo.com/xxx' },
      { name: 'twitch', display_name: 'Twitch', icon: '🎮', color: '#9146ff', supports_quality: true, website: 'https://www.twitch.tv', example: 'https://www.twitch.tv/videos/xxx' },
      { name: 'reddit', display_name: 'Reddit', icon: '🤖', color: '#ff4500', supports_quality: false, website: 'https://www.reddit.com', example: 'https://www.reddit.com/r/videos/xxx' },
      { name: 'dailymotion', display_name: 'Dailymotion', icon: '🎥', color: '#0066dc', supports_quality: true, website: 'https://www.dailymotion.com', example: 'https://www.dailymotion.com/video/xxx' },
    ]
  },
  {
    category: '🎓 学习教育平台',
    sites: [
      { name: 'coursera', display_name: 'Coursera', icon: '🎓', color: '#0056d2', supports_quality: true, website: 'https://www.coursera.org', example: 'https://www.coursera.org/lecture/xxx' },
      { name: 'udemy', display_name: 'Udemy', icon: '🎓', color: '#a435f0', supports_quality: true, website: 'https://www.udemy.com', example: 'https://www.udemy.com/course/xxx' },
      { name: 'ted', display_name: 'TED', icon: '💡', color: '#e62b1e', supports_quality: true, website: 'https://www.ted.com', example: 'https://www.ted.com/talks/xxx' },
    ]
  },
  {
    category: '📰 新闻媒体',
    sites: [
      { name: 'cnn', display_name: 'CNN', icon: '📰', color: '#cc0000', supports_quality: true, website: 'https://www.cnn.com', example: 'https://www.cnn.com/videos/xxx' },
      { name: 'bbc', display_name: 'BBC', icon: '📰', color: '#000000', supports_quality: true, website: 'https://www.bbc.com', example: 'https://www.bbc.com/news/av/xxx' },
      { name: 'espn', display_name: 'ESPN', icon: '⚽', color: '#d50a0a', supports_quality: true, website: 'https://www.espn.com', example: 'https://www.espn.com/video/clip/_/id/xxx' },
    ]
  },
  {
    category: '🎧 音频平台',
    sites: [
      { name: 'soundcloud', display_name: 'SoundCloud', icon: '🎧', color: '#ff5500', supports_quality: false, website: 'https://soundcloud.com', example: 'https://soundcloud.com/user/track' },
      { name: 'bandcamp', display_name: 'Bandcamp', icon: '🎵', color: '#629aa9', supports_quality: false, website: 'https://bandcamp.com', example: 'https://artist.bandcamp.com/track/xxx' },
      { name: 'mixcloud', display_name: 'Mixcloud', icon: '🎵', color: '#314359', supports_quality: false, website: 'https://www.mixcloud.com', example: 'https://www.mixcloud.com/xxx/' },
      { name: 'spotify', display_name: 'Spotify', icon: '🎵', color: '#1db954', supports_quality: false, website: 'https://www.spotify.com', example: 'https://open.spotify.com/track/xxx' },
    ]
  },
  {
    category: '🇯🇵 日韩及动漫',
    sites: [
      { name: 'niconico', display_name: 'niconico', icon: '📹', color: '#231815', supports_quality: false, website: 'https://www.nicovideo.jp', example: 'https://www.nicovideo.jp/watch/smxxxx' },
      { name: 'afreecatv', display_name: 'AfreecaTV', icon: '🎥', color: '#0064ff', supports_quality: false, website: 'https://www.afreecatv.com', example: 'https://play.afreecatv.com/xxx' },
      { name: 'crunchyroll', display_name: 'Crunchyroll', icon: '🍥', color: '#f47521', supports_quality: true, website: 'https://www.crunchyroll.com', example: 'https://www.crunchyroll.com/watch/xxx' },
      { name: 'funimation', display_name: 'Funimation', icon: '🎌', color: '#5b0bb5', supports_quality: true, website: 'https://www.funimation.com', example: 'https://www.funimation.com/shows/xxx' },
      { name: 'vrv', display_name: 'VRV', icon: '📺', color: '#ff8500', supports_quality: true, website: 'https://vrv.co', example: 'https://vrv.co/watch/xxx' },
    ]
  },
  {
    category: '🇷🇺 俄罗斯平台',
    sites: [
      { name: 'vk', display_name: 'VK', icon: '🔵', color: '#4680c2', supports_quality: true, website: 'https://vk.com', example: 'https://vk.com/video-xxx' },
      { name: 'ok', display_name: 'OK.ru', icon: '🟠', color: '#ee8208', supports_quality: true, website: 'https://ok.ru', example: 'https://ok.ru/video/xxx' },
      { name: 'rutube', display_name: 'RuTube', icon: '🎬', color: '#00a8e8', supports_quality: true, website: 'https://rutube.ru', example: 'https://rutube.ru/video/xxx' },
    ]
  },
  {
    category: '🎨 其他平台',
    sites: [
      { name: 'streamable', display_name: 'Streamable', icon: '📹', color: '#0e7ac4', supports_quality: true, website: 'https://streamable.com', example: 'https://streamable.com/xxx' },
      { name: 'imgur', display_name: 'Imgur', icon: '🖼️', color: '#1bb76e', supports_quality: false, website: 'https://imgur.com', example: 'https://imgur.com/gallery/xxx' },
      { name: 'gfycat', display_name: 'Gfycat', icon: '🐱', color: '#00ccff', supports_quality: true, website: 'https://gfycat.com', example: 'https://gfycat.com/xxx' },
      { name: 'linkedin', display_name: 'LinkedIn', icon: '💼', color: '#0077b5', supports_quality: true, website: 'https://www.linkedin.com', example: 'https://www.linkedin.com/posts/xxx' },
      { name: 'pinterest', display_name: 'Pinterest', icon: '📌', color: '#e60023', supports_quality: false, website: 'https://www.pinterest.com', example: 'https://www.pinterest.com/pin/xxx' },
      { name: 'tumblr', display_name: 'Tumblr', icon: '📝', color: '#35465c', supports_quality: false, website: 'https://www.tumblr.com', example: 'https://user.tumblr.com/post/xxx' },
      { name: 'flickr', display_name: 'Flickr', icon: '📸', color: '#0063dc', supports_quality: true, website: 'https://www.flickr.com', example: 'https://www.flickr.com/photos/xxx' },
      { name: 'vine', display_name: 'Vine', icon: '🌿', color: '#00b488', supports_quality: false, website: 'https://vine.co', example: 'https://vine.co/v/xxx' },
      { name: 'periscope', display_name: 'Periscope', icon: '📡', color: '#40a4c4', supports_quality: true, website: 'https://www.pscp.tv', example: 'https://www.pscp.tv/w/xxx' },
      { name: 'liveleak', display_name: 'LiveLeak', icon: '📹', color: '#d32f2f', supports_quality: false, website: 'https://www.liveleak.com', example: 'https://www.liveleak.com/view?t=xxx' },
      { name: 'metacafe', display_name: 'Metacafe', icon: '🎬', color: '#e8530f', supports_quality: false, website: 'https://www.metacafe.com', example: 'https://www.metacafe.com/watch/xxx' },
      { name: 'break', display_name: 'Break', icon: '💥', color: '#ff0000', supports_quality: false, website: 'http://www.break.com', example: 'http://www.break.com/video/xxx' },
      { name: 'vevo', display_name: 'Vevo', icon: '🎵', color: '#ff0000', supports_quality: true, website: 'https://www.vevo.com', example: 'https://www.vevo.com/watch/xxx' },
    ]
  },
];

export const SupportedSitesModal: React.FC<SupportedSitesModalProps> = ({ onClose }) => {
  const totalSites = SUPPORTED_SITES.reduce((sum, category) => sum + category.sites.length, 0);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10000,
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        maxWidth: '1000px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        {/* 标题栏 */}
        <div style={{
          padding: '24px',
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: 'white' }}>
              🌐 支持的视频网站
            </h2>
            <p style={{ margin: '8px 0 0 0', fontSize: '14px', color: 'rgba(255,255,255,0.9)' }}>
              共支持 {totalSites} 个视频平台，自动识别并下载
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '8px',
              width: '36px',
              height: '36px',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
          >
            ✕
          </button>
        </div>

        {/* 内容区 */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '24px'
        }}>
          {SUPPORTED_SITES.map((category, idx) => (
            <div key={idx} style={{ marginBottom: '32px' }}>
              <h3 style={{
                margin: '0 0 16px 0',
                fontSize: '16px',
                fontWeight: 600,
                color: '#333',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                {category.category}
                <span style={{
                  fontSize: '12px',
                  color: '#666',
                  fontWeight: 400,
                  background: '#f0f0f0',
                  padding: '2px 8px',
                  borderRadius: '12px'
                }}>
                  {category.sites.length} 个
                </span>
              </h3>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '12px'
              }}>
                {category.sites.map((site, siteIdx) => (
                  <div
                    key={siteIdx}
                    style={{
                      padding: '14px',
                      background: 'white',
                      borderRadius: '12px',
                      border: '2px solid #f0f0f0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      transition: 'all 0.3s',
                      cursor: 'default',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = site.color;
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = `0 8px 20px ${site.color}30`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#f0f0f0';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    {/* 顶部信息 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        fontSize: '28px',
                        width: '48px',
                        height: '48px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: `linear-gradient(135deg, ${site.color}20, ${site.color}40)`,
                        borderRadius: '12px',
                        boxShadow: `0 2px 8px ${site.color}20`
                      }}>
                        {site.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '15px',
                          fontWeight: 700,
                          color: '#2c3e50',
                          marginBottom: '4px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {site.display_name}
                        </div>
                        <div style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '10px',
                          fontWeight: 600,
                          background: site.supports_quality ? '#e8f5e9' : '#f5f5f5',
                          color: site.supports_quality ? '#2e7d32' : '#757575'
                        }}>
                          {site.supports_quality ? '✓ 画质选择' : '自动画质'}
                        </div>
                      </div>
                    </div>
                    
                    {/* 按钮组 */}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {site.website && (
                        <button
                          onClick={() => window.open(site.website, '_blank')}
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            background: `linear-gradient(135deg, ${site.color}, ${site.color}dd)`,
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'scale(1.05)';
                            e.currentTarget.style.boxShadow = `0 4px 12px ${site.color}40`;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >
                          🌍 访问官网
                        </button>
                      )}
                      {site.example && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(site.example!);
                            alert('示例URL已复制到剪贴板！');
                          }}
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            background: '#f0f0f0',
                            color: '#666',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#e0e0e0';
                            e.currentTarget.style.transform = 'scale(1.05)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#f0f0f0';
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                        >
                          📋 示例
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 底部提示 */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #e0e0e0',
          background: '#f9f9f9',
          borderRadius: '0 0 12px 12px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '13px',
            color: '#666'
          }}>
            <span style={{ fontSize: '16px' }}>💡</span>
            <div>
              <strong>使用方法:</strong> 复制任意支持网站的视频链接，应用会自动识别并提供下载选项。
              <br />
              <span style={{ color: '#4caf50', fontWeight: 600 }}>✓ 支持画质</span> 表示可以选择不同的视频画质。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
