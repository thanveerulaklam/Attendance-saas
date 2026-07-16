const path = require('path');
const fs = require('fs');
const { AppError } = require('../utils/AppError');

const MODEL_DIR = path.join(__dirname, '../../models/face-api');
const MATCH_THRESHOLD = Number(process.env.KIOSK_FACE_MATCH_THRESHOLD || 0.55);

let ready = false;
let faceapi = null;
let canvasLib = null;

function modelsInstalled() {
  return fs.existsSync(path.join(MODEL_DIR, 'face_recognition_model-weights_manifest.json'));
}

async function ensureModels() {
  if (ready) return;
  if (!modelsInstalled()) {
    throw new AppError(
      'Face recognition models are not installed. Run: npm run face:models',
      503,
      'FACE_MODELS_MISSING'
    );
  }

  const canvas = require('canvas');
  // tfjs-node 4.22 still calls Node util helpers removed in Node 23+.
  // Keep this compatibility shim until TensorFlow publishes the merged fix.
  const nodeUtil = require('util');
  if (typeof nodeUtil.isNullOrUndefined !== 'function') {
    nodeUtil.isNullOrUndefined = (value) => value === null || value === undefined;
  }
  if (typeof nodeUtil.isArray !== 'function') {
    nodeUtil.isArray = Array.isArray;
  }
  // Register the native TensorFlow backend before face-api is loaded.
  require('@tensorflow/tfjs-node');
  const faceApi = require('@vladmandic/face-api');

  canvasLib = canvas;
  faceapi = faceApi;
  const { Canvas, Image, ImageData } = canvas;
  faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

  await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_DIR);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_DIR);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_DIR);
  ready = true;
}

function euclideanDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

async function computeFaceDescriptor(imageBuffer) {
  await ensureModels();
  const img = await canvasLib.loadImage(imageBuffer);
  const detection = await faceapi
    .detectSingleFace(img)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) return null;
  return Array.from(detection.descriptor);
}

function matchDescriptor(descriptor, candidates, threshold = MATCH_THRESHOLD) {
  if (!descriptor || !candidates?.length) return null;

  let best = null;
  for (const candidate of candidates) {
    const embedding = candidate.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) continue;
    const distance = euclideanDistance(descriptor, embedding);
    if (distance <= threshold && (!best || distance < best.distance)) {
      best = {
        employee_id: candidate.employee_id,
        employee_name: candidate.employee_name,
        employee_code: candidate.employee_code,
        distance,
      };
    }
  }
  return best;
}

module.exports = {
  MODEL_DIR,
  MATCH_THRESHOLD,
  modelsInstalled,
  computeFaceDescriptor,
  matchDescriptor,
};
