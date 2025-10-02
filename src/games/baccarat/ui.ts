import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { makeId } from "../../utils/ids.js";

/** 라운드 오픈 안내 + 현재 내 베팅 요약용 (옵션) */
export function embedBacRoundIntro(leftSec: number) {
  return new EmbedBuilder()
    .setTitle("🀄 바카라 라운드")
    .setDescription(
      [
        `⏱️ 베팅 종료까지 **${leftSec}s**`,
        "메인: PLAYER / BANKER / TIE",
        "사이드: PLAYER_PAIR / BANKER_PAIR",
        "버튼을 여러 번 눌러 금액 누적 가능, CLEAR로 초기화",
      ].join("\n")
    )
    .setFooter({ text: "모의머니 전용 · 실제 돈 사용 없음" });
}

/** 메인 베팅 (tableId 필요) */
export function rowBacMain(tableId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(makeId("bac", "betMain", tableId, "PLAYER", "100"))
      .setLabel("PLAYER +100").setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(makeId("bac", "betMain", tableId, "BANKER", "100"))
      .setLabel("BANKER +100").setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(makeId("bac", "betMain", tableId, "TIE", "50"))
      .setLabel("TIE +50").setStyle(ButtonStyle.Secondary),
  );
}

/** 사이드 베팅 + CLEAR (tableId 필요) */
export function rowBacSide(tableId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(makeId("bac", "betSide", tableId, "PLAYER_PAIR", "50"))
      .setLabel("P_PAIR +50").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(makeId("bac", "betSide", tableId, "BANKER_PAIR", "50"))
      .setLabel("B_PAIR +50").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(makeId("bac", "clear", tableId))
      .setLabel("CLEAR").setStyle(ButtonStyle.Danger),
  );
}

/** 금액 증감 패널 (공통 증/감 버튼) */
export function rowAmountNudge(tableId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(makeId("bac","nudge","+50",tableId))
      .setLabel("+50").setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(makeId("bac","nudge","+100",tableId))
      .setLabel("+100").setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(makeId("bac","nudge","+500",tableId))
      .setLabel("+500").setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(makeId("bac","nudge","-50",tableId))
      .setLabel("-50").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(makeId("bac","nudge","-100",tableId))
      .setLabel("-100").setStyle(ButtonStyle.Secondary),
  );
}
