import { ThreadAutoArchiveDuration, TextChannel, Message } from "discord.js";
import { prisma } from "../../db/client.ts";
import { Prisma } from "@prisma/client";
import { CFG } from "../../config.ts";
import { embedBacRoundIntro, rowBacMain, rowBacSide, rowAmountNudge } from "./ui.js";
import { runCountdownEmbed } from "../../utils/timer.ts";

/* ===== 카드/슈 ===== */
const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const SUITS = ["♠","♥","♦","♣"];
const CARD_VALUE: Record<string, number> = {
  "A": 1, "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,
  "10":0,"J":0,"Q":0,"K":0,
};
function buildShoe(decks = CFG.BAC_DECKS) {
  const shoe: string[] = [];
  for (let d=0; d<decks; d++)
    for (const r of RANKS) for (const s of SUITS) shoe.push(`${r}${s}`);
  for (let i=shoe.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}
const v = (card:string)=> CARD_VALUE[card.replace(/[♠♥♦♣]/g,"")];
const score = (cards:string[]) => cards.reduce((a,c)=> (a + v(c)) % 10, 0);
const isPair = (cards:string[]) => cards.length>=2
  && cards[0].replace(/[♠♥♦♣]/g,"") === cards[1].replace(/[♠♥♦♣]/g,"");

/* ===== 타입/상태 ===== */
type SideKey = "PLAYER_PAIR" | "BANKER_PAIR";
type MainKey = "PLAYER" | "BANKER" | "TIE";

type BetsBucket = {
  main: Record<string, Partial<Record<MainKey, number>>>;
  side: Record<string, Partial<Record<SideKey, number>>>;
};

type LastTarget = Record<string, { kind: "MAIN"|"SIDE"; key: MainKey | SideKey }>;

type BacState =
  | { phase:"BETTING"; until:number; bets: BetsBucket; lastTarget: LastTarget }
  | { phase:"DEAL"; P:string[]; B:string[]; bets: BetsBucket }
  | { phase:"SETTLE" };

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

/* ===== 허브 생성 ===== */
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
      shoeJson: buildShoe(),
    }
  });

  await startBetting(table.id);
}

/* ===== 루프 ===== */
export function ensureHubLoop(tableId: string) {
  if (hubs.has(tableId)) return;
  hubs.add(tableId);
  (async function run(){
    try { await step(tableId); }
    catch (e) { console.error("BAC step error", e); }
    finally { setTimeout(() => ensureHubLoop(tableId), 1000); }
  })();
}

/* ===== 라운드 시작(베팅) ===== */
async function startBetting(tableId: string) {
  const until = Date.now() + (CFG.BAC_BET_SEC ?? 25) * 1000;
  const state: BacState = { phase:"BETTING", until, bets: { main:{}, side:{} }, lastTarget:{} };

  await prisma.table.update({
    where:{ id: tableId },
    data:{ status:"RUNNING", stateJson: state }
  });

  const t = await prisma.table.findUnique({ where:{ id: tableId }});
  if (!t) return;
  const ch = await (globalThis as any).discordClient.channels.fetch(t.channelId) as TextChannel;

  // 안내 메시지 + 버튼
  const msg = await ch.send({
    content: "배팅을 시작하세요!",
    embeds: [embedBacRoundIntro(CFG.BAC_BET_SEC ?? 25)],
    components: [rowBacMain(tableId), rowBacSide(tableId), rowAmountNudge(tableId)],
  });

  // 실시간 카운트다운(임베드)
  await runCountdownEmbed(msg, CFG.BAC_BET_SEC ?? 25, "🀄 베팅 카운트다운", async () => {
    await ch.send("⛔ 베팅 마감! 딜링 중…");
    await dealAndSettle(tableId, ch);
  });

  ensureHubLoop(tableId);
}

/* ===== 틱 ===== */
async function step(tableId: string) {
  const t = await prisma.table.findUnique({ where:{ id: tableId }});
  if (!t) return;
  const st = t.stateJson as BacState | null;
  if (!st) return;

  if (st.phase === "SETTLE") {
    // 다음 라운드
    await startBetting(tableId);
    return;
  }
}

/* ===== 딜/정산 ===== */
async function dealAndSettle(tableId: string, ch: TextChannel) {
  const t = await prisma.table.findUnique({ where:{ id: tableId }});
  if (!t) return;

  let shoe = Array.isArray(t.shoeJson) ? (t.shoeJson as string[]) : buildShoe();
  if (shoe.length <= 10) shoe = buildShoe();

  const st = t.stateJson as Extract<BacState,{phase:"BETTING"}>;
  if (!st || st.phase !== "BETTING") return;

  // 카드 배분
  const P: string[] = [shoe.pop()!, shoe.pop()!];
  const B: string[] = [shoe.pop()!, shoe.pop()!];
  let pT = score(P), bT = score(B);
  const natural = pT >= 8 || bT >= 8;

  if (!natural) {
    const pDraw = pT <= 5;
    let p3v: number | undefined;
    if (pDraw) {
      const pc = shoe.pop()!; P.push(pc); pT = score(P); p3v = v(pc);
    }
    const bankerDraw = (() => {
      if (!pDraw) return bT <= 5;
      if (bT <= 2) return true;
      if (bT === 3) return p3v !== 8;
      if (bT === 4) return p3v! >= 2 && p3v! <= 7;
      if (bT === 5) return p3v! >= 4 && p3v! <= 7;
      if (bT === 6) return p3v! === 6 || p3v! === 7;
      return false;
    })();
    if (bankerDraw) {
      const bc = shoe.pop()!; B.push(bc); bT = score(B);
    }
  }

  // DEAL 상태 반영
  await prisma.table.update({
    where:{ id: tableId },
    data:{ stateJson: { phase:"DEAL", P, B, bets: st.bets }, shoeJson: shoe }
  });

  // 정산
  const winner: MainKey = pT > bT ? "PLAYER" : (bT > pT ? "BANKER" : "TIE");
  const pPair = isPair(P), bPair = isPair(B);

  const lines = [
    `🂠 PLAYER: ${P.join(" ")} (=${pT})`,
    `🂠 BANKER: ${B.join(" ")} (=${bT})`,
    `🏁 결과: **${winner}**  |  사이드: P_PAIR=${pPair ? "O" : "X"} / B_PAIR=${bPair ? "O" : "X"}`
  ];

  await ch.send(lines.join("\n"));

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // 유저별 베팅 합계 확인 → 잔액 부족 시 해당 유저 베팅 스킵(취소)
    const userIds = new Set<string>([
      ...Object.keys(st.bets.main),
      ...Object.keys(st.bets.side),
    ]);

    for (const uid of userIds) {
      const u = await tx.user.findUnique({ where:{ id: uid }});
      if (!u) continue;

      const main = st.bets.main[uid] || {};
      const side = st.bets.side[uid] || {};
      const mainSum = (main.PLAYER||0)+(main.BANKER||0)+(main.TIE||0);
      const sideSum = (side.PLAYER_PAIR||0)+(side.BANKER_PAIR||0);
      const totalStake = mainSum + sideSum;

      if (totalStake <= 0) continue;
      if (u.balance < totalStake) {
        // 잔액 부족: 스킵(실패 알림)
        await ch.send(`<@${uid}> 베팅 취소(잔액 부족): ${totalStake}`);
        continue;
      }

      // 먼저 스테이크 차감
      await tx.user.update({ where:{ id: uid }, data:{ balance: { decrement: totalStake } }});

      // 메인 정산
      for (const sideKey of ["PLAYER","BANKER","TIE"] as MainKey[]) {
        const amt = main[sideKey] || 0;
        if (!amt) continue;
        const hit = (sideKey === winner);
        const odds = hit ? PAYOUT_MAIN[sideKey] : 0;
        const delta = hit ? Math.floor(amt * odds) : 0;  // 배당금(스테이크 포함 아님)
        if (delta) {
          await tx.user.update({ where:{ id: uid }, data:{ balance: { increment: delta } }});
        }
        await tx.bet.create({
          data: {
            userId: uid, tableId, game:"BACCARAT",
            amount: amt,
            outcome: sideKey,
            odds: odds,
            delta: (delta - 0), // 기록용(실지급액)
            meta: { P, B, pT, bT, winner, type: "MAIN" }
          }
        });
      }

      // 사이드 정산
      const sidePP = side.PLAYER_PAIR || 0;
      if (sidePP) {
        const hit = pPair; const odds = hit ? PAYOUT_SIDE.PLAYER_PAIR : 0;
        const delta = hit ? Math.floor(sidePP * odds) : 0;
        if (delta) await tx.user.update({ where:{ id: uid }, data:{ balance: { increment: delta } }});
        await tx.bet.create({
          data: {
            userId: uid, tableId, game:"BACCARAT",
            amount: sidePP, outcome: "PLAYER",
            odds, delta,
            meta: { P, B, pT, bT, winner, type: "PLAYER_PAIR" }
          }
        });
      }
      const sideBP = side.BANKER_PAIR || 0;
      if (sideBP) {
        const hit = bPair; const odds = hit ? PAYOUT_SIDE.BANKER_PAIR : 0;
        const delta = hit ? Math.floor(sideBP * odds) : 0;
        if (delta) await tx.user.update({ where:{ id: uid }, data:{ balance: { increment: delta } }});
        await tx.bet.create({
          data: {
            userId: uid, tableId, game:"BACCARAT",
            amount: sideBP, outcome: "BANKER",
            odds, delta,
            meta: { P, B, pT, bT, winner, type: "BANKER_PAIR" }
          }
        });
      }
    }

    await tx.table.update({
      where:{ id: tableId },
      data:{ status:"OPEN", stateJson: { phase:"SETTLE" } }
    });
  });
}

/* ===== 버튼 핸들러 ===== */
export async function handleBacButton(i:any, action:string, rest:string[]){
  if (action === "open") {
    if (!i.channel?.isTextBased())
      return i.reply({ ephemeral: true, content: "텍스트 채널에서만 가능" });
    await openHub(i.channel as TextChannel);
    return i.reply({ ephemeral: true, content: "바카라 허브를 열었습니다!" });
  }

  // 메인 베팅(누적)
  if (action === "betMain") {
    const [tableId, side, incStr] = rest as [string, MainKey, string];
    const inc = Number(incStr||"0");
    if (!Number.isFinite(inc) || inc <= 0)
      return i.reply({ ephemeral:true, content:"잘못된 금액" });

    const t = await prisma.table.findUnique({ where:{ id: tableId }});
    if (!t) return i.reply({ ephemeral:true, content:"허브 없음" });
    const st = t.stateJson as BacState | null;
    if (!st || st.phase !== "BETTING")
      return i.reply({ ephemeral:true, content:"지금은 베팅 시간이 아님" });

    st.bets.main[i.user.id] = st.bets.main[i.user.id] || {};
    st.bets.main[i.user.id][side] = (st.bets.main[i.user.id][side] || 0) + inc;
    st.lastTarget[i.user.id] = { kind:"MAIN", key: side };
    await prisma.table.update({ where:{ id: tableId }, data:{ stateJson: st }});

    return i.reply({ ephemeral:true, content: `${side}에 +${inc} 누적` });
  }

  // 사이드 베팅(누적)
  if (action === "betSide") {
    const [tableId, side, incStr] = rest as [string, SideKey, string];
    const inc = Number(incStr||"0");
    if (!Number.isFinite(inc) || inc <= 0)
      return i.reply({ ephemeral:true, content:"잘못된 금액" });

    const t = await prisma.table.findUnique({ where:{ id: tableId }});
    if (!t) return i.reply({ ephemeral:true, content:"허브 없음" });
    const st = t.stateJson as BacState | null;
    if (!st || st.phase !== "BETTING")
      return i.reply({ ephemeral:true, content:"지금은 베팅 시간이 아님" });

    st.bets.side[i.user.id] = st.bets.side[i.user.id] || {};
    st.bets.side[i.user.id][side] = (st.bets.side[i.user.id][side] || 0) + inc;
    st.lastTarget[i.user.id] = { kind:"SIDE", key: side };
    await prisma.table.update({ where:{ id: tableId }, data:{ stateJson: st }});

    return i.reply({ ephemeral:true, content: `${side}에 +${inc} 누적` });
  }

  // 마지막 타겟에 증/감 (예: +50, -100)
  if (action === "nudge") {
    const [deltaStr, tableId] = rest; // ex) +50 / -100
    const delta = Number(deltaStr);
    if (!Number.isFinite(delta) || delta === 0)
      return i.reply({ ephemeral:true, content:"잘못된 증감 값" });

    const t = await prisma.table.findUnique({ where:{ id: tableId }});
    if (!t) return i.reply({ ephemeral:true, content:"허브 없음" });
    const st = t.stateJson as BacState | null;
    if (!st || st.phase !== "BETTING")
      return i.reply({ ephemeral:true, content:"지금은 베팅 시간이 아님" });

    const target = st.lastTarget[i.user.id];
    if (!target) return i.reply({ ephemeral:true, content:"먼저 타겟(메인/사이드)을 선택하세요" });

    if (target.kind === "MAIN") {
      const key = target.key as MainKey;
      st.bets.main[i.user.id] = st.bets.main[i.user.id] || {};
      const next = Math.max(0, (st.bets.main[i.user.id][key] || 0) + delta);
      st.bets.main[i.user.id][key] = next;
    } else {
      const key = target.key as SideKey;
      st.bets.side[i.user.id] = st.bets.side[i.user.id] || {};
      const next = Math.max(0, (st.bets.side[i.user.id][key] || 0) + delta);
      st.bets.side[i.user.id][key] = next;
    }
    await prisma.table.update({ where:{ id: tableId }, data:{ stateJson: st }});
    return i.reply({ ephemeral:true, content:`마지막 타겟에 ${delta>0?'+':''}${delta}` });
  }

  if (action === "clear") {
    const [tableId] = rest;
    const t = await prisma.table.findUnique({ where:{ id: tableId }});
    if (!t) return i.reply({ ephemeral:true, content:"허브 없음" });
    const st = t.stateJson as BacState | null;
    if (!st || st.phase !== "BETTING")
      return i.reply({ ephemeral:true, content:"지금은 베팅 시간이 아님" });

    delete st.bets.main[i.user.id];
    delete st.bets.side[i.user.id];
    delete st.lastTarget[i.user.id];
    await prisma.table.update({ where:{ id: tableId }, data:{ stateJson: st }});
    return i.reply({ ephemeral:true, content:"내 베팅 초기화" });
  }
}
