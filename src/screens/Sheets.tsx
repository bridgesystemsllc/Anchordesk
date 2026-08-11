import { useState } from 'react';
import { ArrowDownUp, ExternalLink, Plus, RefreshCw, Table2 } from 'lucide-react';
import { SHEETS } from '@/data/mock';
import { INTENT_SHORT } from '@/data/brands';
import { cx, shortAge } from '@/lib/utils';

export function Sheets() {
  const [activeId, setActiveId] = useState(SHEETS[0]!.id);
  const [appended, setAppended] = useState<string[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const sheet = SHEETS.find((s) => s.id === activeId)!;

  const appendDemo = () => {
    setSyncing(true);
    window.setTimeout(() => {
      setAppended([
        new Date().toISOString().slice(0, 10),
        '4821',
        'CD',
        'Tanya Whitfield',
        'CD-GS-7OIL',
        'Lost in transit — reship',
        '$0.00',
        'A. George',
      ]);
      setSyncing(false);
    }, 900);
  };

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Sheets</h1>
          <p className="page-sub">
            Live from SharePoint via Graph. The team keeps the workflow it already trusts — the Desk
            just writes to it too.
          </p>
        </div>
        <div className="ml-a row gap-8">
          <button className="btn btn-secondary" onClick={appendDemo} disabled={syncing}>
            <Plus size={14} /> Append ticket #4821
          </button>
          <button className="btn btn-secondary">
            <ExternalLink size={14} /> Open in Excel
          </button>
        </div>
      </div>

      <div className="row gap-8 wrap" style={{ marginBottom: 12 }}>
        <div className="tab-bar">
          {SHEETS.map((s) => (
            <button
              key={s.id}
              className={cx('tab', s.id === activeId && 'active')}
              onClick={() => {
                setActiveId(s.id);
                setAppended(null);
              }}
            >
              <Table2 size={12} />
              {s.name}
            </button>
          ))}
        </div>
        <span className="ml-a row gap-6 t-xs t-ter">
          <ArrowDownUp size={12} />
          Two-way · last write {shortAge(sheet.lastWriteAt)} ago
        </span>
      </div>

      <div className="embed-frame">
        <div className="embed-bar">
          <span className="status-dot live" style={{ color: 'var(--success)' }} />
          <strong style={{ fontSize: 12.5 }}>{sheet.name}</strong>
          <span className="t-ter">›</span>
          <span className="t-ter">{sheet.worksheet}</span>
          <span className="chip">{sheet.owner}</span>
          {sheet.autoAppendOn && (
            <span className="badge badge-accent">
              auto-append on {INTENT_SHORT[sheet.autoAppendOn]}
            </span>
          )}
          <button className="icon-btn ml-a" title="Refresh" aria-label="Refresh">
            <RefreshCw size={13} className={syncing ? 'spin' : undefined} />
          </button>
        </div>

        <div className="embed-grid">
          <table className="xl-table">
            <thead>
              <tr>
                <th className="rownum" />
                {sheet.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {appended && (
                <tr className="xl-new-row">
                  <td className="rownum">1</td>
                  {appended.map((cell, i) => (
                    <td key={i}>{cell}</td>
                  ))}
                </tr>
              )}
              {sheet.rows.map((row, i) => (
                <tr key={i}>
                  <td className="rownum">{i + (appended ? 2 : 1)}</td>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="t-xs t-ter" style={{ marginTop: 10, lineHeight: 1.6 }}>
        Rendered here as a native grid for speed. In production this pane is the real Excel surface —
        a SharePoint <code className="mono">?action=embedview</code> iframe — so agents edit in the UI
        they already know, and the Desk reads and writes the same range through a Graph workbook
        session.
      </p>
    </div>
  );
}
