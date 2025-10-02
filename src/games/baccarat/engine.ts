import { ThreadAutoArchiveDuration, TextChannel } from "discord.js";
import { prisma } from "../../db/client.js";
import { Prisma } from "@prisma/client";
import { CFG } from "../../config.js";
import { embedBacRoundIntro, rowBacMain, rowBacSide, rowAmountNudge } from "./ui.js";
import { runCountdownEmbed } from "../../utils/timer.js";
import type { BacState, BetsBucket, LastTarget, MainKey, SideKey } from "./types.js";

/* ===== 카드/슈 ===== */
const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const SUITS = ["♠","♥","♦","♣"];
const CV: Record<string, number> = { A:1, "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9, "10":0,"J":0,"Q":0,"K":0 };

function buildShoe(decks = CFG.BAC_DECKS) {
  const shoe: string[] = [];
  for (let d=0; d<decks; d++)
    for (const r of RANKS) for (const s of SUITS) shoe.push(`${r}${s}`);
  for (let i=shoe.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [shoe[i], shoe[j]]=[shoe[j], shoe[i]]; }
  return shoe;
}
const val = (c:string)=> CV[c.replace(/[♠♥♦♣]/g,"")];
const sc  = (cards:string[]) => cards.reduce((a,c)=> (a + val(c)) % 10, 0);
const isPair = (cards:string[]) => cards.length>=2 && cards[0].replace(/[♠♥♦♣]/g,"") === cards[1].replace(/[♠♥♦♣]/g,"");

/* ===== 페이아웃(총지급) ===== */
const PAYOUT_MAIN: Record<MainKey, number> = {
  PLAYER: CFG.PAYOUTS.PLAYER,
  BANKER: CFG.PAYOUTS.BANKER,
  TIE:    CFG.PAYOUTS.TIE,
};
const PAYOUT_SIDE: Record<SideKey, number> = {
  PLAYER_PAIR: CFG.PAYOUTS.PLAYER_PAIR,
  BANKER_PAIR: CFG.PAYOUTS.BANKER_PAIR,
};

/* ===== 허브 만들기 ===== */
export async function openHub(channel: TextChannel) {
  const thread = await channel.threads.create({
    name: "🎴 바카라",
    autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
    reason: "Baccarat hub",
  });

  const table = await prisma.table.create({
    data: {
      type: "BACCARAT",
      status: "OPEN",
      channelId: thread.id,
      minPlayers: 2,
      maxPlayers: 999,
      shoeJson: buildShoe(),
    },
  });

  await startBetting(table.id);
}

/* ===== 라운드 시작(베팅) ===== */
async function startBetting(tableId: string) {
  const until = Date.now() + (CFG.BAC_BET_SEC ?? 25) * 1000;
  const state: BacState = { phase: "BETTING", until, bets: { main:{}, side:{} }, lastTarget:{} };

  await prisma.table.update({ where:{ id: tableId }, data:{ status:"RUNNING", stateJson: state }});
  const t = await prisma.table.findUnique({ where:{ id: tableId }});
  if (!t) return;

  const ch = await (globalThis as any).discordClient.channels.fetch(t.channelId) as TextChannel;
  const msg = await ch.send({ embeds: [embedBacRoundIntro(CFG.BAC_BET_SEC ?? 25)], components: [rowBacMain(tableId), rowBacSide(tableId), rowAmountNudge(tableId)] });

  await runCountdownEmbed(msg, CFG.BAC_BET_SEC ?? 25, "🀄 베팅 카운트다운", async () => {
    await ch.send("⛔ 베팅 마감! 딜링 중…");
    await deal(tableId, ch);
  });
}

/* ===== 딜링 + 애니메이션 ===== */
async function deal(tableId: string, ch: TextChannel) {
  const t = await prisma.table.findUnique({ where:{ id: tableId }});
  if (!t) return;

  let shoe = Array.isArray(t.shoeJson) ? (t.shoeJson as string[]) : buildShoe();
  if (shoe.length < 12) shoe = buildShoe();

  const st = t.stateJson as Extract<BacState, { phase: "BETTING" }>;
  if (!st || st.phase !== "BETTING") return;

  // 첫 4장
  const P: string[] = [shoe.pop()!, shoe.pop()!];
  const B: string[] = [shoe.pop()!, shoe.pop()!];

  await prisma.table.update({ where:{ id: tableId }, data:{ stateJson: { phase:"DEALING", P, B, bets: st.bets }, shoeJson: shoe }});

  // 애니메이션: 숨긴 카드 → 순차 오픈
  const fmt = (p: string[], b: string[], hideP = 0, hideB = 0) =>
    `🂠 PLAYER: ${p.map((c,idx)=> idx<hideP ? "🂠" : c).join(" ")}\n🂠 BANKER: ${b.map((c,idx)=> idx<hideB ? "🂠" : c).join(" ")}`;

  const m = await ch.send("🃏 카드를 배분합니다…");
  await sleep(400);
  await m.edit(fmt([P[0]], [], 0, 0));
  await sleep(400);
  await m.edit(fmt([P[0]], [B[0]], 0, 0));
  await sleep(400);
  await m.edit(fmt(P, [B[0]], 0, 0));
  await sleep(400);
  await m.edit(fmt(P, B, 0, 0));

  // 규칙에 따라 3카드
  let pT = sc(P), bT = sc(B);
  const natural = pT >= 8 || bT >= 8;

  if (!natural) {
    const pDraw = pT <= 5;
    let p3: string | undefined;
    let p3v: number | undefined;
    if (pDraw) {
      p3 = shoe.pop()!; P.push(p3); p3v = val(p3); pT = sc(P);
      await sleep(600);
      await m.edit(fmt(P, B, 0, 0));
    }
    const bDraw = (() => {
      if (!pDraw) return bT <= 5;
      if (bT <= 2) return true;
      if (bT === 3) return p3v !== 8;
      if (bT === 4) return p3v! >= 2 && p3v! <= 7;
      if (bT === 5) return p3v! >= 4 && p3v! <= 7;
      if (bT === 6) return p3v! === 6 || p3v! === 7;
      return false;
    })();
    if (bDraw) {
      const bc = shoe.pop()!; B.push(bc); bT = sc(B);
      await sleep(600);
      await m.edit(fmt(P, B, 0, 0));
    }
  }

  await prisma.table.update({ where:{ id: tableId }, data:{ stateJson: { phase:"SHOW", P, B, bets: st.bets }, shoeJson: shoe }});
  await showAndSettle(tableId, ch);
}

async function showAndSettle(tableId: string, ch: TextChannel) {
  const t = await prisma.table.findUnique({ where:{ id: tableId }});
  if (!t) return;
  const st = t.stateJson as Extract<BacState, { phase: "SHOW" }>;
  if (!st || st.phase !== "SHOW") return;

  const { P, B } = st;
  const pT = sc(P), bT = sc(B);
  const winner: MainKey = pT > bT ? "PLAYER" : (bT > pT ? "BANKER" : "TIE");
  const pPair = isPair(P), bPair = isPair(B);

  const lines = [
    `🂡 PLAYER: ${P.join(" ")} (=${pT})`,
    `🂡 BANKER: ${B.join(" ")} (=${bT})`,
    `🏁 결과: **${winner}** / 사이드: P_PAIR=${pPair?"O":"X"} · B_PAIR=${bPair?"O":"X"}`
  ];
  await ch.send(lines.join("\n"));

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const bets = st.bets;
    const userIds = new Set<string>([...Object.keys(bets.main), ...Object.keys(bets.side)]);

    for (const uid of userIds) {
      const u = await tx.user.findUnique({ where:{ id: uid }});
      if (!u) continue;

      const main = bets.main[uid] || {};
      const side = bets.side[uid] || {};
      const mainSum = (main.PLAYER||0)+(main.BANKER||0)+(main.TIE||0);
      const sideSum = (side.PLAYER_PAIR||0)+(side.BANKER_PAIR||0);
      const stake = mainSum + sideSum;
      if (stake <= 0) continue;

      if (u.balance < stake) {
        await ch.send(`<@${uid}> 베팅 취소(잔액 부족): ${stake}`);
        continue;
      }

      // 선 차감
      await tx.user.update({ where:{ id: uid }, data:{ balance: { decrement: stake }}});

      // 메인
      for (const k of ["PLAYER","BANKER","TIE"] as MainKey[]) {
        const amt = main[k] || 0; if (!amt) continue;
        const hit = (k === winner);
        const payout = hit ? Math.floor(amt * PAYOUT_MAIN[k]) : 0; // 총지급
        const net = payout - amt; // 순이익

        if (payout) await tx.user.update({ where:{ id: uid }, data:{ balance: { increment: payout } }});
        await tx.bet.create({
          data: { userId: uid, tableId, game:"BACCARAT", amount: amt, outcome: k, odds: PAYOUT_MAIN[k], delta: net, meta: { P,B,pT,bT,winner,type:"MAIN" } }
        });
      }

      // 사이드
      const sPP = side.PLAYER_PAIR || 0;
      if (sPP) {
        const hit = pPair; const payout = hit ? Math.floor(sPP * PAYOUT_SIDE.PLAYER_PAIR) : 0;
        const net = payout - sPP;
        if (payout) await tx.user.update({ where:{ id: uid }, data:{ balance: { increment: payout } }});
        await tx.bet.create({
          data: { userId: uid, tableId, game:"BACCARAT", amount: sPP, outcome:"PLAYER", odds:PAYOUT_SIDE.PLAYER_PAIR, delta: net, meta:{P,B,pT,bT,winner,type:"PLAYER_PAIR"} }
        });
      }
      const sBP = side.BANKER_PAIR || 0;
      if (sBP) {
        const hit = bPair; const payout = hit ? Math.floor(sBP * PAYOUT_SIDE.BANKER_PAIR) : 0;
        const net = payout - sBP;
        if (payout) await tx.user.update({ where:{ id: uid }, data:{ balance: { increment: payout } }});
        await tx.bet.create({
          data: { userId: uid, tableId, game:"BACCARAT", amount: sBP, outcome:"BANKER", odds:PAYOUT_SIDE.BANKER_PAIR, delta: net, meta:{P,B,pT,bT,winner,type:"BANKER_PAIR"} }
        });
      }
    }

    // COOLDOWN → BETTING
    const until = Date.now() + (Number(process.env.BACCARAT_COOLDOWN_SECONDS ?? 5) * 1000);
    await tx.table.update({ where:{ id: tableId }, data:{ stateJson: { phase:"COOLDOWN", until }, status: "OPEN" }});
  });

  // 5초 뒤 다음 라운드
  setTimeout(() => startBetting(tableId), Number(process.env.BACCARAT_COOLDOWN_SECONDS ?? 5) * 1000);
}

/* ===== 버튼 라우팅 ===== */
export async function handleBacButton(i:any, action:string, rest:string[]){
  if (action === "open") {
    if (!i.channel?.isTextBased()) return i.reply({ ephemeral:true, content:"텍스트 채널에서만 가능" });
    await openHub(i.channel as TextChannel);
    return i.reply({ ephemeral:true, content:"바카라 허브 오픈!" });
  }

  // 공통 유틸
  const getBettingState = async (tableId:string) => {
    const t = await prisma.table.findUnique({ where:{ id: tableId }});
    const st = t?.stateJson as BacState | null;
    if (!t || !st || st.phase !== "BETTING") return null;
    return { t, st };
  };

  // 메인 베팅
  if (action === "betMain") {
    const [tableId, key, incStr] = rest as [string, MainKey, string];
    const inc = Number(incStr||"0");
    const ctx = await getBettingState(tableId);
    if (!ctx) return i.reply({ ephemeral:true, content:"지금은 베팅 시간이 아님" });

    ctx.st.bets.main[i.user.id] = ctx.st.bets.main[i.user.id] || {};
    ctx.st.bets.main[i.user.id][key] = (ctx.st.bets.main[i.user.id][key] || 0) + inc;
    ctx.st.lastTarget[i.user.id] = { kind:"MAIN", key };
    await prisma.table.update({ where:{ id: tableId }, data:{ stateJson: ctx.st }});
    return i.reply({ ephemeral:true, content:`${key} +${inc}` });
  }

  // 사이드 베팅
  if (action === "betSide") {
    const [tableId, key, incStr] = rest as [string, SideKey, string];
    const inc = Number(incStr||"0");
    const ctx = await getBettingState(tableId);
    if (!ctx) return i.reply({ ephemeral:true, content:"지금은 베팅 시간이 아님" });

    ctx.st.bets.side[i.user.id] = ctx.st.bets.side[i.user.id] || {};
    ctx.st.bets.side[i.user.id][key] = (ctx.st.bets.side[i.user.id][key] || 0) + inc;
    ctx.st.lastTarget[i.user.id] = { kind:"SIDE", key };
    await prisma.table.update({ where:{ id: tableId }, data:{ stateJson: ctx.st }});
    return i.reply({ ephemeral:true, content:`${key} +${inc}` });
  }

  // 증/감
  if (action === "nudge") {
    const [deltaStr, tableId] = rest;
    const delta = Number(deltaStr);
    const ctx = await getBettingState(tableId);
    if (!ctx) return i.reply({ ephemeral:true, content:"지금은 베팅 시간이 아님" });
    const target = ctx.st.lastTarget[i.user.id];
    if (!target) return i.reply({ ephemeral:true, content:"먼저 타겟(메인/사이드)을 선택하세요" });

    if (target.kind === "MAIN") {
      const key = target.key as MainKey;
      ctx.st.bets.main[i.user.id] = ctx.st.bets.main[i.user.id] || {};
      ctx.st.bets.main[i.user.id][key] = Math.max(0, (ctx.st.bets.main[i.user.id][key] || 0) + delta);
    } else {
      const key = target.key as SideKey;
      ctx.st.bets.side[i.user.id] = ctx.st.bets.side[i.user.id] || {};
      ctx.st.bets.side[i.user.id][key] = Math.max(0, (ctx.st.bets.side[i.user.id][key] || 0) + delta);
    }
    await prisma.table.update({ where:{ id: tableId }, data:{ stateJson: ctx.st }});
    return i.reply({ ephemeral:true, content:`${delta>0?'+':''}${delta}` });
  }

  if (action === "clear") {
    const [tableId] = rest;
    const ctx = await getBettingState(tableId);
    if (!ctx) return i.reply({ ephemeral:true, content:"지금은 베팅 시간이 아님" });
    delete ctx.st.bets.main[i.user.id];
    delete ctx.st.bets.side[i.user.id];
    delete ctx.st.lastTarget[i.user.id];
    await prisma.table.update({ where:{ id: tableId }, data:{ stateJson: ctx.st }});
    return i.reply({ ephemeral:true, content:"내 베팅 초기화" });
  }
}

/* ===== util ===== */
const sleep = (ms:number)=> new Promise(r=>setTimeout(r, ms));
