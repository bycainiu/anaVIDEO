import { dbOperations } from './db.js';
import { readdir } from 'fs/promises';
import { join } from 'path';

const videoId = 'a33dcb6b-bfa0-4383-b0b3-bb995622d149';

console.log('=== Checking Video Data ===\n');

const video = dbOperations.getVideoById(videoId);
console.log('Database record:');
console.log(`  ID: ${video.id}`);
console.log(`  Name: ${video.name}`);
console.log(`  File Path: ${video.file_path}`);

const videoDir = join('../storage/videos', videoId);
const files = await readdir(videoDir);
console.log('\nActual files on disk:');
files.forEach(f => console.log(`  - ${f}`));

console.log('\n=== Diagnosis ===');
if (video.file_path !== files[0]) {
    console.log(`❌ MISMATCH DETECTED!`);
    console.log(`   DB has: "${video.file_path}"`);
    console.log(`   Disk has: "${files[0]}"`);
    console.log(`\n   This will cause 404 errors!`);
} else {
    console.log(`✅ file_path matches actual filename`);
}
