import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { makeId } from "../../utils/ids.js";

// ---------------------
// 바카라 로비 임베드
// ---------------------
export function embedBacLobby() {
  return new EmbedBuilder()
    .setTitle("🀄 바카라 게임")
    .setDescription(
      "플레이어 또는 뱅커에 베팅하세요!\n" +
        "추가로 사이드 배팅도 가능합니다.\n\n" +
        "⏱️ 충분한 베팅 시간이 주어집니다."
    )
    .setFooter({ text: "바카라 규칙 준수 / 사이드 배팅 포함" });
}

// ---------------------
// 메인 베팅 버튼 (플레이어 / 뱅커 / 타이)
// ---------------------
export function rowBacMain() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(makeId("bac", "bet", "PLAYER"))
      .setLabel("👤 플레이어")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(makeId("bac", "bet", "BANKER"))
      .setLabel("🏦 뱅커")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(makeId("bac", "bet", "TIE"))
      .setLabel("⚖️ 타이")
      .setStyle(ButtonStyle.Secondary)
  );
}

// ---------------------
// 사이드 베팅 버튼 (페어, 빅/스몰 등)
// ---------------------
export function rowBacSide() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(makeId("bac", "side", "PLAYER_PAIR"))
      .setLabel("👥 플레이어 페어")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(makeId("bac", "side", "BANKER_PAIR"))
      .setLabel("🏦 뱅커 페어")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(makeId("bac", "side", "BIG"))
      .setLabel("⬆️ 빅 (총합 ≥ 5장)")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(makeId("bac", "side", "SMALL"))
      .setLabel("⬇️ 스몰 (총합 4장)")
      .setStyle(ButtonStyle.Secondary)
  );
}
