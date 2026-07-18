/**
 * OnboardingTour — Custom guided tour, zero external dependencies
 *
 * WHY we replaced react-joyride:
 *   The project uses react-joyride v3 but the previous code imported it
 *   using the v2 named-export API ({ Joyride, STATUS, EVENTS }). In v3
 *   Joyride is a default export and STATUS/EVENTS are not exported at all,
 *   so all three resolved to `undefined` at runtime. The component rendered
 *   nothing visible but the internal overlay div remained in the DOM with
 *   pointer-events:all, blocking all clicks on the page permanently.
 *
 * All bugs fixed:
 *   BUG 1 - Wrong import: `{ Joyride }` is undefined in v3 → crash + stuck overlay
 *   BUG 2 - Manual stepIndex + continuous mode conflict → Next button frozen
 *   BUG 3 - disableOverlayClose=false → overlay click doesn't call completeOnboarding
 *   BUG 4 - Early return on !isFirstLogin unmounts mid-tour → orphaned overlay
 *   BUG 5 - stale doneRef prevents double-firing completeOnboarding
 */

import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { X, ChevronRight, ChevronLeft, SkipForward } from 'lucide-react';

const STEPS = [
  {
    target:  null,
    title:   '👋 Welcome to FamilyFinance!',
    content: 'Let us show you around in 30 seconds. You can skip at any time.',
  },
  {
    target:  '[data-tour="dashboard"]',
    title:   '📊 Dashboard',
    content: 'Your financial health at a glance — spending, budget progress, alerts, and recent transactions.',
  },
  {
    target:  '[data-tour="expenses"]',
    title:   '🧾 Expenses',
    content: 'Add and track daily expenses by category. Filter by month or search by description.',
  },
  {
    target:  '[data-tour="bills"]',
    title:   '💳 Bills',
    content: 'Never miss a due date. Add recurring bills like rent, electricity and LPG. Get alerts 7 days before.',
  },
  {
    target:  '[data-tour="investments"]',
    title:   '📈 Investments',
    content: 'Track your SIPs, FDs, LIC, and gold. See real returns and 5-year growth projections.',
  },
  {
    target:  '[data-tour="ai-insights"]',
    title:   '🧠 AI Insights',
    content: 'Get personalised spending analysis, budget recommendations and investment suggestions powered by AI.',
  },
  {
    target:  '[data-tour="market"]',
    title:   '🌍 Market & News',
    content: 'Live gold and silver prices, AI market predictions, and the latest financial news — all in one place.',
  },
];

const TOTAL = STEPS.length;
const PADDING = 6;

function getTooltipStyle(rect) {
  if (!rect) {
    return { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }
  const TIP_W = 320;
  const TIP_H = 200;
  const GAP   = 16;
  const vw    = window.innerWidth;
  const vh    = window.innerHeight;

  let left = rect.right + GAP;
  let top  = rect.top + rect.height / 2 - TIP_H / 2;

  if (left + TIP_W > vw - 16) {
    left = rect.left + rect.width / 2 - TIP_W / 2;
    top  = rect.bottom + GAP;
  }
  if (top + TIP_H > vh - 16) {
    top = rect.top - TIP_H - GAP;
  }

  left = Math.max(16, Math.min(left, vw - TIP_W - 16));
  top  = Math.max(16, Math.min(top,  vh - TIP_H - 16));

  return { position: 'fixed', left, top, width: TIP_W };
}

export default function OnboardingTour() {
  const { user, completeOnboarding } = useAuth();

  const [active,  setActive]  = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [rect,    setRect]    = useState(null);

  // Sync ref so handleFinish closure always sees the latest value
  // without needing to be in the dependency array
  const doneRef = useRef(false);

  // ── Auto-start ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (user?.isFirstLogin && !active) {
      const t = setTimeout(() => {
        setActive(true);
        setStepIdx(0);
        setRect(null);
        doneRef.current = false;
      }, 600);
      return () => clearTimeout(t);
    }
  }, [user?.isFirstLogin]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Measure the target DOM element for the current step ────────────────────
  useLayoutEffect(() => {
    if (!active) return;
    const step = STEPS[stepIdx];
    if (!step?.target) { setRect(null); return; }

    const measure = () => {
      const el = document.querySelector(step.target);
      setRect(el ? el.getBoundingClientRect() : null);
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active, stepIdx]);

  // ── Escape key = skip ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => { if (e.key === 'Escape') handleFinish(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Finish / skip ──────────────────────────────────────────────────────────
  // FIX BUG 4+5: gate only on `active` (not isFirstLogin), use doneRef to fire once
  const handleFinish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setActive(false);
    setStepIdx(0);
    setRect(null);
    completeOnboarding();
  }, [completeOnboarding]);

  const handleNext = useCallback(() => {
    if (stepIdx >= TOTAL - 1) {
      handleFinish();
    } else {
      setStepIdx(i => i + 1);
    }
  }, [stepIdx, handleFinish]);

  const handleBack = useCallback(() => {
    setStepIdx(i => Math.max(0, i - 1));
  }, []);

  // FIX BUG 4: do NOT return null based on user.isFirstLogin — only on `active`
  if (!active) return null;

  const step         = STEPS[stepIdx];
  const isFirst      = stepIdx === 0;
  const isLast       = stepIdx === TOTAL - 1;
  const tooltipStyle = getTooltipStyle(rect);

  const spotlightStyle = rect ? {
    position:     'fixed',
    top:          rect.top    - PADDING,
    left:         rect.left   - PADDING,
    width:        rect.width  + PADDING * 2,
    height:       rect.height + PADDING * 2,
    borderRadius: '12px',
    boxShadow:    '0 0 0 9999px rgba(0,0,0,0.65)',
    border:       '2px solid rgba(14,165,233,0.85)',
    pointerEvents:'none',
    zIndex:       9998,
    transition:   'top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease',
  } : {
    position:      'fixed',
    inset:         0,
    background:    'rgba(0,0,0,0.65)',
    pointerEvents: 'none',
    zIndex:        9998,
  };

  return (
    <>
      {/* Dim overlay / spotlight — pointer-events:none keeps page interactive */}
      <div style={spotlightStyle} aria-hidden="true" />

      {/* Tooltip */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
        style={{
          ...tooltipStyle,
          zIndex:       9999,
          background:   '#1e293b',
          border:       '1px solid rgba(51,65,85,0.9)',
          borderRadius: '16px',
          padding:      '20px 22px',
          boxShadow:    '0 25px 50px rgba(0,0,0,0.5)',
          minWidth:     280,
          maxWidth:     340,
          animation:    'tourFadeIn 0.2s ease-out',
        }}
      >
        {/* Title + close */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
          <h3 style={{ margin:0, fontSize:15, fontWeight:600, color:'#f1f5f9', lineHeight:1.3 }}>
            {step.title}
          </h3>
          <button
            onClick={handleFinish}
            title="Close tour (Esc)"
            aria-label="Close tour"
            style={{
              background:'transparent', border:'none', color:'#64748b',
              cursor:'pointer', padding:'2px 4px', marginLeft:8,
              borderRadius:6, flexShrink:0, display:'flex', alignItems:'center',
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <p style={{ margin:'0 0 16px', fontSize:13, color:'#94a3b8', lineHeight:1.6 }}>
          {step.content}
        </p>

        {/* Progress dots */}
        <div style={{ display:'flex', gap:5, justifyContent:'center', marginBottom:16 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width:        i === stepIdx ? 20 : 6,
              height:       6,
              borderRadius: 3,
              background:   i === stepIdx ? '#0ea5e9' : '#334155',
              transition:   'all 0.2s ease',
            }} />
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {!isLast && (
            <button
              onClick={handleFinish}
              style={{
                background:'transparent', border:'none', color:'#475569',
                cursor:'pointer', fontSize:12, padding:'6px 0',
                display:'flex', alignItems:'center', gap:4,
              }}
            >
              <SkipForward size={12} /> Skip
            </button>
          )}

          <div style={{ flex:1 }} />

          {!isFirst && (
            <button
              onClick={handleBack}
              style={{
                background:'#1e3a4f', border:'1px solid #334155', color:'#94a3b8',
                cursor:'pointer', fontSize:13, padding:'7px 14px', borderRadius:9,
                display:'flex', alignItems:'center', gap:4,
              }}
            >
              <ChevronLeft size={14} /> Back
            </button>
          )}

          <button
            onClick={handleNext}
            style={{
              background:'#0ea5e9', border:'none', color:'#fff',
              cursor:'pointer', fontSize:13, fontWeight:500,
              padding:'7px 16px', borderRadius:9,
              display:'flex', alignItems:'center', gap:4,
            }}
          >
            {isLast ? 'Finish ✓' : <> Next <ChevronRight size={14} /></>}
          </button>
        </div>

        {/* Step counter */}
        <p style={{ margin:'10px 0 0', fontSize:11, color:'#334155', textAlign:'center' }}>
          {stepIdx + 1} / {TOTAL}
        </p>
      </div>

      <style>{`
        @keyframes tourFadeIn {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)  scale(1); }
        }
      `}</style>
    </>
  );
}
