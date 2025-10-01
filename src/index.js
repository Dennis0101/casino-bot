import 'dotenv/config';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { prisma } from './db/client.js';
import { routeInteraction } from './router.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));

client.on('interactionCreate', async (i) => {
  if (!i.isButton()) return;
  try { await routeInteraction(i, prisma, client); }
  catch (e) {
    console.error(e);
    if (!i.deferred && !i.replied) {
      await i.reply({ ephemeral: true, content: `오류: ${e.message}` });
    }
  }
});

client.login(process.env.BOT_TOKEN);
