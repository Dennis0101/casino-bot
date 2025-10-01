import 'dotenv/config';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

// 간단 헬스체크
async function healthCheck() {
  try {
    // DB 접속 확인
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Prisma DB OK');
  } catch (e) {
    console.error('❌ Prisma DB error:', e);
  }
}

client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user?.tag}`);
  await healthCheck();
});

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('❌ BOT_TOKEN is missing in .env');
  process.exit(1);
}
client.login(token).catch((e) => {
  console.error('❌ Discord login failed:', e);
  process.exit(1);
});
