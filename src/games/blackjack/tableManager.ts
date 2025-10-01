import {
  ChannelType, ThreadAutoArchiveDuration, ButtonBuilder,
  ButtonStyle, ActionRowBuilder, ButtonInteraction, TextChannel
} from 'discord.js';
import { prisma } from '../../db/client.js';
import { CFG } from '../../config.js';
import { makeId } from '../../utils/ids.js';
import { embedOpen, rowJoin, rowBetting, embedBetting } from './ui.js';
import { Prisma } from '@prisma/client'; // ✅ 추가

type BJState =
  | { phase: 'BETTING'; until: number; bets: Record<string, number> }
  | { phase: 'DEAL' }
  | { phase: 'ACTION' }
  | { phase: 'SETTLE' };

const loops = new Set<string>();

export async function openTable(channel: TextChannel) {
  const thread = await channel.threads.create({
    name: `🂡 블랙잭 테이블`,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
    reason: 'Blackjack table'
  });
  const table = await prisma.table.create({
    data: { type: 'BLACKJACK', status: 'OPEN', channelId: thread.id, minPlayers: 2, maxPlayers: 6 }
  });
  const msg = await thread.send({ embeds: [embedOpen()], components: [rowJoin(table.id)] });
  await prisma.table.update({ where: { id: table.id }, data: { messageId: msg.id }});
  ensureTableLoop(table.id);
}

export function ensureTableLoop(tableId: string) {
  if (loops.has(tableId)) return;
  loops.add(tableId);
  (async function run() {
    try { await step(tableId); }
    catch (e) { console.error('BJ loop error', e); }
    finally { setTimeout(() => ensureTableLoop(tableId), 2000); }
  })();
}

async function step(tableId: string) {
  // 단순 골조: 실제 운영에서는 withTableLock 같은 직렬화 유틸을 써도 됩니다
  const t = await prisma.table.findUnique({ where: { id: tableId }, include: { seats: true }});
  if (!t) return;

  if (t.seats.length < t.minPlayers) {
    if (t.status !== 'OPEN') {
      await prisma.table.update({
        where: { id: t.id },
        data: {
          status: 'OPEN',
          stateJson: Prisma.DbNull, // ✅ DB NULL 로 명시
        }
      });
    }
    return;
  }

  // BETTING 시작
  const state = (t.stateJson ?? null) as BJState | null; // ✅ 안전 캐스팅
  const hasUntil = state && (state as any).until !== undefined;

  if (t.status === 'OPEN' || (t.status === 'RUNNING' && !hasUntil)) {
    const until = Date.now() + CFG.BJ_BET_SEC * 1000;
    const next: BJState = { phase: 'BETTING', until, bets: {} };
    await prisma.table.update({
      where: { id: t.id },
      data: { status: 'RUNNING', stateJson: next }
    });
    return;
  }

  // BETTING 진행 중이면 남은 시간 체크
  if (state?.phase === 'BETTING') {
    if (Date.now() >= state.until) {
      await prisma.table.update({
        where: { id: t.id },
        data: { stateJson: { phase: 'DEAL' } as BJState }
      });
    } else {
      const left = Math.max(0, Math.floor((state.until - Date.now()) / 1000));
      // UI 업데이트는 message.edit로 처리(여기선 골조)
      // await message.edit({ embeds: [embedBetting(left, t.seats)], components: [rowBetting(t.id)] });
    }
  }
}

export async function handleBJButton(i: ButtonInteraction, action: string, rest: string[]) {
  if (action === 'open') {
    if (i.channel?.type !== ChannelType.GuildText)
      return i.reply({ ephemeral: true, content: '텍스트 채널에서만 가능' });
    await openTable(i.channel as TextChannel);
    return i.reply({ ephemeral: true, content: '블랙잭 테이블을 열었습니다!' });
  }

  if (action === 'join') {
    const tableId = rest[0];
    await prisma.seat.create({ data: { tableId, userId: i.user.id } }).catch(() => {});
    return i.reply({ ephemeral: true, content: '착석 완료!' });
  }
}
