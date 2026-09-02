import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Anchor, Laptop, Moon, Sun } from 'lucide-react';
import { BRANDS, BRAND_ORDER } from '@/data/brands';
import { useTheme } from '@/lib/theme';

export type LoginStatus = 'ready' | 'loading' | 'error';

export interface LoginViewProps {
  status?: LoginStatus;
}

export function LoginView({ status = 'ready' }: LoginViewProps) {
  const navigate = useNavigate();
  const { pref, cycle, resolved } = useTheme();
  const Icon = pref === 'system' ? Laptop : resolved === 'dark' ? Moon : Sun;
  const [signingIn, setSigningIn] = useState(false);

  const handleSignIn = () => {
    setSigningIn(true);
    navigate('/queue');
  };

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

        {status === 'error' ? (
          <>
            <div className="callout callout-warn" style={{ marginBottom: 16, textAlign: 'left' }}>
              <AlertTriangle size={14} style={{ flex: 'none', marginTop: 1 }} />
              <div>
                <strong>Microsoft sign-in did not complete</strong>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  Entra SSO is not wired on this ticket. Demo sign-in still opens the queue.
                  If you reached this screen from a failed attempt, use Try again.
                </p>
              </div>
            </div>
            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%' }}
              onClick={handleSignIn}
              disabled={signingIn}
            >
              Try again
            </button>
          </>
        ) : status === 'loading' ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            Signing in...
          </div>
        ) : (
          <>
            <p className="login-sub">
              Five brand mailboxes, one queue. Sign in with your KarEve account — the Desk uses the same
              identity as Outlook and Teams.
            </p>
            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%' }}
              onClick={handleSignIn}
              disabled={signingIn}
            >
              <MicrosoftMark />
              Sign in with Microsoft
            </button>
          </>
        )}

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

export function Login() {
  return <LoginView status="ready" />;
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
