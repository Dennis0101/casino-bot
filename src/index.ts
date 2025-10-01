import 'dotenv/config';
import {
  Client, GatewayIntentBits, Partials, IntentsBitField,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel, Interaction, ButtonInteraction, EmbedBuilder
} from 'discord.js';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const client = new Client({
  // ✅ 버튼/인터랙션만 사용 → Guilds 하나면 충분
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel], // 스레드/채널 일부 로딩 시 유용. 불필요하면 제거 가능
});

// (선택) 실제 인텐트 비트 확인용 로그: Guilds만이면 1 또는 1n
console.log('Intents bitfield:', new IntentsBitField([GatewayIntentBits.Guilds]).bitfield);

// ----------------------
// 유틸
// ----------------------
const num = (n: number | bigint) => Number(n).toLocaleString('en-US');
const makeId = (scope: string, action: string, ...rest: string[]) => `casino:${scope}:${action}:${rest.join(':')}`;
function parseId(id: string) {
  const [ns, scope, action, ...rest] = id.split(':');
  return { ns, scope, action, rest };
}
async function ensureUser(userId: string) {
  return prisma.user.upsert({ where: { id: userId }, update: {}, create: { id: userId } });
}

// ----------------------
// 로비 패널 (자동 게시)
// ----------------------
async function sendLobby(channel: TextChannel) {
  const embed = new EmbedBuilder()
    .setTitle('🎰 카지노 로비 (모의머니)')
    .setDescription('실제 돈은 사용되지 않습니다. 아래 버튼으로 시작하세요!')
    .setFooter({ text: '쿨다운/일일한도/자기차단 지원' });

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(makeId('lobby','daily')).setLabel('🗓️ 일일 보너스').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(makeId('lobby','wallet')).setLabel('💼 내 지갑').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(makeId('lobby','rank')).setLabel('🏆 랭킹').setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(makeId('bj','open')).setLabel('🂡 블랙잭 입장').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(makeId('bac','open')).setLabel('🀄 바카라 입장').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(makeId('slots','panel')).setLabel('🎰 슬롯').setStyle(ButtonStyle.Secondary),
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(makeId('lobby','selfban')).setLabel('⛔ 자기차단').setStyle(ButtonStyle.Danger)
  );

  await channel.send({ embeds: [embed], components: [row1, row2, row3] });
}

// ----------------------
// 슬롯: 버튼 패널 + 스핀 처리
// ----------------------
const SYMBOLS = ['🍒','🍋','🔔','⭐','7️⃣','💎'];
const lastHit = new Map<string, number>(); // 간단 쿨다운

function hitCooldown(key: string, ms: number) {
  const now = Date.now();
  const prev = lastHit.get(key) ?? 0;
  if (now - prev < ms) return false;
  lastHit.set(key, now);
  return true;
}

async function handleSlots(i: ButtonInteraction, action: string, rest: string[]) {
  if (action === 'panel') {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(makeId('slots','spin','50')).setLabel('50 스핀').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(makeId('slots','spin','100')).setLabel('100 스핀').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(makeId('slots','spin','500')).setLabel('500 스핀').setStyle(ButtonStyle.Secondary),
    );
    return i.reply({ ephemeral: true, content: '스핀 금액을 선택하세요!', components: [row] });
  }

  if (action === 'spin') {
    if (!hitCooldown(`slots:${i.user.id}`, 1000))
      return i.reply({ ephemeral: true, content: '쿨다운 1초만 기다려줘!' });

    const bet = Number(rest[0] || '0');
    if (!Number.isFinite(bet) || bet <= 0)
      return i.reply({ ephemeral: true, content: '잘못된 베팅 금액' });

    try {
      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

// ----------------------
// 간단 헬스체크
// ----------------------
async function healthCheck() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Prisma DB OK');
  } catch (e) {
    console.error('❌ Prisma DB error:', e);
  }
}

client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user?.tag ?? '(no user)'}`);
  await healthCheck();

  // ✅ 자동 로비 게시 (슬래시/프리픽스 없이 시작)
  const lobbyChannelId = process.env.LOBBY_CHANNEL_ID;
  if (lobbyChannelId) {
    try {
      const ch = await client.channels.fetch(lobbyChannelId);
      if (ch && ch.isTextBased()) {
        await sendLobby(ch as TextChannel);
        console.log('🎲 로비 패널 자동 게시 완료');
      } else {
        console.warn('LOBBY_CHANNEL_ID 채널이 텍스트 채널이 아닙니다.');
      }
    } catch (e) {
      console.error('로비 자동 게시 실패:', e);
    }
  } else {
    console.log('ℹ️ LOBBY_CHANNEL_ID가 설정되지 않아 로비 자동 게시를 건너뜁니다.');
  }
});

// ----------------------
// 버튼 라우팅 (슬래시/프리픽스 없이 버튼만)
// ----------------------
client.on('interactionCreate', async (i: Interaction) => {
  if (!i.isButton()) return;

  try {
    // 유저 보장
    const me = await ensureUser(i.user.id);
    if (me.banned) return i.reply({ ephemeral: true, content: '⛔ 자기차단 상태입니다.' });

    const { ns, scope, action, rest } = parseId(i.customId);
    if (ns !== 'casino') return;

    // 로비 공통
    if (scope === 'lobby') {
      if (action === 'wallet') {
        const u = await prisma.user.findUnique({ where: { id: i.user.id }});
        return i.reply({ ephemeral: true, content: `💼 잔액: **${num(u!.balance)}**` });
      }
      if (action === 'daily') {
        const u = await prisma.user.findUnique({ where: { id: i.user.id }});
        const now = new Date();
        const can = !u!.dailyClaimed || (now.getTime() - new Date(u!.dailyClaimed).getTime()) > 86_400_000;
        if (!can) return i.reply({ ephemeral: true, content: '오늘 보너스는 이미 받았습니다.' });
        const bonus = Number(process.env.CASINO_DAILY_BONUS || 500);
        await prisma.user.update({
          where: { id: i.user.id },
          data: { balance: { increment: bonus }, dailyClaimed: now }
        });
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
        const lines = top.length
          ? top.map((r, idx) => `**${idx+1}.** <@${r.userId}>: ${num(r.profit)}`).join('\n')
          : '기록 없음';
        return i.reply({ ephemeral: true, content: `🏆 누적 수익 랭킹\n${lines}` });
      }
      if (action === 'selfban') {
        await prisma.user.update({ where: { id: i.user.id }, data: { banned: true } });
        return i.reply({ ephemeral: true, content: '⛔ 자기차단 활성화됨.' });
      }
    }

    // 슬롯
    if (scope === 'slots') return handleSlots(i, action, rest);

    // 블랙잭/바카라 자리표 오픈 (엔진 연결 전)
    if (scope === 'bj' && action === 'open') {
      return i.reply({ ephemeral: true, content: '🂡 블랙잭 테이블이 곧 열립니다! (엔진 연결 예정)' });
    }
    if (scope === 'bac' && action === 'open') {
      return i.reply({ ephemeral: true, content: '🀄 바카라 허브가 곧 열립니다! (라운드 연결 예정)' });
    }

  } catch (e: any) {
    console.error('interaction error', e);
    if (!i.deferred && !i.replied) {
      await i.reply({ ephemeral: true, content: `오류: ${e.message ?? '알 수 없는 오류'}` });
    }
  }
});

// 전역 에러 핸들링 (권장)
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

// 종료 시 클린업
async function gracefulExit(code = 0) {
  try {
    await client.destroy();
  } catch {}
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(code);
}
process.on('SIGINT', () => gracefulExit(0));
process.on('SIGTERM', () => gracefulExit(0));

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('❌ BOT_TOKEN is missing in .env');
  // Prisma 커넥션 닫고 종료
  prisma.$disconnect().finally(() => process.exit(1));
} else {
  client.login(token).catch((e) => {
    console.error('❌ Discord login failed:', e);
    prisma.$disconnect().finally(() => process.exit(1));
  });
}
