const express = require('express');
const router  = express.Router();
const {
  getFamily, updateFamily, getDashboardSummary,
  generateInviteCode, joinFamily, addMember, removeMember,
} = require('../controllers/family.controller');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');

router.use(authenticate);

// ── Core family ───────────────────────────────────────────────────────────────
router.get('/', getFamily);
router.put('/', requireAdmin, updateFamily);
router.get('/dashboard', getDashboardSummary);

// ── Member management (admin only) ───────────────────────────────────────────
router.post('/invite', requireAdmin, generateInviteCode);
router.post('/members', requireAdmin, addMember);
router.delete('/members/:memberId', requireAdmin, removeMember);

// ── Join via invite code (any authenticated user) ─────────────────────────────
router.post('/join', joinFamily);

module.exports = router;
