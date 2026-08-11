import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { messageIdFrom, notificationsRouter } from './notifications';
import { clientStateFor, clientStateMatches } from '../graph/subscriptions';

function app() {
  const a = express();
  a.use(express.json());
  a.use(express.text({ type: 'text/plain' }));
  a.use('/api/graph', notificationsRouter);
  return a;
}

describe('validation handshake', () => {
  it('echoes the validation token as text/plain', async () => {
    // Graph will not create the subscription unless this comes back verbatim.
    const res = await request(app())
      .post('/api/graph/notifications')
      .query({ validationToken: 'Validation: Testing client application reachability' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toBe('Validation: Testing client application reachability');
  });

  it('echoes a token containing URL-escaped characters', async () => {
    const token = 'abc 123+/=&?#';
    const res = await request(app())
      .post('/api/graph/notifications')
      .query({ validationToken: token });

    expect(res.status).toBe(200);
    expect(res.text).toBe(token);
  });

  it('validates the lifecycle endpoint the same way', async () => {
    const res = await request(app())
      .post('/api/graph/lifecycle')
      .query({ validationToken: 'lifecycle-token' });

    expect(res.status).toBe(200);
    expect(res.text).toBe('lifecycle-token');
  });
});

describe('notification acknowledgement', () => {
  it('acknowledges with 202 before doing any work', async () => {
    // Graph retries anything not answered in ~3s, so the response must not
    // wait on ingest.
    const res = await request(app())
      .post('/api/graph/notifications')
      .send({
        value: [
          {
            subscriptionId: 'sub-unknown',
            clientState: 'nope',
            resource: "Users/x/Messages('AAMkAG1')",
            resourceData: { id: 'AAMkAG1' },
          },
        ],
      });

    expect(res.status).toBe(202);
  });

  it('acknowledges an empty payload without erroring', async () => {
    const res = await request(app()).post('/api/graph/notifications').send({ value: [] });
    expect(res.status).toBe(202);
  });
});

describe('messageIdFrom', () => {
  it('reads the id from resourceData', () => {
    expect(messageIdFrom({ resourceData: { id: 'AAMkAG1' } })).toBe('AAMkAG1');
  });

  it('falls back to parsing the resource path', () => {
    expect(messageIdFrom({ resource: "Users/abc/Messages('AAMkAG2')" })).toBe('AAMkAG2');
  });

  it('handles double-quoted resource paths', () => {
    expect(messageIdFrom({ resource: 'Users/abc/Messages("AAMkAG3")' })).toBe('AAMkAG3');
  });

  it('returns null when neither is present', () => {
    expect(messageIdFrom({})).toBeNull();
    expect(messageIdFrom({ resource: 'Users/abc/Messages' })).toBeNull();
  });
});

describe('clientState verification', () => {
  it('accepts the value derived for that mailbox', () => {
    const expected = clientStateFor('mailbox-uuid');
    expect(clientStateMatches(expected, expected)).toBe(true);
  });

  it('is deterministic, so a renewal keeps the same clientState', () => {
    expect(clientStateFor('mailbox-uuid')).toBe(clientStateFor('mailbox-uuid'));
  });

  it('differs per mailbox', () => {
    expect(clientStateFor('mailbox-a')).not.toBe(clientStateFor('mailbox-b'));
  });

  it('rejects a wrong, empty, or missing value', () => {
    const expected = clientStateFor('mailbox-uuid');
    expect(clientStateMatches(expected, clientStateFor('other-mailbox'))).toBe(false);
    expect(clientStateMatches(expected, '')).toBe(false);
    expect(clientStateMatches(expected, undefined)).toBe(false);
    expect(clientStateMatches(expected, null)).toBe(false);
  });

  it('rejects a value of a different length without throwing', () => {
    // timingSafeEqual throws on length mismatch; the guard must catch it first.
    expect(clientStateMatches(clientStateFor('m'), 'short')).toBe(false);
  });
});
