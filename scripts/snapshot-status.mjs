#!/usr/bin/env node
/**
 * P0 快照：把"当前宿主 + 当前补丁表"的判定结果与目标文件指纹冻结成 fixture。
 *
 * 产出：
 *   fixtures/status-baseline.json  逐补丁状态（applied/pending/drifted/...）+ 计数
 *   fixtures/host-files.json       每个 file 键解析到的真实路径、sha256、大小
 *
 * 用法：node scripts/snapshot-status.mjs [--out fixtures]
 * 只读：不改宿主任何文件。
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "../lib/core.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outArgIdx = process.argv.indexOf("--out");
const OUT = path.resolve(ROOT, outArgIdx > -1 ? process.argv[outArgIdx + 1] : "fixtures");

const sha256File = (fp) => {
	try {
		return createHash("sha256").update(readFileSync(fp)).digest("hex");
	} catch {
		return null;
	}
};

const pkgVersion = (fp) => {
	try {
		return JSON.parse(readFileSync(fp, "utf8")).version || "";
	} catch {
		return "";
	}
};

const aiBase = core.findAiBase();
const installRoot = aiBase ? path.dirname(aiBase) : "";
const mask = (p) => {
	if (!p) return p;
	const norm = String(p);
	if (aiBase && norm.toLowerCase().startsWith(aiBase.toLowerCase())) return "<aiBase>" + norm.slice(aiBase.length);
	if (installRoot && norm.toLowerCase().startsWith(installRoot.toLowerCase())) return "<installRoot>" + norm.slice(installRoot.length);
	const home = process.env.USERPROFILE || "";
	if (home && norm.toLowerCase().startsWith(home.toLowerCase())) return "<home>" + norm.slice(home.length);
	return norm;
};
if (!aiBase || !existsSync(aiBase)) {
	console.error(`aiBase 不可用：${aiBase || "(null)"}`);
	process.exit(2);
}

const status = await core.patchStatus(aiBase);
const counts = { total: 0, applied: 0, pending: 0, drifted: 0, unmatched: 0, skipped: 0, na: 0, other: 0 };
for (const [, st] of Object.entries(status)) {
	counts.total += 1;
	if (st in counts) counts[st] += 1;
	else counts.other += 1;
}

const files = core.targetFiles(aiBase);
const hostFiles = {};
for (const [key, val] of Object.entries(files)) {
	const list = (Array.isArray(val) ? val : [val]).filter(Boolean);
	hostFiles[key] = list.map((fp) => {
		const exists = existsSync(fp);
		return {
			path: mask(fp),
			exists,
			bytes: exists ? statSync(fp).size : 0,
			sha256: exists ? sha256File(fp) : null,
		};
	});
}

const snapshot = {
	schema: "dsh-purge/status-baseline@1",
	capturedAt: new Date().toISOString(),
	aiBase: "<aiBase>",
	host: {
		"dsh-base": pkgVersion(path.join(aiBase, "dsh-base", "package.json")),
		"dsh-web-app": pkgVersion(path.join(aiBase, "dsh-web-app", "package.json")),
		"dsh-agent-loop": pkgVersion(path.join(aiBase, "dsh-agent-loop", "package.json")),
		"dsh-system-prompt": pkgVersion(path.join(aiBase, "dsh-system-prompt", "package.json")),
	},
	patches: core.ALL_PATCHES.length,
	counts,
	status: Object.fromEntries(Object.entries(status).sort((a, b) => Number(a[0]) - Number(b[0]))),
};

mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, "status-baseline.json"), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
writeFileSync(
	path.join(OUT, "host-files.json"),
	`${JSON.stringify({ schema: "dsh-purge/host-files@1", aiBase: "<aiBase>", files: hostFiles }, null, 2)}\n`,
	"utf8",
);

console.log(`aiBase   : ${aiBase}`);
console.log(`versions : ${JSON.stringify(snapshot.host)}`);
console.log(`patches  : ${snapshot.patches}`);
console.log(`counts   : ${JSON.stringify(counts)}`);
console.log(`written  : ${path.relative(ROOT, path.join(OUT, "status-baseline.json"))}, ${path.relative(ROOT, path.join(OUT, "host-files.json"))}`);




