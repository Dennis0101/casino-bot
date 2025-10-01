import { withTableLock } from '../../db/locks.js';
import { CFG } from '../../config.js';
import { embedOpen, rowJoin, rowBetting } from './ui.js';
import { ChannelType } from 'discord.js';

const loops = new Set();

export function ensureTableLoop(tableId, client, prisma) {
  if (loops.has(tableId)) return;
  loops.add(tableId);
  (async function run() {
    try { await step(tableId, client, prisma); }
    catch (e) { console.error('BJ loop error', e); }
    finally {
      // 2초 후 재스케줄: 다음 라운드 or 대기 확인
      setTimeout(() => ensureTableLoop(tableId, client, prisma), 2000);
    }
  })();
}

async function step(tableId, client, prisma) {
  await withTableLock(prisma, tableId, async () => {
    const t = await prisma.table.findUnique({ where:{ id: tableId }, include:{ seats:true }});
    if (!t) return;

    const channel = await client.channels.fetch(t.channelId);
    const message = await channel.messages.fetch(t.messageId);

    // 인원 체크
    if (t.seats.length < t.minPlayers) {
      if (t.status !== 'OPEN') {
        await prisma.table.update({ where:{ id:t.id }, data:{ status:'OPEN', stateJson:null }});
        await message.edit({ embeds: [embedOpen()], components: [rowJoin(t.id)] });
      }
      return; // 최소 인원 미만 → 대기
    }

    // 베팅 타임 시작
    if (t.status === 'OPEN' || t.status === 'RUNNING') {
      const until = Date.now() + CFG.BJ_BET_SEC*1000;
      await prisma.table.update({
        where:{ id:t.id },
        data:{ status:'RUNNING', stateJson:{ phase:'BETTING', until, bets:{} } }
      });
      await message.edit({ embeds: [/* 남은 시간은 루프에서 갱신 */], components: [rowBetting(t.id)] });
    }

    // 남은 시간 표시
    const state = (await prisma.table.findUnique({ where:{ id: t.id }})).stateJson;
    if (state?.phase === 'BETTING') {
      const left = Math.max(0, Math.floor((state.until - Date.now())/1000));
      await message.edit({ embeds: [ (await import('./ui.js')).embedBetting(left, t.seats) ], components: [rowBetting(t.id)] });
      if (Date.now() >= state.until) {
        // TODO: DEAL → ACTION → SETTLE 단계로 넘어가기 (엔진 결합)
        // 여기서 베팅 확정된 좌석만 참가자로 스냅샷 후 다음 단계로 진행
        await prisma.table.update({ where:{ id:t.id }, data:{ stateJson:{ phase:'DEAL' } }});
      }
    }
  });
}
