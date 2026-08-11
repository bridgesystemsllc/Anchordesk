/**
 * Surface detection — §3.6 of the spec.
 *
 * One codebase, two doors: the standalone app at its own URL, and the same app
 * rendered inside a Teams tab. Everything below the shell is surface-agnostic;
 * only chrome, auth and theme binding differ.
 *
 * The real implementation calls `microsoftTeams.app.initialize()`, which throws
 * outside Teams. Until the SDK lands (Day 18), we detect the iframe host and
 * allow `?surface=teams` for local preview of the suppressed-chrome layout.
 */
export type Surface = 'standalone' | 'teams';

const TEAMS_HOSTS = ['teams.microsoft.com', 'teams.live.com', 'skype.com'];

export function detectSurface(): Surface {
  if (typeof window === 'undefined') return 'standalone';

  const forced = new URLSearchParams(window.location.search).get('surface');
  if (forced === 'teams' || forced === 'standalone') return forced;

  const inIframe = window.self !== window.top;
  if (!inIframe) return 'standalone';

  // document.referrer is the only cross-origin-safe signal we get from an iframe.
  try {
    const host = new URL(document.referrer).hostname;
    if (TEAMS_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return 'teams';
  } catch {
    /* no referrer — treat as standalone */
  }
  return 'standalone';
}
