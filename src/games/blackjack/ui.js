import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ThreadAutoArchiveDuration, EmbedBuilder } from 'discord.js';
import { id } from '../../utils/ids.js';
import { CFG } from '../../config.js';
import { ensureTableLoop } from './tableManager.js';

export async function handleBlackjack(i, prisma, client) {
  const [, action] = i.customId.split(':').slice(1);
  if (action === 'open') {
    // 테이블 스레드 생성 or 기존 연결
    const channel = i.channel;
    const thread = await channel.threads.create({
      name: `🂡 블랙잭 테이블`,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
      reason: 'Blackjack table'
    });

    const table = await prisma.table.create({
      data: { type:'BLACKJACK', status:'OPEN', channelId: thread.id, minPlayers:2, maxPlayers:6 }
    });
    const msg = await thread.send({ embeds: [embedOpen()], components: [rowJoin()] });
    await prisma.table.update({ where:{ id: table.id }, data:{ messageId: msg.id }});

    await i.reply({ ephemeral: true, content: `블랙잭 테이블이 열렸습니다 → <#${thread.id}>` });
    ensureTableLoop(table.id, client, prisma); // 비동기 루프 시작
  }
  if (action === 'join') {
    const tableId = i.customId.split(':')[3];
    const t = await prisma.table.findUnique({ where:{ id: tableId }, include:{ seats:true }});
    if (!t) return i.reply({ ephemeral:true, content:'테이블 없음' });
    if (t.seats.some(s=>s.userId===i.user.id)) return i.reply({ ephemeral:true, content:'이미 착석함' });
    if (t.seats.length >= t.maxPlayers) return i.reply({ ephemeral:true, content:'자리가 꽉 찼어요 (6/6)' });

    await prisma.seat.create({ data:{ tableId: t.id, userId: i.user.id }});
    return i.reply({ ephemeral:true, content:'착석 완료!' });
  }
}

export function embedOpen() {
  return new EmbedBuilder()
    .setTitle('🂡 블랙잭 (모의머니)')
    .setDescription('최대 6인 / 최소 2인 모이면 자동으로 베팅 타이머 시작')
    .setFooter({ text: '베팅타임 후 자동 진행' });
}
export const rowJoin = (tableId='TBD') => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(id('bj','join', tableId)).setLabel('좌석 앉기').setStyle(ButtonStyle.Primary)
);
export const rowBetting = (tableId) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(id('bj','bet','-10', tableId)).setLabel('-10').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId(id('bj','bet','+10', tableId)).setLabel('+10').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId(id('bj','bet','confirm', tableId)).setLabel('베팅 확정').setStyle(ButtonStyle.Success)
);
export function embedBetting(seconds, seats) {
  return new EmbedBuilder()
    .setTitle('💰 베팅 타임')
    .setDescription(`남은 시간: **${seconds}s**\n참가 좌석: ${seats.map(s=>`<@${s.userId}>`).join(', ') || '없음'}`);
}
