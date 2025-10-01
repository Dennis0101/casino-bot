import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, IntentsBitField } from 'discord.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const client = new Client({
  // ✅ 버튼/인터랙션/스레드/임베드만 사용 → Guilds 하나면 충분
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel], // 스레드/채널 일부 로딩 시 유용. 불필요하면 제거 가능
});

// (선택) 실제 인텐트 비트 확인용 로그: Guilds만이면 1 또는 1n
console.log('Intents bitfield:', new IntentsBitField([GatewayIntentBits.Guilds]).bitfield);

// 간단 헬스체크
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
