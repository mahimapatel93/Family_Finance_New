const express = require('express');
const { body } = require('express-validator');
const router  = express.Router();
const {
  signup, login, getProfile, updateProfile,
  completeOnboarding, restartTour,
} = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');

// ── Public ────────────────────────────────────────────────────────────────────
router.post('/signup', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('monthlyBudget').optional().isNumeric().withMessage('Monthly budget must be a number'),
], validate, signup);

router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], validate, login);

// ── Protected ─────────────────────────────────────────────────────────────────
router.get('/profile',              authenticate, getProfile);
router.put('/profile',              authenticate, updateProfile);
router.post('/onboarding/complete', authenticate, completeOnboarding);
router.post('/onboarding/restart',  authenticate, restartTour);

module.exports = router;
