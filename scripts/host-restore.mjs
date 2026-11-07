#!/usr/bin/env node
/**
 * 从宿主快照还原被补丁改过的文件（测试 GitHub 安装后的回滚工具）。
 *
 * 默认 dry-run，只报告差异；加 --apply 才写盘，并把原文件备份为 <file>.restore-bak-<时间戳>。
 *
 * 用法：
 *   node scripts/host-restore.mjs --host 0.2.2-rc.1            # 预览
 *   node scripts/host-restore.mjs --host 0.2.2-rc.1 --apply    # 执行
 *   node scripts/host-restore.mjs --host 0.2.2-rc.1 --aiBase <path> --apply
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "../lib/core.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (name, fallback) => {
	const i = process.argv.indexOf(name);
	return i > -1 ? process.argv[i + 1] : fallback;
};
const apply = process.argv.includes("--apply");
const hostVersion = arg("--host", JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).dshTarget);
const snapshotDir = path.join(ROOT, "hosts", hostVersion);
const manifestPath = path.join(snapshotDir, "manifest.json");
if (!existsSync(manifestPath)) {
	console.error(`缺少快照：${path.relative(ROOT, manifestPath)}`);
	process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const aiBase = arg("--aiBase", core.findAiBase() || "");
if (!aiBase) {
	console.error("找不到 aiBase，用 --aiBase 指定");
	process.exit(2);
}
const installRoot = path.dirname(aiBase);
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

const report = { hostVersion, aiBase, apply, same: 0, restored: [], backedUp: [], missing: [] };
for (const f of manifest.files) {
	if (f.role !== "host" || !f.rel) continue;
	const live = path.join(installRoot, ...f.rel.split("/"));
	const snap = path.join(snapshotDir, "node_modules", ...f.rel.split("/"));
	if (!existsSync(live)) {
		report.missing.push(f.rel);
		continue;
	}
	const h = createHash("sha256").update(readFileSync(live)).digest("hex");
	if (h === f.sha256) {
		report.same += 1;
		continue;
	}
	report.restored.push(f.rel);
	if (apply) {
		if (existsSync(snap)) {
			const bak = `${live}.restore-bak-${stamp}`;
			copyFileSync(live, bak);
			report.backedUp.push(path.relative(installRoot, bak));
			copyFileSync(snap, live);
		} else {
			report.missing.push(`${f.rel} (snapshot file absent)`);
		}
	}
}

if (apply) {
	writeFileSync(
		path.join(ROOT, "hosts", hostVersion, `restore-${stamp}.json`),
		`${JSON.stringify(report, null, 2)}\n`,
		"utf8",
	);
}

console.log(JSON.stringify(report, null, 2));
console.log(
	apply
		? `\n已还原 ${report.restored.length} 个文件（备份后缀 .restore-bak-${stamp}）`
		: `\n预览：${report.restored.length} 个文件与快照不同；加 --apply 执行还原`,
);
process.exit(0);
