import { env } from '../env';
import { GraphError, graphRequest } from './client';
import { log } from '../log';

const FIXTURE = {
  teamsMessageId: 'fixture-msg',
  deepLink: 'https://teams.microsoft.com/l/message/fixture-channel/fixture-msg',
};

export interface AdaptiveCardPayload {
  ticketId: string;
  ticketNumber: number;
  subject: string;
  summary: string | null;
  brandName: string;
  customerName: string;
  customerVip: boolean;
  customerOrders: number;
  customerValue: number;
  orderNumber: string | null;
  repliesSent: number;
  tags: string[];
  agentName: string;
  deepLink: string;
}

function buildAdaptiveCard(payload: AdaptiveCardPayload): object {
  const facts: Array<{ title: string; value: string }> = [
    { title: 'Brand', value: payload.brandName },
    {
      title: 'Customer',
      value: `${payload.customerName}${payload.customerVip ? ' · VIP' : ''} · ${payload.customerOrders} orders · $${payload.customerValue.toFixed(2)}`,
    },
  ];

  if (payload.orderNumber) {
    facts.push({ title: 'Order', value: payload.orderNumber });
  }

  facts.push({
    title: 'Tried',
    value: `${payload.repliesSent} replies sent · ${payload.tags.length > 0 ? payload.tags.join(', ') : 'no tags'}`,
  });

  facts.push({ title: 'From', value: payload.agentName });

  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              text: `Escalation · #${payload.ticketNumber} · ${payload.subject}`,
              weight: 'Bolder',
              size: 'Medium',
              wrap: true,
            },
            ...(payload.summary
              ? [
                  {
                    type: 'TextBlock',
                    text: payload.summary,
                    wrap: true,
                    spacing: 'Small',
                  },
                ]
              : []),
            {
              type: 'FactSet',
              facts,
              spacing: 'Medium',
            },
          ],
          actions: [
            {
              type: 'Action.OpenUrl',
              title: 'Open in Anchor Desk',
              url: payload.deepLink,
            },
          ],
        },
      },
    ],
  };
}

export interface PostTeamsMessageResult {
  teamsMessageId: string;
  deepLink: string;
}

export async function postTeamsChannelMessage(
  channelId: string,
  payload: AdaptiveCardPayload,
): Promise<PostTeamsMessageResult> {
  if (!env.GRAPH_ACCESS_TOKEN) {
    log.info('teams escalation using fixture (GRAPH_ACCESS_TOKEN unset)', {
      ticketId: payload.ticketId,
      channelId,
    });
    return FIXTURE;
  }

  const card = buildAdaptiveCard(payload);

  const result = await graphRequest<{ id: string; webUrl?: string }>(
    `/teams/${encodeURIComponent(channelId.split('/')[0] ?? channelId)}/channels/${encodeURIComponent(channelId.split('/')[1] ?? channelId)}/messages`,
    {
      method: 'POST',
      body: card,
    },
  );

  const deepLink = result.webUrl ?? `https://teams.microsoft.com/l/message/${channelId}/${result.id}`;

  log.info('teams escalation posted', {
    ticketId: payload.ticketId,
    channelId,
    teamsMessageId: result.id,
  });

  return {
    teamsMessageId: result.id,
    deepLink,
  };
}

export { GraphError };
