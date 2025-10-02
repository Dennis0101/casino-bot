import { EmbedBuilder, Message } from "discord.js";

/** 0~1 사이 값으로 10칸 진행바 생성 */
function bar(p: number) {
  const filled = Math.max(0, Math.min(10, Math.round(p * 10)));
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

/**
 * 실시간 카운트다운(임베드 메시지 수정)
 * - msg: 생성해 둔 메시지 (edit 가능해야 함)
 * - sec: 총 초
 * - title: 상단 제목
 * - onFinish: 종료시 콜백
 */
export async function runCountdownEmbed(
  msg: Message,
  sec: number,
  title: string,
  onFinish: () => Promise<void> | void
) {
  const start = Date.now();
  const total = sec;

  const tick = async () => {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const remain = Math.max(0, total - elapsed);
    const progress = 1 - remain / total;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(
        [
          `⏱️ **${remain}s** 남음`,
          '',
          `\`${bar(progress)}\``,
        ].join("\n")
      );

    await msg.edit({ embeds: [embed], content: "" });

    if (remain <= 0) {
      await onFinish();
      return;
    }
    setTimeout(tick, 1000);
  };

  // 최초 렌더
  await msg.edit({
    content: "",
    embeds: [
      new EmbedBuilder()
        .setTitle(title)
        .setDescription(
          [`⏱️ **${sec}s** 남음`, '', `\`${bar(0)}\``].join('\n')
        )
    ]
  });

  setTimeout(tick, 1000);
}
