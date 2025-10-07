// src/games/baccarat/engine.ts
import {
  ThreadAutoArchiveDuration,
  TextChannel,
  ModalSubmitInteraction,
  Message,
} from "discord.js";
import { prisma } from "../../db/client.js";
import { Prisma } from "@prisma/client";
import { CFG } from "../../config.js";
import {
  embedBacRoundIntro,
  rowBacMain,
  rowBacSide,
  rowAmountNudge,
  makeBetModal,
} from "./ui.js";
// ⚠️ 빌드 후 dist에서 ESM import가 되도록 .js 확장자 사용
import { runCountdownEmbed } from "../../utils/timer.js";
import type { BacState, MainKey, SideKey } from "./types.js";

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
const strip = (c?:string)=> (c??"").replace(/[♠♥♦♣]/g,"");
const val   = (c:string)=> CV[strip(c)];
const sc    = (cards:string[]) => cards.reduce((a,c)=> (a + val(c)) % 10, 0);
const isPair= (cards:string[]) => cards.length>=2 && strip(cards[0]) === strip(cards[1]);

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

  await prisma.table.create({
    data: {
      type: "BACCARAT",
      status: "OPEN",
      channelId: thread.id,
      minPlayers: 2,
      maxPlayers: 999,
      shoeJson: buildShoe(),
      stateJson: { roundNo: 0 }, // 라운드 카운터만 보관
    },
  });

  await startBettingByChannelId(thread.id);
}

/* ===== 라운드 시작(베팅) ===== */
async function startBettingByChannelId(channelId: string) {
  const t = await prisma.table.findFirst({ where: { channelId, type: "BACCARAT" }});
  if (!t) return;
  await startBetting(t.id);
}
async function startBetting(tableId: string) {
  const t0 = await prisma.table.findUnique({ where: { id: tableId }});
  if (!t0) return;

  const roundNo = Number((t0.stateJson as any)?.roundNo ?? 0) + 1;
  const until = Date.now() + (CFG.BAC_BET_SEC ?? 25) * 1000;
  const state: BacState & { roundNo: number; messageIds?: { panel?: string; anim?: string } } = {
    phase: "BETTING",
    until,
    bets: { main: {}, side: {} },
    lastTarget: {},
    roundNo,
    messageIds: {},
  };

  const t = await prisma.table.update({
    where: { id: tableId },
    data: { status: "RUNNING", stateJson: state },
  });

  const ch = await (globalThis as any).discordClient.channels.fetch(t.channelId) as TextChannel;

  // 이전 패널 제거
  try {
    const prevPanelId = (t0.stateJson as any)?.messageIds?.panel as string | undefined;
    if (prevPanelId) {
      const prevMsg = await ch.messages.fetch(prevPanelId).catch(() => null);
      if (prevMsg) await safeDelete(prevMsg);
    }
  } catch {}

  const msg = await ch.send({
    embeds: [embedBacRoundIntro(CFG.BAC_BET_SEC ?? 25, roundNo)],
    components: [rowBacMain(tableId), rowBacSide(tableId), rowAmountNudge(tableId)],
  });

  // 패널 id 저장
  await prisma.table.update({
    where: { id: tableId },
    data: { stateJson: { ...state, messageIds: { panel: msg.id } } },
  });

  await runCountdownEmbed(
    msg,
    CFG.BAC_BET_SEC ?? 25,
    "🀄 베팅 카운트다운",
    async () => {
      await ch.send("⛔ 베팅 마감! 딜링 중…");
      await deal(tableId, ch);
    }
  );
}

/* ===== 딜링 + 애니메이션 ===== */
async function deal(tableId: string, ch: TextChannel) {
  const t = await prisma.table.findUnique({ where: { id: tableId }});
  if (!t) return;

  let shoe = Array.isArray(t.shoeJson) ? (t.shoeJson as string[]) : buildShoe();
  if (shoe.length < 12) shoe = buildShoe();

  const st = t.stateJson as (BacState & { roundNo?: number; messageIds?: { panel?: string } });
  if (!st || st.phase !== "BETTING") return;

  const P: string[] = [shoe.pop()!, shoe.pop()!];
  const B: string[] = [shoe.pop()!, shoe.pop()!];

  await prisma.table.update({
    where: { id: tableId },
    data: { stateJson: { ...st, phase:"DEALING", P, B, bets: st.bets }, shoeJson: shoe },
  });

  // 애니메이션
  const fmt = (p: string[], b: string[]) =>
    `🂠 **PLAYER**: ${p.join(" ")}\n🂠 **BANKER**: ${b.join(" ")}`;

  const m = await ch.send("🃏 카드를 배분합니다…");
  await sleep(400); await m.edit(fmt([P[0]], []));
  await sleep(400); await m.edit(fmt([P[0]], [B[0]]));
  await sleep(400); await m.edit(fmt(P, [B[0]]));
  await sleep(400); await m.edit(fmt(P, B));

  let pT = sc(P), bT = sc(B);
  const natural = pT >= 8 || bT >= 8;

  if (!natural) {
    const pDraw = pT <= 5;
    let p3v: number | undefined;
    if (pDraw) {
      const p3 = shoe.pop()!; P.push(p3); p3v = val(p3); pT = sc(P);
      await sleep(600); await m.edit(fmt(P, B));
    }
    const bDraw = (() => {
      if (!pDraw) return bT <= 5;
      if (bT <= 2) return true;
      if (bT === 3) return p3v !== 8;
      if (bT === 4) return (p3v ?? 0) >= 2 && (p3v ?? 0) <= 7;
      if (bT === 5) return (p3v ?? 0) >= 4 && (p3v ?? 0) <= 7;
      if (bT === 6) return (p3v ?? 0) === 6 || (p3v ?? 0) === 7;
      return false;
    })();
    if (bDraw) {
      const bc = shoe.pop()!; B.push(bc); bT = sc(B);
      await sleep(600); await m.edit(fmt(P, B));
    }
  }

  await prisma.table.update({
    where: { id: tableId },
    data: {
      stateJson: { ...(t.stateJson as any), phase: "SHOW", P, B, bets: st.bets, messageIds: { ...(st as any).messageIds, anim: m.id } },
      shoeJson: shoe,
    },
  });

  await showAndSettle(tableId, ch);
}

/* ===== 정산 + 알림 + 다음 라운드 ===== */
async function showAndSettle(tableId: string, ch: TextChannel) {
  const t = await prisma.table.findUnique({ where: { id: tableId }});
  if (!t) return;
  const st = t.stateJson as (BacState & { roundNo?: number; messageIds?: { panel?: string; anim?: string } });
  if (!st || st.phase !== "SHOW") return;

  const { P, B } = st;
  const pT = sc(P), bT = sc(B);
  const winner: MainKey = pT > bT ? "PLAYER" : (bT > pT ? "BANKER" : "TIE");
  const pPair = isPair(P), bPair = isPair(B);

  const header = [
    `🂡 **PLAYER**: ${P.join(" ")} (= ${pT})`,
    `🂡 **BANKER**: ${B.join(" ")} (= ${bT})`,
    `🏁 결과: **${winner}**  |  사이드: P_PAIR=${pPair?"O":"X"} · B_PAIR=${bPair?"O":"X"}`,
  ].join("\n");
  await ch.send(header);

  const winners: { uid: string; net: number }[] = [];
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const bets = st.bets;
    const userIds = new Set<string>([...Object.keys(bets.main), ...Object.keys(bets.side)]);

    for (const uid of userIds) {
      const u = await tx.user.findUnique({ where: { id: uid }});
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

      let totalNet = 0;

      // 선 차감
      await tx.user.update({ where: { id: uid }, data: { balance: { decrement: stake }}});

      // 메인
      for (const k of ["PLAYER","BANKER","TIE"] as MainKey[]) {
        const amt = main[k] || 0; if (!amt) continue;
        const hit = (k === winner);
        const payout = hit ? Math.floor(amt * PAYOUT_MAIN[k]) : 0;
        const net = payout - amt;
        totalNet += net;

        if (payout) await tx.user.update({ where: { id: uid }, data: { balance: { increment: payout } }});
        await tx.bet.create({
          data: { userId: uid, tableId, game: "BACCARAT", amount: amt, outcome: k, odds: PAYOUT_MAIN[k], delta: net, meta: { P,B,pT,bT,winner,type:"MAIN", roundNo: st.roundNo ?? 0 } },
        });
      }

      // 사이드
      const sPP = side.PLAYER_PAIR || 0;
      if (sPP) {
        const hit = pPair; const payout = hit ? Math.floor(sPP * PAYOUT_SIDE.PLAYER_PAIR) : 0;
        const net = payout - sPP; totalNet += net;
        if (payout) await tx.user.update({ where: { id: uid }, data: { balance: { increment: payout } }});
        await tx.bet.create({
          data: { userId: uid, tableId, game: "BACCARAT", amount: sPP, outcome: "PLAYER", odds: PAYOUT_SIDE.PLAYER_PAIR, delta: net, meta: { P,B,pT,bT,winner,type:"PLAYER_PAIR", roundNo: st.roundNo ?? 0 } },
        });
      }
      const sBP = side.BANKER_PAIR || 0;
      if (sBP) {
        const hit = bPair; const payout = hit ? Math.floor(sBP * PAYOUT_SIDE.BANKER_PAIR) : 0;
        const net = payout - sBP; totalNet += net;
        if (payout) await tx.user.update({ where: { id: uid }, data: { balance: { increment: payout } }});
        await tx.bet.create({
          data: { userId: uid, tableId, game: "BACCARAT", amount: sBP, outcome: "BANKER", odds: PAYOUT_SIDE.BANKER_PAIR, delta: net, meta: { P,B,pT,bT,winner,type:"BANKER_PAIR", roundNo: st.roundNo ?? 0 } },
        });
      }

      if (totalNet > 0) winners.push({ uid, net: totalNet });
    }

    // 쿨다운 상태 기록 + 라운드 넘버 유지
    const until = Date.now() + (Number(process.env.BACCARAT_COOLDOWN_SECONDS ?? 5) * 1000);
    await tx.table.update({
      where: { id: tableId },
      data: { stateJson: { phase: "COOLDOWN", until, roundNo: st.roundNo ?? 0, messageIds: st.messageIds }, status: "OPEN" },
    });
  });

  // 승리자 @멘션
  if (winners.length) {
    winners.sort((a,b)=> b.net - a.net);
    const lines = winners.slice(0, 10).map(w => `<@${w.uid}>: **+${num(w.net)}**`);
    await ch.send(`🎉 승리자\n${lines.join("\n")}`);
  } else {
    await ch.send("🙃 이번 라운드는 당첨자 없음");
  }

  // 기록 채널 요약 로그(선택)
  const logChId = process.env.HISTORY_CHANNEL_ID;
  if (logChId) {
    try {
      const logCh = await (globalThis as any).discordClient.channels.fetch(logChId) as TextChannel;
      if (logCh?.isTextBased?.()) {
        await logCh.send(
          [
            `# 바카라 라운드 #${st.roundNo ?? 0}`,
            `P: ${P.join(" ")} (= ${pT})`,
            `B: ${B.join(" ")} (= ${bT})`,
            `결과: ${winner} / P_PAIR=${isPair(P)?"O":"X"} · B_PAIR=${isPair(B)?"O":"X"}`,
            winners.length ? `승리자: ${winners.map(w=>`<@${w.uid}> +${num(w.net)}`).join(", ")}` : "승리자 없음",
          ].join("\n")
        );
      }
    } catch {}
  }

  // 패널 버튼 제거(도배 방지)
  try {
    const panelId = st.messageIds?.panel;
    if (panelId) {
      const panel = await ch.messages.fetch(panelId).catch(()=>null);
      if (panel) await panel.edit({ components: [] }).catch(()=>null);
    }
  } catch {}

  // 다음 라운드
  setTimeout(() => startBetting(tableId), Number(process.env.BACCARAT_COOLDOWN_SECONDS ?? 5) * 1000);
}

/* ===== 버튼/모달 라우팅 ===== */
export async function handleBacButton(i:any, action:string, rest:string[]){
  // 허브 오픈
  if (action === "open") {
    if (!i.channel?.isTextBased()) return i.reply({ ephemeral:true, content:"텍스트 채널에서만 가능" });
    await openHub(i.channel as TextChannel);
    return i.reply({ ephemeral:true, content:"바카라 허브 오픈!" });
  }

  // 모달 열기
  if (action === "modalMain") {
    const [tableId] = rest;
    return i.showModal(makeBetModal("MAIN", tableId, ["PLAYER","BANKER","TIE"]));
  }
  if (action === "modalSide") {
    const [tableId] = rest;
    return i.showModal(makeBetModal("SIDE", tableId, ["PLAYER_PAIR","BANKER_PAIR"]));
  }

  // 모달 제출 처리
  if (action === "modalSubmit") {
    const [kind, tableId] = rest as ["MAIN"|"SIDE", string];
    const msi = i as ModalSubmitInteraction;

    const keyRaw = msi.fields.getTextInputValue("betKey")?.trim()?.toUpperCase();
    const amt = Math.trunc(Number(msi.fields.getTextInputValue("betAmt")));
    if (!Number.isFinite(amt) || amt <= 0) {
      return msi.reply({ ephemeral:true, content:"금액은 양의 정수여야 합니다." });
    }

    const t = await prisma.table.findUnique({ where: { id: tableId }});
    if (!t) return msi.reply({ ephemeral:true, content:"테이블 없음" });
    const st = t.stateJson as any;
    if (!st || st.phase !== "BETTING") return msi.reply({ ephemeral:true, content:"지금은 베팅 시간이 아닙니다." });

    const validMain: MainKey[] = ["PLAYER","BANKER","TIE"];
    const validSide: SideKey[] = ["PLAYER_PAIR","BANKER_PAIR"];
    if (kind === "MAIN") {
      if (!validMain.includes(keyRaw as MainKey)) return msi.reply({ ephemeral:true, content:`메인 키는 ${validMain.join(", ")} 중 하나여야 합니다.` });
      const key = keyRaw as MainKey;
      st.bets.main[i.user.id] = st.bets.main[i.user.id] || {};
      st.bets.main[i.user.id][key] = (st.bets.main[i.user.id][key] || 0) + amt;
      st.lastTarget[i.user.id] = { kind:"MAIN", key };
    } else {
      if (!validSide.includes(keyRaw as SideKey)) return msi.reply({ ephemeral:true, content:`사이드 키는 ${validSide.join(", ")} 중 하나여야 합니다.` });
      const key = keyRaw as SideKey;
      st.bets.side[i.user.id] = st.bets.side[i.user.id] || {};
      st.bets.side[i.user.id][key] = (st.bets.side[i.user.id][key] || 0) + amt;
      st.lastTarget[i.user.id] = { kind:"SIDE", key };
    }

    await prisma.table.update({ where: { id: tableId }, data: { stateJson: st }});
    return msi.reply({ ephemeral:true, content:`${keyRaw} ${amt} 베팅 완료` });
  }

  // 공통: 현재 베팅 상태
  const getBettingState = async (tableId:string) => {
    const t = await prisma.table.findUnique({ where: { id: tableId }});
    const st = t?.stateJson as BacState | null;
    if (!t || !st || st.phase !== "BETTING") return null;
    return { t, st: st as any };
  };

  // 버튼: 고정증가
  if (action === "betMain") {
    const [tableId, key, incStr] = rest as [string, MainKey, string];
    const inc = Math.trunc(Number(incStr||"0"));
    const ctx = await getBettingState(tableId);
    if (!ctx) return i.reply({ ephemeral:true, content:"지금은 베팅 시간이 아님" });
    if (inc <= 0) return i.reply({ ephemeral:true, content:"증가 금액이 잘못되었습니다." });

    ctx.st.bets.main[i.user.id] = ctx.st.bets.main[i.user.id] || {};
    ctx.st.bets.main[i.user.id][key] = (ctx.st.bets.main[i.user.id][key] || 0) + inc;
    ctx.st.lastTarget[i.user.id] = { kind:"MAIN", key };
    await prisma.table.update({ where:{ id: tableId }, data:{ stateJson: ctx.st }});
    return i.reply({ ephemeral:true, content:`${key} +${inc}` });
  }
  if (action === "betSide") {
    const [tableId, key, incStr] = rest as [string, SideKey, string];
    const inc = Math.trunc(Number(incStr||"0"));
    const ctx = await getBettingState(tableId);
    if (!ctx) return i.reply({ ephemeral:true, content:"지금은 베팅 시간이 아님" });
    if (inc <= 0) return i.reply({ ephemeral:true, content:"증가 금액이 잘못되었습니다." });

    ctx.st.bets.side[i.user.id] = ctx.st.bets.side[i.user.id] || {};
    ctx.st.bets.side[i.user.id][key] = (ctx.st.bets.side[i.user.id][key] || 0) + inc;
    ctx.st.lastTarget[i.user.id] = { kind:"SIDE", key };
    await prisma.table.update({ where:{ id: tableId }, data:{ stateJson: ctx.st }});
    return i.reply({ ephemeral:true, content:`${key} +${inc}` });
  }

  // 버튼: 증/감
  if (action === "nudge") {
    const [deltaStr, tableId] = rest;
    const delta = Math.trunc(Number(deltaStr));
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

  // 버튼: 내 베팅 초기화
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
const num = (n:number|bigint)=> Number(n).toLocaleString("en-US");
async function safeDelete(m: Message) { try { await m.delete(); } catch {} }
