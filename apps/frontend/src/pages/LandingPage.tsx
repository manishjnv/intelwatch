/**
 * ⛔ DESIGN LOCKED — see UI_DESIGN_LOCK.md
 *
 * LandingPage — the approved futuristic splash screen at route "/"
 * Mirrors docker/nginx/landing.html exactly.
 *
 * FROZEN elements (require [DESIGN-APPROVED] to change):
 *  - Background color: #04060e
 *  - Title gradient: #00ff88 → #00ddff animated
 *  - Title font: 800 weight, clamp(3.2rem,8vw,6rem)
 *  - Subtitle: uppercase, letter-spacing 0.08em, ETIP letters in #00ff88
 *  - Grid overlay: 60×60px, rgba(0,255,136,0.015) lines
 *  - Radar rings: 4 rings, 4s pulse, staggered 1s delays
 *  - Orbs: 3 blurred radial gradients, float 8-12s
 *  - Scanline: repeating-linear-gradient 4px pitch
 *  - Corner accents: 40×40px, rgba(0,255,136,0.1)
 *  - Status pill: "Infrastructure Online" with blinking #00ff88 dot
 *  - Version: "v4.0.0", color #1a1f2e
 *  - CTA buttons: Launch Platform → /login, Learn More → /register
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'

export function LandingPage() {
  const navigate   = useNavigate()
  const accessToken = useAuthStore((s) => s.accessToken)

  // Auto-redirect authenticated users straight to dashboard
  useEffect(() => {
    if (accessToken) navigate('/dashboard', { replace: true })
  }, [accessToken, navigate])

  return (
    <>
      {/* ⛔ FROZEN inline styles — do not extract to Tailwind; these exact values must be preserved */}
      <style>{`
        /* ⛔ FROZEN — base reset */
        .lp-root {
          position: fixed; inset: 0;
          background: #04060e;               /* ⛔ FROZEN: #04060e (NOT --bg-base) */
          font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex; align-items: center; justify-content: center;
          overflow: hidden;
        }

        /* ⛔ FROZEN — gradient mesh background */
        .lp-bg-mesh {
          position: fixed; inset: 0; z-index: 0;
          background:
            radial-gradient(ellipse 80% 60% at 50% -10%, rgba(0,255,136,0.07) 0%, transparent 70%),
            radial-gradient(ellipse 60% 50% at 85% 110%, rgba(0,120,255,0.06) 0%, transparent 60%),
            radial-gradient(ellipse 40% 40% at 15% 80%,  rgba(120,0,255,0.04) 0%, transparent 60%);
        }

        /* ⛔ FROZEN — grid overlay: 60×60px, rgba(0,255,136,0.015) */
        .lp-grid {
          position: fixed; inset: 0; z-index: 1;
          background-image:
            linear-gradient(rgba(0,255,136,0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,136,0.015) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, black 30%, transparent 70%);
          -webkit-mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, black 30%, transparent 70%);
        }

        /* ⛔ FROZEN — scanline effect */
        .lp-scanline {
          position: fixed; inset: 0; z-index: 2; pointer-events: none;
          background: repeating-linear-gradient(
            0deg, transparent, transparent 2px,
            rgba(0,255,136,0.003) 2px, rgba(0,255,136,0.003) 4px
          );
        }

        /* ⛔ FROZEN — floating orbs: 3 instances, blur 80px, float 8-12s */
        .lp-orb {
          position: fixed; border-radius: 50%; filter: blur(80px); z-index: 0;
          animation: lp-float 8s ease-in-out infinite;
        }
        .lp-orb-1 {
          width: 400px; height: 400px; top: -100px; right: -100px;
          background: radial-gradient(circle, rgba(0,255,136,0.08), transparent 70%);
          animation-delay: 0s;
        }
        .lp-orb-2 {
          width: 300px; height: 300px; bottom: -80px; left: -80px;
          background: radial-gradient(circle, rgba(0,120,255,0.06), transparent 70%);
          animation-delay: -4s; animation-duration: 10s;
        }
        .lp-orb-3 {
          width: 200px; height: 200px; top: 40%; left: 60%;
          background: radial-gradient(circle, rgba(120,0,255,0.04), transparent 70%);
          animation-delay: -2s; animation-duration: 12s;
        }
        @keyframes lp-float {
          0%, 100% { transform: translateY(0) scale(1); }
          50%       { transform: translateY(-30px) scale(1.05); }
        }

        /* ⛔ FROZEN — radar rings: 4 rings, 4s, staggered 1s */
        /* center fix: in the HTML version radar-container is a flex child of body
           so it was naturally centered. In React it’s position:absolute so we
           must center it explicitly. */
        .lp-radar {
          position: absolute;
          z-index: 1;
          width: 500px; height: 500px;
          opacity: 0.06;
          left: 50%; top: 50%;
          transform: translate(-50%, -50%);
        }
        .lp-ring {
          position: absolute; inset: 0;
          border: 1px solid #00ff88; border-radius: 50%;
          animation: lp-radar-pulse 4s ease-out infinite;
        }
        .lp-ring:nth-child(2) { animation-delay: 1s; }
        .lp-ring:nth-child(3) { animation-delay: 2s; }
        .lp-ring:nth-child(4) { animation-delay: 3s; }
        @keyframes lp-radar-pulse {
          0%   { transform: scale(0.3); opacity: 1; }
          100% { transform: scale(1.2); opacity: 0; }
        }

        /* ⛔ FROZEN — corner accents: 40×40px, rgba(0,255,136,0.1) */
        .lp-corner {
          position: fixed; z-index: 3;
          width: 40px; height: 40px;
          border-color: rgba(0,255,136,0.1); border-style: solid;
        }
        .lp-corner-tl { top: 20px;    left: 20px;  border-width: 1px 0 0 1px; }
        .lp-corner-tr { top: 20px;    right: 20px; border-width: 1px 1px 0 0; }
        .lp-corner-bl { bottom: 20px; left: 20px;  border-width: 0 0 1px 1px; }
        .lp-corner-br { bottom: 20px; right: 20px; border-width: 0 1px 1px 0; }

        /* ⛔ FROZEN — main container */
        .lp-container {
          text-align: center; position: relative; z-index: 10; padding: 2rem;
        }

        /* ⛔ FROZEN — title: 800 weight, animated gradient #00ff88→#00ddff */
        .lp-title {
          font-size: clamp(3.2rem, 8vw, 6rem);
          font-weight: 800;
          letter-spacing: -0.02em;
          margin-bottom: 1.5rem;
          line-height: 1;
          background: linear-gradient(135deg, #00ff88 0%, #00ddff 40%, #00ff88 80%, #00ddff 100%);
          background-size: 300% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: lp-gradient-shift 6s ease infinite;
          filter: drop-shadow(0 0 40px rgba(0,255,136,0.15));
        }
        @keyframes lp-gradient-shift {
          0%   { background-position: 0% center; }
          50%  { background-position: 100% center; }
          100% { background-position: 0% center; }
        }

        /* ⛔ FROZEN — subtitle: uppercase 0.08em spacing, ETIP letters #00ff88 */
        .lp-subtitle {
          font-size: clamp(1rem, 2.2vw, 1.4rem);
          color: #4a5568;
          margin-bottom: 2.5rem;
          font-weight: 300;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .lp-hl {
          color: #00ff88;
          font-weight: 700;
          text-shadow: 0 0 20px rgba(0,255,136,0.3);
        }

        /* ⛔ FROZEN — divider */
        .lp-divider {
          width: 80px; height: 1px;
          background: linear-gradient(90deg, transparent, #00ff8844, transparent);
          margin: 0 auto 2rem;
        }

        /* ⛔ FROZEN — status pill with blinking #00ff88 dot */
        .lp-pill {
          display: inline-flex; align-items: center; gap: 10px;
          padding: 0.6rem 2rem;
          border: 1px solid rgba(0,255,136,0.12);
          border-radius: 100px;
          color: rgba(0,255,136,0.8);
          font-size: 0.8rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          font-weight: 500;
          backdrop-filter: blur(10px);
          background: rgba(0,255,136,0.02);
          box-shadow: 0 0 30px rgba(0,255,136,0.03), inset 0 0 30px rgba(0,255,136,0.02);
          cursor: default;
        }
        .lp-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #00ff88;
          box-shadow: 0 0 10px #00ff88;
          animation: lp-blink 2s ease-in-out infinite;
        }
        @keyframes lp-blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }

        /* ⛔ FROZEN — version: #1a1f2e */
        .lp-version {
          color: #1a1f2e;
          font-size: 0.7rem;
          margin-top: 2.5rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
        }

        /* CTA buttons — NOT locked (functional additions) */
        .lp-ctas {
          display: flex; align-items: center; justify-content: center;
          gap: 1rem; margin-top: 2.5rem;
        }
        .lp-btn-primary {
          padding: 0.65rem 2rem;
          background: rgba(0,255,136,0.08);
          border: 1px solid rgba(0,255,136,0.25);
          border-radius: 100px;
          color: #00ff88;
          font-size: 0.85rem;
          font-weight: 500;
          letter-spacing: 0.06em;
          cursor: pointer;
          transition: background 0.2s, box-shadow 0.2s;
          text-transform: uppercase;
        }
        .lp-btn-primary:hover {
          background: rgba(0,255,136,0.14);
          box-shadow: 0 0 20px rgba(0,255,136,0.1);
        }
        .lp-btn-secondary {
          padding: 0.65rem 2rem;
          background: transparent;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 100px;
          color: rgba(255,255,255,0.3);
          font-size: 0.85rem;
          font-weight: 400;
          letter-spacing: 0.06em;
          cursor: pointer;
          transition: border-color 0.2s, color 0.2s;
          text-transform: uppercase;
        }
        .lp-btn-secondary:hover {
          border-color: rgba(255,255,255,0.15);
          color: rgba(255,255,255,0.5);
        }
      `}</style>

      <div className="lp-root">
        {/* ⛔ FROZEN layers */}
        <div className="lp-bg-mesh" />
        <div className="lp-grid" />
        <div className="lp-scanline" />
        <div className="lp-orb lp-orb-1" />
        <div className="lp-orb lp-orb-2" />
        <div className="lp-orb lp-orb-3" />

        {/* ⛔ FROZEN — corner accents */}
        <div className="lp-corner lp-corner-tl" />
        <div className="lp-corner lp-corner-tr" />
        <div className="lp-corner lp-corner-bl" />
        <div className="lp-corner lp-corner-br" />

        {/* ⛔ FROZEN — radar rings */}
        <div className="lp-radar">
          <div className="lp-ring" />
          <div className="lp-ring" />
          <div className="lp-ring" />
          <div className="lp-ring" />
        </div>

        {/* ⛔ FROZEN — main content */}
        <div className="lp-container">
          {/* ⛔ FROZEN title */}
          <h1 className="lp-title">IntelWatch</h1>

          {/* ⛔ FROZEN subtitle — E T I P letters highlighted */}
          <p className="lp-subtitle">
            <span className="lp-hl">E</span>nterprise&ensp;
            <span className="lp-hl">T</span>hreat&ensp;
            <span className="lp-hl">I</span>ntelligence&ensp;
            <span className="lp-hl">P</span>latform
          </p>

          {/* ⛔ FROZEN divider */}
          <div className="lp-divider" />

          {/* ⛔ FROZEN status pill */}
          <div className="lp-pill">
            <span className="lp-dot" />
            Infrastructure Online
          </div>

          {/* CTA buttons — functional, not locked */}
          <div className="lp-ctas">
            <button className="lp-btn-primary" onClick={() => navigate('/login')}>
              Launch Platform
            </button>
            <button className="lp-btn-secondary" onClick={() => navigate('/register')}>
              Get Started
            </button>
          </div>

          {/* ⛔ FROZEN version */}
          <p className="lp-version">v4.0.0</p>
        </div>
      </div>
    </>
  )
}
