import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  CornerUpLeft,
  FileText,
  History,
  Info,
  Mail,
  MessageSquare,
  Package,
  Paperclip,
  Phone,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  Sparkles,
  Star,
  StickyNote,
  User,
  X,
} from 'lucide-react';
import { EscalateModal } from '@/components/EscalateModal';
import { LogCallModal } from '@/components/LogCallModal';
import { Avatar, BrandChip, EmptyState, KeyVal, SlaRing, StatusBadge } from '@/components/ui';
import { BRANDS, INTENT_LABEL } from '@/data/brands';
import {
  attachOrderToTicket,
  checkPolicy,
  generateDraft,
  getTicket,
  isLive,
  lookupShopifyOrders,
  sendReply,
  summarizeThread,
  type ShopifyLookupBy,
  type ShopifyOrder,
} from '@/data/source';
import type { Citation, Message } from '@/data/types';
import type { TicketDetail } from '@/data/view';
import { useResource } from '@/hooks/useResource';
import { ApiError, apiErrorMessage } from '@/lib/api';
import { clockTime, cx, fullStamp, shortAge, usd } from '@/lib/utils';

const TRACK_ORDER = ['unfulfilled', 'in_transit', 'out_for_delivery', 'delivered'] as const;
const TRACK_LABELS = ['Placed', 'In transit', 'Out for del.', 'Delivered'];

function newKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `key-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function sendErrorHeadline(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 422) return 'Uncited claims detected';
    if (e.status === 409 && e.message.includes('supervisor')) return 'Cannot auto-reply to supervisor request';
    if (e.isConflict) return 'This reply is already being sent';
    if (e.status === 0) return 'Could not confirm whether the reply was sent';
    if (e.status === 502) return 'Outlook rejected the reply';
    if (e.status === 503) return 'AI service unavailable';
    if (e.isUnauthorized) return 'Not authorized to send';
  }
  return 'The reply was not sent';
}

/**
 * The uncertain case matters most. On a timeout the mail may already be gone,
 * so the agent must be told to retry rather than rewrite — retrying reuses the
 * idempotency key and cannot produce a second email.
 */
function sendErrorDetail(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 422) {
      return 'Every factual claim must cite a policy chunk or an order field. Edit the draft to cite sources or remove uncited claims.';
    }
    if (e.status === 409 && e.message.includes('supervisor')) {
      return 'This customer asked for a supervisor. Escalate to a human instead of sending an AI reply.';
    }
    if (e.isConflict) {
      return 'Another send is already in flight for this message. Give it a moment, then refresh — it will not send twice.';
    }
    if (e.status === 0) {
      return 'It may or may not have gone out. Press Try again — this resumes the same send and cannot email the customer twice. Do not rewrite the reply.';
    }
    if (e.status === 502) return `${e.message}. Press Try again once the mailbox recovers.`;
    if (e.status === 503) return `${e.message}. Check ANTHROPIC_API_KEY or try again later.`;
  }
  return apiErrorMessage(e);
}

export function TicketView() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const fetcher = useCallback((signal: AbortSignal) => getTicket(id, signal), [id]);
  const { data: ticket, error, loading, refreshing, refetch } = useResource<TicketDetail | null>(
    id,
    fetcher,
    { enabled: Boolean(id) },
  );

  const [draft, setDraft] = useState<string | null>(null);
  const [draftCitations, setDraftCitations] = useState<Citation[]>([]);
  const [draftBlocked, setDraftBlocked] = useState(false);
  const [draftUncited, setDraftUncited] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [checkingPolicy, setCheckingPolicy] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [logging, setLogging] = useState(false);
  const [openCitation, setOpenCitation] = useState<Citation | null>(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<unknown>(undefined);
  const [aiError, setAiError] = useState<string | null>(null);

  const [orderSearchOpen, setOrderSearchOpen] = useState(false);
  const [orderQuery, setOrderQuery] = useState('');
  const [orderSearchBy, setOrderSearchBy] = useState<ShopifyLookupBy>('email');
  const [orderSearching, setOrderSearching] = useState(false);
  const [orderResults, setOrderResults] = useState<ShopifyOrder[]>([]);
  const [orderDemo, setOrderDemo] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [attachedSnapshotId, setAttachedSnapshotId] = useState<string | null>(null);

  /**
   * One key per composed reply, minted lazily and reused across retries. This
   * is the client half of the send-once guarantee: pressing send again after a
   * timeout resumes the same send rather than starting a second one.
   */
  const idempotencyKey = useRef<string | null>(null);
  if (idempotencyKey.current === null) idempotencyKey.current = newKey();

  if (loading) return <TicketSkeleton />;

  if (error !== undefined && !ticket) {
    const notFound = error instanceof ApiError && error.isNotFound;
    return (
      <div className="page">
        <EmptyState
          glyph={notFound ? <Mail size={26} /> : <AlertTriangle size={26} />}
          title={notFound ? 'Ticket not found' : 'Could not load this ticket'}
          body={
            notFound
              ? 'It may have been merged or closed. Head back to the queue and try again.'
              : apiErrorMessage(error)
          }
          action={
            <div className="row gap-8">
              <button className="btn btn-secondary" onClick={refetch}>
                <RefreshCw size={14} /> Retry
              </button>
              <Link to="/queue" className="btn btn-ghost">
                <ArrowLeft size={14} /> Back to queue
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="page">
        <EmptyState
          glyph={<Mail size={26} />}
          title="Ticket not found"
          body="It may have been merged or closed. Head back to the queue and try again."
          action={
            <Link to="/queue" className="btn btn-secondary">
              <ArrowLeft size={14} /> Back to queue
            </Link>
          }
        />
      </div>
    );
  }

  const { customer, assignee: owner } = ticket;
  const brand = BRANDS[ticket.brand];
  const body = draft ?? ticket.aiDraft ?? '';
  const citations = draftCitations.length > 0 ? draftCitations : ticket.citations;
  const closed = ticket.status === 'resolved' || ticket.status === 'closed';
  const isSupervisor = ticket.intent === 'supervisor';
  const wasEdited = draft !== null && draft !== ticket.aiDraft;

  const regenerate = async () => {
    setGenerating(true);
    setAiError(null);
    setDraftBlocked(false);
    setDraftUncited([]);

    try {
      const result = await generateDraft(ticket.id);
      setDraft(result.text);
      setDraftCitations(result.citations);
      setDraftBlocked(result.blocked);
      setDraftUncited(result.uncited);
    } catch (e) {
      if (e instanceof ApiError) {
        setAiError(e.message);
      } else {
        setAiError('Failed to generate draft');
      }
    } finally {
      setGenerating(false);
    }
  };

  const doSummarize = async () => {
    setSummarizing(true);
    setAiError(null);

    try {
      await summarizeThread(ticket.id);
      refetch();
    } catch (e) {
      if (e instanceof ApiError) {
        setAiError(e.message);
      } else {
        setAiError('Failed to summarize thread');
      }
    } finally {
      setSummarizing(false);
    }
  };

  const doPolicyCheck = async () => {
    setCheckingPolicy(true);
    setAiError(null);

    try {
      await checkPolicy(ticket.id);
      refetch();
    } catch (e) {
      if (e instanceof ApiError) {
        setAiError(e.message);
      } else {
        setAiError('Failed to check policy');
      }
    } finally {
      setCheckingPolicy(false);
    }
  };

  const send = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    setSendError(undefined);

    const draftedByAi = Boolean(ticket.aiDraft) || draftCitations.length > 0;

    try {
      await sendReply(ticket.id, {
        body,
        idempotencyKey: idempotencyKey.current!,
        draftedByAi,
        editedByHuman: wasEdited,
        originalDraft: wasEdited ? ticket.aiDraft ?? undefined : undefined,
        citations: citations.length > 0 ? { items: citations } : undefined,
      });
      setSent(true);
      idempotencyKey.current = newKey();
      setDraft('');
      setDraftCitations([]);
      setDraftBlocked(false);
      setDraftUncited([]);
      refetch();
    } catch (e) {
      setSendError(e);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="ticket-layout">
      <section className="ticket-main">
        <header className="ticket-head">
          <div className="row gap-10">
            <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back">
              <ArrowLeft size={15} />
            </button>
            <h1 className="ticket-subject truncate">{ticket.subject}</h1>
            <div className="ml-a row gap-6">
              <button className="icon-btn" onClick={refetch} aria-label="Refresh">
                <RefreshCw size={13} className={refreshing ? 'spin' : undefined} />
              </button>
              <button className="btn btn-sm btn-secondary" onClick={() => setLogging(true)}>
                <Phone size={13} /> Log call
              </button>
              <button className="btn btn-sm btn-secondary" onClick={() => setEscalating(true)}>
                <ArrowUpRight size={13} /> Escalate
              </button>
              <button className="btn btn-sm btn-primary">
                <Check size={13} /> Resolve
              </button>
            </div>
          </div>

          <div className="ticket-meta">
            <span className="mono">#{ticket.number}</span>
            <StatusBadge status={ticket.status} />
            <BrandChip brand={ticket.brand} full />
            <span className="chip">{INTENT_LABEL[ticket.intent]}</span>
            {ticket.orderNumber && <span className="chip mono">{ticket.orderNumber}</span>}
            <span>·</span>
            <span>opened {shortAge(ticket.createdAt)} ago</span>
            <div className="ml-a row gap-10">
              {owner ? (
                <span className="row gap-6">
                  <Avatar name={owner.name} size="sm" />
                  <span className="t-sm truncate" style={{ maxWidth: 160 }}>
                    {owner.name}
                  </span>
                </span>
              ) : (
                <button className="btn btn-sm btn-ghost">
                  <User size={13} /> Assign
                </button>
              )}
              {!closed && <SlaRing createdAt={ticket.createdAt} dueAt={ticket.slaDueAt} />}
            </div>
          </div>
        </header>

        <div className="ticket-scroll">
          {error !== undefined && (
            <div className="callout callout-warn" style={{ marginBottom: 14 }}>
              <AlertTriangle size={14} style={{ flex: 'none', marginTop: 1 }} />
              <span className="grow">{apiErrorMessage(error)} Showing the last data received.</span>
              <button className="btn btn-sm btn-secondary" onClick={refetch}>
                Retry
              </button>
            </div>
          )}

          {isSupervisor && (
            <div className="callout callout-danger" style={{ marginBottom: 14 }}>
              <ShieldAlert size={14} style={{ flex: 'none', marginTop: 1 }} />
              <span className="grow">
                <strong>Supervisor escalation requested</strong>
                <br />
                This customer asked to speak with a supervisor. Do not auto-reply — escalate to a human.
              </span>
            </div>
          )}

          {aiError && (
            <div className="callout callout-warn" style={{ marginBottom: 14 }}>
              <AlertTriangle size={14} style={{ flex: 'none', marginTop: 1 }} />
              <span className="grow">{aiError}</span>
              <button className="btn btn-sm btn-ghost" onClick={() => setAiError(null)}>
                Dismiss
              </button>
            </div>
          )}

          <div className="ai-summary fade-up">
            <div className="ai-summary-head">
              <Sparkles size={12} strokeWidth={2.4} />
              Thread summary
              <span className="ml-a row gap-8" style={{ textTransform: 'none', letterSpacing: 0 }}>
                <span className="t-xs t-ter">{ticket.messages.length} events</span>
                <button
                  className="btn btn-xs btn-ghost"
                  onClick={() => void doSummarize()}
                  disabled={summarizing}
                  title="Summarize thread with AI"
                >
                  {summarizing ? <RefreshCw size={11} className="spin" /> : <Sparkles size={11} />}
                  {ticket.aiSummary.length > 0 ? 'Refresh' : 'Summarize'}
                </button>
              </span>
            </div>
            {ticket.aiSummary.length > 0 ? (
              <ul className="ai-summary-body" style={{ margin: 0, paddingLeft: 17 }}>
                {ticket.aiSummary.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="t-sm t-ter" style={{ lineHeight: 1.55, margin: '6px 0 0' }}>
                Click Summarize to generate AI bullet points for this thread.
              </p>
            )}
          </div>

          {/* No optimistic entry: the send writes the message before it
              responds, so the refetch shows what actually happened rather than
              what we hoped happened. */}
          <div className="timeline">
            {ticket.messages.map((m, i) => (
              <TimelineItem key={m.id} m={m} index={i} />
            ))}
          </div>
        </div>

        <div className="composer">
          <div className="composer-head">
            <span className="composer-label">
              Reply to {customer.name.split(' ')[0] ?? 'customer'}
            </span>
            {(ticket.aiDraft || draft) && !sent && (
              <span className="badge badge-accent">
                <Sparkles size={10} /> AI draft{wasEdited && ' · edited'}
              </span>
            )}
            <div className="ml-a row gap-6">
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => void regenerate()}
                disabled={generating || closed}
              >
                <RefreshCw size={12} className={generating ? 'spin' : undefined} />
                {ticket.aiDraft || draft ? 'Regenerate' : 'Generate draft'}
              </button>
              <span className="t-xs t-ter">from {brand.mailbox}</span>
            </div>
          </div>

          {sendError !== undefined && (
            <div className="callout callout-warn" style={{ marginBottom: 9 }}>
              <AlertTriangle size={14} style={{ flex: 'none', marginTop: 1 }} />
              <span className="grow">
                <strong>{sendErrorHeadline(sendError)}</strong>
                <br />
                {sendErrorDetail(sendError)}
              </span>
              <button className="btn btn-sm btn-secondary" onClick={() => void send()} disabled={sending}>
                Try again
              </button>
            </div>
          )}

          <div className={cx('composer-box', generating && 'generating')}>
            <textarea
              className="composer-textarea"
              value={body}
              onChange={(e) => {
                setDraft(e.target.value);
                // Typing after a send means a new reply is being written; the
                // button must stop reading "Sent" and offer to send again.
                if (sent) setSent(false);
                if (sendError !== undefined) setSendError(undefined);
              }}
              placeholder={
                ticket.aiDraft
                  ? 'AI draft loading…'
                  : 'No draft yet — AI drafting lands on Day 11. Write your reply here.'
              }
            />

            {draftBlocked && (
              <div className="citation-blocked">
                <AlertTriangle size={12} />
                <span>
                  <strong>Blocked:</strong> {draftUncited.length} uncited claim{draftUncited.length === 1 ? '' : 's'}.
                  Edit to cite sources before sending.
                </span>
              </div>
            )}

            {citations.length > 0 && (
              <div className="citation-strip">
                {citations.map((c) => (
                  <button key={c.n} className="citation" onClick={() => setOpenCitation(c)}>
                    <span className="citation-index">{c.n}</span>
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            <div className="composer-foot">
              <button className="icon-btn" title="Attach" aria-label="Attach">
                <Paperclip size={14} />
              </button>
              <button className="icon-btn" title="Insert KB article" aria-label="Insert KB article">
                <BookOpen size={14} />
              </button>
              <button className="icon-btn" title="Internal note" aria-label="Internal note">
                <StickyNote size={14} />
              </button>
              <span className="t-xs t-ter ml-a">
                Threads into the existing conversation · lands in {brand.mailbox} Sent
              </span>
              <button
                className="btn btn-sm btn-primary"
                disabled={!body.trim() || sending}
                onClick={() => void send()}
              >
                {sending ? (
                  <RefreshCw size={13} className="spin" />
                ) : sent ? (
                  <Check size={13} />
                ) : (
                  <Send size={13} />
                )}
                {sending ? 'Sending…' : sent ? 'Sent' : 'Send reply'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <aside className="ticket-rail">
        <div className="rail-card">
          <div className="rail-head">
            <User size={11} /> Customer
          </div>
          <div className="rail-body">
            <div className="row gap-10">
              <Avatar name={customer.name} size="lg" />
              <div className="col" style={{ minWidth: 0, lineHeight: 1.35 }}>
                <span className="row gap-4" style={{ fontWeight: 600, fontSize: 13.5 }}>
                  <span className="truncate">{customer.name}</span>
                  {customer.vip && <Star size={11} style={{ color: 'var(--warning)' }} fill="currentColor" />}
                </span>
                <span className="t-xs t-ter truncate">{customer.email}</span>
              </div>
            </div>
            <KeyVal k="Lifetime orders" v={<span className="mono">{customer.lifetimeOrders}</span>} />
            <KeyVal k="Lifetime value" v={<span className="mono">{usd(customer.lifetimeValue)}</span>} />
            {customer.since && (
              <KeyVal k="Customer since" v={new Date(customer.since).getFullYear()} />
            )}
            {customer.phone && <KeyVal k="Phone" v={<span className="mono t-sm">{customer.phone}</span>} />}
            {isLive && customer.lifetimeOrders === 0 && (
              <p className="t-xs t-ter" style={{ lineHeight: 1.5 }}>
                Order history arrives with Shopify enrichment (Days 6–7).
              </p>
            )}
          </div>
        </div>

        {ticket.order ? (
          <div className="rail-card">
            <div className="rail-head">
              <Package size={11} /> Order
              <span className="ml-a mono" style={{ textTransform: 'none', letterSpacing: 0 }}>
                {ticket.order.number}
              </span>
            </div>
            <div className="rail-body">
              <div>
                <div className="track-steps">
                  {TRACK_ORDER.map((step, i) => {
                    const currentIdx = TRACK_ORDER.indexOf(ticket.order!.fulfillmentStatus as never);
                    const exception = ticket.order!.fulfillmentStatus === 'exception';
                    const done = !exception && i <= currentIdx;
                    return (
                      <span
                        key={step}
                        className={cx('track-step', done && 'done', exception && i <= 1 && 'current')}
                      />
                    );
                  })}
                </div>
                <div className="track-labels">
                  {TRACK_LABELS.map((l) => (
                    <span key={l}>{l}</span>
                  ))}
                </div>
              </div>

              {ticket.order.fulfillmentStatus === 'exception' && (
                <div className="callout callout-warn">
                  <History size={13} style={{ flex: 'none', marginTop: 1 }} />
                  <span>{ticket.order.eta ?? 'Carrier exception — no recent scan.'}</span>
                </div>
              )}

              <KeyVal k="Placed" v={fullStamp(ticket.order.placedAt)} />
              <KeyVal k="Carrier" v={ticket.order.carrier} />
              <KeyVal k="Tracking" v={<span className="mono t-xs">{ticket.order.tracking}</span>} />
              <KeyVal k="Ship to" v={ticket.order.shipTo} />
              <KeyVal k="Total" v={<span className="mono">{usd(ticket.order.total)}</span>} />

              <hr className="glow-rule" />

              {ticket.order.lines.map((l) => (
                <div className="line-item" key={l.sku}>
                  <span className="line-thumb">{l.qty}×</span>
                  <span className="col grow" style={{ minWidth: 0, lineHeight: 1.3 }}>
                    <span className="line-name">{l.name}</span>
                    <span className="t-xs t-ter mono">{l.sku}</span>
                  </span>
                  <span className="mono t-sm">{usd(l.price)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <OrderLookupCard
            ticket={ticket}
            isOpen={orderSearchOpen}
            onToggle={() => setOrderSearchOpen(!orderSearchOpen)}
            query={orderQuery}
            onQueryChange={setOrderQuery}
            searchBy={orderSearchBy}
            onSearchByChange={setOrderSearchBy}
            searching={orderSearching}
            results={orderResults}
            demo={orderDemo}
            error={orderError}
            attaching={attaching}
            attachedSnapshotId={attachedSnapshotId}
            onSearch={async () => {
              if (!orderQuery.trim()) return;
              setOrderSearching(true);
              setOrderError(null);
              setOrderResults([]);
              try {
                const result = await lookupShopifyOrders(orderQuery, orderSearchBy);
                setOrderResults(result.orders);
                setOrderDemo(result.demo);
              } catch (e) {
                if (e instanceof ApiError) {
                  if (e.status === 503) {
                    const msg = e.message.toLowerCase();
                    if (msg.includes('not connected')) {
                      setOrderError('Shopify is not connected');
                    } else {
                      setOrderError('Order lookup failed');
                    }
                  } else {
                    setOrderError(e.message);
                  }
                } else {
                  setOrderError('Order lookup failed');
                }
              } finally {
                setOrderSearching(false);
              }
            }}
            onAttach={async (order: ShopifyOrder) => {
              setAttaching(true);
              setOrderError(null);
              try {
                const result = await attachOrderToTicket(ticket.id, order.id);
                setAttachedSnapshotId(result.snapshotId);
                refetch();
              } catch (e) {
                if (e instanceof ApiError) {
                  if (e.status === 404) {
                    setOrderError('Order could not be attached');
                  } else if (e.status === 503) {
                    setOrderError('Order could not be attached');
                  } else {
                    setOrderError(e.message);
                  }
                } else {
                  setOrderError('Order could not be attached');
                }
              } finally {
                setAttaching(false);
              }
            }}
            onClear={() => {
              setOrderResults([]);
              setOrderQuery('');
              setOrderError(null);
              setAttachedSnapshotId(null);
            }}
          />
        )}

        <div className="rail-card">
          <div className="rail-head">
            <FileText size={11} /> Policy check
            <button
              className="btn btn-xs btn-ghost ml-a"
              onClick={() => void doPolicyCheck()}
              disabled={checkingPolicy}
              title="Check relevant policies with AI"
            >
              {checkingPolicy ? <RefreshCw size={11} className="spin" /> : <Sparkles size={11} />}
              {ticket.policyHits.length > 0 ? 'Refresh' : 'Check'}
            </button>
          </div>
          <div className="rail-body">
            {ticket.policyHits.length > 0 ? (
              ticket.policyHits.map((p, i) => (
                <div className="policy-hit" key={i}>
                  <strong>{p.title}</strong>
                  {p.text}
                </div>
              ))
            ) : (
              <p className="t-sm t-ter" style={{ lineHeight: 1.55 }}>
                Click Check to find relevant policies for this ticket.
              </p>
            )}
          </div>
        </div>

        {ticket.similar.length > 0 && (
          <div className="rail-card">
            <div className="rail-head">
              <MessageSquare size={11} /> Similar past tickets
            </div>
            <div className="rail-body">
              {ticket.similar.map((s) => (
                <Link key={s.id} to={`/tickets/${s.id}`} className="col gap-4" style={{ lineHeight: 1.35 }}>
                  <span className="t-sm truncate">{s.subject}</span>
                  <span className="row gap-6 t-xs t-ter">
                    <BrandChip brand={s.brand} />
                    <span className="mono">#{s.number}</span>
                    <span>· {shortAge(s.createdAt)} old</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="rail-card">
          <div className="rail-head">
            <Settings2 size={11} /> Brand voice
          </div>
          <div className="rail-body">
            <p className="t-sm t-sec" style={{ lineHeight: 1.55 }}>
              {brand.voice}
            </p>
            <span className="t-xs t-ter">Signature: {brand.signature}</span>
          </div>
        </div>
      </aside>

      {escalating && <EscalateModal ticket={ticket} onClose={() => setEscalating(false)} />}
      {logging && <LogCallModal ticket={ticket} onClose={() => setLogging(false)} />}
      {openCitation && <CitationModal citation={openCitation} onClose={() => setOpenCitation(null)} />}
    </div>
  );
}

function TicketSkeleton() {
  return (
    <div className="ticket-layout" aria-busy="true" aria-label="Loading ticket">
      <section className="ticket-main">
        <header className="ticket-head">
          <span className="skeleton" style={{ width: '52%', height: 22 }} />
          <div className="row gap-8">
            <span className="skeleton" style={{ width: 46 }} />
            <span className="skeleton" style={{ width: 64 }} />
            <span className="skeleton" style={{ width: 78 }} />
          </div>
        </header>
        <div className="ticket-scroll col gap-16">
          <span className="skeleton" style={{ height: 74, borderRadius: 16 }} />
          {[72, 96, 58].map((h, i) => (
            <div className="col gap-6" key={i}>
              <span className="skeleton" style={{ width: 160, height: 10 }} />
              <span className="skeleton" style={{ height: h, borderRadius: 12 }} />
            </div>
          ))}
        </div>
      </section>
      <aside className="ticket-rail">
        {[128, 190, 96].map((h, i) => (
          <span className="skeleton" key={i} style={{ height: h, borderRadius: 12 }} />
        ))}
      </aside>
    </div>
  );
}

function CitationModal({ citation, onClose }: { citation: Citation; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <header className="modal-header">
          <span className="empty-glyph" style={{ width: 34, height: 34, borderRadius: 10, boxShadow: 'none' }}>
            <BookOpen size={16} />
          </span>
          <div>
            <h2 className="modal-title">{citation.label}</h2>
            <p className="modal-subtitle">{citation.source}</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            {citation.snippet}
          </p>
          <div className="callout callout-accent">
            <Sparkles size={13} style={{ flex: 'none', marginTop: 1 }} />
            <span>
              Every factual claim in a draft maps back to a chunk like this one. Uncited claims are
              blocked before the draft reaches you.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineItem({ m, index }: { m: Message; index: number }) {
  const icon =
    m.kind === 'inbound' ? <CornerUpLeft size={8} /> :
    m.kind === 'outbound' ? <Send size={8} /> :
    m.kind === 'call' ? <Phone size={8} /> :
    m.kind === 'escalation' ? <ArrowUpRight size={8} /> :
    m.kind === 'note' ? <StickyNote size={8} /> :
    <Sparkles size={8} />;

  const nodeTone =
    m.kind === 'inbound' ? 'inbound' :
    m.kind === 'outbound' ? 'outbound' :
    m.kind === 'escalation' ? 'escalation' :
    'system';

  const isBare = m.kind === 'system';

  return (
    <div
      className={cx('tl-item', m.kind === 'outbound' && 'outbound')}
      style={{ animationDelay: `${Math.min(index * 45, 300)}ms` }}
    >
      <span className={cx('tl-node', nodeTone)}>{icon}</span>
      {isBare ? (
        <div className="tl-system row gap-6">
          {m.body}
          <span className="tl-time">{clockTime(m.at)}</span>
        </div>
      ) : (
        <>
          <div className="tl-head">
            <span className="tl-author">{m.authorName}</span>
            {m.kind === 'note' && <span className="badge badge-neutral">Internal</span>}
            {m.kind === 'call' && <span className="badge badge-info">Call</span>}
            {m.kind === 'escalation' && <span className="badge badge-warning">Escalation</span>}
            {m.draftedByAi && (
              <span className="badge badge-accent" title={m.editedByHuman ? 'AI draft, edited before sending' : 'AI draft, sent as written'}>
                <Sparkles size={9} /> {m.editedByHuman ? 'AI · edited' : 'AI'}
              </span>
            )}
            <span className="tl-time">{fullStamp(m.at)}</span>
          </div>
          <div className="tl-body">{m.body}</div>
        </>
      )}
    </div>
  );
}

interface OrderLookupCardProps {
  ticket: TicketDetail;
  isOpen: boolean;
  onToggle: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  searchBy: ShopifyLookupBy;
  onSearchByChange: (by: ShopifyLookupBy) => void;
  searching: boolean;
  results: ShopifyOrder[];
  demo: boolean;
  error: string | null;
  attaching: boolean;
  attachedSnapshotId: string | null;
  onSearch: () => void;
  onAttach: (order: ShopifyOrder) => void;
  onClear: () => void;
}

function OrderLookupCard({
  ticket,
  isOpen,
  onToggle,
  query,
  onQueryChange,
  searchBy,
  onSearchByChange,
  searching,
  results,
  demo,
  error,
  attaching,
  attachedSnapshotId,
  onSearch,
  onAttach,
  onClear,
}: OrderLookupCardProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim()) {
      onSearch();
    }
  };

  return (
    <div className="rail-card">
      <div className="rail-head">
        <Package size={11} /> Order
        {!isOpen && (
          <button
            className="btn btn-xs btn-ghost ml-a"
            onClick={onToggle}
            title="Search Shopify orders"
          >
            <Search size={11} /> Find
          </button>
        )}
        {isOpen && (
          <button
            className="btn btn-xs btn-ghost ml-a"
            onClick={() => {
              onClear();
              onToggle();
            }}
            title="Close search"
          >
            <X size={11} />
          </button>
        )}
      </div>
      <div className="rail-body">
        {ticket.orderNumber && !isOpen && (
          <>
            <KeyVal k="Referenced" v={<span className="mono">{ticket.orderNumber}</span>} />
            <p className="t-sm t-ter" style={{ lineHeight: 1.55 }}>
              Extracted from the message. Click Find to search Shopify.
            </p>
          </>
        )}

        {!ticket.orderNumber && !isOpen && (
          <p className="t-sm t-ter" style={{ lineHeight: 1.55 }}>
            No order number found in this thread. Click Find to search Shopify by email or name.
          </p>
        )}

        {isOpen && (
          <>
            {demo && (
              <div className="callout callout-info" style={{ marginBottom: 10 }}>
                <Info size={13} style={{ flex: 'none', marginTop: 1 }} />
                <span className="t-xs">Using demo orders</span>
              </div>
            )}

            <div className="row gap-6" style={{ marginBottom: 10 }}>
              <select
                className="form-select"
                value={searchBy}
                onChange={(e) => onSearchByChange(e.target.value as ShopifyLookupBy)}
                style={{ width: 90, fontSize: 12, padding: '4px 6px' }}
              >
                <option value="email">Email</option>
                <option value="number">Order #</option>
                <option value="name">Name</option>
              </select>
              <input
                type="text"
                className="form-input"
                placeholder={
                  searchBy === 'email'
                    ? 'customer@example.com'
                    : searchBy === 'number'
                      ? '#1001'
                      : 'John Doe'
                }
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{ flex: 1, fontSize: 12, padding: '5px 8px' }}
              />
              <button
                className="btn btn-sm btn-primary"
                onClick={onSearch}
                disabled={searching || !query.trim()}
                style={{ padding: '5px 10px' }}
              >
                {searching ? <RefreshCw size={12} className="spin" /> : <Search size={12} />}
              </button>
            </div>

            {error && (
              <div className="callout callout-warn" style={{ marginBottom: 10 }}>
                <AlertTriangle size={13} style={{ flex: 'none', marginTop: 1 }} />
                <span className="t-sm">{error}</span>
              </div>
            )}

            {attachedSnapshotId && (
              <div className="callout callout-success" style={{ marginBottom: 10 }}>
                <Check size={13} style={{ flex: 'none', marginTop: 1 }} />
                <span className="t-sm">Order attached successfully</span>
              </div>
            )}

            {results.length === 0 && !searching && !error && query.trim() && (
              <p className="t-sm t-ter" style={{ lineHeight: 1.55 }}>
                No orders found. Try a different search.
              </p>
            )}

            {results.length > 0 && (
              <div className="col gap-8">
                {results.map((order) => (
                  <div
                    key={order.id}
                    className="order-result"
                    style={{
                      padding: '8px 10px',
                      background: 'var(--surface)',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div className="row gap-6" style={{ marginBottom: 4 }}>
                      <span className="mono t-sm" style={{ fontWeight: 600 }}>
                        {order.name}
                      </span>
                      {order.vip && (
                        <Star size={11} style={{ color: 'var(--warning)' }} fill="currentColor" />
                      )}
                      <span className="t-xs t-ter ml-a">{usd(parseFloat(order.totalPrice))}</span>
                    </div>
                    <div className="t-xs t-ter" style={{ marginBottom: 4 }}>
                      {order.customer.firstName} {order.customer.lastName} · {order.email}
                    </div>
                    <div className="row gap-6">
                      <span className={cx('badge', 'badge-sm', getFulfillmentBadge(order.fulfillmentStatus))}>
                        {order.fulfillmentStatus}
                      </span>
                      <button
                        className="btn btn-xs btn-primary ml-a"
                        onClick={() => onAttach(order)}
                        disabled={attaching}
                      >
                        {attaching ? <RefreshCw size={10} className="spin" /> : <Check size={10} />}
                        Attach
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function getFulfillmentBadge(status: string): string {
  switch (status) {
    case 'delivered':
      return 'badge-success';
    case 'in_transit':
    case 'out_for_delivery':
      return 'badge-info';
    case 'exception':
      return 'badge-danger';
    default:
      return 'badge-neutral';
  }
}
