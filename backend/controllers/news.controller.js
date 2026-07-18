/**
 * News Controller — NEW
 * GET /api/news
 *
 * Fetches stock market / financial news via NewsAPI (free tier)
 * and optionally summarises headlines with Groq AI.
 *
 * Caching: in-memory, 1 hour TTL (requirement 7)
 * Pagination: supports ?page=1&limit=12 for infinite scroll (requirement 8)
 *
 * Environment variables required:
 *   NEWS_API_KEY  — free key from https://newsapi.org (500 req/day free)
 *   GROQ_API_KEY  — already present (used for AI summaries)
 */

const axios = require('axios');
const Groq  = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── 1-hour in-memory cache ───────────────────────────────────────────────────
const newsCache   = new Map();
const NEWS_TTL    = 60 * 60 * 1000; // 1 hour

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > NEWS_TTL) { newsCache.delete(key); return null; }
  return entry.data;
}
function setCache(key, data) {
  newsCache.set(key, { data, timestamp: Date.now() });
}

// ─── GET NEWS ─────────────────────────────────────────────────────────────────
const getNews = async (req, res) => {
  try {
    const page    = Math.max(1, parseInt(req.query.page)  || 1);
    const limit   = Math.min(20, parseInt(req.query.limit) || 12);
    const category = req.query.category || 'finance';  // 'finance' | 'markets' | 'india'

    const cacheKey = `news-${category}-${page}`;
    const cached   = getCached(cacheKey);
    if (cached) return res.json(cached);

    const NEWS_API_KEY = process.env.NEWS_API_KEY;

    let articles = [];
    let totalResults = 0;

    if (NEWS_API_KEY) {
      // NewsAPI query — financial keywords relevant to Indian investors
      const query = category === 'india'
        ? 'India stock market OR NSE OR BSE OR Sensex OR Nifty'
        : 'stock market OR mutual funds OR cryptocurrency OR gold price OR RBI OR SEBI';

      const response = await axios.get('https://newsapi.org/v2/everything', {
        params: {
          q:        query,
          language: 'en',
          sortBy:   'publishedAt',
          pageSize: limit,
          page,
          apiKey:   NEWS_API_KEY,
        },
        timeout: 8000,
      });

      articles     = response.data?.articles || [];
      totalResults = response.data?.totalResults || 0;

      // Clean up articles — remove [Removed] placeholders from NewsAPI
      articles = articles.filter(a =>
        a.title && a.title !== '[Removed]' && a.description && a.description !== '[Removed]'
      );
    } else {
      // Fallback sample articles when no API key is configured
      articles = generateFallbackArticles(page, limit);
      totalResults = 100;
    }

    // Shape articles for frontend
    const shaped = articles.map((a, idx) => ({
      id:          `${Date.now()}-${page}-${idx}`,
      title:       a.title       || 'Financial News Update',
      description: a.description || a.content?.slice(0, 200) || '',
      source:      a.source?.name || 'Financial News',
      url:         a.url         || '#',
      imageUrl:    a.urlToImage  || null,
      publishedAt: a.publishedAt || new Date().toISOString(),
      category:    category,
      // AI summary added below for first-page articles only (cost control)
      aiSummary:   null,
    }));

    // AI summaries for first page only (saves Groq quota)
    if (page === 1 && process.env.GROQ_API_KEY && shaped.length > 0) {
      try {
        const headlines = shaped.slice(0, 5).map((a, i) => `${i + 1}. ${a.title}`).join('\n');
        const completion = await groq.chat.completions.create({
          model:       process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          messages: [{
            role:    'user',
            content: `You are a financial news summariser for Indian investors. For each headline below, write a 1-sentence plain-language summary (max 20 words). Return ONLY a JSON array of strings, no markdown:\n${headlines}`,
          }],
          temperature: 0.3,
          max_tokens:  400,
        });

        const raw     = completion.choices[0]?.message?.content || '[]';
        const cleaned = raw.replace(/```json|```/g, '').trim();
        const summaries = JSON.parse(cleaned);

        summaries.forEach((s, i) => {
          if (shaped[i]) shaped[i].aiSummary = s;
        });
      } catch (aiErr) {
        console.warn('[news] AI summary skipped:', aiErr.message);
        // non-fatal — articles are returned without AI summaries
      }
    }

    const result = {
      articles: shaped,
      pagination: {
        page,
        limit,
        totalResults,
        hasNextPage: page * limit < totalResults,
        nextPage:    page * limit < totalResults ? page + 1 : null,
      },
      lastUpdated: new Date().toISOString(),
      source: NEWS_API_KEY ? 'NewsAPI' : 'Sample Data',
    };

    setCache(cacheKey, result);
    res.json(result);

  } catch (err) {
    console.error('[news] getNews error:', err.message);
    // Return fallback so UI never breaks
    res.json({
      articles:   generateFallbackArticles(1, 12),
      pagination: { page: 1, limit: 12, totalResults: 12, hasNextPage: false, nextPage: null },
      lastUpdated: new Date().toISOString(),
      source: 'Fallback Data',
      warning: 'Live news unavailable',
    });
  }
};

// ─── Fallback articles (shown when NEWS_API_KEY is not set) ───────────────────
function generateFallbackArticles(page, limit) {
  const samples = [
    { title: 'Sensex Surges 500 Points on Strong Q3 Earnings', description: 'Indian markets rallied as major IT companies reported better-than-expected quarterly results.', source: 'Economic Times' },
    { title: 'RBI Holds Repo Rate Steady at 6.5%', description: 'The Reserve Bank of India maintained its key interest rate, signaling a balanced approach to inflation control.', source: 'Mint' },
    { title: 'Gold Prices Hit Record High Amid Global Uncertainty', description: 'Gold futures crossed ₹65,000 per 10 grams as investors sought safe-haven assets.', source: 'Business Standard' },
    { title: 'SEBI Tightens Rules on F&O Trading for Retail Investors', description: 'New regulations require higher margin requirements for futures and options positions held overnight.', source: 'NDTV Profit' },
    { title: 'Mutual Fund SIP Inflows Reach All-Time High of ₹21,000 Crore', description: 'Systematic investment plans continue to attract record participation from retail investors.', source: 'Financial Express' },
    { title: 'Nifty 50 Crosses 22,000 Mark for First Time', description: 'The benchmark index hit a historic milestone driven by banking and IT sector gains.', source: 'LiveMint' },
    { title: 'India GDP Growth Forecast Upgraded to 7.2% by IMF', description: 'The International Monetary Fund raised its growth estimate citing strong domestic consumption.', source: 'Reuters' },
    { title: 'LIC Announces New Term Insurance Plan with Lower Premiums', description: 'Life Insurance Corporation launches a competitive term plan targeting young earners under 35.', source: 'Insurance Times' },
    { title: 'Crypto Regulations: India to Introduce New Framework by Q2', description: 'The government is finalising rules for virtual digital assets to bring clarity to crypto investors.', source: 'CoinDesk' },
    { title: 'Real Estate Prices Up 12% in Tier-2 Cities', description: 'Cities like Pune, Ahmedabad and Indore see significant property appreciation driven by IT expansion.', source: 'PropTiger' },
    { title: 'HDFC Bank Reports 18% Rise in Net Profit', description: 'India\'s largest private bank exceeded analyst expectations with strong retail lending growth.', source: 'Bloomberg Quint' },
    { title: 'Inflation Eases to 4.8% — Lowest in 18 Months', description: 'Consumer price index softened as vegetable prices fell, giving relief to household budgets.', source: 'The Hindu Business' },
  ];

  const offset = ((page - 1) * limit) % samples.length;
  return samples.slice(offset, offset + limit).map((s, i) => ({
    id:          `fallback-${page}-${i}`,
    title:       s.title,
    description: s.description,
    source:      s.source,
    url:         '#',
    imageUrl:    null,
    publishedAt: new Date(Date.now() - i * 3600000).toISOString(),
    category:    'finance',
    aiSummary:   null,
  }));
}

module.exports = { getNews };
