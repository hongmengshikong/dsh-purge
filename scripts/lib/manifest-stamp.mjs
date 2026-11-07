import { readFileSync, existsSync, writeFileSync } from "node:fs";
// 让 manifest 的 capturedAt 在内容未变时保持不变，避免每次 snapshot 产生无意义 diff
export function stableCapturedAt(manifestPath, next) {
  if (!existsSync(manifestPath)) return next.capturedAt;
  try {
    const prev = JSON.parse(readFileSync(manifestPath, "utf8"));
    const strip = (m) => JSON.stringify({ f: m.files, p: m.packages, c: m.counts, m: m.missing });
    if (strip(prev) === strip(next)) return prev.capturedAt;
  } catch {}
  return next.capturedAt;
}
