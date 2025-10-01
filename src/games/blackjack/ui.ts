import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { makeId } from '../../utils/ids.js';

export const embedOpen = () =>
  new EmbedBuilder()
    .setTitle('🂡 블랙잭 테이블')
    .setDescription('최소 2인, 최대 6인. 베팅 타이머로 자동 진행됩니다.');

export const rowJoin = (tableId: string) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(makeId('bj','join',tableId)).setLabel('🪑 착석').setStyle(ButtonStyle.Primary),
  );

export const embedBetting = (left: number, seats: {userId:string}[]) =>
  new EmbedBuilder()
    .setTitle('💵 블랙잭 베팅 중')
    .setDescription(`종료까지 **${left}s**\n참가중: ${seats.map(s=>`<@${s.userId}>`).join(', ') || '없음'}`);

export const rowBetting = (tableId: string) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(makeId('bj','bet',tableId,'50')).setLabel('50').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(makeId('bj','bet',tableId,'100')).setLabel('100').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(makeId('bj','bet',tableId,'500')).setLabel('500').setStyle(ButtonStyle.Secondary),
  );

export const rowAction = (tableId: string, handIdx: number) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(makeId('bj','hit',tableId,String(handIdx))).setLabel('HIT').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(makeId('bj','stand',tableId,String(handIdx))).setLabel('STAND').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(makeId('bj','double',tableId,String(handIdx))).setLabel('DOUBLE').setStyle(ButtonStyle.Success),
  );
