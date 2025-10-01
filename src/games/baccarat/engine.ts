import { ThreadAutoArchiveDuration, TextChannel } from "discord.js";
import { prisma } from "../../db/client.js";
import { Prisma } from "@prisma/client";
import { CFG } from "../../config.js";
import { embedBacLobby, rowBacBet, rowBacMain, rowBacSide } from "./ui.js";

// ────────────────────────────────
// 카드/슈/유틸
// ────────────────────────────────
const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const SUITS = ["♠","♥","♦","♣"];
const CARD_VALUE: Record<string, number> = {
  "A": 1, "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,
  "10":0,"J":0,"Q":0,"K":0,
};

function buildShoe(decks = CFG.BAC_DECKS) {
  const shoe: string[] = [];
  for (let d=0; d<decks; d++) {
    for (const r of RANKS) for (const s of SUITS) shoe.push(`${r}${s}`);
  }
  for (let i=shoe.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

function v(card: string) { return CARD_VALUE[card.replace(/[♠♥♦♣]/g,"")]; }
function score(cards: string[]) { return cards.reduce((a,c)=> (a + v(c)) % 10, 0); }
function isPair(cards: string[]) {
  if (cards.length < 2) return false;
  const r1 = cards[0].replace(/[♠♥♦♣]/g,"");
  const r2 = cards[1].replace(/[♠♥♦♣]/g,"");
  return r1 === r2;
}

// 플레이어 3rd 카드 필요 여부
function needPlayerThird(playerTotal: number) { return playerTotal <= 5; }
// 뱅커 3rd 카드 룰
function bankerThirdRule(bankerTotal: number, playerDrew: boolean, playerThird?: number) {
  if (!playerDrew) return bankerTotal <= 5;
  if (bankerTotal <= 2) return true;
  if (bankerTotal === 3) return playerThird !== 8;
  if (bankerTotal === 4) return playerThird! >= 2 && playerThird! <= 7;
  if (bankerTotal === 5) return playerThird! >= 4 && playerThird! <= 7;
  if (bankerTotal === 6) return playerThird! === 6 || playerThird! === 7;
  return false; // 7 stand
}

// ────────────────────────────────
// 상태/타입/배당
// ────────────────────────────────
type SideKey = "PLAYER_PAIR" | "BANKER_PAIR";
type MainKey = "PLAYER" | "BANKER" | "TIE";

type BetsBucket = {
  main: Record<string, Partial<Record<MainKey, number>>>;
  side: Record<string, Partial<Record<SideKey, number>>>;
};

type BacState =
  | { phase:"BETTING"; until:number; bets: BetsBucket }
  | { phase:"DEAL"; P:string[]; B:string[]; bets: BetsBucket }
  | { phase:"SETTLE" }; // ← SETTLE에는 shoe 없음

const PAYOUT_MAIN: Record<MainKey, number> = {
  PLAYER: CFG.PAYOUTS?.PLAYER ?? 2.0,
  BANKER: CFG.PAYOUTS?.BANKER ?? 1.95,
  TIE:    CFG.PAYOUTS?.TIE    ?? 9.0,
};

const PAYOUT_SIDE: Record<SideKey, number> = {
  PLAYER_PAIR: CFG.PAYOUTS?.PLAYER_PAIR ?? 12.0,
  BANKER_PAIR: CFG.PAYOUTS?.BANKER_PAIR ?? 12.0,
};

const hubs = new Set<string>();

// ────────────────────────────────
export async function openHub(channel: TextChannel) {
  const thread = await channel.threads.create({
    name: "🎴 바카라",
    autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
    reason: "Baccarat hub",
  });

  const table = await prisma.table.create({
    data: {
      type:"BACCARAT",
      status:"OPEN",
      channelId: thread.id,
      minPlayers: 2,
      maxPlayers: 999,
      shoeJson: buildShoe(), // 슈는 테이블에 저장
    }
  });

  await startBetting(table.id);
}

export function ensureHubLoop(tableId: string) {
  if (hubs.has(tableId)) return;
  hubs.add(tableId);
  (async function run(){
    try { await step(tableId); }
    catch (e) { console.error("BAC step error", e); }
    finally { setTimeout(() => ensureHubLoop(tableId), 1000); }
  })();
}

async function startBetting(tableId: string) {
  const until = Date.now() + CFG.BAC_BET_SEC * 1000;
  const state: BacState = { phase:"BETTING", until, bets: { main:{}, side:{} } };

  // 상태만 갱신 (슈는 Table.shoeJson 유지)
  await prisma.table.update({
    where:{ id: tableId },
    data:{ status:"RUNNING", stateJson: state }
  });

  const t = await prisma.table.findUnique({ where:{ id: tableId }});
  if (!t) return;
  const ch = await (globalThis as any).discordClient.channels.fetch(t.channelId);
  if (!ch) return;

  await (ch as TextChannel).send({
    embeds: [embedBacLobby(CFG.BAC_BET_SEC)],
    components: [rowBacMain(tableId), rowBacSide(tableId)],
  });

  ensureHubLoop(tableId);
}

// 한 틱
async function step(tableId: string) {
  const t = await prisma.table.findUnique({ where:{ id: tableId }});
  if (!t) return;
  const st = t.stateJson as BacState | null;
  if (!st) return;

  if (st.phase === "BETTING") {
    if (Date.now() < st.until) return;

    // 딜 시작: 슈는 table.shoeJson에서 꺼냄
    let shoe = Array.isArray(t.shoeJson) ? (t.shoeJson as string[]) : buildShoe();
    if (shoe.length <= 10) shoe = buildShoe(); // 안전빵 리셋

    const P: string[] = [shoe.pop()!, shoe.pop()!];
    const B: string[] = [shoe.pop()!, shoe.pop()!];

    let pT = score(P), bT = score(B);
    const natural = pT >= 8 || bT >= 8;

    if (!natural) {
      // Player third?
      const pDraw = needPlayerThird(pT);
      let playerThirdVal: number | undefined;

      if (pDraw) {
        const pc = shoe.pop()!;
        P.push(pc);
        pT = score(P);
        playerThirdVal = v(pc);
      }

      // Banker third?
      const bDraw = bankerThirdRule(bT, !!pDraw, playerThirdVal);
      if (bDraw) {
        const bc = shoe.pop()!;
        B.push(bc);
        bT = score(B);
      }
    }

    // 상태: DEAL, 슈는 table.shoeJson에 저장
    await prisma.table.update({
      where:{ id: tableId },
      data:{
        stateJson: { phase:"DEAL", P, B, bets: st.bets },
        shoeJson: shoe,
      }
    });

    await settle(tableId, { phase:"DEAL", P, B, bets: st.bets });
    return;
  }

  if (st.phase === "SETTLE") {
    // 다음 라운드로: 슈는 table.shoeJson에서 재사용(짧으면 새로 빌드)
    const t2 = await prisma.table.findUnique({ where:{ id: tableId }});
    let shoe = Array.isArray(t2?.shoeJson) ? (t2!.shoeJson as string[]) : buildShoe();
    if (shoe.length <= 52) shoe = buildShoe();
    // startBetting이 상태만 세팅하고, 슈는 그대로 table.shoeJson 유지
    // (여기서는 굳이 shoe를 넘길 필요 X)
    await startBetting(tableId);
    return;
  }
}

// 정산
async function settle(tableId: string, st: Extract<BacState,{phase:"DEAL"}>) {
  const P = st.P, B = st.B;
  const pT = score(P), bT = score(B);
  let winner: MainKey = "TIE";
  if (pT > bT) winner = "PLAYER";
  else if (bT > pT) winner = "BANKER";

  const pPair = isPair(P);
  const bPair = isPair(B);

  const t = await prisma.table.findUnique({ where:{ id: tableId }});
  if (!t) return;
  const ch = await (globalThis as any).discordClient.channels.fetch(t.channelId) as TextChannel;

  const lines: string[] = [
    `🂠 PLAYER: ${P.join(" ")}  (=${pT})`,
    `🂠 BANKER: ${B.join(" ")}  (=${bT})`,
    `🏁 결과: **${winner}**  |  사이드: P_PAIR=${pPair ? "O" : "X"} / B_PAIR=${bPair ? "O" : "X"}`
  ];

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // 메인 정산
    for (const [uid, bets] of Object.entries(st.bets.main)) {
      for (const side of ["PLAYER","BANKER","TIE"] as MainKey[]) {
        const amt = bets[side] || 0;
        if (!amt) continue;
        const hit = (side === winner);
        const odds = hit ? PAYOUT_MAIN[side] : 0;
        const delta = hit ? Math.floor(amt * (odds - 1)) : -amt;

        await tx.user.update({ where:{ id: uid }, data:{ balance: { increment: delta } }});
        await tx.bet.create({
          data: {
            userId: uid, tableId, game: "BACCARAT",
            amount: amt, outcome: side, odds, delta,
            meta: { P, B, pT, bT, winner, type: "MAIN" }
          }
        });
      }
    }

    // 사이드 정산
    for (const [uid, bets] of Object.entries(st.bets.side)) {
      const aPP = bets["PLAYER_PAIR"] || 0;
      if (aPP) {
        const hit = pPair;
        const odds = hit ? PAYOUT_SIDE["PLAYER_PAIR"] : 0;
        const delta = hit ? Math.floor(aPP * (odds - 1)) : -aPP;
        await tx.user.update({ where:{ id: uid }, data:{ balance: { increment: delta } }});
        await tx.bet.create({
          data: {
            userId: uid, tableId, game: "BACCARAT",
            amount: aPP, outcome: "PLAYER", odds, delta,
            meta: { P, B, pT, bT, winner, type: "PLAYER_PAIR" }
          }
        });
      }

      const aBP = bets["BANKER_PAIR"] || 0;
      if (aBP) {
        const hit = bPair;
        const odds = hit ? PAYOUT_SIDE["BANKER_PAIR"] : 0;
        const delta = hit ? Math.floor(aBP * (odds - 1)) : -aBP;
        await tx.user.update({ where:{ id: uid }, data:{ balance: { increment: delta } }});
        await tx.bet.create({
          data: {
            userId: uid, tableId, game: "BACCARAT",
            amount: aBP, outcome: "BANKER", odds, delta,
            meta: { P, B, pT, bT, winner, type: "BANKER_PAIR" }
          }
        });
      }
    }

    // SETTLE로 마무리 (shoe는 table.shoeJson에만 있음)
    await tx.table.update({
      where:{ id: tableId },
      data:{ status:"OPEN", stateJson: { phase:"SETTLE" } }
    });
  });

  await ch.send(lines.join("\n"));

  // 다음 루프에서 SETTLE → BETTING으로 넘어감
}

// 버튼 핸들러
export async function handleBacButton(i:any, action:string, rest:string[]){
  if (action === "open") {
    if (!i.channel?.isTextBased()) return i.reply({ ephemeral: true, content: "텍스트 채널에서만 가능" });
    await openHub(i.channel as TextChannel);
    return i.reply({ ephemeral: true, content: "바카라 허브를 열었습니다!" });
  }

  if (action === "betMain") {
    const [tableId, side, incStr] = rest; // PLAYER|BANKER|TIE
    const inc = Number(incStr || "0");
    if (!Number.isFinite(inc) || inc <= 0) return i.reply({ ephemeral: true, content: "잘못된 금액" });

    const t = await prisma.table.findUnique({ where:{ id: tableId }});
    if (!t) return i.reply({ ephemeral: true, content: "허브 없음" });
    const st = t.stateJson as BacState | null;
    if (!st || st.phase !== "BETTING") return i.reply({ ephemeral: true, content: "지금은 베팅 시간이 아님" });

    st.bets.main[i.user.id] = st.bets.main[i.user.id] || {};
    st.bets.main[i.user.id][side as MainKey] = (st.bets.main[i.user.id][side as MainKey] || 0) + inc;
    await prisma.table.update({ where:{ id: tableId }, data:{ stateJson: st }});

    return i.reply({ ephemeral: true, content: `${side}에 +${inc} 배팅` });
  }

  if (action === "betSide") {
    const [tableId, side, incStr] = rest; // PLAYER_PAIR|BANKER_PAIR
    const inc = Number(incStr || "0");
    if (!Number.isFinite(inc) || inc <= 0) return i.reply({ ephemeral: true, content: "잘못된 금액" });

    const t = await prisma.table.findUnique({ where:{ id: tableId }});
    if (!t) return i.reply({ ephemeral: true, content: "허브 없음" });
    const st = t.stateJson as BacState | null;
    if (!st || st.phase !== "BETTING") return i.reply({ ephemeral: true, content: "지금은 베팅 시간이 아님" });

    st.bets.side[i.user.id] = st.bets.side[i.user.id] || {};
    st.bets.side[i.user.id][side as SideKey] = (st.bets.side[i.user.id][side as SideKey] || 0) + inc;

    await prisma.table.update({ where:{ id: tableId }, data:{ stateJson: st }});
    return i.reply({ ephemeral: true, content: `${side}에 +${inc} 배팅` });
  }

  if (action === "clear") {
    const [tableId] = rest;
    const t = await prisma.table.findUnique({ where:{ id: tableId }});
    if (!t) return i.reply({ ephemeral: true, content: "허브 없음" });
    const st = t.stateJson as BacState | null;
    if (!st || st.phase !== "BETTING") return i.reply({ ephemeral: true, content: "지금은 베팅 시간이 아님" });

    delete st.bets.main[i.user.id];
    delete st.bets.side[i.user.id];
    await prisma.table.update({ where:{ id: tableId }, data:{ stateJson: st }});
    return i.reply({ ephemeral: true, content: `내 베팅 초기화` });
  }
}
