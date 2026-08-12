import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Inbox,
  Moon,
  Phone,
  Search,
  Settings,
  Sun,
  Table2,
  Ticket as TicketIcon,
  User,
} from 'lucide-react';
import { searchTickets } from '@/data/source';
import type { QueueItem } from '@/data/view';
import { BRANDS } from '@/data/brands';
import { useResource } from '@/hooks/useResource';
import { useTheme } from '@/lib/theme';
import { cx } from '@/lib/utils';

type Item = {
  id: string;
  group: string;
  label: string;
  meta?: string;
  icon: React.ReactNode;
  run: () => void;
};

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { resolved, setPref } = useTheme();

  // Loaded once when the palette opens; searching filters that page locally.
  const fetcher = useCallback((signal: AbortSignal) => searchTickets(signal), []);
  const { data: tickets, loading } = useResource<QueueItem[]>('cmdk', fetcher);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const items = useMemo<Item[]>(() => {
    const go = (path: string) => () => {
      navigate(path);
      onClose();
    };

    const nav: Item[] = [
      { id: 'n-queue', group: 'Go to', label: 'Queue', icon: <Inbox size={15} />, run: go('/queue') },
      { id: 'n-mine', group: 'Go to', label: 'My Tickets', icon: <TicketIcon size={15} />, run: go('/queue?assignee=me') },
      { id: 'n-calls', group: 'Go to', label: 'Calls', icon: <Phone size={15} />, run: go('/calls') },
      { id: 'n-sheets', group: 'Go to', label: 'Sheets', icon: <Table2 size={15} />, run: go('/sheets') },
      { id: 'n-insights', group: 'Go to', label: 'Insights', icon: <BarChart3 size={15} />, run: go('/insights') },
      { id: 'n-settings', group: 'Go to', label: 'Settings', icon: <Settings size={15} />, run: go('/settings') },
      {
        id: 'a-theme',
        group: 'Actions',
        label: resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        icon: resolved === 'dark' ? <Sun size={15} /> : <Moon size={15} />,
        run: () => {
          setPref(resolved === 'dark' ? 'light' : 'dark');
          onClose();
        },
      },
    ];

    const needle = q.trim().toLowerCase();
    if (!needle) return nav;

    const pool = tickets ?? [];

    const ticketHits: Item[] = pool
      .filter(
        (t) =>
          String(t.number).includes(needle) ||
          t.subject.toLowerCase().includes(needle) ||
          (t.orderNumber ?? '').toLowerCase().includes(needle),
      )
      .slice(0, 6)
      .map((t) => ({
        id: t.id,
        group: 'Tickets',
        label: `#${t.number} · ${t.subject}`,
        meta: BRANDS[t.brand].short,
        icon: <TicketIcon size={15} />,
        run: go(`/tickets/${t.id}`),
      }));

    // Customers are derived from the loaded tickets rather than a separate
    // directory, so the palette never offers someone with nothing to open.
    const seen = new Set<string>();
    const customerHits: Item[] = [];
    for (const t of pool) {
      if (!t.customer || seen.has(t.customer.id)) continue;
      const matches =
        t.customer.name.toLowerCase().includes(needle) ||
        t.customer.email.toLowerCase().includes(needle);
      if (!matches) continue;
      seen.add(t.customer.id);
      customerHits.push({
        id: t.customer.id,
        group: 'Customers',
        label: t.customer.name,
        meta: t.customer.email,
        icon: <User size={15} />,
        run: go(`/tickets/${t.id}`),
      });
      if (customerHits.length >= 4) break;
    }

    return [
      ...ticketHits,
      ...customerHits,
      ...nav.filter((n) => n.label.toLowerCase().includes(needle)),
    ];
  }, [q, tickets, navigate, onClose, resolved, setPref]);

  useEffect(() => setActive(0), [q]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return onClose();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % Math.max(items.length, 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + items.length) % Math.max(items.length, 1));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      items[active]?.run();
    }
  };

  let lastGroup = '';

  return (
    <div
      className="cmdk-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="cmdk-input-row">
          <Search size={17} />
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Search tickets, customers, order numbers…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <span className="kbd">ESC</span>
        </div>
        <div className="cmdk-list">
          {items.length === 0 && (
            <div className="cmdk-group" style={{ padding: '18px 10px' }}>
              {loading ? 'Loading tickets…' : `No matches for “${q}”`}
            </div>
          )}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {header && <div className="cmdk-group">{header}</div>}
                <button
                  className={cx('cmdk-item', i === active && 'active')}
                  onMouseEnter={() => setActive(i)}
                  onClick={it.run}
                >
                  {it.icon}
                  <span className="truncate">{it.label}</span>
                  {it.meta && <span className="cmdk-item-meta">{it.meta}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="cmdk-foot">
          <span>
            <span className="kbd">↑↓</span> navigate
          </span>
          <span>
            <span className="kbd">↵</span> open
          </span>
          <span className="ml-a">Anchor Desk</span>
        </div>
      </div>
    </div>
  );
}
