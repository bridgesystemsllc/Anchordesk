import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Anchor,
  BarChart3,
  Bell,
  Inbox,
  Laptop,
  Moon,
  Phone,
  Search,
  Settings,
  Sun,
  Table2,
  Ticket as TicketIcon,
} from 'lucide-react';
import { CommandPalette } from './CommandPalette';
import { Avatar } from './ui';
import { ME } from '@/data/mock';
import { getIngestHealth, isLive, listQueue, type IngestHealth } from '@/data/source';
import type { QueueItem } from '@/data/view';
import { useResource } from '@/hooks/useResource';
import { useTheme } from '@/lib/theme';
import { detectSurface, type Surface } from '@/lib/surface';
import { cx, shortAge } from '@/lib/utils';

const COUNT_POLL_MS = 60_000;
const HEALTH_POLL_MS = 60_000;

const NAV = [
  { to: '/queue', label: 'Queue', icon: Inbox, counter: 'open' },
  { to: '/mine', label: 'My Tickets', icon: TicketIcon, counter: 'mine' },
  { to: '/calls', label: 'Calls', icon: Phone },
  { to: '/sheets', label: 'Sheets', icon: Table2 },
  { to: '/insights', label: 'Insights', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

const TITLES: Record<string, { title: string; sub: string }> = {
  '/queue': { title: 'Queue', sub: 'All brands · live' },
  '/mine': { title: 'My Tickets', sub: 'Assigned to you' },
  '/calls': { title: 'Calls', sub: 'Logged conversations' },
  '/sheets': { title: 'Sheets', sub: 'Live from SharePoint' },
  '/insights': { title: 'Insights', sub: 'Rolling 7 days' },
  '/settings': { title: 'Settings', sub: 'Admin console' },
};

function ThemeToggle() {
  const { pref, cycle, resolved } = useTheme();
  const Icon = pref === 'system' ? Laptop : resolved === 'dark' ? Moon : Sun;
  const label =
    pref === 'system' ? `System (${resolved})` : resolved === 'dark' ? 'Dark' : 'Light';
  return (
    <button className="icon-btn" onClick={cycle} title={`Theme: ${label} — click to change`} aria-label={`Theme: ${label}`}>
      <Icon size={15} />
    </button>
  );
}

/** Violet bloom that trails the pointer. Desktop only, disabled for reduced motion. */
function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia('(hover: none)').matches) return;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = ref.current;
        if (el) {
          el.style.left = `${e.clientX}px`;
          el.style.top = `${e.clientY}px`;
        }
      });
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <div className="cursor-glow" ref={ref} aria-hidden />;
}

/** Live subscription health, in the shell rather than only in a monitor. */
function SyncPill({ health }: { health: IngestHealth | undefined }) {
  if (!health) {
    return (
      <div className="sync-pill">
        <span className="status-dot" style={{ color: 'var(--text-tertiary)' }} />
        Graph sync
        <span className="sync-pill-meta">—</span>
      </div>
    );
  }

  const unhealthy = health.mailboxes.filter((m) => !m.healthy);
  const lastSync = health.mailboxes
    .map((m) => m.lastSyncAt)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1);

  return (
    <div
      className="sync-pill"
      title={
        unhealthy.length > 0
          ? unhealthy.map((m) => `${m.brand}: ${m.problems.join(', ')}`).join('\n')
          : lastSync
            ? `All mailboxes syncing · last delta ${shortAge(lastSync)} ago`
            : 'All mailboxes syncing'
      }
    >
      <span
        className="status-dot live"
        style={{ color: health.ok ? 'var(--success)' : 'var(--danger)' }}
      />
      Graph sync
      <span className="sync-pill-meta" style={{ color: health.ok ? undefined : 'var(--danger)' }}>
        {health.ok ? `${health.mailboxes.length} mbx` : `${unhealthy.length} down`}
      </span>
    </div>
  );
}

export function AppShell() {
  const { pathname, search } = useLocation();
  const [cmdk, setCmdk] = useState(false);
  const [surface] = useState<Surface>(detectSurface);

  // Nav badges and the sync pill are shell-wide, so they load here rather than
  // in each screen. Both pause while the tab is hidden.
  const openFetcher = useCallback((signal: AbortSignal) => listQueue({ status: 'open_all', limit: 200 }, signal), []);
  const { data: openTickets } = useResource<QueueItem[]>('shell-open', openFetcher, {
    pollMs: isLive ? COUNT_POLL_MS : undefined,
  });

  const healthFetcher = useCallback((signal: AbortSignal) => getIngestHealth(signal), []);
  const { data: health } = useResource<IngestHealth>('shell-health', healthFetcher, {
    pollMs: isLive ? HEALTH_POLL_MS : undefined,
  });

  const counts: Record<string, number | undefined> = {
    open: openTickets?.length,
    mine: openTickets?.filter((t) => t.assignee?.id === ME.id).length,
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdk((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isTicket = pathname.startsWith('/tickets/');
  const head = TITLES[pathname] ?? (isTicket ? { title: 'Ticket', sub: 'Thread' } : TITLES['/queue']!);

  // In the Teams surface Teams already draws the outer chrome — §3.6.
  const chromeless = surface === 'teams';

  return (
    <div className="shell" data-chrome={chromeless ? 'none' : 'full'}>
      <CursorGlow />

      {!chromeless && (
        <aside className="sidebar">
          <div className="brandmark">
            <span className="brandmark-logo">
              <Anchor size={15} strokeWidth={2.2} />
            </span>
            <span className="brandmark-text">
              <span className="brandmark-name">Anchor Desk</span>
              <span className="brandmark-sub">KarEve</span>
            </span>
          </div>

          <div className="nav-section-label">Workspace</div>
          {NAV.map(({ to, label, icon: Icon, ...rest }) => {
            const count = 'counter' in rest ? counts[rest.counter as string] : undefined;
            return (
              <NavLink key={to} to={to} className={({ isActive }) => cx('nav-item', isActive && 'active')}>
                <Icon size={15} strokeWidth={1.9} />
                {label}
                {count !== undefined && <span className="nav-count">{count}</span>}
              </NavLink>
            );
          })}

          <div className="sidebar-footer">
            <SyncPill health={health} />
            <div className="nav-item" style={{ cursor: 'default' }}>
              <Avatar name={ME.name} size="sm" />
              <span className="col" style={{ lineHeight: 1.2, overflow: 'hidden' }}>
                <span className="truncate" style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>
                  {ME.name.split(' ')[0]}
                </span>
                <span className="t-xs t-ter truncate">{ME.title}</span>
              </span>
            </div>
          </div>
        </aside>
      )}

      <div className="main">
        <header className="topbar">
          {chromeless && (
            <span className="brandmark-logo" style={{ width: 24, height: 24, borderRadius: 8 }}>
              <Anchor size={13} strokeWidth={2.2} />
            </span>
          )}
          <div className="topbar-title">
            {head.title}
            <small>{head.sub}</small>
          </div>
          <div className="topbar-spacer" />
          <button className="search-trigger" onClick={() => setCmdk(true)}>
            <Search size={14} />
            Search tickets, customers, orders
            <span className="kbd">⌘K</span>
          </button>
          <ThemeToggle />
          <button className="icon-btn" title="Notifications" aria-label="Notifications">
            <Bell size={15} />
            <span className="dot-badge" />
          </button>
          {!chromeless && <Avatar name={ME.name} />}
        </header>

        <Outlet key={pathname + search} />
      </div>

      {cmdk && <CommandPalette onClose={() => setCmdk(false)} />}
    </div>
  );
}
