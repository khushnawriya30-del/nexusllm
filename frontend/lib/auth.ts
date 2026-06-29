// Framework-free auth token cache.
//
// The Firebase AuthProvider pushes the current user's ID token here whenever it
// changes; the API layer (lib/api.ts) and the chat stream (hooks/useChat.ts)
// read it synchronously to attach `Authorization: Bearer <token>` to every
// backend call. Kept free of any firebase import so it's safe to use anywhere
// (including non-React modules) without pulling the SDK into the bundle.

let _idToken: string | null = null;

export function setIdToken(token: string | null): void {
  _idToken = token;
}

export function getIdToken(): string | null {
  return _idToken;
}

/** Authorization header for the signed-in user, or `{}` when logged out. */
export function authHeader(): Record<string, string> {
  return _idToken ? { Authorization: `Bearer ${_idToken}` } : {};
}
