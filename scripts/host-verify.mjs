#!/usr/bin/env node
/**
 * 发布门禁：对一个钉死的宿主快照跑 patchStatus，要求「必需补丁」全绿。
 *
 * 判定口径（对应 1 宿主 : 1 插件）：
 *   必需补丁（optional !== true）→ 必须 applied，否则 gate 失败、不发版
 *   可选补丁（optional === true）→ 未命中只记录，不挡发版
 *   仅 external 文件的补丁（如 @earendil-works/pi-ai）→ 快照不含其文件，单独列出
 *
 * 另外做一次「宿主已升版」检测：把本机安装的指纹与 manifest 比对。
 *
 * 用法：
 *   node scripts/host-verify.mjs                # 校验 package.json 里 dshTarget 的宿主
 *   node scripts/host-verify.mjs --host 0.2.1-rc.5 --json
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "../lib/core.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (name, fallback) => {
	const i = process.argv.indexOf(name);
	return i > -1 ? process.argv[i + 1] : fallback;
};
const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
const hostVersion = arg("--host", pkg.dshTarget || "");
const asJson = process.argv.includes("--json");
if (!hostVersion) {
	console.error("package.json 没有 dshTarget，也没有 --host");
	process.exit(2);
}

const hostDir = path.join(ROOT, "hosts", hostVersion);
const manifestPath = path.join(hostDir, "manifest.json");
if (!existsSync(manifestPath)) {
	console.error(`缺少宿主快照：${path.relative(ROOT, manifestPath)}（先跑 npm run host:snapshot）`);
	process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const fixtureAiBase = path.join(hostDir, "node_modules", "@deepseek-ai");
const hostKeys = new Set(manifest.files.filter((f) => f.role === "host").map((f) => f.key));

const status = await core.patchStatus(fixtureAiBase);
const patches = core.ALL_PATCHES;

const rows = [];
for (const p of patches) {
	if (!core.patchAppliesHere(p, "web")) continue;
	const keys = [].concat(p.file ?? []).filter(Boolean);
	const pinnedHere = keys.some((k) => hostKeys.has(k));
	const st = status[p.id] || "missing";
	rows.push({ id: p.id, name: p.name, optional: p.optional === true, pinned: pinnedHere, status: st });
}

const required = rows.filter((r) => !r.optional && r.pinned);
const requiredFail = required.filter((r) => r.status !== "applied");
const optionalMiss = rows.filter((r) => r.optional && r.status !== "applied" && r.status !== "na");
const externalOnly = rows.filter((r) => !r.pinned);

// 宿主升版检测：本机安装 vs manifest
const liveAiBase = core.findAiBase();
let live = { aiBase: liveAiBase, version: "", matched: 0, mismatched: [], missing: [] };
if (liveAiBase) {
	const base = path.join(liveAiBase, "..");
	for (const f of manifest.files.filter((x) => x.role === "host")) {
		const livePath = path.join(base, ...f.rel.split("/"));
		if (!existsSync(livePath)) {
			live.missing.push(f.rel);
			continue;
		}
		const h = createHash("sha256").update(readFileSync(livePath)).digest("hex");
		if (h === f.sha256) live.matched += 1;
		else live.mismatched.push(f.rel);
	}
	try {
		live.version = JSON.parse(readFileSync(path.join(liveAiBase, "dsh-base", "package.json"), "utf8")).version || "";
	} catch {
		live.version = "";
	}
}

const report = {
	hostVersion,
	pluginVersion: pkg.version,
	dshTarget: pkg.dshTarget,
	fixture: path.relative(ROOT, hostDir),
	pinnedFiles: manifest.counts.files,
	patches: { total: rows.length, required: required.length, requiredFail: requiredFail.length, optionalMiss: optionalMiss.length, externalOnly: externalOnly.length },
	requiredFail: requiredFail.map((r) => ({ id: r.id, name: r.name, status: r.status })),
	optionalMiss: optionalMiss.map((r) => ({ id: r.id, name: r.name, status: r.status })),
	externalOnly: externalOnly.map((r) => ({ id: r.id, name: r.name })),
	live: {
		aiBase: live.aiBase,
		version: live.version,
		versionMatchesPin: live.version === hostVersion,
		filesMatched: live.matched,
		filesMismatched: live.mismatched.length,
		filesMissing: live.missing.length,
	},
	gate: requiredFail.length === 0 ? "PASS" : "FAIL",
};

if (asJson) {
	console.log(JSON.stringify(report, null, 2));
} else {
	console.log(`宿主钉版本 : ${hostVersion}   插件 ${pkg.version}`);
	console.log(`快照       : ${report.fixture}（${report.pinnedFiles} 文件）`);
	console.log(`本机宿主   : ${live.version || "?"} ${report.live.versionMatchesPin ? "= 钉子" : "≠ 钉子（已升版）"}`);
	console.log(`指纹比对   : 命中 ${report.live.filesMatched} / 变更 ${report.live.filesMismatched} / 缺失 ${report.live.filesMissing}`);
	console.log(`\n补丁判定   : 参与 ${report.patches.total}  必需 ${report.patches.required}  失败 ${report.patches.requiredFail}  可选未命中 ${report.patches.optionalMiss}  external-only ${report.patches.externalOnly}`);
	if (requiredFail.length) {
		console.log("\n必需补丁未通过：");
		for (const r of requiredFail.slice(0, 40)) console.log(`  #${r.id} ${r.name.padEnd(38)} ${r.status}`);
		if (requiredFail.length > 40) console.log(`  ... 另外 ${requiredFail.length - 40} 条`);
	}
	if (live.mismatched.length) {
		console.log(`\n本机与快照不一致（前 10）：`);
		for (const f of live.mismatched.slice(0, 10)) console.log(`  ${f}`);
	}
	console.log(`\nGATE: ${report.gate}`);
}

process.exit(requiredFail.length === 0 ? 0 : 1);

