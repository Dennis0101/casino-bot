import crypto from 'crypto';

/** 서버 시드 생성 */
export const randomSeed = () => crypto.randomBytes(32).toString('hex');

/** 커밋(해시) 공개용 */
export const commit = (seed: string) =>
  crypto.createHash('sha256').update(seed).digest('hex');

/** HMAC 기반 RNG (0..1) */
export function rng(serverSeed: string, salt: string, nonce = 0): number {
  const h = crypto.createHmac('sha256', serverSeed).update(`${salt}:${nonce}`).digest('hex');
  const v = parseInt(h.slice(0, 16), 16) / 0xffffffffffffffff;
  return v;
}
