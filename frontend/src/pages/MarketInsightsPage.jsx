import React, { useState, useEffect, useCallback, useRef } from 'react';
import { newsService } from '../services/api';
import { Card, Spinner, Alert, Badge } from '../components/ui';
import { Newspaper, RefreshCw, ExternalLink, Sparkles } from 'lucide-react';

const CATEGORIES = [
  { value: 'finance', label: 'Finance'       },
  { value: 'markets', label: 'Markets'       },
  { value: 'india',   label: 'India Markets' },
];

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const SOURCE_COLORS = {
  'Economic Times':   '#f59e0b',
  'Mint':             '#38bdf8',
  'Business Standard':'#34d399',
  'NDTV Profit':      '#f472b6',
  'LiveMint':         '#38bdf8',
  'Bloomberg Quint':  '#818cf8',
  'Reuters':          '#fb923c',
};

export default function MarketInsightsPage() {
  const [articles,    setArticles]    = useState([]);
  const [page,        setPage]        = useState(1);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [loading,     setLoading]     = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error,       setError]       = useState('');
  const [category,    setCategory]    = useState('finance');
  const loaderRef = useRef(null);

  // Fetch a page of articles
  const fetchArticles = useCallback(async (pageNum, cat, replace = false) => {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await newsService.getNews({ page: pageNum, limit: 12, category: cat });
      const data = res.data;
      setArticles(prev => replace ? data.articles : [...prev, ...data.articles]);
      setHasNextPage(data.pagination.hasNextPage);
      setPage(pageNum);
    } catch {
      setError('Failed to load news. Please try again.');
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, [loading]);

  // Initial load
  useEffect(() => {
    setInitialLoad(true);
    setArticles([]);
    setPage(1);
    setHasNextPage(true);
    fetchArticles(1, category, true);
  }, [category]); // eslint-disable-line

  // Infinite scroll — IntersectionObserver watches the loader div at the bottom
  useEffect(() => {
    if (!loaderRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !loading) {
          fetchArticles(page + 1, category);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, loading, page, category, fetchArticles]);

  const handleRefresh = () => {
    setArticles([]);
    setPage(1);
    setHasNextPage(true);
    fetchArticles(1, category, true);
  };

  const ArticleCard = ({ article }) => (
    <div className="glass rounded-2xl p-5 flex flex-col gap-3 hover:border-slate-600 transition-all group animate-fade-in">
      {/* Source + time */}
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-semibold px-2.5 py-1 rounded-full"
          style={{
            background: `${SOURCE_COLORS[article.source] || '#64748b'}18`,
            color:       SOURCE_COLORS[article.source] || '#94a3b8',
            border:      `1px solid ${SOURCE_COLORS[article.source] || '#64748b'}30`,
          }}
        >
          {article.source}
        </span>
        <span className="text-xs text-slate-500">{timeAgo(article.publishedAt)}</span>
      </div>

      {/* Thumbnail */}
      {article.imageUrl && (
        <div className="w-full h-36 rounded-xl overflow-hidden bg-slate-700/50">
          <img
            src={article.imageUrl} alt={article.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={e => { e.target.style.display = 'none'; }}
          />
        </div>
      )}

      {/* Title */}
      <h3 className="font-semibold text-slate-200 text-sm leading-snug line-clamp-2">
        {article.title}
      </h3>

      {/* AI Summary badge */}
      {article.aiSummary && (
        <div className="flex gap-2 p-2.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
          <Sparkles size={13} className="text-violet-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-violet-300 leading-relaxed">{article.aiSummary}</p>
        </div>
      )}

      {/* Description */}
      {!article.aiSummary && article.description && (
        <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">{article.description}</p>
      )}

      {/* Read more link */}
      {article.url && article.url !== '#' && (
        <a
          href={article.url} target="_blank" rel="noopener noreferrer"
          className="mt-auto flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 transition-colors self-start"
        >
          Read full article <ExternalLink size={11} />
        </a>
      )}
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Newspaper size={22} className="text-sky-400" /> Market Insights
          </h1>
          <p className="text-slate-400 text-sm">Latest financial news with AI summaries</p>
        </div>
        <button onClick={handleRefresh} disabled={loading} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw size={14} className={loading && initialLoad ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map(c => (
          <button key={c.value} onClick={() => setCategory(c.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              category === c.value
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Initial skeleton loader */}
      {initialLoad && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="glass rounded-2xl p-5 space-y-3">
              <div className="flex justify-between">
                <div className="shimmer h-6 w-24 rounded-full" />
                <div className="shimmer h-4 w-12 rounded" />
              </div>
              <div className="shimmer h-32 rounded-xl" />
              <div className="shimmer h-4 rounded" />
              <div className="shimmer h-4 w-3/4 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Articles grid */}
      {!initialLoad && articles.length > 0 && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {articles.map(article => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!initialLoad && articles.length === 0 && !error && (
        <Card>
          <div className="text-center py-12">
            <Newspaper size={40} className="text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No articles found</p>
            <button onClick={handleRefresh} className="btn-secondary mt-4 text-sm">Try again</button>
          </div>
        </Card>
      )}

      {/* Infinite scroll trigger + loading indicator */}
      <div ref={loaderRef} className="flex justify-center py-4">
        {loading && !initialLoad && <Spinner size={28} />}
        {!loading && !hasNextPage && articles.length > 0 && (
          <p className="text-slate-600 text-sm">You've reached the end</p>
        )}
      </div>
    </div>
  );
}
