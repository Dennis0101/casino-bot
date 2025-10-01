import crypto from 'crypto';

export const randomSeed = () => crypto.randomBytes(32).toString('hex');
export const commit = (seed: string) => crypto.createHash('sha256').update(seed).digest('hex');

export function rng(serverSeed: string, salt: string, nonce = 0): number {
  const h = crypto.createHmac('sha256', serverSeed).update(`${salt}:${nonce}`).digest('hex');
  const v = parseInt(h.slice(0,16), 16) / 0xffffffffffffffff;
  return v; // 0..1
}
