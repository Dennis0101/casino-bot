import { CFG } from '../../config.js';

const hubs = new Set();
export function runHub(channelId, prisma, client) {
  if (hubs.has(channelId)) return;
  hubs.add(channelId);
  (async function loop(){
    try { await round(channelId, prisma, client); }
    catch(e){ console.error('BAC round error', e); }
    finally { setTimeout(()=>runHub(channelId, prisma, client), 1000); }
  })();
}
async function round(channelId, prisma, client) {
  // TODO:
  // 1) commit 공개 (serverSeed hash)
  // 2) BETTING 타이머 CFG.BAC_BET_SEC (버튼으로 Bet 레코드 "확정 전 임시" 스냅)
  // 3) 결과 산출 (engine) → 정산 (트랜잭션 벌크)
  // 4) reveal
  // 5) 다음 라운드
}
