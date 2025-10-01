import { ThreadAutoArchiveDuration, ChannelType, TextChannel } from 'discord.js';
import { prisma } from '../../db/client.js';
import { Prisma } from '@prisma/client';
import { CFG } from '../../config.js';
import { buildShoe, valueOf } from './shoe.js';
import { embedOpen, rowJoin, embedBetting, rowBetting, rowAction } from './ui.js';

type BJState =
  | { phase:'BETTING'; until:number; bets:Record<string,number> }
  | { phase:'DEAL'; shoe:string[]; dealer:string[]; hands:Record<string,string[]>; order:string[]; turn:number; baseBets:Record<string,number> }
  | { phase:'SETTLE' };

const loops = new Set<string>();

export async function openTable(channel: TextChannel) {
  const thread = await channel.threads.create({
    name: '🂡 블랙잭',
    autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
    reason: 'Blackjack table',
  });
  const table = await prisma.table.create({
    data: { type: 'BLACKJACK', status: 'OPEN', channelId: thread.id, minPlayers: 2, maxPlayers: 6 }
  });
  const msg = await thread.send({ embeds:[embedOpen()], components:[rowJoin(table.id)] });
  await prisma.table.update({ where:{ id: table.id }, data:{ messageId: msg.id } });
  ensureLoop(table.id);
}

export function ensureLoop(tableId: string){
  if (loops.has(tableId)) return;
  loops.add(tableId);
  (async function tick(){
    try { await step(tableId); }
    catch (e) { console.error('BJ step error', e); }
    finally { setTimeout(() => ensureLoop(tableId), 1000); }
  })();
}

async function step(tableId: string){
  const t = await prisma.table.findUnique({ where:{ id: tableId }, include:{ seats:true } });
  if (!t) return;

  // 인원 부족 → OPEN 유지
  if (t.seats.length < t.minPlayers) {
    if (t.status !== 'OPEN') {
      await prisma.table.update({ where:{ id:t.id }, data:{ status:'OPEN', stateJson: Prisma.DbNull }});
    }
    return;
  }

  const state = t.stateJson as BJState | null;

  // 1) OPEN or no state → BETTING 시작
  if (t.status === 'OPEN' || !state){
    const until = Date.now() + CFG.BJ_BET_SEC*1000;
    const next: BJState = { phase:'BETTING', until, bets:{} };
    await prisma.table.update({ where:{ id:t.id }, data:{ status:'RUNNING', stateJson: next }});
    await updateMessage(t, embedBetting(Math.ceil((until-Date.now())/1000), t.seats), [rowBetting(t.id)]);
    return;
  }

  // 2) BETTING 진행
  if (state.phase === 'BETTING'){
    const left = Math.ceil((state.until-Date.now())/1000);
    if (left > 0){
      await updateMessage(t, embedBetting(left, t.seats), [rowBetting(t.id)]);
      return;
    }
    // 베팅 종료 → DEAL
    const shoe = t.shoeJson && Array.isArray(t.shoeJson) && (t.shoeJson as string[]).length>52
      ? (t.shoeJson as string[])
      : buildShoe(CFG.BJ_DECKS);
    const dealer:string[] = [];
    const hands:Record<string,string[]> = {};
    const order = t.seats.map(s=>s.userId);
    const baseBets = state.bets;

    // 카드 2장씩
    for (const uid of order){
      hands[uid]=[shoe.pop()!, shoe.pop()!];
    }
    dealer.push(shoe.pop()!, shoe.pop()!);

    const next: BJState = { phase:'DEAL', shoe, dealer, hands, order, turn:0, baseBets };
    await prisma.table.update({ where:{ id:t.id }, data:{ stateJson: next, shoeJson: shoe }});
    await renderDeal(t.id, next);
    return;
  }

  // 3) DEAL/액션 진행
  if (state.phase === 'DEAL'){
    // 현재 턴 플레이어
    const uid = state.order[state.turn];
    if (!uid){
      // 모두 끝 → 딜러 플레이
      await dealerAndSettle(t.id, state);
      return;
    }
    const hand = state.hands[uid];
    const v = valueOf(hand);
    if (v >= 21){
      await advanceTurn(t.id, state);
      return;
    }
    // 액션 타임아웃 체크는 간단히 메시지 안내만 (버튼은 router에서 처리)
    await renderTurn(t.id, state, uid);
    return;
  }
}

async function renderDeal(tableId: string, s: Extract<BJState,{phase:'DEAL'}>){
  const thread = await getThread(tableId);
  if (!thread) return;
  const lines = [
    `딜러: ??, ${s.dealer[1]}`,
    ...s.order.map(u=>`<@${u}>: ${s.hands[u].join(' ')}`),
  ];
  await thread.send('🂡 카드 배분\n' + lines.join('\n'));
}

async function renderTurn(tableId: string, s: Extract<BJState,{phase:'DEAL'}>, uid: string){
  const thread = await getThread(tableId);
  if (!thread) return;
  await thread.send({
    content: `🎯 <@${uid}> 차례입니다. HIT/STAND/DOUBLE`,
    components: [rowAction(tableId, 0)],
  });
}

async function dealerAndSettle(tableId: string, s: Extract<BJState,{phase:'DEAL'}>){
  const thread = await getThread(tableId); if (!thread) return;
  // 딜러 17 이상까지
  while (valueOf(s.dealer) < 17){ s.dealer.push(s.shoe.pop()!); }

  const dealerV = valueOf(s.dealer);
  const results: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const uid of s.order){
      const hv = valueOf(s.hands[uid]);
      const bet = s.baseBets[uid] || 0;
      if (bet<=0) continue;
      let delta = 0;
      let outcome: 'WIN'|'LOSE'|'PUSH' = 'PUSH';

      if (hv>21) { outcome='LOSE'; delta = -bet; }
      else if (dealerV>21 || hv>dealerV) { outcome='WIN'; delta = bet; }
      else if (hv<dealerV) { outcome='LOSE'; delta = -bet; }
      else { outcome='PUSH'; delta = 0; }

      await tx.user.update({ where:{ id: uid }, data:{ balance:{ increment: delta } }});
      await tx.bet.create({
        data:{
          userId: uid, tableId, game:'BLACKJACK', amount: bet,
          outcome, odds: outcome==='WIN'?2:outcome==='PUSH'?1:0,
          delta, meta: { dealer:s.dealer, hand:s.hands[uid] }
        }
      });

      results.push(`<@${uid}> ${outcome} (${delta>=0?'+':''}${delta})`);
    }

    await tx.table.update({ where:{ id: tableId }, data:{ status:'OPEN', stateJson: Prisma.DbNull, shoeJson: s.shoe }});
  });

  await thread.send(`🧮 정산 완료 — 딜러 ${s.dealer.join(' ')} (${dealerV})\n` + results.join('\n'));
}

async function advanceTurn(tableId: string, s: Extract<BJState,{phase:'DEAL'}>){
  s.turn++;
  await prisma.table.update({ where:{ id: tableId }, data:{ stateJson: s }});
}

async function updateMessage(t: any, embed: any, components: any[]){
  if (!t.messageId) return;
  const thread = await getThread(t.id);
  const msg = await thread?.messages.fetch(t.messageId).catch(()=>null);
  if (msg) await msg.edit({ embeds:[embed], components });
}

async function getThread(tableId: string){
  const t = await prisma.table.findUnique({ where:{ id: tableId }});
  if (!t) return;
  const ch = await (globalThis as any).discordClient.channels.fetch(t.channelId).catch(()=>null);
  if (ch?.type === ChannelType.PublicThread || ch?.type === ChannelType.PrivateThread) return ch as any as TextChannel;
  return null;
}

// ---- 버튼 핸들러 ----
export async function handleBJButton(i: any, action: string, rest: string[]){
  if (action === 'open'){
    if (!i.channel?.isTextBased()) return i.reply({ ephemeral:true, content:'텍스트 채널에서만 가능' });
    await openTable(i.channel as TextChannel);
    return i.reply({ ephemeral:true, content:'블랙잭 테이블을 열었습니다!' });
  }

  if (action === 'join'){
    const tableId = rest[0];
    await prisma.seat.create({ data:{ tableId, userId: i.user.id }}).catch(()=>{});
    return i.reply({ ephemeral:true, content:'착석 완료!' });
  }

  if (action === 'bet'){
    const [tableId, amtStr] = rest;
    const amount = Number(amtStr||'0');
    if (amount<=0) return i.reply({ ephemeral:true, content:'잘못된 베팅' });

    const t = await prisma.table.findUnique({ where:{ id: tableId }, include:{ seats:true }});
    if (!t) return i.reply({ ephemeral:true, content:'테이블 없음' });
    const st = t.stateJson as BJState | null;
    if (!st || st.phase!=='BETTING') return i.reply({ ephemeral:true, content:'지금은 베팅 단계가 아님' });
    if (!t.seats.find(s=>s.userId===i.user.id)) return i.reply({ ephemeral:true, content:'먼저 착석하세요' });

    // 잔액 확인 & 임시 차감은 정산 때 처리(간단 버전)
    st.bets[i.user.id] = (st.bets[i.user.id]||0) + amount;
    await prisma.table.update({ where:{ id: tableId }, data:{ stateJson: st }});
    return i.reply({ ephemeral:true, content:`베팅 ${amount} OK` });
  }

  if (action === 'hit' || action === 'stand' || action === 'double'){
    const [tableId] = rest;
    const t = await prisma.table.findUnique({ where:{ id: tableId }});
    if (!t) return;
    const st = t.stateJson as BJState | null;
    if (!st || st.phase!=='DEAL') return;
    const uid = st.order[st.turn];
    if (uid !== i.user.id) return i.reply({ ephemeral:true, content:'당신의 차례가 아닙니다' });

    if (action==='hit'){
      st.hands[uid].push(st.shoe.pop()!);
    } else if (action==='stand'){
      // nothing
    } else if (action==='double'){
      st.hands[uid].push(st.shoe.pop()!);
      // 배당 2배 가정(간단히 기록만)
      st.baseBets[uid] = (st.baseBets[uid]||0)*2;
    }

    await advanceTurn(tableId, st);
    return i.deferUpdate(); // 조용히 버튼 처리
  }
}
