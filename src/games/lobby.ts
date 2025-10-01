import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  TextChannel,
} from 'discord.js';
import { makeId } from '../utils/ids.js';

export async function sendLobby(channel: TextChannel) {
  const embed = new EmbedBuilder()
    .setTitle('🎰 카지노 로비 (모의머니)')
    .setDescription('실제 돈은 사용되지 않습니다.\n아래 버튼으로 시작하세요!')
    .setFooter({ text: '쿨다운 / 일일한도 / 자기차단 지원' });

  // 1행: 유틸 버튼
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(makeId('lobby', 'daily'))
      .setLabel('🗓️ 일일 보너스')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(makeId('lobby', 'wallet'))
      .setLabel('💼 내 지갑')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(makeId('lobby', 'rank'))
      .setLabel('🏆 랭킹')
      .setStyle(ButtonStyle.Secondary),
  );

  // 2행: 게임 버튼
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(makeId('bj', 'open'))
      .setLabel('🂡 블랙잭 입장')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(makeId('bac', 'open'))
      .setLabel('🀄 바카라 입장')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(makeId('slots', 'panel'))
      .setLabel('🎰 슬롯')
      .setStyle(ButtonStyle.Secondary),
  );

  // 3행: 자기차단
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(makeId('lobby', 'selfban'))
      .setLabel('⛔ 자기차단')
      .setStyle(ButtonStyle.Danger),
  );

  // 로비 메시지 전송
  await channel.send({
    embeds: [embed],
    components: [row1, row2, row3],
  });
}
