import React, { useState } from 'react';

interface Video {
  bvid: string;
  title: string;
  duration?: string;
  pic?: string;
  play?: number;
  index?: string;
  badge?: string;
}

interface VideoListSelectorProps {
  videos: Video[];
  listType: 'space' | 'bangumi';
  listTitle: string;
  onDownload: (selectedBvids: string[]) => void;
  onClose: () => void;
}

export const VideoListSelector: React.FC<VideoListSelectorProps> = ({
  videos,
  listType,
  listTitle,
  onDownload,
  onClose
}) => {
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  const handleToggleVideo = (bvid: string) => {
    const newSelected = new Set(selectedVideos);
    if (newSelected.has(bvid)) {
      newSelected.delete(bvid);
    } else {
      newSelected.add(bvid);
    }
    setSelectedVideos(newSelected);
    setSelectAll(newSelected.size === videos.length);
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedVideos(new Set());
    } else {
      setSelectedVideos(new Set(videos.map(v => v.bvid)));
    }
    setSelectAll(!selectAll);
  };

  const handleDownload = () => {
    if (selectedVideos.size > 0) {
      onDownload(Array.from(selectedVideos));
    }
  };

  return (
    <div className="video-list-selector-overlay">
      <div className="video-list-selector">
        <div className="selector-header">
          <h2>{listTitle}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="selector-toolbar">
          <label className="select-all-checkbox">
            <input
              type="checkbox"
              checked={selectAll}
              onChange={handleSelectAll}
            />
            <span>全选 ({videos.length}个视频)</span>
          </label>
          <div className="selected-count">
            已选择: {selectedVideos.size} / {videos.length}
          </div>
        </div>

        <div className="video-list">
          {videos.map((video) => (
            <div
              key={video.bvid}
              className={`video-item ${selectedVideos.has(video.bvid) ? 'selected' : ''}`}
              onClick={() => handleToggleVideo(video.bvid)}
            >
              <input
                type="checkbox"
                checked={selectedVideos.has(video.bvid)}
                onChange={() => {}}
                className="video-checkbox"
              />
              {video.pic && (
                <img 
                  src={`http://localhost:3004/api/bili/image-proxy?url=${encodeURIComponent(video.pic)}`}
                  alt={video.title} 
                  className="video-thumbnail"
                  onError={(e) => {
                    // 如果代理失败，隐藏图片
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <div className="video-info">
                <div className="video-title">
                  {listType === 'bangumi' && video.index && (
                    <span className="video-index">{video.index}</span>
                  )}
                  {video.title}
                  {video.badge && (
                    <span className="video-badge">{video.badge}</span>
                  )}
                </div>
                <div className="video-meta">
                  {video.duration && <span>时长: {video.duration}</span>}
                  {video.play && <span>播放: {video.play}</span>}
                </div>
                <div className="video-bvid">{video.bvid}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="selector-footer">
          <button className="cancel-btn" onClick={onClose}>
            取消
          </button>
          <button
            className="download-btn"
            onClick={handleDownload}
            disabled={selectedVideos.size === 0}
          >
            下载选中 ({selectedVideos.size})
          </button>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .video-list-selector-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 20px;
        }

        .video-list-selector {
          background: white;
          border-radius: 12px;
          width: 900px;
          max-width: 100%;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        }

        .selector-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #e1e8ed;
        }

        .selector-header h2 {
          margin: 0;
          font-size: 20px;
          color: #1a1a1a;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 24px;
          color: #657786;
          cursor: pointer;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: all 0.2s;
        }

        .close-btn:hover {
          background: #f7f9fa;
          color: #1a1a1a;
        }

        .selector-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: #f7f9fa;
          border-bottom: 1px solid #e1e8ed;
        }

        .select-all-checkbox {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-weight: 500;
          color: #14171a;
        }

        .select-all-checkbox input[type="checkbox"] {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .selected-count {
          color: #00a1d6;
          font-weight: 600;
        }

        .video-list {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
        }

        .video-item {
          display: flex;
          gap: 12px;
          padding: 12px;
          border: 2px solid #e1e8ed;
          border-radius: 8px;
          margin-bottom: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .video-item:hover {
          border-color: #00a1d6;
          background: #f0f8ff;
        }

        .video-item.selected {
          border-color: #00a1d6;
          background: #e6f7ff;
        }

        .video-checkbox {
          flex-shrink: 0;
          width: 18px;
          height: 18px;
          margin-top: 4px;
          cursor: pointer;
        }

        .video-thumbnail {
          width: 120px;
          height: 75px;
          object-fit: cover;
          border-radius: 4px;
          flex-shrink: 0;
        }

        .video-info {
          flex: 1;
          min-width: 0;
        }

        .video-title {
          font-weight: 500;
          color: #14171a;
          margin-bottom: 6px;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .video-index {
          background: #00a1d6;
          color: white;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
        }

        .video-badge {
          background: #fb7299;
          color: white;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
        }

        .video-meta {
          display: flex;
          gap: 16px;
          font-size: 13px;
          color: #657786;
          margin-bottom: 4px;
        }

        .video-bvid {
          font-family: 'Consolas', monospace;
          font-size: 12px;
          color: #8899a6;
        }

        .selector-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 16px 20px;
          border-top: 1px solid #e1e8ed;
          background: #f7f9fa;
        }

        .cancel-btn, .download-btn {
          padding: 10px 24px;
          border-radius: 6px;
          border: none;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .cancel-btn {
          background: white;
          color: #14171a;
          border: 1px solid #cfd9de;
        }

        .cancel-btn:hover {
          background: #f7f9fa;
        }

        .download-btn {
          background: #00a1d6;
          color: white;
        }

        .download-btn:hover:not(:disabled) {
          background: #0090c1;
        }

        .download-btn:disabled {
          background: #cfd9de;
          cursor: not-allowed;
        }
      ` }} />
    </div>
  );
};
