// tr-walkthrough.jsx — first-visit guided walkthrough per tab.
//
// Shows a step-by-step overlay the first time the user visits each tab.
// Each step has: title, body, and optionally a CSS selector that we spotlight
// (overlay with a punched-out hole over the element).
//
// Exposes:
//   window.TR_WALKTHROUGHS           — { tabKey: [ { title, body, target? } ] }
//   window.openTRWalkthrough(tabKey) — replay the walkthrough for a tab
//   window.resetTRWalkthroughs()     — wipe seen flags (for gear menu)
//
// Storage key: `tr_walkthrough_seen_v1` = array of tab keys already seen.

(function () {
  const T = {
    ink000: '#07090C', ink100: '#0B0E13', ink200: '#10141B', ink300: '#171C24',
    edge: 'rgba(255,255,255,0.06)', edgeHi: 'rgba(255,255,255,0.10)',
    text: '#ffffff', textMid: 'rgba(180,188,200,0.85)', textDim: 'rgba(130,138,150,0.55)',
    signal: '#c9a227', bull: '#6FCF8E', bear: '#D96B6B',
    ui: 'InterTight, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  };

  const SEEN_KEY = 'tr_walkthrough_seen_v1';
  function loadSeen() {
    try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); }
  }
  function saveSeen(set) {
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...set])); } catch {}
  }
  function markSeen(tab) {
    const s = loadSeen(); s.add(tab); saveSeen(s);
  }
  function hasSeen(tab) { return loadSeen().has(tab); }

  // Content dictionary — populated by tr-walkthrough-content.js (agents fill this in).
  window.TR_WALKTHROUGHS = window.TR_WALKTHROUGHS || {};

  // ===================================================================
  // Spotlight — renders the highlight ring over a target element.
  // ===================================================================
  function Spotlight({ rect }) {
    if (!rect) return null;
    const pad = 6;
    return React.createElement('div', {
      style: {
        position: 'fixed',
        top: rect.top - pad, left: rect.left - pad,
        width: rect.width + pad * 2, height: rect.height + pad * 2,
        border: `2px solid ${T.signal}`,
        borderRadius: 10,
        boxShadow: `0 0 0 9999px rgba(7,9,12,0.72), 0 0 24px ${T.signal}88`,
        pointerEvents: 'none',
        transition: 'all 240ms cubic-bezier(0.2,0.7,0.2,1)',
        zIndex: 9998,
      },
    });
  }

  // ===================================================================
  // Step card — the floating caption next to the spotlighted element.
  // ===================================================================
  function StepCard({ step, index, total, onNext, onPrev, onSkip, targetRect }) {
    // Position card near the target if it exists; otherwise center.
    let style = {
      position: 'fixed',
      zIndex: 9999,
      width: 360,
      background: T.ink100,
      border: `1px solid ${T.edgeHi}`,
      borderRadius: 12,
      boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(201,162,39,0.18)',
      padding: '18px 20px 16px',
      fontFamily: T.ui,
      animation: 'trWalkIn 220ms cubic-bezier(0.2,0.7,0.2,1)',
    };

    if (targetRect) {
      const vw = window.innerWidth, vh = window.innerHeight;
      // Prefer to the right of the target; fall back below, then above.
      let left = targetRect.right + 18;
      let top  = targetRect.top;
      if (left + 380 > vw) {
        left = targetRect.left;
        top  = targetRect.bottom + 18;
      }
      if (top + 280 > vh) top = Math.max(20, targetRect.top - 300);
      left = Math.max(20, Math.min(left, vw - 380));
      style = { ...style, left, top };
    } else {
      style = { ...style, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
    }

    return React.createElement(
      'div', { style },
      React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
      },
        React.createElement('div', {
          style: {
            fontSize: 9, letterSpacing: 1.3, color: T.signal,
            textTransform: 'uppercase', fontWeight: 700, fontFamily: T.mono,
          },
        }, 'Walkthrough'),
        React.createElement('div', {
          style: {
            fontFamily: T.mono, fontSize: 9.5, color: T.textDim, letterSpacing: 0.5,
          },
        }, `${index + 1} / ${total}`),
        React.createElement('div', {
          onClick: onSkip,
          style: {
            marginLeft: 'auto', padding: '3px 10px', borderRadius: 5,
            background: T.ink300, border: `0.5px solid ${T.edge}`,
            fontSize: 10, fontWeight: 500, color: T.textDim,
            fontFamily: T.mono, letterSpacing: 0.4, cursor: 'pointer',
            transition: 'background 160ms cubic-bezier(0.2,0.7,0.2,1), color 160ms cubic-bezier(0.2,0.7,0.2,1)',
          },
          onMouseEnter: (e) => { e.currentTarget.style.color = T.text; },
          onMouseLeave: (e) => { e.currentTarget.style.color = T.textDim; },
        }, 'Skip'),
      ),
      React.createElement('div', {
        style: {
          fontSize: 15, fontWeight: 600, color: T.text,
          letterSpacing: -0.1, marginBottom: 8, lineHeight: 1.3,
        },
      }, step.title),
      React.createElement('div', {
        style: {
          fontSize: 12.5, color: T.textMid, lineHeight: 1.6, marginBottom: 16,
          whiteSpace: 'pre-wrap',
        },
      }, step.body),
      React.createElement('div', {
        style: { display: 'flex', gap: 8, alignItems: 'center' },
      },
        // Step dots
        React.createElement('div', { style: { display: 'flex', gap: 4 } },
          Array.from({ length: total }).map((_, i) =>
            React.createElement('div', {
              key: i,
              style: {
                width: 6, height: 6, borderRadius: 3,
                background: i <= index ? T.signal : T.ink300,
                transition: 'background 200ms cubic-bezier(0.2,0.7,0.2,1)',
              },
            })
          )
        ),
        React.createElement('div', { style: { marginLeft: 'auto', display: 'flex', gap: 6 } },
          index > 0 && React.createElement('div', {
            onClick: onPrev,
            style: {
              padding: '6px 12px', borderRadius: 6,
              background: T.ink200, border: `1px solid ${T.edge}`,
              fontSize: 11, fontWeight: 500, color: T.textMid,
              fontFamily: T.mono, letterSpacing: 0.2, cursor: 'pointer',
              transition: 'background 160ms cubic-bezier(0.2,0.7,0.2,1), color 160ms cubic-bezier(0.2,0.7,0.2,1)',
            },
          }, '← Back'),
          React.createElement('div', {
            onClick: onNext,
            style: {
              padding: '6px 14px', borderRadius: 6,
              background: T.signal, color: T.ink000,
              fontSize: 11, fontWeight: 700, fontFamily: T.mono,
              letterSpacing: 0.3, cursor: 'pointer',
              boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.3)',
              transition: 'background 160ms cubic-bezier(0.2,0.7,0.2,1)',
            },
          }, index === total - 1 ? 'Got it ✓' : 'Next →'),
        ),
      ),
    );
  }

  // ===================================================================
  // Host — top-level component that listens for tab changes and
  // displays the walkthrough for whichever tab is active & unseen.
  // ===================================================================
  function TRWalkthroughHost() {
    const [activeTab, setActiveTab] = React.useState(null);
    const [stepIdx, setStepIdx]     = React.useState(0);
    const [rect, setRect]           = React.useState(null);
    const [force, setForce]         = React.useState(0);

    // Listen for tab changes dispatched by TradeRadarApp on setTab().
    React.useEffect(() => {
      const onTab = (e) => {
        const tabKey = e.detail && e.detail.tab;
        if (!tabKey) return;
        const steps = window.TR_WALKTHROUGHS[tabKey];
        if (!steps || !steps.length) return;
        if (hasSeen(tabKey)) return;
        setActiveTab(tabKey);
        setStepIdx(0);
      };
      const onReplay = (e) => {
        const tabKey = e.detail && e.detail.tab;
        if (!tabKey) return;
        const steps = window.TR_WALKTHROUGHS[tabKey];
        if (!steps || !steps.length) return;
        setActiveTab(tabKey);
        setStepIdx(0);
      };
      window.addEventListener('tr:tab-changed', onTab);
      window.addEventListener('tr:walkthrough-replay', onReplay);

      // Also fire for the initial load — check current tab after mount.
      const initial = window.TR_CURRENT_TAB || 'drivers';
      setTimeout(() => {
        if (!hasSeen(initial) && window.TR_WALKTHROUGHS[initial]) {
          setActiveTab(initial);
          setStepIdx(0);
        }
      }, 900); // give the screen a beat to paint

      return () => {
        window.removeEventListener('tr:tab-changed', onTab);
        window.removeEventListener('tr:walkthrough-replay', onReplay);
      };
    }, []);

    // Locate the target element for the current step whenever state changes.
    React.useEffect(() => {
      if (!activeTab) { setRect(null); return; }
      const steps = window.TR_WALKTHROUGHS[activeTab] || [];
      const step = steps[stepIdx];
      if (!step || !step.target) { setRect(null); return; }
      // Try to find the target element. Retry for up to 2s in case the screen
      // is still mounting.
      let tries = 0, id;
      const scan = () => {
        tries += 1;
        const el = document.querySelector(step.target);
        if (el) {
          setRect(el.getBoundingClientRect());
          return;
        }
        if (tries < 20) id = setTimeout(scan, 100);
        else setRect(null);
      };
      scan();
      return () => { if (id) clearTimeout(id); };
    }, [activeTab, stepIdx, force]);

    // Also reposition on window resize / scroll.
    React.useEffect(() => {
      if (!activeTab) return;
      const onResize = () => setForce(f => f + 1);
      window.addEventListener('resize', onResize);
      window.addEventListener('scroll', onResize, true);
      return () => {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('scroll', onResize, true);
      };
    }, [activeTab]);

    if (!activeTab) return null;
    const steps = window.TR_WALKTHROUGHS[activeTab] || [];
    const step = steps[stepIdx];
    if (!step) return null;

    const finish = () => {
      if (activeTab) markSeen(activeTab);
      setActiveTab(null);
      setStepIdx(0);
      setRect(null);
    };
    const next = () => {
      if (stepIdx < steps.length - 1) setStepIdx(stepIdx + 1);
      else finish();
    };
    const prev = () => { if (stepIdx > 0) setStepIdx(stepIdx - 1); };
    const skip = () => { finish(); };

    return React.createElement(React.Fragment, null,
      // Dim backdrop — clicking outside does nothing (forces Skip button use).
      React.createElement('div', {
        style: {
          position: 'fixed', inset: 0, background: rect ? 'transparent' : 'rgba(7,9,12,0.62)',
          backdropFilter: rect ? 'none' : 'blur(6px)',
          WebkitBackdropFilter: rect ? 'none' : 'blur(6px)',
          zIndex: 9997,
          animation: 'trWalkFade 200ms ease-out',
        },
      }),
      React.createElement(Spotlight, { rect }),
      React.createElement(StepCard, {
        step, index: stepIdx, total: steps.length,
        onNext: next, onPrev: prev, onSkip: skip,
        targetRect: rect,
      }),
    );
  }
  window.TRWalkthroughHost = TRWalkthroughHost;

  // ===================================================================
  // Global helpers
  // ===================================================================
  window.openTRWalkthrough = function (tabKey) {
    try {
      window.dispatchEvent(new CustomEvent('tr:walkthrough-replay', { detail: { tab: tabKey } }));
    } catch (_) {}
  };
  window.resetTRWalkthroughs = function () {
    try {
      localStorage.removeItem(SEEN_KEY);
    } catch (_) {}
    // Re-trigger the current tab
    const current = window.TR_CURRENT_TAB || 'drivers';
    window.openTRWalkthrough(current);
  };

  // Inject CSS keyframes
  (function () {
    if (document.getElementById('tr-walkthrough-styles')) return;
    const s = document.createElement('style');
    s.id = 'tr-walkthrough-styles';
    s.textContent = `
      @keyframes trWalkIn {
        from { opacity: 0; transform: translateY(10px) scale(0.98); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes trWalkFade {
        from { opacity: 0; } to { opacity: 1; }
      }
    `;
    document.head.appendChild(s);
  })();

  // Auto-mount the host on load
  (function mountHost() {
    if (document.getElementById('tr-walkthrough-root')) return;
    const div = document.createElement('div');
    div.id = 'tr-walkthrough-root';
    document.body.appendChild(div);
    function render() {
      if (window.ReactDOM && ReactDOM.createRoot) {
        ReactDOM.createRoot(div).render(React.createElement(TRWalkthroughHost));
      } else if (window.ReactDOM) {
        ReactDOM.render(React.createElement(TRWalkthroughHost), div);
      }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
    else render();
  })();
})();
