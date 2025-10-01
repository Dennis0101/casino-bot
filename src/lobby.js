import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { id } from './utils/ids.js';
import { CFG } from './config.js';

export async function sendLobby(channel) {
  const embed = new EmbedBuilder()
    .setTitle('🎰 카지노 로비 (모의머니)')
    .setDescription('실제 돈은 사용되지 않습니다.\n아래 버튼으로 시작하세요!')
    .setFooter({ text: '즐겜! (쿨다운/일일한도/자기차단 지원)' });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id('lobby','daily')).setLabel('🗓️ 일일 보너스').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(id('lobby','wallet')).setLabel('💼 내 지갑').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(id('lobby','rank')).setLabel('🏆 랭킹').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id('bj','open')).setLabel('🂡 블랙잭 입장').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(id('bac','open')).setLabel('🀄 바카라 입장').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(id('slots','panel')).setLabel('🎰 슬롯').setStyle(ButtonStyle.Secondary),
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id('lobby','selfban')).setLabel('⛔ 자기차단').setStyle(ButtonStyle.Danger)
  );

  await channel.send({ embeds: [embed], components: [row1, row2, row3] });
}

export async function handleLobbyInteraction(i, prisma, client) {
  const [, action] = i.customId.split(':').slice(1);
  if (action === 'wallet') {
    const u = await prisma.user.findUnique({ where:{ id:i.user.id }});
    return i.reply({ ephemeral: true, content: `💼 잔액: **${u.balance.toLocaleString()}**` });
  }
  if (action === 'daily') {
    const u = await prisma.user.findUnique({ where:{ id:i.user.id }});
    const now = new Date();
    const can = !u.dailyClaimed || (now.getTime() - new Date(u.dailyClaimed).getTime()) > 86_400_000;
    if (!can) return i.reply({ ephemeral: true, content: '오늘 보너스는 이미 받았습니다.' });
    await prisma.user.update({ where:{ id:u.id }, data:{ balance:{ increment: CFG.DAILY_BONUS }, dailyClaimed: now }});
    return i.reply({ ephemeral: true, content: `🪙 일일 보너스 **+${CFG.DAILY_BONUS}** 지급!` });
  }
  if (action === 'rank') {
    const top = await prisma.$queryRaw`
      SELECT "userId", COALESCE(SUM("delta"),0) AS profit
      FROM "Bet"
      GROUP BY 1
      ORDER BY profit DESC
      LIMIT 10
    `;
    const lines = top.length ? top.map((r, i2) => `**${i2+1}.** <@${r.userId}>: ${Number(r.profit).toLocaleString()}`).join('\n') : '기록 없음';
    return i.reply({ ephemeral: true, content: `🏆 누적 수익 랭킹\n${lines}` });
  }
  if (action === 'selfban') {
    await prisma.user.update({ where:{ id:i.user.id }, data:{ banned:true }});
    return i.reply({ ephemeral: true, content: '⛔ 자기차단 활성화됨.' });
  }
}
