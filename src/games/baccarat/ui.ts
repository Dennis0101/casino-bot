// src/games/baccarat/ui.ts
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { makeId } from "../../utils/ids.js";
import type { MainKey, SideKey } from "./types.js";

/** 라운드 안내 embed */
export function embedBacRoundIntro(leftSec: number, roundNo: number) {
  return new EmbedBuilder()
    .setTitle(`🀄 바카라 라운드 #${roundNo}`)
    .setDescription(
      [
        `⏱️ 베팅 종료까지 **${leftSec}s**`,
        "메인: PLAYER / BANKER / TIE",
        "사이드: PLAYER_PAIR / BANKER_PAIR",
        "버튼으로 누적, CLEAR 초기화, ✏️ '입력' 버튼으로 자유 금액 입력",
      ].join("\n")
    )
    .setFooter({ text: "모의머니 · 실제 돈 아님" });
}

/** 메인 베팅 버튼 묶음 */
export function rowBacMain(tableId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(tableId, "betMain", "PLAYER", "100", "PLAYER +100", ButtonStyle.Primary),
    btn(tableId, "betMain", "BANKER", "100", "BANKER +100", ButtonStyle.Success),
    btn(tableId, "betMain", "TIE", "50", "TIE +50", ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(makeId("bac", "modalMain", tableId))
      .setLabel("✏️ 입력(메인)")
      .setStyle(ButtonStyle.Secondary),
  );
}

/** 사이드 베팅 버튼 묶음 */
export function rowBacSide(tableId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(tableId, "betSide", "PLAYER_PAIR", "50", "P_PAIR +50", ButtonStyle.Secondary),
    btn(tableId, "betSide", "BANKER_PAIR", "50", "B_PAIR +50", ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(makeId("bac", "modalSide", tableId))
      .setLabel("✏️ 입력(사이드)")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(makeId("bac", "clear", tableId))
      .setLabel("CLEAR")
      .setStyle(ButtonStyle.Danger),
  );
}

/** 증감 버튼 묶음 */
export function rowAmountNudge(tableId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    nud("+50"),
    nud("+100"),
    nud("+500"),
    nud("-50"),
    nud("-100"),
  );
  function nud(delta: string) {
    return new ButtonBuilder()
      .setCustomId(makeId("bac", "nudge", delta, tableId))
      .setLabel(delta)
      .setStyle(delta.startsWith("+") ? ButtonStyle.Primary : ButtonStyle.Secondary);
  }
}

/** 자유 입력 모달 생성 */
export function makeBetModal(
  kind: "MAIN" | "SIDE",
  tableId: string,
  keyOptions: (MainKey | SideKey)[]
) {
  const modal = new ModalBuilder()
    .setCustomId(makeId("bac", "modalSubmit", kind, tableId)) // 제출 라우팅: action=modalSubmit, rest=[kind, tableId]
    .setTitle(kind === "MAIN" ? "메인 베팅 입력" : "사이드 베팅 입력");

  const keyInput = new TextInputBuilder()
    .setCustomId("betKey") // 제출 시 필드 ID
    .setLabel("베팅 대상 (" + keyOptions.join(", ") + ")")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(String(keyOptions[0]))
    .setRequired(true);

  const amtInput = new TextInputBuilder()
    .setCustomId("betAmt")
    .setLabel("베팅 금액(정수)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("예: 500")
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(keyInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(amtInput),
  );

  return modal;
}

/** 내부 유틸: 고정 증액 버튼 */
function btn(
  tableId: string,
  action: "betMain" | "betSide",
  key: MainKey | SideKey,
  inc: string,
  label: string,
  style: ButtonStyle
) {
  return new ButtonBuilder()
    .setCustomId(makeId("bac", action, tableId, key, inc))
    .setLabel(label)
    .setStyle(style);
}
