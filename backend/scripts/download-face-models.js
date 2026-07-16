#!/usr/bin/env node
/**
 * Download face-api model weights into backend/models/face-api
 * Run once after npm install: npm run face:models
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const MODEL_DIR = path.join(__dirname, '../models/face-api');
const BASE =
  'https://raw.githubusercontent.com/vladmandic/face-api/master/model';

const FILES = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model.bin',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model.bin',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model.bin',
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
      })
      .on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  for (const name of FILES) {
    const dest = path.join(MODEL_DIR, name);
    if (fs.existsSync(dest)) {
      console.log(`skip ${name}`);
      continue;
    }
    const url = `${BASE}/${name}`;
    console.log(`download ${name}`);
    await download(url, dest);
  }
  console.log('Face models ready in', MODEL_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
