// src/utils/timer.ts
import {
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
  Message,
} from "discord.js";

function bar(p: number, slots = 10) {
  const clamped = Math.min(1, Math.max(0, p));
  const filled = Math.round(clamped * slots);
  return "█".repeat(filled) + "░".repeat(slots - filled);
}

export type CountdownOptions = {
  slots?: number;                 // 진행바 칸 수(기본 10)
  tickMs?: number;                // 틱 간격 ms(기본 1000)
  onTick?: (remain: number, elapsed: number) => Promise<void> | void;
  deleteOnFinish?: boolean;       // 완료 시 메시지 삭제
  disableComponentsOnFinish?: boolean; // 완료 시 버튼 비활성화
  footer?: string;
  color?: number;
};

export type CountdownHandle = {
  cancel: () => void;
  getRemaining: () => number;
  isFinished: () => boolean;
};

export async function runCountdownEmbed(
  msg: Message,
  sec: number,
  title: string,
  onFinish: () => Promise<void> | void,
  opts: CountdownOptions = {}
): Promise<CountdownHandle> {
  const total = Math.max(1, Math.floor(sec || 0));
  const tickMs = Math.max(250, Math.floor(opts.tickMs ?? 1000));
  const slots = Math.max(5, Math.floor(opts.slots ?? 10));

  let finished = false;
  let timer: NodeJS.Timeout | null = null;

  const start = Date.now();

  const baseEmbed = (remain: number) => {
    const progress = 1 - remain / total;
    const emb = new EmbedBuilder()
      .setTitle(title)
      .setDescription(
        [`⏱️ **${remain}s** 남음`, "", `\`${bar(progress, slots)}\``].join("\n")
      );

    if (opts.footer) emb.setFooter({ text: opts.footer });
    if (opts.color !== undefined) emb.setColor(opts.color);

    return emb;
  };

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const safeEdit = async (payload: Parameters<Message["edit"]>[0]) => {
    try {
      await msg.edit(payload);
    } catch {
      // 메시지 삭제/권한 문제 등 → 타이머 종료
      clearTimer();
      finished = true;
    }
  };

  // ✅ 기존 Message.components를 읽어서 "새" 빌더로 재구성(비활성화)
  const disableAllComponents = async () => {
    const rows = msg.components?.length
      ? msg.components.map((row) => {
          const newRow = new ActionRowBuilder<ButtonBuilder>();
          for (const comp of row.components) {
            if ((comp as any).type === 2) {
              // Button
              const btn = ButtonBuilder.from(comp as any).setDisabled(true);
              newRow.addComponents(btn);
            }
          }
          return newRow;
        })
      : [];

    if (rows.length) {
      try { await msg.edit({ components: rows }); } catch { /* 무시 */ }
    }
  };

  const tick = async () => {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const remain = Math.max(0, total - elapsed);

    if (finished) return;

    await safeEdit({ embeds: [baseEmbed(remain)] });

    if (opts.onTick) {
      try { await opts.onTick(remain, elapsed); } catch { /* 무시 */ }
    }

    if (remain <= 0) {
      finished = true;
      clearTimer();

      if (opts.disableComponentsOnFinish) {
        await disableAllComponents();
      }

      try { await onFinish(); } catch { /* 무시 */ }

      if (opts.deleteOnFinish) {
        try { await msg.delete(); } catch { /* 무시 */ }
      }
      return;
    }

    timer = setTimeout(tick, tickMs);
  };

  // 첫 렌더
  await safeEdit({ embeds: [baseEmbed(total)] });
  timer = setTimeout(tick, tickMs);

  return {
    cancel: () => {
      if (finished) return;
      finished = true;
      clearTimer();
    },
    getRemaining: () => {
      if (finished) return 0;
      const elapsed = Math.floor((Date.now() - start) / 1000);
      return Math.max(0, total - elapsed);
    },
    isFinished: () => finished,
  };
}
