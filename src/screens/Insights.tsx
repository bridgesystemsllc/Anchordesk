import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart2, RefreshCw, Send, Sparkles, TrendingUp } from 'lucide-react';
import { EmptyState, Sparkline } from '@/components/ui';
import {
  AGENT_THROUGHPUT,
  CLUSTERS,
  VOLUME_BY_BRAND,
  VOLUME_BY_DAY,
  VOLUME_BY_INTENT,
  agentById,
} from '@/data/mock';
import { cx } from '@/lib/utils';

export type InsightsStatus = 'ready' | 'loading' | 'empty' | 'error';

export interface InsightsViewProps {
  status?: InsightsStatus;
  onRetry?: () => void;
}

/** Counts a KPI up from zero on mount — the number arriving feels like data landing. */
function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setV(target);
      return;
    }
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(target * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);

  return v;
}

function Kpi({
  label,
  value,
  suffix,
  decimals = 0,
  trend,
  trendLabel,
}: {
  label: string;
  value: number;
  suffix?: string;
  decimals?: number;
  trend: number;
  trendLabel: string;
}) {
  const v = useCountUp(value);
  const up = trend >= 0;

  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {v.toFixed(decimals)}
        {suffix && <small>{suffix}</small>}
      </div>
      <div className={cx('kpi-trend', up ? 'up' : 'down')}>
        {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
        {Math.abs(trend)}%<span>{trendLabel}</span>
      </div>
    </div>
  );
}

export function InsightsView({ status = 'ready', onRetry }: InsightsViewProps) {
  const maxDay = Math.max(...VOLUME_BY_DAY.map((d) => d.count));

  if (status === 'loading') {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">Insights</h1>
            <p className="page-sub">Loading insights...</p>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
          <RefreshCw size={24} className="spin" style={{ color: 'var(--text-tertiary)' }} />
        </div>
      </div>
    );
  }

  if (status === 'empty') {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">Insights</h1>
            <p className="page-sub">No data available</p>
          </div>
        </div>
        <EmptyState
          glyph={<BarChart2 size={26} />}
          title="No insights yet"
          body="Insights will appear once tickets start flowing through the system."
        />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">Insights</h1>
            <p className="page-sub">Error loading insights</p>
          </div>
        </div>
        <div className="callout callout-warn" style={{ margin: '24px 0' }}>
          <AlertTriangle size={14} style={{ flex: 'none', marginTop: 1 }} />
          <div>
            <strong>Insights could not be loaded</strong>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              Aggregates are unavailable. Live Insights is not this ticket. Retry keeps you on this page.
            </p>
          </div>
        </div>
        {onRetry && (
          <button className="btn btn-primary" onClick={onRetry} style={{ alignSelf: 'flex-start' }}>
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Insights</h1>
          <p className="page-sub">Rolling 7 days · all five brands</p>
        </div>
        <button className="btn btn-secondary ml-a">
          <Send size={14} /> Post weekly digest to Teams
        </button>
      </div>

      <div className="kpi-grid stagger">
        <Kpi label="Tickets in" value={347} trend={12} trendLabel="vs last week" />
        <Kpi label="Median first reply" value={41} suffix="m" trend={-28} trendLabel="faster" />
        <Kpi label="AI draft acceptance" value={68} suffix="%" trend={9} trendLabel="since Monday" />
        <Kpi label="Resolved / agent / day" value={9.4} decimals={1} trend={17} trendLabel="vs last week" />
      </div>

      <div className="chart-grid">
        <div className="card">
          <div className="card-head">
            <span className="card-title">Volume by day</span>
            <span className="ml-a t-xs t-ter mono">
              {VOLUME_BY_DAY.reduce((s, d) => s + d.count, 0)} total
            </span>
          </div>
          <div className="card-pad">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${VOLUME_BY_DAY.length}, 1fr)`,
                gap: 10,
                alignItems: 'end',
                height: 150,
              }}
            >
              {VOLUME_BY_DAY.map((d, i) => (
                <div key={d.day} className="col gap-6" style={{ alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                  <span className="mono t-xs t-ter">{d.count}</span>
                  <div
                    style={{
                      width: '100%',
                      height: `${(d.count / maxDay) * 100}%`,
                      borderRadius: '6px 6px 3px 3px',
                      background: 'linear-gradient(180deg, var(--accent), var(--accent-solid))',
                      boxShadow: '0 0 18px var(--accent-glow)',
                      transformOrigin: 'bottom',
                      animation: `barGrow 700ms var(--ease-spring) ${i * 60}ms both`,
                    }}
                  />
                  <span className="t-xs t-ter">{d.day}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <span className="card-title">By intent</span>
          </div>
          <div className="card-pad">
            {VOLUME_BY_INTENT.map((row, i) => (
              <div className="bar-row" key={row.label}>
                <span className="truncate t-sm">{row.label}</span>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${row.pct}%`, animationDelay: `${i * 60}ms` }}
                  />
                </div>
                <span className="bar-value">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="card">
          <div className="card-head">
            <TrendingUp size={13} style={{ color: 'var(--accent)' }} />
            <span className="card-title">Complaint clusters</span>
            <span className="ml-a badge badge-accent">
              <Sparkles size={10} /> AI clustered
            </span>
          </div>
          <div className="card-pad">
            {CLUSTERS.map((c) => (
              <div className="cluster-row" key={c.title}>
                <div style={{ minWidth: 0 }}>
                  <div className="cluster-title truncate">{c.title}</div>
                  <div className="cluster-sub">
                    <span className="mono">{c.sku}</span> · {c.note}
                  </div>
                </div>
                <Sparkline
                  points={c.spark}
                  tone={c.delta > 0 ? 'var(--danger)' : 'var(--success)'}
                />
                <div className="col" style={{ alignItems: 'flex-end', lineHeight: 1.3, flex: 'none', width: 62 }}>
                  <span className="mono" style={{ fontWeight: 600 }}>{c.count}</span>
                  <span className={cx('t-xs', c.delta > 0 ? 'kpi-trend down' : 'kpi-trend up')} style={{ fontSize: 11 }}>
                    {c.delta > 0 ? '+' : ''}
                    {c.delta}%
                  </span>
                </div>
              </div>
            ))}
            <div className="callout callout-warn" style={{ marginTop: 12 }}>
              <TrendingUp size={14} style={{ flex: 'none', marginTop: 1 }} />
              <span>
                <strong>Cover Care compacts are cracking in transit.</strong> 14 reports in 7 days,
                all shipped from Aurora in polymailers. This is a packaging fix, not 14 replacements.
              </span>
            </div>
          </div>
        </div>

        <div className="col gap-12">
          <div className="card">
            <div className="card-head">
              <span className="card-title">By brand</span>
            </div>
            <div className="card-pad">
              {VOLUME_BY_BRAND.map((b, i) => (
                <div className="bar-row" key={b.label}>
                  <span className="truncate t-sm">{b.label}</span>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${b.pct}%`,
                        background: b.color,
                        boxShadow: `0 0 12px ${b.color}`,
                        animationDelay: `${i * 60}ms`,
                      }}
                    />
                  </div>
                  <span className="bar-value">{b.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <span className="card-title">Agent throughput</span>
            </div>
            <div className="card-pad col gap-10">
              {AGENT_THROUGHPUT.map((a) => {
                const agent = agentById(a.id)!;
                return (
                  <div className="row gap-10" key={a.id}>
                    <span className="t-sm truncate grow">{agent.name}</span>
                    <span className="mono t-xs t-ter">{a.avgMin}m avg</span>
                    <span
                      className="badge badge-accent"
                      title="Share of AI drafts sent with light or no edits"
                    >
                      {Math.round(a.acceptance * 100)}% AI
                    </span>
                    <span className="mono" style={{ fontWeight: 600, width: 26, textAlign: 'right' }}>
                      {a.resolved}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Insights() {
  return <InsightsView status="ready" />;
}
