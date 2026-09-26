const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // base32-ish, no ambiguous chars

function randomSuffix(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

// One per app launch — good enough for AK1 hello-world. AK2 replaces this
// with the real 10-minute-rotating server-issued token (MASTER_SPEC 7.1).
export const sessionDeviceSuffix = randomSuffix(4);
