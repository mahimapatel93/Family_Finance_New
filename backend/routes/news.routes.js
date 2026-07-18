const express = require('express');
const router  = express.Router();
const { getNews } = require('../controllers/news.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);
router.get('/', getNews);

module.exports = router;
