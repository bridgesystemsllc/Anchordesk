import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Brush,
  Clock,
  Inbox,
  Laptop,
  Moon,
  Palette,
  RefreshCw,
  Route,
  Sparkles,
  Sun,
  Table2,
  Users,
} from 'lucide-react';
import { Avatar, Badge, Toggle } from '@/components/ui';
import { BRANDS, BRAND_ORDER, INTENT_SHORT } from '@/data/brands';
import { AGENTS, SHEETS } from '@/data/mock';
import { getIngestHealth, type IngestHealth, isLive } from '@/data/source';
import { apiGet, apiPost, apiPut, apiErrorMessage } from '@/lib/api';
import { useTheme, type ThemePref } from '@/lib/theme';
import { cx, fullStamp, shortAge } from '@/lib/utils';

const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'mailboxes', label: 'Mailboxes', icon: Inbox },
  { id: 'brands', label: 'Brands & voice', icon: Brush },
  { id: 'sheets', label: 'Excel bindings', icon: Table2 },
  { id: 'routing', label: 'Escalation routing', icon: Route },
  { id: 'knowledge', label: 'Knowledge sources', icon: BookOpen },
  { id: 'users', label: 'Users & roles', icon: Users },
  { id: 'sla', label: 'SLA targets', icon: Clock },
  { id: 'ai', label: 'AI settings', icon: Sparkles },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

export function Settings() {
  const [section, setSection] = useState<SectionId>('appearance');

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">
            Anything that will change is data, not code. Mailboxes, routing and Excel bindings never
            need a deploy.
          </p>
        </div>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={cx('nav-item', section === id && 'active')}
              onClick={() => setSection(id)}
            >
              <Icon size={15} strokeWidth={1.9} />
              {label}
            </button>
          ))}
        </nav>

        <div key={section} className="fade-up">
          {section === 'appearance' && <Appearance />}
          {section === 'mailboxes' && <Mailboxes />}
          {section === 'brands' && <Brands />}
          {section === 'sheets' && <ExcelBindings />}
          {section === 'routing' && <Routing />}
          {section === 'knowledge' && <Knowledge />}
          {section === 'users' && <UsersRoles />}
          {section === 'sla' && <Sla />}
          {section === 'ai' && <AiSettings />}
        </div>
      </div>
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-head">
        <span className="card-title">{title}</span>
        {hint && (
          <span className="ml-a t-xs t-ter" style={{ textTransform: 'none', letterSpacing: 0 }}>
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Row({
  title,
  desc,
  control,
}: {
  title: React.ReactNode;
  desc?: React.ReactNode;
  control: React.ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-main">
        <div className="settings-row-title">{title}</div>
        {desc && <div className="settings-row-desc">{desc}</div>}
      </div>
      <div className="settings-row-control">{control}</div>
    </div>
  );
}

function Appearance() {
  const { pref, setPref, resolved } = useTheme();
  const opts: { id: ThemePref; label: string; icon: typeof Sun }[] = [
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'system', label: 'System', icon: Laptop },
  ];

  return (
    <>
      <Panel title="Theme" hint={`Currently rendering ${resolved}`}>
        <Row
          title="Colour theme"
          desc="Dark is the default for long shifts. Light is a full composition, not an inversion — both are built on the same Electric Indigo accent."
          control={
            <div className="tab-bar">
              {opts.map(({ id, label, icon: Icon }) => (
                <button key={id} className={cx('tab', pref === id && 'active')} onClick={() => setPref(id)}>
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>
          }
        />
        <Row
          title="Follow Teams theme in the tab surface"
          desc="Inside the Teams tab the app binds to the Teams theme context (default / dark / contrast) instead of this preference."
          control={<Toggle on onChange={() => {}} />}
        />
        <Row
          title="Density"
          desc="Compact is the default. This is a tool people live in eight hours a day."
          control={
            <select className="form-select" style={{ width: 140 }} defaultValue="compact">
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
            </select>
          }
        />
      </Panel>

      <Panel title="Preview">
        <div className="card-pad row gap-12 wrap">
          {(['new', 'open', 'pending', 'escalated', 'resolved'] as const).map((s) => (
            <span key={s} className="chip">
              {s}
            </span>
          ))}
          <button className="btn btn-sm btn-primary">Primary</button>
          <button className="btn btn-sm btn-secondary">Secondary</button>
          <Badge tone="accent">Accent</Badge>
          <Badge tone="success">Success</Badge>
          <Badge tone="warning">Warning</Badge>
          <Badge tone="danger">Danger</Badge>
        </div>
      </Panel>
    </>
  );
}

function Mailboxes() {
  const [health, setHealth] = useState<IngestHealth | null>(null);
  const [loading, setLoading] = useState(isLive);
  const [_error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    if (!isLive) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getIngestHealth();
      setHealth(data);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchHealth();
  }, []);

  const unhealthyMailboxes = health?.mailboxes.filter((m) => !m.healthy) ?? [];
  const hasExpired = unhealthyMailboxes.some((m) => m.problems.includes('subscription-expired'));

  return (
    <>
      <div className="callout callout-warn" style={{ marginBottom: 12 }}>
        <AlertTriangle size={14} style={{ flex: 'none', marginTop: 1 }} />
        <span>
          Graph change-notification subscriptions last <strong>10,080 minutes</strong> (under 7 days).
          We request <strong>6 days</strong> and renew with a <strong>24-hour lead</strong>, so a full
          day of renewal failures still can't drop a subscription. Point the monitor at{' '}
          <code className="mono">GET /api/health/ingest</code> and page on a non-200. Run the renewal
          dry-run: <code className="mono">POST /api/health/renewal-drill</code>.
        </span>
      </div>

      {isLive && !loading && unhealthyMailboxes.length > 0 && (
        <div className="callout callout-warn" style={{ marginBottom: 12, background: 'var(--danger-bg)', borderColor: 'var(--danger)' }}>
          <AlertTriangle size={14} style={{ flex: 'none', marginTop: 1, color: 'var(--danger)' }} />
          <div>
            <div className="row gap-8" style={{ marginBottom: 6 }}>
              <strong style={{ color: 'var(--danger)' }}>Mailbox ingest is unhealthy</strong>
              <Badge tone={hasExpired ? 'danger' : 'warning'}>{hasExpired ? 'Expired' : 'Down'}</Badge>
            </div>
            {unhealthyMailboxes.map((m) => (
              <div key={m.address} style={{ fontSize: 13, marginBottom: 4 }}>
                <strong>{BRANDS[m.brand as keyof typeof BRANDS]?.name ?? m.brand}</strong>{' '}
                <span className="mono">{m.address}</span>: {m.problems.join(', ')}
              </div>
            ))}
            <button
              className="btn btn-sm btn-secondary"
              onClick={fetchHealth}
              style={{ marginTop: 8 }}
            >
              <RefreshCw size={12} /> Retry health
            </button>
          </div>
        </div>
      )}

      <Panel title="Brand mailboxes" hint={loading ? 'Loading...' : `${BRAND_ORDER.length} connected`}>
        {BRAND_ORDER.map((code) => {
          const b = BRANDS[code];
          const mailboxHealth = health?.mailboxes.find((m) => m.brand === code);
          const isHealthy = mailboxHealth?.healthy ?? true;
          const problems = mailboxHealth?.problems ?? [];
          return (
            <Row
              key={code}
              title={
                <span className="row gap-8">
                  <span
                    className="brand-chip"
                    style={{ ['--brand-color' as string]: b.color }}
                  >
                    {b.name}
                  </span>
                </span>
              }
              desc={
                <span className="row gap-10 wrap">
                  <span className="mono">{b.mailbox}</span>
                  <span>· subscription renews {fullStamp(b.subscriptionRenewsAt)}</span>
                </span>
              }
              control={
                <>
                  {isHealthy ? (
                    <Badge tone="success" dot>
                      Syncing
                    </Badge>
                  ) : problems.includes('subscription-expired') ? (
                    <Badge tone="danger">Expired</Badge>
                  ) : (
                    <Badge tone="warning">Down</Badge>
                  )}
                  <button className="btn btn-sm btn-secondary">Edit</button>
                </>
              }
            />
          );
        })}
      </Panel>

      <Panel title="Delta reconciliation">
        <Row
          title="Safety-net poll"
          desc="Runs a delta query against every mailbox on an interval, so a dropped webhook can never lose mail."
          control={
            <select className="form-select" style={{ width: 140 }} defaultValue="15">
              <option value="5">Every 5 min</option>
              <option value="15">Every 15 min</option>
              <option value="60">Hourly</option>
            </select>
          }
        />
        <Row
          title="Mark handled in Outlook"
          desc="Sets an Outlook category on the source message so anyone still working in the shared mailbox can see the Desk has it."
          control={<Toggle on onChange={() => {}} />}
        />
      </Panel>
    </>
  );
}

function Brands() {
  return (
    <Panel title="Brand voice" hint="Feeds every AI draft">
      {BRAND_ORDER.map((code) => {
        const b = BRANDS[code];
        return (
          <Row
            key={code}
            title={
              <span className="brand-chip" style={{ ['--brand-color' as string]: b.color }}>
                {b.name}
              </span>
            }
            desc={
              <>
                {b.voice}
                <br />
                <span className="t-ter">Signature: {b.signature}</span>
              </>
            }
            control={<button className="btn btn-sm btn-secondary">Edit voice</button>}
          />
        );
      })}
    </Panel>
  );
}

function ExcelBindings() {
  return (
    <Panel title="Workbook bindings" hint="Graph workbook sessions">
      {SHEETS.map((s) => (
        <Row
          key={s.id}
          title={s.name}
          desc={
            <>
              {s.owner} › {s.worksheet} · {s.columns.length} mapped columns · last write{' '}
              {shortAge(s.lastWriteAt)} ago
            </>
          }
          control={
            <>
              {s.autoAppendOn ? (
                <Badge tone="accent">auto on {INTENT_SHORT[s.autoAppendOn]}</Badge>
              ) : (
                <Badge tone="neutral">manual</Badge>
              )}
              <button className="btn btn-sm btn-secondary">Map fields</button>
            </>
          }
        />
      ))}
    </Panel>
  );
}

function Routing() {
  const routes = [
    { intent: 'Refund above $25', target: 'Renata Cole', channel: '#kareve-finance' },
    { intent: 'Repeat damage / packaging', target: 'Simone Boateng', channel: '#fulfillment-escalations' },
    { intent: 'Carrier exception', target: 'Simone Boateng', channel: '#kareve-operations' },
    { intent: 'Adverse reaction claim', target: 'Renata Cole', channel: '#kareve-operations' },
    { intent: 'Anything unrouted', target: 'Team lead on duty', channel: '#kareve-operations' },
  ];

  return (
    <Panel title="Default escalation targets" hint="Per intent · overridable per brand">
      {routes.map((r) => (
        <Row
          key={r.intent}
          title={r.intent}
          desc={<span className="mono">{r.channel}</span>}
          control={
            <>
              <span className="chip">{r.target}</span>
              <button className="btn btn-sm btn-secondary">Change</button>
            </>
          }
        />
      ))}
    </Panel>
  );
}

interface KbSettings {
  siteId: string | null;
  driveId: string | null;
  folderPath: string;
  lastCrawlAt: string | null;
  crawlStatus: string;
  crawlError: string | null;
}

interface KbSource {
  id: string;
  name: string;
  path: string;
  chunkCount: number;
  indexedAt: string | null;
  brandCode: string | null;
}

interface KbSourcesResponse {
  sources: KbSource[];
  totalSources: number;
  totalChunks: number;
}

function Knowledge() {
  const [settings, setSettings] = useState<KbSettings | null>(null);
  const [sources, setSources] = useState<KbSourcesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editSiteId, setEditSiteId] = useState('');
  const [editDriveId, setEditDriveId] = useState('');
  const [editFolderPath, setEditFolderPath] = useState('/');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, sourcesRes] = await Promise.all([
        apiGet<KbSettings>('/kb/settings'),
        apiGet<KbSourcesResponse>('/kb/sources'),
      ]);
      setSettings(settingsRes);
      setSources(sourcesRes);
      setEditSiteId(settingsRes.siteId ?? '');
      setEditDriveId(settingsRes.driveId ?? '');
      setEditFolderPath(settingsRes.folderPath ?? '/');
    } catch (e) {
      if (!isLive) {
        setSettings({
          siteId: null,
          driveId: null,
          folderPath: '/',
          lastCrawlAt: null,
          crawlStatus: 'idle',
          crawlError: null,
        });
        setSources({ sources: [], totalSources: 0, totalChunks: 0 });
      } else {
        setError(apiErrorMessage(e));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const handleSaveSettings = async () => {
    if (!isLive) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiPut<KbSettings>('/kb/settings', {
        siteId: editSiteId || null,
        driveId: editDriveId || null,
        folderPath: editFolderPath || '/',
      });
      setSettings(updated);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleReindex = async () => {
    if (!isLive) return;
    setReindexing(true);
    setError(null);
    try {
      await apiPost('/kb/reindex', {});
      setTimeout(() => {
        void fetchData();
        setReindexing(false);
      }, 2000);
    } catch (e) {
      setError(apiErrorMessage(e));
      setReindexing(false);
    }
  };

  const isConfigured = Boolean(settings?.siteId && settings?.driveId);
  const hasChanges =
    editSiteId !== (settings?.siteId ?? '') ||
    editDriveId !== (settings?.driveId ?? '') ||
    editFolderPath !== (settings?.folderPath ?? '/');

  if (loading) {
    return (
      <Panel title="Knowledge sources" hint="Loading...">
        <div className="card-pad t-ter">Loading KB configuration...</div>
      </Panel>
    );
  }

  return (
    <>
      {error && (
        <div className="callout callout-warn" style={{ marginBottom: 12 }}>
          <AlertTriangle size={14} style={{ flex: 'none', marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      {!isConfigured && (
        <div className="callout callout-warn" style={{ marginBottom: 12 }}>
          <AlertTriangle size={14} style={{ flex: 'none', marginTop: 1 }} />
          <span>
            <strong>SharePoint not configured.</strong> Enter your Site ID and Drive ID below to
            connect the knowledge base.
          </span>
        </div>
      )}

      <Panel title="SharePoint connection" hint={isConfigured ? 'Connected' : 'Not configured'}>
        <Row
          title="Site ID"
          desc="The SharePoint site ID containing your knowledge base documents"
          control={
            <input
              className="form-input mono"
              style={{ width: 280 }}
              value={editSiteId}
              onChange={(e) => setEditSiteId(e.target.value)}
              placeholder="kareve.sharepoint.com,..."
            />
          }
        />
        <Row
          title="Drive ID"
          desc="The document library drive ID"
          control={
            <input
              className="form-input mono"
              style={{ width: 280 }}
              value={editDriveId}
              onChange={(e) => setEditDriveId(e.target.value)}
              placeholder="b!..."
            />
          }
        />
        <Row
          title="Folder path"
          desc="Folder within the drive to index (default: root)"
          control={
            <input
              className="form-input mono"
              style={{ width: 160 }}
              value={editFolderPath}
              onChange={(e) => setEditFolderPath(e.target.value)}
              placeholder="/"
            />
          }
        />
        <div className="card-pad row gap-8" style={{ justifyContent: 'flex-end' }}>
          <button
            className="btn btn-sm btn-primary"
            disabled={!hasChanges || saving || !isLive}
            onClick={handleSaveSettings}
          >
            {saving ? 'Saving...' : 'Save connection'}
          </button>
        </div>
      </Panel>

      <Panel
        title="Indexed sources"
        hint={`${sources?.totalChunks ?? 0} chunks · hybrid FTS + pgvector`}
      >
        {sources && sources.sources.length > 0 ? (
          sources.sources.map((s) => (
            <Row
              key={s.id}
              title={s.name}
              desc={
                <>
                  {s.path} · <span className="mono">{s.chunkCount}</span> chunks
                  {s.indexedAt && ` · indexed ${shortAge(s.indexedAt)} ago`}
                </>
              }
              control={
                s.brandCode ? (
                  <Badge tone="neutral">{s.brandCode}</Badge>
                ) : null
              }
            />
          ))
        ) : (
          <div className="card-pad t-ter">
            {isConfigured
              ? 'No documents indexed yet. Click Re-index to start.'
              : 'Configure SharePoint connection above to index documents.'}
          </div>
        )}
        <div className="card-pad row gap-8" style={{ justifyContent: 'flex-end' }}>
          <button
            className="btn btn-sm btn-secondary"
            disabled={!isConfigured || reindexing || !isLive}
            onClick={handleReindex}
          >
            {reindexing
              ? 'Indexing...'
              : settings?.crawlStatus === 'crawling'
                ? 'Crawl in progress...'
                : 'Re-index'}
          </button>
        </div>
        {settings?.crawlStatus === 'failed' && settings.crawlError && (
          <div className="card-pad">
            <Badge tone="danger">Last crawl failed: {settings.crawlError}</Badge>
          </div>
        )}
        {settings?.lastCrawlAt && (
          <div className="card-pad t-ter t-xs">
            Last indexed: {fullStamp(settings.lastCrawlAt)}
          </div>
        )}
      </Panel>

      {/* Retrieval quality is the lever on draft quality. If acceptance drops
          below 50%, the fix is almost always the chunks, not the model. */}
      <div className="callout callout-accent">
        <BookOpen size={14} style={{ flex: 'none', marginTop: 1 }} />
        <span>
          Retrieval quality is the lever on draft quality. If acceptance drops below 50%, the fix is
          almost always the chunks — not the model.
        </span>
      </div>
    </>
  );
}

function UsersRoles() {
  return (
    <Panel title="Team" hint="Synced from Entra groups">
      {AGENTS.map((a) => (
        <Row
          key={a.id}
          title={
            <span className="row gap-8">
              <Avatar name={a.name} size="sm" />
              {a.name}
              {a.online && <span className="status-dot live" style={{ color: 'var(--success)' }} />}
            </span>
          }
          desc={
            <>
              {a.title} · <span className="mono">{a.email}</span>
            </>
          }
          control={
            <select className="form-select" style={{ width: 118 }} defaultValue={a.role}>
              <option value="agent">Agent</option>
              <option value="lead">Lead</option>
              <option value="admin">Admin</option>
            </select>
          }
        />
      ))}
    </Panel>
  );
}

function Sla() {
  const targets = [
    ['P1 — Critical', '1 hour', 'VIP, billing disputes, adverse reactions'],
    ['P2 — High', '2 hours', 'Carrier exceptions, damage, mis-picks'],
    ['P3 — Normal', '4 hours', 'Returns, standard WISMO'],
    ['P4 — Low', '1 business day', 'Product questions, pre-sale'],
  ];

  return (
    <Panel title="First-reply targets" hint="Per priority · overridable per brand">
      {targets.map(([p, t, d]) => (
        <Row
          key={p}
          title={p!}
          desc={d}
          control={
            <>
              <span className="chip mono">{t}</span>
              <button className="btn btn-sm btn-secondary">Edit</button>
            </>
          }
        />
      ))}
    </Panel>
  );
}

function AiSettings() {
  const [autoDraft, setAutoDraft] = useState(true);
  const [citations, setCitations] = useState(true);

  return (
    <>
      <Panel title="Drafting" hint="Autonomy L1–L2 · a human always sends">
        <Row
          title="Draft on arrival"
          desc="Generate a reply as soon as a ticket lands, so the agent opens an edit rather than a blank box."
          control={<Toggle on={autoDraft} onChange={setAutoDraft} />}
        />
        <Row
          title="Require a citation for every factual claim"
          desc="Blocks any draft containing a claim that doesn't map to a KB chunk or an order field. Leave this on."
          control={<Toggle on={citations} onChange={setCitations} />}
        />
        <Row
          title="Model"
          desc="Drafting and policy checks. Triage runs on a smaller model."
          control={
            <select className="form-select" style={{ width: 168 }} defaultValue="opus">
              <option value="opus">Claude Opus 5</option>
              <option value="sonnet">Claude Sonnet 5</option>
              <option value="haiku">Claude Haiku 4.5</option>
            </select>
          }
        />
        <Row
          title="Refund auto-fill ceiling"
          desc="AI never fills an amount above this. Anything higher requires a lead."
          control={<input className="form-input mono" style={{ width: 96 }} defaultValue="$25.00" />}
        />
      </Panel>

      <Panel title="Guardrails">
        <Row
          title="Never deflect a supervisor request"
          desc="Any message asking for a supervisor routes to a lead immediately, no draft."
          control={<Badge tone="accent">Enforced</Badge>}
        />
        <Row
          title="Never send unattended"
          desc="The Desk has no path to send a customer-facing message without a human pressing send."
          control={<Badge tone="accent">Enforced</Badge>}
        />
      </Panel>

      <Panel title="Cost & quality" hint="Rolling 7 days">
        <Row title="Spend" desc="Across triage, drafting, summaries and policy checks." control={<span className="mono">$41.28</span>} />
        <Row title="Draft acceptance" desc="Share of drafts sent with light or no edits." control={<Badge tone="success">68%</Badge>} />
        <Row title="Median draft latency" desc="Time from arrival to a draft being ready." control={<span className="mono">3.1s</span>} />
      </Panel>
    </>
  );
}
