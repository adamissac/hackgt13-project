// Hermes has no WebCrypto. supabase-js needs crypto.subtle.digest for the PKCE S256 challenge
// (without it, it falls back to the weaker "plain" method), plus crypto.getRandomValues.
import * as ExpoCrypto from 'expo-crypto';

const g = globalThis as unknown as { crypto?: Record<string, unknown> };
g.crypto ??= {};
g.crypto.getRandomValues ??= ExpoCrypto.getRandomValues;
if (!g.crypto.subtle) {
  g.crypto.subtle = {
    digest: (algorithm: string | { name: string }, data: BufferSource) => {
      const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
      if (name.toUpperCase() !== 'SHA-256') throw new Error(`crypto.subtle.digest: ${name} not supported`);
      return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data);
    },
  };
}
