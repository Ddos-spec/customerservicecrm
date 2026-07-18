import { useAuthStore } from '../store/useAuthStore';

const WS_AUTH_PROTOCOL = 'crm-auth-v1';

function getWebSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = import.meta.env.VITE_API_URL
    ? new URL(import.meta.env.VITE_API_URL).host
    : window.location.host;

  return `${protocol}//${host}`;
}

/**
 * Browser WebSocket cannot attach an Authorization header. The short-lived
 * admin token is therefore sent in the WebSocket subprotocol handshake, never
 * in the URL where it could leak through logs, referrers, or screenshots.
 */
export function createAuthenticatedWebSocket() {
  const authToken = useAuthStore.getState().authToken;
  if (!authToken) return null;

  return new WebSocket(getWebSocketUrl(), [WS_AUTH_PROTOCOL, authToken]);
}
