import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
} from "discord.js";
import { makeId } from "../../utils/ids.js";
import type { MainKey, SideKey } from "./types.js";

export function embedBacRoundIntro(leftSec: number) {
  return new EmbedBuilder()
    .setTitle("🀄 바카라 라운드")
    .setDescription(
      [
        `⏱️ 베팅 종료까지 **${leftSec}s**`,
        "메인: PLAYER / BANKER / TIE",
        "사이드: PLAYER_PAIR / BANKER_PAIR",
        "버튼을 여러 번 눌러 금액 누적, CLEAR로 초기화",
      ].join("\n")
    )
    .setFooter({ text: "모의머니 · 실제 돈 아님" });
}

export function rowBacMain(tableId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(tableId, "betMain", "PLAYER", "100", "PLAYER +100", ButtonStyle.Primary),
    btn(tableId, "betMain", "BANKER", "100", "BANKER +100", ButtonStyle.Success),
    btn(tableId, "betMain", "TIE",    "50",  "TIE +50",      ButtonStyle.Secondary),
  );
}

export function rowBacSide(tableId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(tableId, "betSide", "PLAYER_PAIR", "50", "P_PAIR +50", ButtonStyle.Secondary),
    btn(tableId, "betSide", "BANKER_PAIR", "50", "B_PAIR +50", ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(makeId("bac", "clear", tableId)).setLabel("CLEAR").setStyle(ButtonStyle.Danger),
  );
}

export function rowAmountNudge(tableId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    nud("+50"), nud("+100"), nud("+500"), nud("-50"), nud("-100")
  );
  function nud(delta: string) {
    return new ButtonBuilder().setCustomId(makeId("bac", "nudge", delta, tableId)).setLabel(delta).setStyle(delta.startsWith("+") ? ButtonStyle.Primary : ButtonStyle.Secondary);
  }
}

function btn(tableId: string, action: "betMain" | "betSide", key: MainKey | SideKey, inc: string, label: string, style: ButtonStyle) {
  return new ButtonBuilder().setCustomId(makeId("bac", action, tableId, key, inc)).setLabel(label).setStyle(style);
}
