/**
 * DESIGN LOCKED — see UI_DESIGN_LOCK.md
 * Mirrors docker/nginx/landing.html exactly.
 * Radar fix (Issue 14): added left:50% top:50% transform:translate(-50%,-50%) to .lp-radar
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'

export function LandingPage() {
  const navigate    = useNavigate()
  const accessToken = useAuthStore(s => s.accessToken)
  useEffect(() => { if (accessToken) navigate('/dashboard', { replace: true }) }, [accessToken, navigate])

  return (
    <>
      <style>{`
        .lp-root { position:fixed;inset:0;background:#04060e;font-family:'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;overflow:hidden; }
        .lp-bg-mesh { position:fixed;inset:0;z-index:0;background:radial-gradient(ellipse 80% 60% at 50% -10%,rgba(0,255,136,0.07) 0%,transparent 70%),radial-gradient(ellipse 60% 50% at 85% 110%,rgba(0,120,255,0.06) 0%,transparent 60%),radial-gradient(ellipse 40% 40% at 15% 80%,rgba(120,0,255,0.04) 0%,transparent 60%); }
        .lp-grid { position:fixed;inset:0;z-index:1;background-image:linear-gradient(rgba(0,255,136,0.015) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,136,0.015) 1px,transparent 1px);background-size:60px 60px;mask-image:radial-gradient(ellipse 70% 70% at 50% 50%,black 30%,transparent 70%);-webkit-mask-image:radial-gradient(ellipse 70% 70% at 50% 50%,black 30%,transparent 70%); }
        .lp-scanline { position:fixed;inset:0;z-index:2;pointer-events:none;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,255,136,0.003) 2px,rgba(0,255,136,0.003) 4px); }
        .lp-orb { position:fixed;border-radius:50%;filter:blur(80px);z-index:0;animation:lp-float 8s ease-in-out infinite; }
        .lp-orb-1 { width:400px;height:400px;top:-100px;right:-100px;background:radial-gradient(circle,rgba(0,255,136,0.08),transparent 70%);animation-delay:0s; }
        .lp-orb-2 { width:300px;height:300px;bottom:-80px;left:-80px;background:radial-gradient(circle,rgba(0,120,255,0.06),transparent 70%);animation-delay:-4s;animation-duration:10s; }
        .lp-orb-3 { width:200px;height:200px;top:40%;left:60%;background:radial-gradient(circle,rgba(120,0,255,0.04),transparent 70%);animation-delay:-2s;animation-duration:12s; }
        @keyframes lp-float { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-30px) scale(1.05)} }
        .lp-radar { position:absolute;z-index:1;width:500px;height:500px;opacity:0.06;left:50%;top:50%;transform:translate(-50%,-50%); }
        .lp-ring { position:absolute;inset:0;border:1px solid #00ff88;border-radius:50%;animation:lp-radar-pulse 4s ease-out infinite; }
        .lp-ring:nth-child(2){animation-delay:1s} .lp-ring:nth-child(3){animation-delay:2s} .lp-ring:nth-child(4){animation-delay:3s}
        @keyframes lp-radar-pulse { 0%{transform:scale(0.3);opacity:1} 100%{transform:scale(1.2);opacity:0} }
        .lp-corner { position:fixed;z-index:3;width:40px;height:40px;border-color:rgba(0,255,136,0.1);border-style:solid; }
        .lp-corner-tl{top:20px;left:20px;border-width:1px 0 0 1px} .lp-corner-tr{top:20px;right:20px;border-width:1px 1px 0 0}
        .lp-corner-bl{bottom:20px;left:20px;border-width:0 0 1px 1px} .lp-corner-br{bottom:20px;right:20px;border-width:0 1px 1px 0}
        .lp-container { text-align:center;position:relative;z-index:10;padding:2rem; }
        .lp-title { font-size:clamp(3.2rem,8vw,6rem);font-weight:800;letter-spacing:-0.02em;margin-bottom:1.5rem;line-height:1;background:linear-gradient(135deg,#00ff88 0%,#00ddff 40%,#00ff88 80%,#00ddff 100%);background-size:300% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:lp-gradient-shift 6s ease infinite;filter:drop-shadow(0 0 40px rgba(0,255,136,0.15)); }
        @keyframes lp-gradient-shift { 0%{background-position:0% center} 50%{background-position:100% center} 100%{background-position:0% center} }
        .lp-subtitle { font-size:clamp(1rem,2.2vw,1.4rem);color:#4a5568;margin-bottom:2.5rem;font-weight:300;letter-spacing:0.08em;text-transform:uppercase; }
        .lp-hl { color:#00ff88;font-weight:700;text-shadow:0 0 20px rgba(0,255,136,0.3); }
        .lp-divider { width:80px;height:1px;background:linear-gradient(90deg,transparent,#00ff8844,transparent);margin:0 auto 2rem; }
        .lp-pill { display:inline-flex;align-items:center;gap:10px;padding:0.6rem 2rem;border:1px solid rgba(0,255,136,0.12);border-radius:100px;color:rgba(0,255,136,0.8);font-size:0.8rem;letter-spacing:0.1em;text-transform:uppercase;font-weight:500;backdrop-filter:blur(10px);background:rgba(0,255,136,0.02);box-shadow:0 0 30px rgba(0,255,136,0.03),inset 0 0 30px rgba(0,255,136,0.02);cursor:default; }
        .lp-dot { width:6px;height:6px;border-radius:50%;background:#00ff88;box-shadow:0 0 10px #00ff88;animation:lp-blink 2s ease-in-out infinite; }
        @keyframes lp-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .lp-version { color:#1a1f2e;font-size:0.7rem;margin-top:2.5rem;letter-spacing:0.15em;text-transform:uppercase; }
        .lp-ctas { display:flex;align-items:center;justify-content:center;gap:1rem;margin-top:2.5rem; }
        .lp-btn-primary { padding:0.65rem 2rem;background:rgba(0,255,136,0.08);border:1px solid rgba(0,255,136,0.25);border-radius:100px;color:#00ff88;font-size:0.85rem;font-weight:500;letter-spacing:0.06em;cursor:pointer;transition:background 0.2s,box-shadow 0.2s;text-transform:uppercase; }
        .lp-btn-primary:hover { background:rgba(0,255,136,0.14);box-shadow:0 0 20px rgba(0,255,136,0.1); }
        .lp-btn-secondary { padding:0.65rem 2rem;background:transparent;border:1px solid rgba(255,255,255,0.06);border-radius:100px;color:rgba(255,255,255,0.3);font-size:0.85rem;font-weight:400;letter-spacing:0.06em;cursor:pointer;transition:border-color 0.2s,color 0.2s;text-transform:uppercase; }
        .lp-btn-secondary:hover { border-color:rgba(255,255,255,0.15);color:rgba(255,255,255,0.5); }
      `}</style>

      <div className="lp-root">
        <div className="lp-bg-mesh"/>
        <div className="lp-grid"/>
        <div className="lp-scanline"/>
        <div className="lp-orb lp-orb-1"/>
        <div className="lp-orb lp-orb-2"/>
        <div className="lp-orb lp-orb-3"/>
        <div className="lp-corner lp-corner-tl"/>
        <div className="lp-corner lp-corner-tr"/>
        <div className="lp-corner lp-corner-bl"/>
        <div className="lp-corner lp-corner-br"/>
        <div className="lp-radar">
          <div className="lp-ring"/><div className="lp-ring"/>
          <div className="lp-ring"/><div className="lp-ring"/>
        </div>
        <div className="lp-container">
          <h1 className="lp-title">IntelWatch</h1>
          <p className="lp-subtitle">
            <span className="lp-hl">E</span>nterprise&ensp;
            <span className="lp-hl">T</span>hreat&ensp;
            <span className="lp-hl">I</span>ntelligence&ensp;
            <span className="lp-hl">P</span>latform
          </p>
          <div className="lp-divider"/>
          <div className="lp-pill"><span className="lp-dot"/> Infrastructure Online</div>
          <div className="lp-ctas">
            <button className="lp-btn-primary"   onClick={()=>navigate('/login')}>Launch Platform</button>
            <button className="lp-btn-secondary" onClick={()=>navigate('/register')}>Get Started</button>
          </div>
          <p className="lp-version">v4.0.0</p>
        </div>
      </div>
    </>
  )
}
