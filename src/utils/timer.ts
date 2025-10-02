import { EmbedBuilder, Message } from "discord.js";

function bar(p: number) {
  const clamped = Math.min(1, Math.max(0, p));
  const filled = Math.round(clamped * 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

export async function runCountdownEmbed(
  msg: Message,
  sec: number,
  title: string,
  onFinish: () => Promise<void> | void
) {
  const start = Date.now();
  const total = Math.max(1, Math.floor(sec));

  const render = async () => {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const remain = Math.max(0, total - elapsed);
    const progress = 1 - remain / total;

    await msg.edit({
      embeds: [
        new EmbedBuilder()
          .setTitle(title)
          .setDescription([`⏱️ **${remain}s** 남음`, "", `\`${bar(progress)}\``].join("\n")),
      ],
    });

    if (remain <= 0) return onFinish();
    setTimeout(render, 1000);
  };

  await msg.edit({
    embeds: [
      new EmbedBuilder()
        .setTitle(title)
        .setDescription([`⏱️ **${total}s** 남음`, "", `\`${bar(0)}\``].join("\n")),
    ],
  });

  setTimeout(render, 1000);
}
