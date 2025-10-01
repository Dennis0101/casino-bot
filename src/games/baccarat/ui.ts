import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { makeId } from "../../utils/ids.js";

export const embedBacLobby = (leftSec: number) =>
  new EmbedBuilder()
    .setTitle("🎴 바카라 베팅")
    .setDescription(
      [
        `⏱️ 종료까지 **${leftSec}s**`,
        "",
        "메인: PLAYER / BANKER / TIE",
        "사이드: PLAYER_PAIR / BANKER_PAIR",
      ].join("\n")
    );

export const rowBacMain = (tableId: string) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(makeId("bac", "betMain", tableId, "PLAYER", "100"))
      .setLabel("PLAYER +100")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(makeId("bac", "betMain", tableId, "BANKER", "100"))
      .setLabel("BANKER +100")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(makeId("bac", "betMain", tableId, "TIE", "50"))
      .setLabel("TIE +50")
      .setStyle(ButtonStyle.Secondary),
  );

export const rowBacSide = (tableId: string) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(makeId("bac", "betSide", tableId, "PLAYER_PAIR", "50"))
      .setLabel("PLAYER_PAIR +50")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(makeId("bac", "betSide", tableId, "BANKER_PAIR", "50"))
      .setLabel("BANKER_PAIR +50")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(makeId("bac", "clear", tableId))
      .setLabel("CLEAR")
      .setStyle(ButtonStyle.Danger),
  );
