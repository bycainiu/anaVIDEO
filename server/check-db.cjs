const Database = require('better-sqlite3');

const db = new Database('./storage/database.sqlite3');
const video = db.prepare('SELECT id, name, file_path FROM videos WHERE id = ?').get('a33dcb6b-bfa0-4383-b0b3-bb995622d149');

console.log('Video in database:');
console.log(JSON.stringify(video, null, 2));

const actualFiles = require('fs').readdirSync(`./storage/videos/${video.id}`);
console.log('\nActual files on disk:', actualFiles);

db.close();
