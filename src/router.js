import { parseId } from './utils/ids.js';
import { handleLobbyInteraction } from './lobby.js';
import { handleSlots } from './games/slots.js';
import { handleBlackjack } from './games/blackjack/ui.js';
import { handleBaccarat } from './games/baccarat/ui.js';

export async function routeInteraction(i, prisma, client) {
  const { ns, scope } = parseId(i.customId);
  if (ns !== 'casino') return;
  // 유저 자동 생성
  await prisma.user.upsert({ where:{ id:i.user.id }, update:{}, create:{ id:i.user.id } });

  if (scope === 'lobby')   return handleLobbyInteraction(i, prisma, client);
  if (scope === 'slots')   return handleSlots(i, prisma);
  if (scope === 'bj')      return handleBlackjack(i, prisma, client);
  if (scope === 'bac')     return handleBaccarat(i, prisma, client);
}
