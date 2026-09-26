// Verification QR format (AK3). The QR carries the server-signed token from GET /qr/token so the
// scanning phone can send it to POST /handshake unchanged. base64url never contains '.', so a
// dot separates payload and signature; the prefix lets us ignore unrelated QR codes (invites, URLs).
const PREFIX = 'fcv1:';

export interface VerifyCode {
  payload: string;
  signature: string;
}

export function encodeVerifyCode({ payload, signature }: VerifyCode): string {
  return `${PREFIX}${payload}.${signature}`;
}

/** Returns null for anything that isn't one of our verification codes. */
export function decodeVerifyCode(data: string): VerifyCode | null {
  if (!data.startsWith(PREFIX)) return null;
  const [payload, signature, ...rest] = data.slice(PREFIX.length).split('.');
  if (!payload || !signature || rest.length) return null;
  const b64url = /^[A-Za-z0-9_-]+$/;
  return b64url.test(payload) && b64url.test(signature) ? { payload, signature } : null;
}

/** Friendly copy for POST /handshake errors (docs/api.md section 9). */
export function handshakeErrorMessage(code: string): string {
  switch (code) {
    case 'expired':
      return 'That code expired. Ask them to show it again.';
    case 'invalid_signature':
      return "That code couldn't be verified. Ask them to reopen their code.";
    case 'already_used':
      return 'That code was already scanned. Ask them for a fresh one.';
    case 'self_scan':
      return "That's your own code. Scan the other person's phone.";
    default:
      return code;
  }
}
