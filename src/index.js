import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, IntentsBitField } from 'discord.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const client = new Client({
  intents: [GatewayIntentBits.Guilds], // 특권 인텐트 제거
  partials: [Partials.Channel],
});

console.log('Intents bitfield:', new IntentsBitField([GatewayIntentBits.Guilds]).bitfield);

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

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

async function gracefulExit(code = 0) {
  try { await client.destroy(); } catch {}
  try { await prisma.$disconnect(); } catch {}
  process.exit(code);
}
process.on('SIGINT', () => gracefulExit(0));
process.on('SIGTERM', () => gracefulExit(0));

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('❌ BOT_TOKEN is missing in .env');
  prisma.$disconnect().finally(() => process.exit(1));
} else {
  client.login(token).catch((e) => {
    console.error('❌ Discord login failed:', e);
    prisma.$disconnect().finally(() => process.exit(1));
  });
}
