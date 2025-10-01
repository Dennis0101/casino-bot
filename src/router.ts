import type { ButtonInteraction, ChatInputCommandInteraction, Client } from 'discord.js';
import { parseId } from './utils/ids.js';
import { prisma } from './db/client.js';
import { num } from './utils/format.js';
import { sendLobby } from './games/lobby.js';
import { handleSlots } from './games/slots.js';

// ★ 엔진 라우터로 교체
import { handleBJButton }  from './games/blackjack/engine.js';
import { handleBacButton } from './games/baccarat/engine.js';

export async function onChatInput(i: ChatInputCommandInteraction) {
  if (i.commandName === 'casino') {
    await i.deferReply({ ephemeral: true });
    await sendLobby(i.channel! as any);
    return i.editReply('🎲 로비 메시지를 전송했습니다!');
  }
}

export async function onButton(i: ButtonInteraction, _client: Client) {
  const { ns, scope, action, rest } = parseId(i.customId);
  if (ns !== 'casino') return;

  // 유저 생성/차단 체크
  const u = await prisma.user.upsert({
    where: { id: i.user.id },
    update: {},
    create: { id: i.user.id },
  });
  if (u.banned) return i.reply({ ephemeral: true, content: '⛔ 자기차단 상태입니다.' });

  // 로비 공용 버튼
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
      const top: Array<{ userId: string; profit: bigint | number }> = await prisma.$queryRaw`
        SELECT "userId", COALESCE(SUM("delta"),0) AS profit
        FROM "Bet"
        GROUP BY 1
        ORDER BY profit DESC
        LIMIT 10
      `;
      const lines = top.length
        ? top.map((r, idx) => {
            const p = typeof r.profit === 'bigint' ? Number(r.profit) : (r.profit as number);
            return `**${idx+1}.** <@${r.userId}>: ${num(p)}`;
          }).join('\n')
        : '기록 없음';
      return i.reply({ ephemeral: true, content: `🏆 누적 수익 랭킹\n${lines}` });
    }
    if (action === 'selfban') {
      await prisma.user.update({ where: { id: i.user.id }, data: { banned: true }});
      return i.reply({ ephemeral: true, content: '⛔ 자기차단 활성화됨.' });
    }
  }

  // 게임 라우팅
  if (scope === 'slots') return handleSlots(i, action, rest);     // 슬롯
  if (scope === 'bj')    return handleBJButton(i, action, rest);  // ★ 블랙잭
  if (scope === 'bac')   return handleBacButton(i, action, rest); // ★ 바카라
}
