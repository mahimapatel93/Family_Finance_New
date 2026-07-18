
const axios = require('axios');
const Groq  = require('groq-sdk');

// FIX 1: NO dotenv.config() here — already called in server.js
const groq    = new Groq({ apiKey: process.env.GROQ_API_KEY });
const AV_BASE = 'https://www.alphavantage.co/query';

// ─── In-memory cache (5 min TTL) ─────────────────────────────────────────────
const cache     = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data;
}
function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// FIX 3: safe parseFloat that never returns NaN
function safeFloat(value, fallback) {
  const n = parseFloat(value);
  return isNaN(n) ? fallback : n;
}

// FIX 7: detect Alpha Vantage rate-limit or invalid-key response
function avIsRateLimited(data) {
  return !!(data?.Note || data?.Information);
}

// FIX 2: single source-of-truth for USD/INR — used by both live and fallback paths
const USD_INR = 84.0;

// FIX 2: shared fallback builder keeps both paths consistent
function buildFallback(warning) {
  return {
    gold: {
      priceUsd:         2650,
      priceInr:         Math.round(2650 * USD_INR / 31.1035),
      pricePerTenGrams: Math.round(2650 * USD_INR / 31.1035 * 10),
      symbol: 'XAU',
      unit:   '10g',
    },
    silver: {
      priceUsd: 30,
      priceInr: Math.round(30 * USD_INR / 31.1035),
      symbol:   'XAG',
      unit:     '1g',
    },
    usdInr:      USD_INR,
    lastUpdated: new Date().toISOString(),
    source:      'Fallback Data',
    warning,
  };
}

// ─── GET COMMODITY PRICES ─────────────────────────────────────────────────────
const getCommodityPrices = async (req, res) => {
  try {
    const cached = getCached('commodities');
    if (cached) return res.json(cached);

    const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY;

    if (!AV_KEY) {
      console.warn('[market] ALPHA_VANTAGE_API_KEY not set — returning fallback');
      return res.json(buildFallback('ALPHA_VANTAGE_API_KEY not configured'));
    }

    // FIX 4: individual .catch() so one failure doesn't kill the other
    const [goldRes, silverRes] = await Promise.all([
      axios.get(AV_BASE, {
        params: { function: 'CURRENCY_EXCHANGE_RATE', from_currency: 'XAU', to_currency: 'USD', apikey: AV_KEY },
        timeout: 8000,
      }).catch(err => { console.error('[market] Gold API error:', err.message); return null; }),

      axios.get(AV_BASE, {
        params: { function: 'CURRENCY_EXCHANGE_RATE', from_currency: 'XAG', to_currency: 'USD', apikey: AV_KEY },
        timeout: 8000,
      }).catch(err => { console.error('[market] Silver API error:', err.message); return null; }),
    ]);

    // FIX 7: catch rate-limit before trying to parse numbers
    if (goldRes && avIsRateLimited(goldRes.data)) {
      const msg = goldRes.data.Note || goldRes.data.Information;
      console.warn('[market] Alpha Vantage rate limit/invalid key:', msg);
      return res.json(buildFallback('Alpha Vantage rate limit reached — try again in 1 minute'));
    }

    // FIX 3: safeFloat prevents NaN propagating into all calculations
    const goldUsd   = safeFloat(goldRes?.data?.['Realtime Currency Exchange Rate']?.['5. Exchange Rate'], 2650);
    const silverUsd = safeFloat(silverRes?.data?.['Realtime Currency Exchange Rate']?.['5. Exchange Rate'], 30);

    const result = {
      gold: {
        priceUsd:         Math.round(goldUsd * 100) / 100,
        priceInr:         Math.round(goldUsd * USD_INR / 31.1035),
        pricePerTenGrams: Math.round(goldUsd * USD_INR / 31.1035 * 10),
        symbol: 'XAU',
        unit:   '10g',
      },
      silver: {
        priceUsd: Math.round(silverUsd * 100) / 100,
        priceInr: Math.round(silverUsd * USD_INR / 31.1035),
        symbol:   'XAG',
        unit:     '1g',
      },
      usdInr:      USD_INR,
      lastUpdated: new Date().toISOString(),
      source:      'Alpha Vantage',
    };

    setCache('commodities', result);
    res.json(result);

  } catch (err) {
    console.error('[market] Commodity price error:', err.message);
    res.json(buildFallback('Live data unavailable'));
  }
};

// ─── MARKET OVERVIEW ──────────────────────────────────────────────────────────
const getMarketOverview = async (req, res) => {
  try {
    const cached = getCached('market-overview');
    if (cached) return res.json(cached);

    const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY;

    const niftyRes = AV_KEY
      ? await axios.get(AV_BASE, {
          params: { function: 'GLOBAL_QUOTE', symbol: 'INFY', apikey: AV_KEY },
          timeout: 8000,
        }).catch(() => ({ data: {} }))
      : { data: {} };

    const quote = niftyRes.data?.['Global Quote'] || {};

    const result = {
      indices: [{
        name:          'Infosys (NSE)',
        price:         safeFloat(quote['05. price'], 1580),
        change:        safeFloat(quote['09. change'], 0),
        // quote['10. change percent'] comes back as "0.86%" — strip the % sign
        changePercent: safeFloat((quote['10. change percent'] || '0').replace('%', ''), 0).toFixed(2),
      }],
      lastUpdated: new Date().toISOString(),
      ...(avIsRateLimited(niftyRes.data) && {
        warning: 'Alpha Vantage rate limit — showing fallback data',
      }),
    };

    setCache('market-overview', result);
    res.json(result);

  } catch (err) {
    // FIX 8: non-critical — return fallback, never a 500 that breaks the UI
    console.error('[market] Overview error:', err.message);
    res.json({
      indices: [{ name: 'Infosys (NSE)', price: 1580, change: 0, changePercent: '0.00' }],
      lastUpdated: new Date().toISOString(),
      warning: 'Live market data unavailable',
    });
  }
};

// ─── AI MARKET PREDICTIONS ────────────────────────────────────────────────────
const getMarketPredictions = async (req, res) => {
  try {
    const { asset } = req.query;
    const cacheKey  = `prediction-${asset || 'all'}`;
    const cached    = getCached(cacheKey);
    if (cached) return res.json(cached);

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: 'GROQ_API_KEY not configured in .env' });
    }

    const prompt = `You are an Indian financial market analyst. Provide a short-term (1-3 month) outlook for ${asset || 'gold, silver, and Indian equity markets'}.

Consider: Global macro trends, USD strength, RBI policy, inflation, geopolitical factors.

Respond ONLY with valid JSON — no markdown, no backticks, no text before or after the JSON object:
{
  "predictions": [
    {
      "asset": "Gold|Silver|Nifty 50|Sensex",
      "shortTermOutlook": "Bullish|Bearish|Neutral",
      "priceTarget": "<range or direction>",
      "confidence": <number 1-100>,
      "keyDrivers": ["driver1", "driver2"],
      "riskFactors": ["risk1", "risk2"],
      "recommendation": "Buy|Sell|Hold|Accumulate on dips",
      "timeHorizon": "1-3 months"
    }
  ],
  "marketSentiment": "Bullish|Bearish|Neutral",
  "summaryForInvestors": "<2-3 sentences of practical advice for Indian retail investors>",
  "disclaimer": "This is AI-generated analysis, not financial advice. Please consult a SEBI-registered advisor."
}`;

    // FIX 6: llama3-70b-8192 deprecated — default to llama-3.3-70b-versatile
    const completion = await groq.chat.completions.create({
      model:       process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages:    [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens:  1200,
    });

    const rawText = completion.choices[0]?.message?.content || '{}';

    // FIX 5: log raw text BEFORE parsing so failures are diagnosable in pm2 logs
    let parsed;
    try {
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('[market] Groq JSON parse failed.\nRaw response was:\n', rawText);
      return res.status(500).json({
        error: 'AI returned invalid JSON — check server logs for the raw response',
      });
    }

    setCache(cacheKey, parsed);
    res.json(parsed);

  } catch (err) {
    console.error('[market] Predictions error:', err.message || err);
    res.status(500).json({ error: 'Failed to generate predictions', detail: err.message });
  }
};

module.exports = { getCommodityPrices, getMarketOverview, getMarketPredictions };
