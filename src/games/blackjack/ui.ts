import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { makeId } from '../../utils/ids.js';

export const embedOpen = () =>
  new EmbedBuilder().setTitle('🂡 블랙잭').setDescription('최대 6인 / 최소 2인 모이면 자동 시작');

export const rowJoin = (tableId: string) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(makeId('bj','join', tableId)).setLabel('좌석 앉기').setStyle(ButtonStyle.Primary)
  );

export const rowBetting = (tableId: string) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(makeId('bj','bet','-10', tableId)).setLabel('-10').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(makeId('bj','bet','+10', tableId)).setLabel('+10').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(makeId('bj','bet','confirm', tableId)).setLabel('베팅 확정').setStyle(ButtonStyle.Success)
  );

export const embedBetting = (seconds: number, seats: { userId: string }[]) =>
  new EmbedBuilder()
    .setTitle('💰 베팅 타임')
    .setDescription(`남은 시간: **${seconds}s**\n참가 좌석: ${seats.map(s=>`<@${s.userId}>`).join(', ') || '없음'}`);
