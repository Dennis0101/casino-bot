import type { ButtonInteraction, ChatInputCommandInteraction, Client } from 'discord.js';
import { parseId } from './utils/ids.js';
import { prisma } from './db/client.js';
import { num } from './utils/format.js';
import { sendLobby } from './games/lobby.js';
import { handleSlots } from './games/slots.js';
import { handleBJButton } from './games/blackjack/tableManager.js';

export async function onChatInput(i: ChatInputCommandInteraction) {
  if (i.commandName === 'casino') {
    await i.deferReply({ ephemeral: true });
    await sendLobby(i.channel! as any);
    return i.editReply('🎲 로비 메시지를 전송했습니다!');
  }
}

export async function onButton(i: ButtonInteraction, client: Client) {
  const { ns, scope, action, rest } = parseId(i.customId);
  if (ns !== 'casino') return;
  const u = await prisma.user.upsert({ where: { id: i.user.id }, update: {}, create: { id: i.user.id } });
  if (u.banned) return i.reply({ ephemeral: true, content: '⛔ 자기차단 상태입니다.' });

  if (scope === 'lobby') {
    if (action === 'wallet') {
      const me = await prisma.user.findUnique({ where: { id: i.user.id }});
      return i.reply({ ephemeral: true, content: `💼 잔액: **${num(me!.balance)}**` });
    }
    if (action === 'daily') {
      const me = await prisma.user.findUnique({ where: { id: i.user.id }});
      const now = new Date();
      const can = !me!.dailyClaimed || (now.getTime() - new Date(me!.dailyClaimed).getTime()) > 86_400_000;
      if (!can) return i.reply({ ephemeral: true, content: '오늘 보너스는 이미 받았습니다.' });
      const bonus = Number(process.env.CASINO_DAILY_BONUS || 500);
      await prisma.user.update({ where: { id: i.user.id }, data: { balance: { increment: bonus }, dailyClaimed: now }});
      return i.reply({ ephemeral: true, content: `🪙 일일 보너스 **+${num(bonus)}** 지급!` });
    }
    if (action === 'rank') {
      const top: any[] = await prisma.$queryRaw`
        SELECT "userId", COALESCE(SUM("delta"),0) AS profit
        FROM "Bet"
        GROUP BY 1
        ORDER BY profit DESC
        LIMIT 10
      `;
      const lines = top.length ? top.map((r, idx) => `**${idx+1}.** <@${r.userId}>: ${num(r.profit)}`).join('\n') : '기록 없음';
      return i.reply({ ephemeral: true, content: `🏆 누적 수익 랭킹\n${lines}` });
    }
    if (action === 'selfban') {
      await prisma.user.update({ where: { id: i.user.id }, data: { banned: true }});
      return i.reply({ ephemeral: true, content: '⛔ 자기차단 활성화됨.' });
    }
  }

  if (scope === 'slots') return handleSlots(i, action, rest);
  if (scope === 'bj')    return handleBJButton(i, action, rest);
  if (scope === 'bac')   return i.reply({ ephemeral: true, content: '🀄 곧 열립니다! (라운드 매니저 연결 예정)' });
}
