import {
  ChannelType, EmbedBuilder, ThreadAutoArchiveDuration, ButtonBuilder,
  ButtonStyle, ActionRowBuilder, ButtonInteraction, TextChannel
} from 'discord.js';
import { prisma } from '../../db/client.js';
import { withTableLock } from '../../locks.js';
import { CFG } from '../../config.js';
import { makeId } from '../../utils/ids.js';
import { embedOpen, rowJoin, rowBetting, embedBetting } from './ui.js';

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
  await withTableLock(tableId, async () => {
    const t = await prisma.table.findUnique({ where: { id: tableId }, include: { seats: true }});
    if (!t) return;

    // 채널/메시지
    const channel = await (await import('discord.js')).default.Client.prototype.channels.fetch.call({} as any, t.channelId).catch(()=>null);
    // 위 한 줄은 타입 헷갈림 회피용—실전에서는 index/router에서 client 주입해 edit하는 방식 권장.
    // 여기선 DB 상태머신 골조만 제공.

    if (t.seats.length < t.minPlayers) {
      if (t.status !== 'OPEN') {
        await prisma.table.update({ where: { id: t.id }, data: { status: 'OPEN', stateJson: null }});
      }
      return;
    }

    // BETTING 시작
    if (t.status === 'OPEN' || t.status === 'RUNNING' && !t.stateJson?.until) {
      const until = Date.now() + CFG.BJ_BET_SEC*1000;
      await prisma.table.update({
        where: { id: t.id },
        data: { status: 'RUNNING', stateJson: { phase: 'BETTING', until, bets: {} } }
      });
    }

    const state = (await prisma.table.findUnique({ where: { id: t.id }}))!.stateJson as any;
    if (state?.phase === 'BETTING') {
      if (Date.now() >= state.until) {
        // TODO: DEAL → ACTION → SETTLE
        await prisma.table.update({ where: { id: t.id }, data: { stateJson: { phase: 'DEAL' } }});
      } else {
        const left = Math.max(0, Math.floor((state.until - Date.now())/1000));
        // UI 업데이트는 실제로는 client로 message.edit 해야 함 (여기선 골조)
        // await message.edit({ embeds: [embedBetting(left, t.seats)], components: [rowBetting(t.id)] });
      }
    }
  });
}

export async function handleBJButton(i: ButtonInteraction, action: string, rest: string[]) {
  if (action === 'open') {
    if (i.channel?.type !== ChannelType.GuildText) return i.reply({ ephemeral: true, content: '텍스트 채널에서만 가능' });
    await openTable(i.channel as TextChannel);
    return i.reply({ ephemeral: true, content: '블랙잭 테이블을 열었습니다!' });
  }
  if (action === 'join') {
    const tableId = rest[0];
    await prisma.seat.create({ data: { tableId, userId: i.user.id } }).catch(()=>{});
    return i.reply({ ephemeral: true, content: '착석 완료!' });
  }
}
