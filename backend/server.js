/**
 * AI-Powered Family Finance Management System
 * Main Server Entry Point — UPDATED
 *
 * Changes from original:
 *   - Added /api/news route (Market Insights feature)
 *   - No other changes to existing routes or middleware
 */

require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes       = require('./routes/auth.routes');
const familyRoutes     = require('./routes/family.routes');
const expenseRoutes    = require('./routes/expense.routes');
const billRoutes       = require('./routes/bill.routes');
const investmentRoutes = require('./routes/investment.routes');
const aiRoutes         = require('./routes/ai.routes');
const marketRoutes     = require('./routes/market.routes');
const newsRoutes       = require('./routes/news.routes');   // NEW

const app = express();  

app.use(helmet());

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX)        || 100,
  message:  { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/health', (req, res) => {
  res.status(200).json({
    status:      'healthy',
    service:     'Family Finance API',
    version:     '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    region:      process.env.AWS_REGION || 'local',
    timestamp:   new Date().toISOString(),
  });
});

app.use('/api/auth',        authRoutes);
app.use('/api/families',    familyRoutes);
app.use('/api/expenses',    expenseRoutes);
app.use('/api/bills',       billRoutes);
app.use('/api/investments', investmentRoutes);
app.use('/api/ai',          aiRoutes);
app.use('/api/market',      marketRoutes);
app.use('/api/news',        newsRoutes);   // NEW

app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.originalUrl} not found` });
});

app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║   Family Finance API Server Running          ║
  ║   Port    : ${PORT}                              ║
  ║   Env     : ${(process.env.NODE_ENV || 'development').padEnd(20)}║
  ║   Region  : ${(process.env.AWS_REGION || 'local').padEnd(20)}║
  ║   CORS    : ${(process.env.FRONTEND_URL || 'localhost').padEnd(20)}║
  ╚══════════════════════════════════════════════╝
  `);
});

module.exports = app;
