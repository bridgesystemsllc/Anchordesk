import { useNavigate } from 'react-router-dom';
import { Anchor, Laptop, Moon, Sun } from 'lucide-react';
import { BRANDS, BRAND_ORDER } from '@/data/brands';
import { useTheme } from '@/lib/theme';

export function Login() {
  const navigate = useNavigate();
  const { pref, cycle, resolved } = useTheme();
  const Icon = pref === 'system' ? Laptop : resolved === 'dark' ? Moon : Sun;

  return (
    <div className="login">
      <div className="login-mesh" />
      <div className="login-grid" />

      <button
        className="icon-btn"
        onClick={cycle}
        style={{ position: 'absolute', top: 18, right: 18, zIndex: 3 }}
        aria-label="Toggle theme"
      >
        <Icon size={15} />
      </button>

      <div className="login-card glass">
        <div className="login-logo">
          <Anchor size={24} strokeWidth={2.1} />
        </div>
        <h1 className="login-title">
          Anchor <span className="grad-text">Desk</span>
        </h1>
        <p className="login-sub">
          Five brand mailboxes, one queue. Sign in with your KarEve account — the Desk uses the same
          identity as Outlook and Teams.
        </p>

        <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={() => navigate('/queue')}>
          <MicrosoftMark />
          Sign in with Microsoft
        </button>

        <div className="login-brands">
          {BRAND_ORDER.map((code) => (
            <span
              key={code}
              title={BRANDS[code].name}
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: BRANDS[code].color,
                boxShadow: `0 0 10px ${BRANDS[code].color}`,
              }}
            />
          ))}
        </div>

        <p className="login-foot">Bridge Systems LLC · built for KarEve Beauty Group</p>
      </div>
    </div>
  );
}

function MicrosoftMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <rect x="0" y="0" width="7" height="7" fill="#F25022" />
      <rect x="9" y="0" width="7" height="7" fill="#7FBA00" />
      <rect x="0" y="9" width="7" height="7" fill="#00A4EF" />
      <rect x="9" y="9" width="7" height="7" fill="#FFB900" />
    </svg>
  );
}
