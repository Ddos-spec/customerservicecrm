import { useAuthStore } from '../store/useAuthStore';

const WS_AUTH_PROTOCOL = 'crm-auth-v1';

function getWebSocketUrl(): string | null {
  const configuredApiUrl = String(import.meta.env.VITE_API_URL || '').trim();

  // Production reaches the VPS through Vercel's same-origin `/api/v1` rewrite.
  // Vercel cannot upgrade that rewrite to a WebSocket, so skip the optional
  // realtime channel instead of opening a connection that fails (or throwing
  // for a relative URL) and taking the authenticated dashboard down with it.
  if (!configuredApiUrl || configuredApiUrl.startsWith('/')) return null;

  try {
    const apiUrl = new URL(configuredApiUrl, window.location.origin);
    if (apiUrl.hostname.endsWith('.vercel.app')) return null;
    const protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${apiUrl.host}`;
  } catch {
    return null;
  }
}

/**
 * Browser WebSocket cannot attach an Authorization header. The short-lived
 * admin token is therefore sent in the WebSocket subprotocol handshake, never
 * in the URL where it could leak through logs, referrers, or screenshots.
 */
export function createAuthenticatedWebSocket() {
  const authToken = useAuthStore.getState().authToken;
  const webSocketUrl = getWebSocketUrl();
  if (!authToken || !webSocketUrl) return null;

  return new WebSocket(webSocketUrl, [WS_AUTH_PROTOCOL, authToken]);
}
