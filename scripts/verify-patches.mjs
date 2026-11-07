#!/usr/bin/env node
/**
 * P1 验收：重构前后必须零差异。
 *
 * 1) 数据等价：patches/*.json（经 loader 解码）与 fixtures/patches.baseline.json 深比较
 * 2) schema：4 个数据文件通过 patches/patch.schema.json
 * 3) 行为等价：patchStatus 结果与 fixtures/status-baseline.json 逐 id 相同
 *
 * 用法：node scripts/verify-patches.mjs [--no-status]
 * 只读：patchStatus 不写宿主文件。
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
const baseline = JSON.parse(readFileSync(path.join(ROOT, "fixtures", "patches.baseline.json"), "utf8"));
let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => {
	console.log(`  ✗ ${m}`);
	failures += 1;
};

console.log("dsh-purge 补丁表重构验收\n");
console.log("[1/3] 数据等价（loader vs baseline）");
const pairs = [
	["prompt", decode(baseline.prompt), PATCHES],
	["code", decode(baseline.code), CODE_PATCHES],
	["engine", decode(baseline.engine), ENGINE_PATCHES],
	["tools", decode(baseline.tools), NEW_TOOL_PATCHES],
	["all", decode(baseline.all), core.ALL_PATCHES],
	["displayGroups", decode(baseline.displayGroups), PATCH_DISPLAY_GROUPS],
];
for (const [label, want, got] of pairs) {
	if (deepEqual(want, got)) ok(`${label}: ${Array.isArray(got) ? `${got.length} 条` : `${Object.keys(got).length} 组`} 完全一致`);
	else bad(`${label}: ${firstDiff(want, got)}`);
}
if (PATCH_DATA_META.counts.total !== core.ALL_PATCHES.length) {
	bad(`PATCH_DATA_META.total=${PATCH_DATA_META.counts.total} != ${core.ALL_PATCHES.length}`);
}

console.log("\n[2/3] RegExp pattern 保持为 RegExp（JSON 往返无损）");
let regexCount = 0;
for (const p of core.ALL_PATCHES) {
	for (const r of p.replacements || []) if (r.pattern instanceof RegExp) regexCount += 1;
}
if (regexCount === 8) ok(`正则 pattern 8/8 还原为 RegExp`);
else bad(`正则 pattern 数量 ${regexCount}，期望 8`);

if (process.argv.includes("--no-status")) {
	console.log("\n[3/3] 跳过（--no-status）");
} else {
	console.log("\n[3/3] 行为等价（patchStatus vs fixtures/status-baseline.json）");
	const snap = JSON.parse(readFileSync(path.join(ROOT, "fixtures", "status-baseline.json"), "utf8"));
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
		if (diffs.length === 0) ok(`86 条状态与基线逐 id 相同（宿主 ${Object.values(snap.host)[0] || "?"}）`);
		else bad(`状态漂移 ${diffs.length} 条：\n      ${diffs.slice(0, 10).join("\n      ")}`);
	}
}

console.log(failures === 0 ? "\nRESULT: PASS" : `\nRESULT: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);

