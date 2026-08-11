export interface GraphEmailAddress {
  name?: string | null;
  address?: string | null;
}

export interface GraphRecipient {
  emailAddress?: GraphEmailAddress | null;
}

export interface GraphItemBody {
  contentType?: 'text' | 'html' | string | null;
  content?: string | null;
}

export interface GraphMessage {
  id: string;
  conversationId?: string | null;
  internetMessageId?: string | null;
  subject?: string | null;
  from?: GraphRecipient | null;
  sender?: GraphRecipient | null;
  toRecipients?: GraphRecipient[] | null;
  ccRecipients?: GraphRecipient[] | null;
  receivedDateTime?: string | null;
  sentDateTime?: string | null;
  bodyPreview?: string | null;
  body?: GraphItemBody | null;
  /** Body with quoted history stripped by Graph. Only present when $select'd. */
  uniqueBody?: GraphItemBody | null;
  isDraft?: boolean | null;
  hasAttachments?: boolean | null;
  parentFolderId?: string | null;
  '@removed'?: { reason?: string } | null;
}

export interface GraphSubscription {
  id: string;
  resource: string;
  changeType: string;
  notificationUrl: string;
  lifecycleNotificationUrl?: string;
  expirationDateTime: string;
  clientState?: string;
}

export interface ChangeNotification {
  subscriptionId?: string;
  subscriptionExpirationDateTime?: string;
  changeType?: string;
  clientState?: string;
  resource?: string;
  resourceData?: { id?: string; '@odata.type'?: string; '@odata.id'?: string } | null;
  tenantId?: string;
  /** Only present on lifecycle notifications. */
  lifecycleEvent?: 'missed' | 'subscriptionRemoved' | 'reauthorizationRequired' | string;
}

export interface ChangeNotificationCollection {
  value?: ChangeNotification[];
  validationTokens?: string[];
}

export interface DeltaPage<T> {
  value?: T[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

const BASE_FIELDS = [
  'id',
  'conversationId',
  'internetMessageId',
  'subject',
  'from',
  'sender',
  'toRecipients',
  'receivedDateTime',
  'sentDateTime',
  'bodyPreview',
  'body',
  'isDraft',
  'hasAttachments',
  'parentFolderId',
];

/**
 * Single-message projection. `uniqueBody` is Graph's own quoted-history
 * stripping and is only returned when explicitly selected.
 */
export const MESSAGE_SELECT = [...BASE_FIELDS, 'uniqueBody'].join(',');

/**
 * Delta projection. `uniqueBody` is deliberately absent: it is not reliably
 * returned by delta queries, and asking for it there risks the whole page
 * failing. The normalizer falls back to stripping quoted history locally.
 */
export const DELTA_SELECT = BASE_FIELDS.join(',');
