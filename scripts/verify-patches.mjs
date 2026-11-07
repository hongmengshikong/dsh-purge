#!/usr/bin/env node
/**
 * 补丁表验收：数据等价 + 正则无损 + 行为等价。
 *
 * 基线说明：fixtures/patches.baseline.json 是重构前（86 条）的冻结快照，
 * 其中 3 条 legacy（#40/#47/#49）已移入 patches/legacy/ 只留档不加载，
 * 因此比对前先从基线里剔除 fixtures/patches.archived.json 列出的 id。
 *
 * 用法：node scripts/verify-patches.mjs [--no-status]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "../lib/core.js";
import { decode, deepEqual, firstDiff } from "../lib/patch-codec.js";
import {
	CODE_PATCHES,
	ENGINE_PATCHES,
	NEW_TOOL_PATCHES,
	PATCH_DATA_META,
	PATCH_DISPLAY_GROUPS,
	PATCHES,
} from "../lib/patch-loader.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readJson = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
const baseline = readJson("fixtures/patches.baseline.json");
const archived = new Set(readJson("fixtures/patches.archived.json").ids);

let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => {
	console.log(`  ✗ ${m}`);
	failures += 1;
};

const strip = (list) => list.filter((p) => !archived.has(p.id));
const countRegex = (list) => list.reduce((n, p) => n + (p.replacements || []).filter((r) => r.pattern instanceof RegExp).length, 0);

console.log("dsh-purge 补丁表验收");
console.log(`基线 ${baseline.all.length} 条，留档剔除 ${archived.size} 条，loader 应加载 ${baseline.all.length - archived.size} 条\n`);

console.log("[1/3] 数据等价（loader vs 冻结基线 - 留档）");
const pairs = [
	["prompt", strip(decode(baseline.prompt)), PATCHES],
	["code", strip(decode(baseline.code)), CODE_PATCHES],
	["engine", strip(decode(baseline.engine)), ENGINE_PATCHES],
	["tools", strip(decode(baseline.tools)), NEW_TOOL_PATCHES],
	["all", strip(decode(baseline.all)), core.ALL_PATCHES],
	["displayGroups", decode(baseline.displayGroups), PATCH_DISPLAY_GROUPS],
];
for (const [label, want, got] of pairs) {
	if (deepEqual(want, got)) ok(`${label}: ${Array.isArray(got) ? `${got.length} 条` : `${Object.keys(got).length} 组`} 完全一致`);
	else bad(`${label}: ${firstDiff(want, got)}`);
}
if (PATCH_DATA_META.counts.total !== core.ALL_PATCHES.length) {
	bad(`PATCH_DATA_META.total=${PATCH_DATA_META.counts.total} != ${core.ALL_PATCHES.length}`);
}

console.log("\n[2/3] RegExp pattern 无损");
const expectedRegex = countRegex(strip(decode(baseline.all)));
const actualRegex = countRegex(core.ALL_PATCHES);
if (actualRegex === expectedRegex) ok(`正则 pattern ${actualRegex}/${expectedRegex} 还原为 RegExp`);
else bad(`正则 pattern ${actualRegex}，期望 ${expectedRegex}`);

if (process.argv.includes("--no-status")) {
	console.log("\n[3/3] 跳过（--no-status）");
} else {
	console.log("\n[3/3] 行为等价（patchStatus vs fixtures/status-baseline.json）");
	const snap = readJson("fixtures/status-baseline.json");
	const aiBase = core.findAiBase();
	if (!aiBase) {
		bad("找不到 aiBase，无法比对 patchStatus");
	} else {
		const status = await core.patchStatus(aiBase);
		const want = snap.status;
		const diffs = [];
		for (const id of new Set([...Object.keys(want), ...Object.keys(status)])) {
			if (want[id] !== status[id]) diffs.push(`#${id}: ${want[id]} -> ${status[id]}`);
		}
		if (diffs.length === 0) ok(`${Object.keys(status).length} 条状态与基线逐 id 相同（宿主 ${Object.values(snap.host)[0] || "?"}）`);
		else bad(`状态漂移 ${diffs.length} 条：\n      ${diffs.slice(0, 10).join("\n      ")}`);
	}
}

console.log(failures === 0 ? "\nRESULT: PASS" : `\nRESULT: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
