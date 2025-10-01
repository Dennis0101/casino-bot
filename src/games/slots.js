import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { id } from '../utils/ids.js';
import { hit } from '../utils/rateLimit.js';

const SYMBOLS = ['🍒','🍋','🔔','⭐','7️⃣','💎'];

export async function handleSlots(i, prisma) {
  const [, action, arg] = i.customId.split(':').slice(1);
  if (action === 'panel') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(id('slots','spin','50')).setLabel('50 스핀').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(id('slots','spin','100')).setLabel('100 스핀').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(id('slots','spin','500')).setLabel('500 스핀').setStyle(ButtonStyle.Secondary)
    );
    return i.reply({ ephemeral: true, content: '스핀 금액을 선택하세요!', components: [row] });
  }
  if (action === 'spin') {
    if (!hit(`slots:${i.user.id}`, 1000)) return i.reply({ ephemeral: true, content: '잠깐! (쿨다운 1초)'});
    const bet = Number(arg);
    await prisma.$transaction(async (tx) => {
      const u = await tx.user.findUnique({ where:{ id:i.user.id }, lock:{ mode:'ForUpdate' }});
      if (u.banned) throw new Error('사용 불가');
      if (!Number.isFinite(bet) || bet<=0) throw new Error('잘못된 베팅');
      if (u.balance < bet) throw new Error('잔액 부족');

      const r = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
      const reel = [r(), r(), r()];
      let payout = 0;
      if (reel[0]===reel[1] && reel[1]===reel[2]) payout = bet*10;
      else if (new Set(reel).size === 2) payout = bet*2;

      const delta = payout - bet;
      await tx.user.update({ where:{ id:u.id }, data:{ balance:{ increment: delta }}});
      await tx.bet.create({ data:{
        userId: u.id, game:'SLOTS', amount: bet, outcome: payout>0?'WIN':'LOSE',
        odds: payout>0 ? payout/bet : 0, delta, meta:{ reel }
      }});

      const balance = u.balance + delta;
      const msg = payout>0
        ? `🎰 ${reel.join(' | ')}\n축하! **+${delta.toLocaleString()}** (잔액 ${balance.toLocaleString()})`
        : `🎰 ${reel.join(' | ')}\n아쉽! **${delta.toLocaleString()}** (잔액 ${balance.toLocaleString()})`;
      await i.reply({ ephemeral: true, content: msg });
    });
  }
}
