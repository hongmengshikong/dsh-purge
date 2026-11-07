#!/usr/bin/env node
/**
 * 补丁表验收
 *
 * 默认：
 *   [1/3] loader 自检（schema 在载入时已校验、id 唯一、计数）
 *   [2/3] RegExp 型 pattern 仍为 RegExp（JSON 往返无损）
 *   [3/3] patchStatus 与 fixtures/status-baseline.json 逐 id 一致
 *
 * --baseline：额外和重构前冻结的 86 条基线逐字段比对（数据化重构是否零差异）。
 *             补丁内容随宿主版本演进而修改后，这项会报差异，属预期。
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
const archived = new Set(readJson("fixtures/patches.archived.json").ids);
const has = (flag) => process.argv.includes(flag);

let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => {
	console.log(`  ✗ ${m}`);
	failures += 1;
};

console.log("dsh-purge 补丁表验收");
console.log(`加载 ${core.ALL_PATCHES.length} 条（留档 ${archived.size} 条：${[...archived].sort((a, b) => a - b).join(",")}）\n`);

console.log("[1/3] loader 自检");
{
	const counts = PATCH_DATA_META.counts;
	const sum = counts.prompt + counts.code + counts.engine + counts.tools;
	if (sum === counts.total && counts.total === core.ALL_PATCHES.length) ok(`分组计数一致：prompt ${counts.prompt} + code ${counts.code} + engine ${counts.engine} + tools ${counts.tools} = ${counts.total}`);
	else bad(`计数不一致：${JSON.stringify(counts)} vs ALL_PATCHES=${core.ALL_PATCHES.length}`);
	const ids = core.ALL_PATCHES.map((p) => p.id);
	if (new Set(ids).size === ids.length) ok(`id 唯一（${ids.length} 条）`);
	else bad("存在重复 id");
	if (has("--baseline")) {
		const baseline = readJson("fixtures/patches.baseline.json");
		const strip = (list) => list.filter((p) => !archived.has(p.id));
		const pairs = [
			["prompt", strip(decode(baseline.prompt)), PATCHES],
			["code", strip(decode(baseline.code)), CODE_PATCHES],
			["engine", strip(decode(baseline.engine)), ENGINE_PATCHES],
			["tools", strip(decode(baseline.tools)), NEW_TOOL_PATCHES],
			["all", strip(decode(baseline.all)), core.ALL_PATCHES],
			["displayGroups", decode(baseline.displayGroups), PATCH_DISPLAY_GROUPS],
		];
		for (const [label, want, got] of pairs) {
			if (deepEqual(want, got)) ok(`baseline ${label}: 完全一致`);
			else bad(`baseline ${label}: ${firstDiff(want, got)}`);
		}
	} else {
		console.log("  · 历史基线比对跳过（--baseline 启用；补丁内容已随宿主演进修改）");
	}
}

console.log("\n[2/3] RegExp pattern 无损");
{
	let n = 0;
	for (const p of core.ALL_PATCHES) for (const r of p.replacements || []) if (r.pattern instanceof RegExp) n += 1;
	if (n > 0) ok(`${n} 个正则 pattern 已还原为 RegExp`);
	else bad("一个 RegExp 都没还原，JSON 往返可能丢了类型");
}

if (has("--no-status")) {
	console.log("\n[3/3] 跳过（--no-status）");
} else {
	console.log("\n[3/3] 行为等价（patchStatus vs fixtures/status-baseline.json）");
	const snap = readJson("fixtures/status-baseline.json");
	const aiBase = core.findAiBase();
	if (!aiBase) bad("找不到 aiBase，无法比对 patchStatus");
	else {
		const status = await core.patchStatus(aiBase);
		const diffs = [];
		for (const id of new Set([...Object.keys(snap.status), ...Object.keys(status)])) {
			if (snap.status[id] !== status[id]) diffs.push(`#${id}: ${snap.status[id]} -> ${status[id]}`);
		}
		if (diffs.length === 0) ok(`${Object.keys(status).length} 条状态与基线逐 id 相同（宿主 ${Object.values(snap.host)[0] || "?"}）`);
		else bad(`状态漂移 ${diffs.length} 条：\n      ${diffs.slice(0, 10).join("\n      ")}`);
	}
}

console.log(failures === 0 ? "\nRESULT: PASS" : `\nRESULT: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
