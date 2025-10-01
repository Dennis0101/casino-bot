import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { id } from '../../utils/ids.js';
import { runHub } from './roundManager.js';

export async function handleBaccarat(i, prisma, client) {
  const channel = i.channel;
  const msg = await channel.send({ embeds: [new EmbedBuilder().setTitle('🀄 바카라 허브')], components: [betRow()] });
  runHub(msg.channel.id, prisma, client); // 라운드 타이머 루프
  await i.reply({ ephemeral:true, content:'바카라 허브가 열렸습니다.' });
}

const betRow = () => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(id('bac','bet','player','100')).setLabel('Player 100').setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId(id('bac','bet','banker','100')).setLabel('Banker 100').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId(id('bac','bet','tie','100')).setLabel('Tie 100').setStyle(ButtonStyle.Success),
);
