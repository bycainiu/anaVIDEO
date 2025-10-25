import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbDir = join(__dirname, '../data');
const dbPath = join(dbDir, 'anavideo.db');

// 确保数据目录存在
mkdirSync(dbDir, { recursive: true });

// 初始化数据库
let db;
let SQL;

async function initDb() {
  SQL = await initSqlJs();
  
  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  return db;
}

// 保存数据库到文件
function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    writeFileSync(dbPath, buffer);
  }
}

// 等待数据库初始化
await initDb();

// 数据库迁移：添加 file_hash 和 file_size 列（如果不存在）
try {
  db.exec(`ALTER TABLE videos ADD COLUMN file_hash TEXT`);
  console.log('[Database] Added file_hash column');
} catch (e) {
  // 列已存在，忽略错误
}

try {
  db.exec(`ALTER TABLE videos ADD COLUMN file_size INTEGER`);
  console.log('[Database] Added file_size column');
} catch (e) {
  // 列已存在，忽略错误
}

try {
  db.exec(`ALTER TABLE videos ADD COLUMN bilibili_bvid TEXT`);
  console.log('[Database] Added bilibili_bvid column');
} catch (e) {
  // 列已存在，忽略错误
}

// 初始化数据库表
db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_hash TEXT,
    file_size INTEGER,
    bilibili_bvid TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_videos_hash ON videos(file_hash);
  CREATE INDEX IF NOT EXISTS idx_videos_bvid ON videos(bilibili_bvid);

  CREATE TABLE IF NOT EXISTS video_analyses (
    video_id TEXT PRIMARY KEY,
    overall_summary_en TEXT,
    overall_summary_cn TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS frame_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id TEXT NOT NULL,
    timestamp REAL NOT NULL,
    frame_path TEXT NOT NULL,
    person_description_en TEXT,
    person_description_cn TEXT,
    clothing_description_en TEXT,
    clothing_description_cn TEXT,
    action_description_en TEXT,
    action_description_cn TEXT,
    inferred_behavior_en TEXT,
    inferred_behavior_cn TEXT,
    keywords_en TEXT,
    keywords_cn TEXT,
    expanded_keywords_en TEXT,
    expanded_keywords_cn TEXT,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_frame_video_id ON frame_analyses(video_id);
  CREATE INDEX IF NOT EXISTS idx_keywords_en ON frame_analyses(keywords_en);
  CREATE INDEX IF NOT EXISTS idx_keywords_cn ON frame_analyses(keywords_cn);
  CREATE INDEX IF NOT EXISTS idx_expanded_keywords_en ON frame_analyses(expanded_keywords_en);
  CREATE INDEX IF NOT EXISTS idx_expanded_keywords_cn ON frame_analyses(expanded_keywords_cn);

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    provider TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);

  CREATE TABLE IF NOT EXISTS subtitles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id TEXT NOT NULL,
    language TEXT NOT NULL,
    format TEXT NOT NULL,
    content TEXT NOT NULL,
    transcription_data TEXT,
    duration REAL,
    segment_count INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    UNIQUE(video_id, language, format)
  );

  CREATE INDEX IF NOT EXISTS idx_subtitles_video ON subtitles(video_id);
`);

// 保存初始化后的数据库
saveDb();

console.log('[Database] Initialized successfully');

// 数据库操作函数
export const dbOperations = {
  // 保存视频基本信息（严格插入）
  saveVideo: (id, name, filePath, fileHash = null, fileSize = null) => {
    db.run(
      'INSERT INTO videos (id, name, file_path, file_hash, file_size) VALUES (?, ?, ?, ?, ?)',
      [id, name, filePath, fileHash, fileSize]
    );
    saveDb();
  },

  // 插入或更新视频（避免重复插入导致失败）
  saveOrUpdateVideo: (id, name, filePath, fileHash = null, fileSize = null, bilibiliId = null) => {
    db.run(
      `INSERT INTO videos (id, name, file_path, file_hash, file_size, bilibili_bvid)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         file_path = excluded.file_path,
         file_hash = COALESCE(excluded.file_hash, videos.file_hash),
         file_size = COALESCE(excluded.file_size, videos.file_size),
         bilibili_bvid = COALESCE(excluded.bilibili_bvid, videos.bilibili_bvid)`,
      [id, name, filePath, fileHash, fileSize, bilibiliId]
    );
    saveDb();
  },
  
  // 通过文件哈希查找视频
  getVideoByHash: (fileHash) => {
    const stmt = db.prepare(`
      SELECT v.*, va.overall_summary_en, va.overall_summary_cn
      FROM videos v
      LEFT JOIN video_analyses va ON v.id = va.video_id
      WHERE v.file_hash = ?
    `);
    stmt.bind([fileHash]);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return result;
  },

  // 保存视频分析结果
  saveVideoAnalysis: (videoId, summaryEn, summaryCn) => {
    db.run(
      'INSERT INTO video_analyses (video_id, overall_summary_en, overall_summary_cn) VALUES (?, ?, ?)',
      [videoId, summaryEn, summaryCn]
    );
    saveDb();
  },

  // 保存帧分析
  saveFrameAnalysis: (...args) => {
    db.run(
      `INSERT INTO frame_analyses (
        video_id, timestamp, frame_path,
        person_description_en, person_description_cn,
        clothing_description_en, clothing_description_cn,
        action_description_en, action_description_cn,
        inferred_behavior_en, inferred_behavior_cn,
        keywords_en, keywords_cn,
        expanded_keywords_en, expanded_keywords_cn
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args
    );
    saveDb();
  },

  // 获取所有视频
  getAllVideos: () => {
    const stmt = db.prepare(`
      SELECT v.*, va.overall_summary_en, va.overall_summary_cn
      FROM videos v
      LEFT JOIN video_analyses va ON v.id = va.video_id
      ORDER BY v.created_at DESC
    `);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  },

  // 获取单个视频详细信息
  getVideoById: (id) => {
    const stmt = db.prepare(`
      SELECT v.*, va.overall_summary_en, va.overall_summary_cn
      FROM videos v
      LEFT JOIN video_analyses va ON v.id = va.video_id
      WHERE v.id = ?
    `);
    stmt.bind([id]);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return result;
  },

  // 获取视频的所有帧分析
  getFramesByVideoId: (videoId) => {
    const stmt = db.prepare(`
      SELECT * FROM frame_analyses
      WHERE video_id = ?
      ORDER BY timestamp ASC
    `);
    stmt.bind([videoId]);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  },

  // 搜索视频（通过关键词）
  searchVideos: (...patterns) => {
    const stmt = db.prepare(`
      SELECT DISTINCT v.*, va.overall_summary_en, va.overall_summary_cn
      FROM videos v
      LEFT JOIN video_analyses va ON v.id = va.video_id
      LEFT JOIN frame_analyses fa ON v.id = fa.video_id
      WHERE 
        v.name LIKE ? OR
        va.overall_summary_en LIKE ? OR
        va.overall_summary_cn LIKE ? OR
        fa.keywords_en LIKE ? OR
        fa.keywords_cn LIKE ? OR
        fa.expanded_keywords_en LIKE ? OR
        fa.expanded_keywords_cn LIKE ?
      ORDER BY v.created_at DESC
    `);
    stmt.bind(patterns);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  },

  // 删除视频
  deleteVideo: (id) => {
    db.run('DELETE FROM videos WHERE id = ?', [id]);
    saveDb();
  },

  // 更新视频标题/名称
  updateVideoTitle: (id, newTitle) => {
    db.run('UPDATE videos SET name = ? WHERE id = ?', [newTitle, id]);
    saveDb();
  },

  // ========== 对话管理 ==========
  
  // 创建或更新对话
  saveConversation: (id, title, provider) => {
    db.run(
      `INSERT OR REPLACE INTO conversations (id, title, provider, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      [id, title, provider]
    );
    saveDb();
  },

  // 获取所有对话
  getAllConversations: () => {
    const stmt = db.prepare(`
      SELECT c.*, COUNT(m.id) as message_count
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      GROUP BY c.id
      ORDER BY c.updated_at DESC
    `);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  },

  // 获取单个对话
  getConversationById: (id) => {
    const stmt = db.prepare('SELECT * FROM conversations WHERE id = ?');
    stmt.bind([id]);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return result;
  },

  // 删除对话
  deleteConversation: (id) => {
    db.run('DELETE FROM conversations WHERE id = ?', [id]);
    saveDb();
  },

  // 保存消息
  saveMessage: (conversationId, role, content) => {
    db.run(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)',
      [conversationId, role, content]
    );
    // 更新对话的 updated_at
    db.run(
      'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [conversationId]
    );
    saveDb();
  },

  // 获取对话的所有消息
  getMessagesByConversationId: (conversationId) => {
    const stmt = db.prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `);
    stmt.bind([conversationId]);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  },

  // 清空对话消息
  clearConversationMessages: (conversationId) => {
    db.run('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
    saveDb();
  },

  // ========== 字幕管理 ==========

  // 保存字幕 - 增强版，确保成功保存
  saveSubtitle: (videoId, language, format, content, transcriptionData, duration, segmentCount) => {
    try {
      // 验证参数
      if (!videoId || !language || !format || !content) {
        throw new Error(`Invalid subtitle parameters: videoId=${videoId}, language=${language}, format=${format}, contentLength=${content?.length}`);
      }
      
      console.log(`[DB] Saving subtitle: videoId=${videoId}, language=${language}, format=${format}, segments=${segmentCount}, duration=${duration}s`);
      console.log(`[DB] Content length: ${content.length} chars, first 50 chars: ${content.substring(0, 50).replace(/\n/g, '\\n')}`);
      
      // 保存到数据库
      db.run(
        `INSERT OR REPLACE INTO subtitles (video_id, language, format, content, transcription_data, duration, segment_count)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [videoId, language, format, content, transcriptionData, duration, segmentCount]
      );
      
      saveDb();
      
      // 验证保存成功
      const saved = dbOperations.getSubtitle(videoId, language, format);
      if (!saved) {
        throw new Error(`Failed to verify saved subtitle for ${videoId}`);
      }
      
      console.log(`[DB] ✅ Subtitle saved and verified successfully`);
      return true;
      
    } catch (error) {
      console.error(`[DB] ❌ Failed to save subtitle:`, error);
      console.error(`[DB] VideoId: ${videoId}, Language: ${language}, Format: ${format}`);
      console.error(`[DB] Content preview: ${content?.substring(0, 200)}`);
      throw error;
    }
  },

  // 获取视频的所有字幕
  getSubtitlesByVideoId: (videoId) => {
    const stmt = db.prepare('SELECT * FROM subtitles WHERE video_id = ? ORDER BY language, format');
    stmt.bind([videoId]);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  },

  // 获取特定格式的字幕
  getSubtitle: (videoId, language, format) => {
    const stmt = db.prepare('SELECT * FROM subtitles WHERE video_id = ? AND language = ? AND format = ?');
    stmt.bind([videoId, language, format]);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return result;
  },

  // 删除视频的所有字幕
  deleteSubtitlesByVideoId: (videoId) => {
    db.run('DELETE FROM subtitles WHERE video_id = ?', [videoId]);
    saveDb();
  },
};

// 批量插入帧分析
export function saveCompleteAnalysis(videoId, videoName, filePath, analysis, framePaths, fileHash = null, fileSize = null) {
  try {
    // 保存或更新视频基本信息（避免重复插入异常）
    dbOperations.saveOrUpdateVideo(videoId, videoName, filePath, fileHash, fileSize);

    // 保存整体分析
    dbOperations.saveVideoAnalysis(
      videoId,
      analysis.overallSummary.en,
      analysis.overallSummary.cn
    );

    // 保存每一帧的分析
    analysis.frameAnalyses.forEach((frame, index) => {
      dbOperations.saveFrameAnalysis(
        videoId,
        frame.timestamp,
        framePaths[index] || '',
        frame.personDescription.en,
        frame.personDescription.cn,
        frame.clothingDescription.en,
        frame.clothingDescription.cn,
        frame.actionDescription.en,
        frame.actionDescription.cn,
        frame.inferredBehavior.en,
        frame.inferredBehavior.cn,
        JSON.stringify(frame.keywords.en),
        JSON.stringify(frame.keywords.cn),
        JSON.stringify(frame.expandedKeywords.en),
        JSON.stringify(frame.expandedKeywords.cn)
      );
    });
  } catch (error) {
    console.error('Error saving complete analysis:', error);
    throw error;
  }
}

export { db, saveDb };
