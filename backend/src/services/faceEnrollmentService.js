const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { computeFaceDescriptor } = require('./faceRecognitionService');

async function createEnrollmentPhoto(imageBuffer) {
  const { createCanvas, loadImage } = require('canvas');
  const image = await loadImage(imageBuffer);
  const maxSize = 320;
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = createCanvas(width, height);
  canvas.getContext('2d').drawImage(image, 0, 0, width, height);
  return canvas.toBuffer('image/jpeg', { quality: 0.78 });
}

async function getEnrollment(companyId, employeeId) {
  const result = await pool.query(
    `SELECT id, employee_id, company_id, enrolled_at
     FROM employee_face_enrollments
     WHERE company_id = $1 AND employee_id = $2`,
    [companyId, employeeId]
  );
  return result.rows[0] || null;
}

async function enrollEmployeeFace(companyId, employeeId, imageBuffer, enrolledBy = null) {
  const emp = await pool.query(
    `SELECT id, name, branch_id, status FROM employees WHERE company_id = $1 AND id = $2`,
    [companyId, employeeId]
  );
  if (emp.rowCount === 0) {
    throw new AppError('Employee not found', 404);
  }
  if (String(emp.rows[0].status) !== 'active') {
    throw new AppError('Employee is not active', 400);
  }

  const descriptor = await computeFaceDescriptor(imageBuffer);
  if (!descriptor) {
    throw new AppError('No face detected. Use a clear front-facing photo.', 422, 'FACE_NOT_DETECTED');
  }
  const photoData = await createEnrollmentPhoto(imageBuffer);

  const result = await pool.query(
    `INSERT INTO employee_face_enrollments (
       company_id, employee_id, embedding, enrolled_by, photo_data, photo_mime
     )
     VALUES ($1, $2, $3::jsonb, $4, $5, 'image/jpeg')
     ON CONFLICT (employee_id) DO UPDATE SET
       embedding = EXCLUDED.embedding,
       enrolled_at = NOW(),
       enrolled_by = EXCLUDED.enrolled_by,
       photo_data = EXCLUDED.photo_data,
       photo_mime = EXCLUDED.photo_mime
     RETURNING id, employee_id, company_id, enrolled_at`,
    [companyId, employeeId, JSON.stringify(descriptor), enrolledBy, photoData]
  );

  return {
    enrollment: result.rows[0],
    employee: emp.rows[0],
  };
}

async function removeEmployeeFace(companyId, employeeId) {
  const result = await pool.query(
    `DELETE FROM employee_face_enrollments
     WHERE company_id = $1 AND employee_id = $2
     RETURNING id`,
    [companyId, employeeId]
  );
  if (result.rowCount === 0) {
    throw new AppError('No face enrollment found', 404);
  }
  return { removed: true };
}

async function listBranchFaceCandidates(companyId, branchId) {
  const result = await pool.query(
    `SELECT e.id AS employee_id, e.name AS employee_name, e.employee_code,
            f.embedding
     FROM employees e
     INNER JOIN employee_face_enrollments f ON f.employee_id = e.id AND f.company_id = e.company_id
     WHERE e.company_id = $1
       AND e.branch_id = $2
       AND e.status = 'active'`,
    [companyId, branchId]
  );
  return result.rows.map((row) => ({
    employee_id: row.employee_id,
    employee_name: row.employee_name,
    employee_code: row.employee_code,
    embedding: row.embedding,
  }));
}

async function listBranchEmployeeEnrollments(companyId, branchId) {
  const result = await pool.query(
    `SELECT e.id, e.name, e.employee_code, e.status,
            CASE
              WHEN f.recognition_model = 'mobilefacenet_sface_v1' THEN f.id
              ELSE NULL
            END AS face_enrollment_id,
            CASE
              WHEN f.recognition_model = 'mobilefacenet_sface_v1' THEN f.enrolled_at
              ELSE NULL
            END AS enrolled_at,
            f.recognition_model,
            f.photo_mime,
            CASE WHEN f.photo_data IS NOT NULL
              THEN encode(f.photo_data, 'base64')
              ELSE NULL
            END AS photo_base64
     FROM employees e
     LEFT JOIN employee_face_enrollments f
       ON f.employee_id = e.id AND f.company_id = e.company_id
     WHERE e.company_id = $1 AND e.branch_id = $2
     ORDER BY e.name ASC`,
    [companyId, branchId]
  );
  return result.rows;
}

const MOBILEFACE_MODEL = 'mobilefacenet_sface_v1';
const MOBILEFACE_DIMENSION = 128;
const MOBILEFACE_MATCH_THRESHOLD = Number(process.env.KIOSK_MOBILEFACE_MATCH_THRESHOLD || 0.363);

function assertMobileFaceProfile(body) {
  if (!body || body.model !== MOBILEFACE_MODEL) {
    throw new AppError('Unsupported face recognition model', 400, 'FACE_MODEL_MISMATCH');
  }
  const dimension = Number(body.dimension);
  if (dimension !== MOBILEFACE_DIMENSION) {
    throw new AppError('Unexpected face embedding size', 400, 'FACE_MODEL_MISMATCH');
  }
  const embeddings = body.embeddings;
  if (!Array.isArray(embeddings) || embeddings.length < 3 || embeddings.length > 5) {
    throw new AppError('Register 3 to 5 face samples', 422, 'FACE_SAMPLES_INVALID');
  }
  for (const vector of embeddings) {
    if (!Array.isArray(vector) || vector.length !== dimension) {
      throw new AppError('A face sample has the wrong size', 422, 'FACE_SAMPLES_INVALID');
    }
    let sum = 0;
    for (const value of vector) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new AppError('A face sample is invalid', 422, 'FACE_SAMPLES_INVALID');
      }
      sum += value * value;
    }
    const norm = Math.sqrt(sum);
    if (norm < 0.9 || norm > 1.1) {
      throw new AppError('A face sample was not normalized', 422, 'FACE_SAMPLES_INVALID');
    }
  }
  return {
    model: MOBILEFACE_MODEL,
    dimension,
    embeddings,
  };
}

async function saveMobileFaceProfile(companyId, employeeId, body, enrolledBy = null) {
  const emp = await pool.query(
    `SELECT id, name, branch_id, status FROM employees WHERE company_id = $1 AND id = $2`,
    [companyId, employeeId]
  );
  if (emp.rowCount === 0) {
    throw new AppError('Employee not found', 404);
  }
  if (String(emp.rows[0].status) !== 'active') {
    throw new AppError('Employee is not active', 400);
  }
  const profile = assertMobileFaceProfile(body);
  const result = await pool.query(
    `INSERT INTO employee_face_enrollments (
       company_id, employee_id, embedding, recognition_model, embedding_dimension, embeddings, enrolled_by
     )
     VALUES ($1, $2, NULL, $3, $4, $5::jsonb, $6)
     ON CONFLICT (employee_id) DO UPDATE SET
       recognition_model = EXCLUDED.recognition_model,
       embedding_dimension = EXCLUDED.embedding_dimension,
       embeddings = EXCLUDED.embeddings,
       enrolled_at = NOW(),
       enrolled_by = EXCLUDED.enrolled_by
     RETURNING id, employee_id, company_id, enrolled_at, recognition_model, embedding_dimension`,
    [
      companyId,
      employeeId,
      profile.model,
      profile.dimension,
      JSON.stringify(profile.embeddings),
      enrolledBy,
    ]
  );
  return {
    enrollment: result.rows[0],
    employee: emp.rows[0],
  };
}

async function listMobileFaceProfiles(companyId, branchId) {
  const result = await pool.query(
    `SELECT e.id AS employee_id, e.name AS employee_name, e.employee_code,
            f.embedding_dimension, f.embeddings
     FROM employees e
     INNER JOIN employee_face_enrollments f ON f.employee_id = e.id AND f.company_id = e.company_id
     WHERE e.company_id = $1
       AND e.branch_id = $2
       AND e.status = 'active'
       AND f.recognition_model = $3
       AND f.embeddings IS NOT NULL`,
    [companyId, branchId, MOBILEFACE_MODEL]
  );
  return result.rows.map((row) => ({
    employee_id: row.employee_id,
    employee_name: row.employee_name,
    employee_code: row.employee_code,
    dimension: row.embedding_dimension,
    embeddings: row.embeddings,
  }));
}

async function getMobileFaceProfile(companyId, employeeId) {
  const result = await pool.query(
    `SELECT employee_id, recognition_model, embedding_dimension, embeddings, enrolled_at
     FROM employee_face_enrollments
     WHERE company_id = $1
       AND employee_id = $2
       AND recognition_model = $3
       AND embeddings IS NOT NULL`,
    [companyId, employeeId, MOBILEFACE_MODEL]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    employee_id: row.employee_id,
    model: row.recognition_model,
    dimension: row.embedding_dimension,
    embeddings: row.embeddings,
    enrolled_at: row.enrolled_at,
  };
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
    return -1;
  }
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = Number(a[i]);
    const y = Number(b[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return -1;
    dot += x * y;
  }
  return dot;
}

function bestCosineAgainstTemplates(embedding, templates) {
  if (!Array.isArray(templates) || templates.length === 0) return -1;
  let best = -1;
  for (const template of templates) {
    const score = cosineSimilarity(embedding, template);
    if (score > best) best = score;
  }
  return best;
}

function embeddingMatchesStoredTemplates(embedding, templates, threshold = MOBILEFACE_MATCH_THRESHOLD) {
  return bestCosineAgainstTemplates(embedding, templates) >= threshold;
}

module.exports = {
  MOBILEFACE_MODEL,
  MOBILEFACE_DIMENSION,
  MOBILEFACE_MATCH_THRESHOLD,
  assertMobileFaceProfile,
  getEnrollment,
  enrollEmployeeFace,
  saveMobileFaceProfile,
  getMobileFaceProfile,
  cosineSimilarity,
  bestCosineAgainstTemplates,
  embeddingMatchesStoredTemplates,
  removeEmployeeFace,
  listBranchFaceCandidates,
  listMobileFaceProfiles,
  listBranchEmployeeEnrollments,
};
