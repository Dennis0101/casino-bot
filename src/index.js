import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, IntentsBitField } from 'discord.js';
import { prisma } from './db/client.js';
import { routeInteraction } from './router.js';

const client = new Client({
  // ✅ 버튼/인터랙션/스레드/임베드만 쓰면 Guilds 하나면 충분
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel],
});

// (선택) 실제 인텐트 비트 확인용 로그: Guilds 하나면 1이 찍힌다
console.log('Intents bitfield:', new IntentsBitField([GatewayIntentBits.Guilds]).bitfield);

client.once('ready', () => {
  const tag = client.user ? client.user.tag : '(no user)';
  console.log(`Logged in as ${tag}`);
});

client.on('interactionCreate', async (i) => {
  if (!i.isButton()) return;
  try {
    await routeInteraction(i, prisma, client);
  } catch (e: any) {
    console.error(e);
    if (!i.deferred && !i.replied) {
      await i.reply({ ephemeral: true, content: `오류: ${e.message ?? '알 수 없는 오류'}` });
    }
  }
});

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('BOT_TOKEN이 .env에 없습니다.');
  process.exit(1);
}
client.login(token);
