import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemePref = 'dark' | 'light' | 'system';
export type Resolved = 'dark' | 'light';

const STORAGE_KEY = 'anchor.theme';

type ThemeCtx = {
  pref: ThemePref;
  resolved: Resolved;
  setPref: (p: ThemePref) => void;
  cycle: () => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

function systemTheme(): Resolved {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'dark' || v === 'light' || v === 'system') return v;
  } catch {
    /* private mode — fall through to default */
  }
  return 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readPref);
  const [systemResolved, setSystemResolved] = useState<Resolved>(systemTheme);

  // Track OS changes so 'system' stays honest while the app is open.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setSystemResolved(mq.matches ? 'light' : 'dark');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved: Resolved = pref === 'system' ? systemResolved : pref;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      /* non-fatal */
    }
  }, []);

  const cycle = useCallback(() => {
    setPref(pref === 'dark' ? 'light' : pref === 'light' ? 'system' : 'dark');
  }, [pref, setPref]);

  const value = useMemo(
    () => ({ pref, resolved, setPref, cycle }),
    [pref, resolved, setPref, cycle],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
