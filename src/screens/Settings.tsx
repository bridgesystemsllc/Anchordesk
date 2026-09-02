import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Brush,
  Clock,
  Inbox,
  Laptop,
  Moon,
  Palette,
  Route,
  Sparkles,
  Sun,
  Table2,
  Users,
} from 'lucide-react';
import { Avatar, Badge, Toggle } from '@/components/ui';
import { BRAND_ORDER, INTENT_SHORT } from '@/data/brands';
import { AGENTS as DEMO_AGENTS, SHEETS as DEMO_SHEETS } from '@/data/mock';
import { apiGet, apiPost, apiPut, apiErrorMessage, isLive } from '@/lib/api';
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

const BRAND_COLORS: Record<string, string> = {
  CD: 'var(--brand-cd)',
  DB: 'var(--brand-db)',
  BOC: 'var(--brand-boc)',
  AMBI: 'var(--brand-ambi)',
  AF: 'var(--brand-af)',
};

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

function ErrorFrame({ headline, body }: { headline: string; body: string }) {
  return (
    <div className="callout callout-warn" style={{ marginBottom: 12 }}>
      <AlertTriangle size={14} style={{ flex: 'none', marginTop: 1 }} />
      <span>
        <strong>{headline}</strong> {body}
      </span>
    </div>
  );
}

function DemoHint() {
  if (isLive) return null;
  return (
    <div className="callout callout-accent" style={{ marginBottom: 12 }}>
      <span className="t-ter">Demo mode — set VITE_API_URL to edit config.</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="card-pad t-ter">{text}</div>;
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

interface ApiMailbox {
  id: string;
  brandCode: string;
  address: string;
  graphUserId: string;
  displayName: string;
  enabled: boolean;
  subscriptionExpiresAt: string | null;
  lastSyncAt: string | null;
}

function Mailboxes() {
  const [mailboxes, setMailboxes] = useState<ApiMailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAddress, setEditAddress] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');

  const fetchData = useCallback(async () => {
    if (!isLive) {
      setMailboxes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ mailboxes: ApiMailbox[] }>('/api/settings/mailboxes');
      setMailboxes(res.mailboxes);
    } catch (e) {
      setError('Mailboxes could not be loaded — The server did not return mailbox config. Check VITE_API_TOKEN. Demo data was not used.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const startEdit = (m: ApiMailbox) => {
    setEditingId(m.id);
    setEditAddress(m.address);
    setEditDisplayName(m.displayName);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError(null);
  };

  const handleSave = async (m: ApiMailbox) => {
    if (!isLive || saving) return;
    if (!editAddress.trim() || !editDisplayName.trim()) {
      setError('Mailbox could not be saved — Address and display name cannot be empty.');
      return;
    }
    setSaving(m.id);
    setError(null);
    try {
      const updated = await apiPut<ApiMailbox>('/api/settings/mailboxes', {
        id: m.id,
        address: editAddress.trim(),
        graphUserId: m.graphUserId,
        displayName: editDisplayName.trim(),
        enabled: m.enabled,
      });
      setMailboxes((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      setEditingId(null);
    } catch (e) {
      const msg = apiErrorMessage(e);
      if (msg.includes('duplicate_address') || msg.includes('409')) {
        setError('Mailbox could not be saved — Duplicate address. Each mailbox needs a unique SMTP address. The previous address is unchanged. Try again.');
      } else {
        setError(`Mailbox could not be saved — ${msg}`);
      }
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <Panel title="Brand mailboxes" hint="Loading...">
        <div className="card-pad t-ter">Loading mailbox configuration...</div>
      </Panel>
    );
  }

  return (
    <>
      <DemoHint />
      {error && <ErrorFrame headline="Mailbox could not be saved —" body={error.replace('Mailbox could not be saved — ', '')} />}

      <div className="callout callout-warn" style={{ marginBottom: 12 }}>
        <AlertTriangle size={14} style={{ flex: 'none', marginTop: 1 }} />
        <span>
          Graph change-notification subscriptions expire every <strong>3 days</strong>. The renewal
          job runs hourly and alerts on failure — this is the number one way a system like this stops
          working silently.
        </span>
      </div>

      <Panel title="Brand mailboxes" hint={`${mailboxes.length} connected`}>
        {mailboxes.length === 0 && !isLive && (
          <EmptyState text="No mailboxes configured. Set VITE_API_URL to load from server." />
        )}
        {mailboxes.map((m) => {
          const isEditing = editingId === m.id;
          const isSaving = saving === m.id;
          return (
            <Row
              key={m.id}
              title={
                <span className="row gap-8">
                  <span className="brand-chip" style={{ ['--brand-color' as string]: BRAND_COLORS[m.brandCode] }}>
                    {m.displayName}
                  </span>
                </span>
              }
              desc={
                isEditing ? (
                  <div className="row gap-8 wrap" style={{ marginTop: 4 }}>
                    <input
                      className="form-input mono"
                      style={{ width: 220 }}
                      value={editAddress}
                      onChange={(e) => setEditAddress(e.target.value)}
                      placeholder="address@example.com"
                    />
                    <input
                      className="form-input"
                      style={{ width: 180 }}
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                      placeholder="Display Name"
                    />
                  </div>
                ) : (
                  <span className="row gap-10 wrap">
                    <span className="mono">{m.address}</span>
                    {m.subscriptionExpiresAt && (
                      <span>· subscription renews {fullStamp(m.subscriptionExpiresAt)}</span>
                    )}
                  </span>
                )
              }
              control={
                isEditing ? (
                  <>
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={isSaving || !isLive}
                      onClick={() => handleSave(m)}
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button className="btn btn-sm btn-secondary" onClick={cancelEdit} disabled={isSaving}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    {m.lastSyncAt ? (
                      <Badge tone="success" dot>Syncing</Badge>
                    ) : (
                      <Badge tone="warning">Not synced</Badge>
                    )}
                    <button className="btn btn-sm btn-secondary" onClick={() => startEdit(m)} disabled={!isLive}>
                      Edit
                    </button>
                  </>
                )
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

interface ApiBrand {
  brandCode: string;
  displayName: string;
  shortName: string;
  signature: string;
  voice: string;
}

function Brands() {
  const [brands, setBrands] = useState<ApiBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editVoice, setEditVoice] = useState('');
  const [editSignature, setEditSignature] = useState('');

  const fetchData = useCallback(async () => {
    if (!isLive) {
      setBrands([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiGet<{ brands: ApiBrand[] }>('/api/settings/brands');
      setBrands(res.brands);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const startEdit = (b: ApiBrand) => {
    setEditingCode(b.brandCode);
    setEditVoice(b.voice);
    setEditSignature(b.signature);
  };

  const cancelEdit = () => {
    setEditingCode(null);
    setError(null);
  };

  const handleSave = async (b: ApiBrand) => {
    if (!isLive || saving) return;
    if (!editSignature.trim()) {
      setError('Brand settings could not be saved — Display name cannot be empty. Signature and voice were not written.');
      return;
    }
    setSaving(b.brandCode);
    setError(null);
    try {
      const updated = await apiPut<ApiBrand>('/api/settings/brands', {
        brandCode: b.brandCode,
        displayName: b.displayName,
        shortName: b.shortName,
        signature: editSignature.trim(),
        voice: editVoice.trim() || b.voice,
      });
      setBrands((prev) => prev.map((x) => (x.brandCode === updated.brandCode ? updated : x)));
      setEditingCode(null);
    } catch (e) {
      setError(`Brand settings could not be saved — ${apiErrorMessage(e)}`);
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <Panel title="Brand voice" hint="Loading...">
        <div className="card-pad t-ter">Loading brand configuration...</div>
      </Panel>
    );
  }

  const orderedBrands = BRAND_ORDER.map((code) => brands.find((b) => b.brandCode === code)).filter(Boolean) as ApiBrand[];

  return (
    <>
      <DemoHint />
      {error && <ErrorFrame headline="Brand settings could not be saved —" body={error.replace('Brand settings could not be saved — ', '')} />}

      <Panel title="Brand voice" hint="Feeds every AI draft">
        {orderedBrands.length === 0 && !isLive && (
          <EmptyState text="No brands configured. Set VITE_API_URL to load from server." />
        )}
        {orderedBrands.map((b) => {
          const isEditing = editingCode === b.brandCode;
          const isSaving = saving === b.brandCode;
          return (
            <Row
              key={b.brandCode}
              title={
                <span className="brand-chip" style={{ ['--brand-color' as string]: BRAND_COLORS[b.brandCode] }}>
                  {b.displayName}
                </span>
              }
              desc={
                isEditing ? (
                  <div style={{ marginTop: 4 }}>
                    <textarea
                      className="form-input"
                      style={{ width: '100%', minHeight: 60 }}
                      value={editVoice}
                      onChange={(e) => setEditVoice(e.target.value)}
                      placeholder="Voice description..."
                    />
                    <input
                      className="form-input"
                      style={{ width: '100%', marginTop: 4 }}
                      value={editSignature}
                      onChange={(e) => setEditSignature(e.target.value)}
                      placeholder="Signature"
                    />
                  </div>
                ) : (
                  <>
                    {b.voice}
                    <br />
                    <span className="t-ter">Signature: {b.signature}</span>
                  </>
                )
              }
              control={
                isEditing ? (
                  <>
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={isSaving || !isLive}
                      onClick={() => handleSave(b)}
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button className="btn btn-sm btn-secondary" onClick={cancelEdit} disabled={isSaving}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button className="btn btn-sm btn-secondary" onClick={() => startEdit(b)} disabled={!isLive}>
                    Edit voice
                  </button>
                )
              }
            />
          );
        })}
      </Panel>
    </>
  );
}

interface ApiBinding {
  id: string;
  name: string;
  workbookId: string;
  worksheet: string;
  owner: string;
  columns: string[];
  autoAppendOn: string | null;
  enabled: boolean;
  lastWriteAt: string | null;
}

function ExcelBindings() {
  const [bindings, setBindings] = useState<ApiBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!isLive) {
      setBindings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiGet<{ bindings: ApiBinding[] }>('/api/settings/bindings');
      setBindings(res.bindings);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <Panel title="Workbook bindings" hint="Loading...">
        <div className="card-pad t-ter">Loading bindings...</div>
      </Panel>
    );
  }

  const displayBindings = isLive ? bindings : DEMO_SHEETS;

  return (
    <>
      <DemoHint />
      {error && <ErrorFrame headline="Binding could not be saved —" body={error} />}

      <Panel title="Workbook bindings" hint="Graph workbook sessions">
        {displayBindings.length === 0 ? (
          <EmptyState text="No bindings configured yet." />
        ) : (
          displayBindings.map((s) => (
            <Row
              key={s.id}
              title={s.name}
              desc={
                <>
                  {s.owner} › {s.worksheet} · {s.columns.length} mapped columns
                  {s.lastWriteAt && ` · last write ${shortAge(s.lastWriteAt)} ago`}
                </>
              }
              control={
                <>
                  {s.autoAppendOn ? (
                    <Badge tone="accent">auto on {INTENT_SHORT[s.autoAppendOn as keyof typeof INTENT_SHORT] ?? s.autoAppendOn}</Badge>
                  ) : (
                    <Badge tone="neutral">manual</Badge>
                  )}
                  <button className="btn btn-sm btn-secondary" disabled={!isLive}>
                    Map fields
                  </button>
                </>
              }
            />
          ))
        )}
      </Panel>
    </>
  );
}

interface ApiRoute {
  id: string;
  intent: string;
  brandCode: string | null;
  destinationType: string;
  destination: string;
  label: string;
  enabled: boolean;
}

function Routing() {
  const [routes, setRoutes] = useState<ApiRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!isLive) {
      setRoutes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiGet<{ routes: ApiRoute[] }>('/api/settings/routes');
      setRoutes(res.routes);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <Panel title="Default escalation targets" hint="Loading...">
        <div className="card-pad t-ter">Loading routing rules...</div>
      </Panel>
    );
  }

  return (
    <>
      <DemoHint />
      {error && <ErrorFrame headline="Routing rule could not be saved —" body={error} />}

      <Panel title="Default escalation targets" hint="Per intent · overridable per brand">
        {routes.length === 0 ? (
          <EmptyState text="No routing rules yet." />
        ) : (
          routes.map((r) => (
            <Row
              key={r.id}
              title={INTENT_SHORT[r.intent as keyof typeof INTENT_SHORT] ?? r.intent}
              desc={<span className="mono">{r.destination}</span>}
              control={
                <>
                  <span className="chip">{r.label}</span>
                  <button className="btn btn-sm btn-secondary" disabled={!isLive}>
                    Change
                  </button>
                </>
              }
            />
          ))
        )}
      </Panel>
    </>
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

  const fetchData = useCallback(async () => {
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
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, sourcesRes] = await Promise.all([
        apiGet<KbSettings>('/api/kb/settings'),
        apiGet<KbSourcesResponse>('/api/kb/sources'),
      ]);
      setSettings(settingsRes);
      setSources(sourcesRes);
      setEditSiteId(settingsRes.siteId ?? '');
      setEditDriveId(settingsRes.driveId ?? '');
      setEditFolderPath(settingsRes.folderPath ?? '/');
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSaveSettings = async () => {
    if (!isLive || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiPut<KbSettings>('/api/kb/settings', {
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
    if (!isLive || reindexing) return;
    setReindexing(true);
    setError(null);
    try {
      await apiPost('/api/kb/reindex', {});
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
      <DemoHint />
      {error && <ErrorFrame headline="Reindex is not ready —" body={error} />}

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

interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: string;
  title: string;
  entraGroup: string | null;
  enabled: boolean;
}

function UsersRoles() {
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!isLive) {
      setUsers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiGet<{ users: ApiUser[] }>('/api/settings/users');
      setUsers(res.users);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleRoleChange = async (user: ApiUser, newRole: string) => {
    if (!isLive || saving) return;
    setSaving(user.id);
    setError(null);
    try {
      const updated = await apiPut<ApiUser>('/api/settings/users', {
        id: user.id,
        name: user.name,
        email: user.email,
        role: newRole,
        title: user.title,
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (e) {
      const msg = apiErrorMessage(e);
      if (msg.includes('duplicate_email') || msg.includes('409')) {
        setError('User could not be saved — Email is required and must be a valid address. Live Entra import is not wired on this ticket.');
      } else {
        setError(`User could not be saved — ${msg}`);
      }
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <Panel title="Team" hint="Loading...">
        <div className="card-pad t-ter">Loading users...</div>
      </Panel>
    );
  }

  const displayUsers = isLive ? users : DEMO_AGENTS.map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    role: a.role,
    title: a.title,
    entraGroup: null,
    enabled: true,
  }));

  return (
    <>
      <DemoHint />
      {error && <ErrorFrame headline="User could not be saved —" body={error.replace('User could not be saved — ', '')} />}

      <Panel title="Team" hint="Synced from Entra groups">
        {displayUsers.length === 0 ? (
          <EmptyState text="No users configured yet." />
        ) : (
          displayUsers.map((a) => (
            <Row
              key={a.id}
              title={
                <span className="row gap-8">
                  <Avatar name={a.name} size="sm" />
                  {a.name}
                </span>
              }
              desc={
                <>
                  {a.title} · <span className="mono">{a.email}</span>
                </>
              }
              control={
                <select
                  className="form-select"
                  style={{ width: 118 }}
                  value={a.role}
                  onChange={(e) => handleRoleChange(a as ApiUser, e.target.value)}
                  disabled={!isLive || saving === a.id}
                >
                  <option value="agent">Agent</option>
                  <option value="lead">Lead</option>
                  <option value="admin">Admin</option>
                </select>
              }
            />
          ))
        )}
      </Panel>
    </>
  );
}

interface ApiSla {
  priority: number;
  firstResponseMinutes: number;
  appliesTo: string;
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins} min`;
  if (mins < 1440) return `${Math.round(mins / 60)} hour${mins >= 120 ? 's' : ''}`;
  return `${Math.round(mins / 1440)} day${mins >= 2880 ? 's' : ''}`;
}

function Sla() {
  const [sla, setSla] = useState<ApiSla[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingPriority, setEditingPriority] = useState<number | null>(null);
  const [editMinutes, setEditMinutes] = useState('');

  const fetchData = useCallback(async () => {
    if (!isLive) {
      setSla([
        { priority: 1, firstResponseMinutes: 60, appliesTo: 'VIP, billing disputes, adverse reactions' },
        { priority: 2, firstResponseMinutes: 120, appliesTo: 'Carrier exceptions, damage, mis-picks' },
        { priority: 3, firstResponseMinutes: 240, appliesTo: 'Returns, standard WISMO' },
        { priority: 4, firstResponseMinutes: 1440, appliesTo: 'Product questions, pre-sale' },
      ]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiGet<{ sla: ApiSla[] }>('/api/settings/sla');
      setSla(res.sla);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const startEdit = (s: ApiSla) => {
    setEditingPriority(s.priority);
    setEditMinutes(String(s.firstResponseMinutes));
  };

  const cancelEdit = () => {
    setEditingPriority(null);
    setError(null);
  };

  const handleSave = async (s: ApiSla) => {
    if (!isLive || saving) return;
    const mins = parseInt(editMinutes, 10);
    if (isNaN(mins) || mins < 1 || mins > 10080) {
      setError('SLA targets could not be saved — First-response minutes must be 1 to 10080.');
      return;
    }
    setSaving(s.priority);
    setError(null);
    try {
      const updated = await apiPut<ApiSla>('/api/settings/sla', {
        priority: s.priority,
        firstResponseMinutes: mins,
        appliesTo: s.appliesTo,
      });
      setSla((prev) => prev.map((x) => (x.priority === updated.priority ? updated : x)));
      setEditingPriority(null);
    } catch (e) {
      setError(`SLA targets could not be saved — ${apiErrorMessage(e)}`);
    } finally {
      setSaving(null);
    }
  };

  const priorityLabels: Record<number, string> = {
    1: 'P1 — Critical',
    2: 'P2 — High',
    3: 'P3 — Normal',
    4: 'P4 — Low',
  };

  if (loading) {
    return (
      <Panel title="First-reply targets" hint="Loading...">
        <div className="card-pad t-ter">Loading SLA targets...</div>
      </Panel>
    );
  }

  return (
    <>
      <DemoHint />
      {error && <ErrorFrame headline="SLA targets could not be saved —" body={error.replace('SLA targets could not be saved — ', '')} />}

      <Panel title="First-reply targets" hint="Per priority · overridable per brand">
        {sla.map((s) => {
          const isEditing = editingPriority === s.priority;
          const isSaving = saving === s.priority;
          return (
            <Row
              key={s.priority}
              title={priorityLabels[s.priority] ?? `P${s.priority}`}
              desc={s.appliesTo}
              control={
                isEditing ? (
                  <>
                    <input
                      className="form-input mono"
                      style={{ width: 80 }}
                      value={editMinutes}
                      onChange={(e) => setEditMinutes(e.target.value)}
                      placeholder="minutes"
                    />
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={isSaving || !isLive}
                      onClick={() => handleSave(s)}
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button className="btn btn-sm btn-secondary" onClick={cancelEdit} disabled={isSaving}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="chip mono">{formatMinutes(s.firstResponseMinutes)}</span>
                    <button className="btn btn-sm btn-secondary" onClick={() => startEdit(s)} disabled={!isLive}>
                      Edit
                    </button>
                  </>
                )
              }
            />
          );
        })}
      </Panel>
    </>
  );
}

interface ApiAiSettings {
  id: string;
  model: string;
  tone: string;
  costCeilingUsd: string;
  autoDraft: boolean;
  requireCitations: boolean;
}

function AiSettings() {
  const [settings, setSettings] = useState<ApiAiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editModel, setEditModel] = useState('claude-sonnet-4-5');
  const [editTone, setEditTone] = useState('warm');
  const [editCeiling, setEditCeiling] = useState('50');
  const [editAutoDraft, setEditAutoDraft] = useState(true);
  const [editCitations, setEditCitations] = useState(true);

  const fetchData = useCallback(async () => {
    if (!isLive) {
      setSettings({
        id: 'default',
        model: 'claude-sonnet-4-5',
        tone: 'warm',
        costCeilingUsd: '50',
        autoDraft: true,
        requireCitations: true,
      });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiGet<{ ai: ApiAiSettings }>('/api/settings/ai');
      setSettings(res.ai);
      setEditModel(res.ai.model);
      setEditTone(res.ai.tone);
      setEditCeiling(res.ai.costCeilingUsd);
      setEditAutoDraft(res.ai.autoDraft);
      setEditCitations(res.ai.requireCitations);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    if (!isLive || saving) return;
    const ceiling = parseFloat(editCeiling);
    if (isNaN(ceiling) || ceiling < 0) {
      setError('AI settings could not be saved — Cost ceiling must be a number greater than or equal to 0. Model was not changed.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await apiPut<ApiAiSettings>('/api/settings/ai', {
        model: editModel,
        tone: editTone,
        costCeilingUsd: ceiling,
        autoDraft: editAutoDraft,
        requireCitations: editCitations,
      });
      setSettings(updated);
    } catch (e) {
      setError(`AI settings could not be saved — ${apiErrorMessage(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    settings &&
    (editModel !== settings.model ||
      editTone !== settings.tone ||
      editCeiling !== settings.costCeilingUsd ||
      editAutoDraft !== settings.autoDraft ||
      editCitations !== settings.requireCitations);

  if (loading) {
    return (
      <Panel title="Drafting" hint="Loading...">
        <div className="card-pad t-ter">Loading AI settings...</div>
      </Panel>
    );
  }

  return (
    <>
      <DemoHint />
      {error && <ErrorFrame headline="AI settings could not be saved —" body={error.replace('AI settings could not be saved — ', '')} />}

      <Panel title="Drafting" hint="Autonomy L1–L2 · a human always sends">
        <Row
          title="Draft on arrival"
          desc="Generate a reply as soon as a ticket lands, so the agent opens an edit rather than a blank box."
          control={<Toggle on={editAutoDraft} onChange={setEditAutoDraft} />}
        />
        <Row
          title="Require a citation for every factual claim"
          desc="Blocks any draft containing a claim that doesn't map to a KB chunk or an order field. Leave this on."
          control={<Toggle on={editCitations} onChange={setEditCitations} />}
        />
        <Row
          title="Model"
          desc="Drafting and policy checks. Triage runs on a smaller model."
          control={
            <select
              className="form-select"
              style={{ width: 168 }}
              value={editModel}
              onChange={(e) => setEditModel(e.target.value)}
            >
              <option value="claude-opus-5">Claude Opus 5</option>
              <option value="claude-sonnet-4-5">Claude Sonnet 4.5</option>
              <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
            </select>
          }
        />
        <Row
          title="Tone"
          desc="The voice the AI uses when drafting replies."
          control={
            <select
              className="form-select"
              style={{ width: 140 }}
              value={editTone}
              onChange={(e) => setEditTone(e.target.value)}
            >
              <option value="warm">Warm</option>
              <option value="clinical">Clinical</option>
              <option value="understated">Understated</option>
              <option value="plainspoken">Plainspoken</option>
              <option value="direct">Direct</option>
            </select>
          }
        />
        <Row
          title="Cost ceiling (USD)"
          desc="AI never fills an amount above this. Anything higher requires a lead."
          control={
            <input
              className="form-input mono"
              style={{ width: 96 }}
              value={editCeiling}
              onChange={(e) => setEditCeiling(e.target.value)}
            />
          }
        />
        <div className="card-pad row gap-8" style={{ justifyContent: 'flex-end' }}>
          <button
            className="btn btn-sm btn-primary"
            disabled={!hasChanges || saving || !isLive}
            onClick={handleSave}
          >
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        </div>
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
