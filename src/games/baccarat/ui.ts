import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { makeId } from '../../utils/ids.js';

export const bacLobby = () => new EmbedBuilder().setTitle('🀄 바카라 허브').setDescription('라운드마다 군중 베팅');

export const bacBetRow = () =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(makeId('bac','bet','player','100')).setLabel('Player 100').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(makeId('bac','bet','banker','100')).setLabel('Banker 100').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(makeId('bac','bet','tie','100')).setLabel('Tie 100').setStyle(ButtonStyle.Success),
  );
