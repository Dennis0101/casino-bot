import crypto from 'crypto';
export const commit = (seed) => crypto.createHash('sha256').update(seed).digest('hex');
export const randomSeed = () => crypto.randomBytes(32).toString('hex');
export function rng(serverSeed, salt, nonce=0) {
  const h = crypto.createHmac('sha256', serverSeed).update(`${salt}:${nonce}`).digest('hex');
  const v = parseInt(h.slice(0,16), 16) / 0xffffffffffffffff;
  return v; // 0..1
}
