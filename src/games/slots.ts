import { ButtonInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { prisma } from '../db/client.js';
import { makeId } from '../utils/ids.js';
import { num } from '../utils/format.js';
import { hit } from '../utils/rateLimit.js';
import type { PrismaClient } from '@prisma/client'; // ✅ 트랜잭션 타입

const SYMBOLS = ['🍒','🍋','🔔','⭐','7️⃣','💎'];

export async function handleSlots(i: ButtonInteraction, action: string, rest: string[]) {
  if (action === 'panel') {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(makeId('slots','spin','50')).setLabel('50 스핀').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(makeId('slots','spin','100')).setLabel('100 스핀').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(makeId('slots','spin','500')).setLabel('500 스핀').setStyle(ButtonStyle.Secondary),
    );
    return i.reply({ ephemeral: true, content: '스핀 금액을 선택하세요!', components: [row] });
  }

  if (action === 'spin') {
    if (!hit(`slots:${i.user.id}`, 1000))
      return i.reply({ ephemeral: true, content: '쿨다운 1초만 기다려줘!' });

    const bet = Number(rest[0] || '0');
    if (!Number.isFinite(bet) || bet <= 0)
      return i.reply({ ephemeral: true, content: '잘못된 베팅 금액' });

    try {
      const result = await prisma.$transaction(async (tx: PrismaClient) => { // ✅ 타입 명시
        // 🔧 NOTE: 아래 lock은 타입 선언에 없으므로 제거(필요하면 SELECT ... FOR UPDATE로 별도 구현)
        const u = await tx.user.findUnique({ where: { id: i.user.id } });
        if (!u) throw new Error('유저 없음');
        if (u.banned) throw new Error('사용 불가');
        if (u.balance < bet) throw new Error('잔액 부족');

        const r = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
        const reel = [r(), r(), r()];
        let payout = 0;
        if (reel[0] === reel[1] && reel[1] === reel[2]) payout = bet * 10;
        else if (new Set(reel).size === 2) payout = bet * 2;

        const delta = payout - bet;

        await tx.user.update({
          where: { id: u.id },
          data: { balance: { increment: delta } }
        });

        await tx.bet.create({
          data: {
            userId: u.id,
            game: 'SLOTS',
            amount: bet,
            outcome: payout > 0 ? 'WIN' : 'LOSE',
            odds: payout > 0 ? payout / bet : 0,
            delta,
            meta: { reel }
          }
        });

        return { reel, delta, balance: u.balance + delta };
      });

      const msg = result.delta >= 0
        ? `🎰 ${result.reel.join(' | ')}\n축하! **+${num(result.delta)}** (잔액 ${num(result.balance)})`
        : `🎰 ${result.reel.join(' | ')}\n아쉽! **${num(result.delta)}** (잔액 ${num(result.balance)})`;

      return i.reply({ ephemeral: true, content: msg });

    } catch (err: any) {
      return i.reply({ ephemeral: true, content: `슬롯 오류: ${err.message ?? '알 수 없는 오류'}` });
    }
  }
}
