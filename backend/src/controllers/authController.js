const authService = require('../services/authService');
const auditService = require('../services/auditService');

/**
 * POST /api/auth/register
 * Body: { company: { name, email?, phone?, address? }, admin: { name, email, password } }
 */
async function register(req, res, next) {
  try {
    const { company, admin } = req.body;
    if (!company || !admin) {
      return res.status(400).json({
        success: false,
        message: 'Request body must include company and admin objects',
      });
    }
    const result = await authService.registerCompany(company, admin);
    auditService.log(result.user.company_id, result.user.id, 'auth.register', 'company', result.company.id, { company_name: result.company.name }).catch(() => {});
    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    auditService.log(result.user.company_id, result.user.id, 'auth.login', 'user', result.user.id, { email: result.user.email }).catch(() => {});
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me
 * Returns current user from JWT. Requires Authorization: Bearer <token>.
 */
async function me(req, res, next) {
  try {
    res.status(200).json({
      success: true,
      data: {
        user_id: req.user.user_id,
        company_id: req.user.company_id,
        email: req.user.email,
        role: req.user.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/change-password
 * Body: { current_password, new_password }
 * Auth: admin only
 */
async function changePassword(req, res, next) {
  try {
    const { current_password: currentPassword, new_password: newPassword } = req.body || {};
    const updatedUser = await authService.changeAdminPassword(
      req.user?.user_id,
      req.user?.company_id,
      currentPassword,
      newPassword
    );
    auditService.log(
      updatedUser.company_id,
      updatedUser.id,
      'auth.password.change',
      'user',
      updatedUser.id,
      { email: updatedUser.email, role: updatedUser.role }
    ).catch(() => {});
    res.status(200).json({
      success: true,
      message: 'Password changed successfully.',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, me, changePassword };
