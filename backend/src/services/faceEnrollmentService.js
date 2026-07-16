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
            f.id AS face_enrollment_id, f.enrolled_at,
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

module.exports = {
  getEnrollment,
  enrollEmployeeFace,
  removeEmployeeFace,
  listBranchFaceCandidates,
  listBranchEmployeeEnrollments,
};
