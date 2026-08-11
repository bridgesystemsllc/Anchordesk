import { ConfidentialClientApplication } from '@azure/msal-node';
import { env } from '../env';

const SCOPE = 'https://graph.microsoft.com/.default';

const msal = new ConfidentialClientApplication({
  auth: {
    clientId: env.AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}`,
    clientSecret: env.AZURE_CLIENT_SECRET,
  },
});

/**
 * App-only token. MSAL caches internally and refreshes when the cached token is
 * close to expiry, so this is cheap to call per request.
 *
 * Note on permissions: Mail.ReadWrite.Shared and Mail.Send.Shared are DELEGATED
 * only. App-only access to shared mailboxes requires Mail.ReadWrite + Mail.Send
 * (Application), which reach every mailbox in the tenant unless an Exchange
 * application access policy scopes the app to just the five brand addresses.
 * That policy is a hard requirement, not a nice-to-have.
 */
export async function getAccessToken(): Promise<string> {
  const result = await msal.acquireTokenByClientCredential({ scopes: [SCOPE] });
  if (!result?.accessToken) {
    throw new Error('Graph token acquisition returned no access token');
  }
  return result.accessToken;
}
