#!/usr/bin/env node
/**
 * 导出当前加载中的补丁表（重构后）。
 *
 * 重构前的 86 条基线已冻结在 fixtures/patches.baseline.json（不再重生成），
 * 这里导出的是「现在 loader 实际加载的」那批，用于对比/归档。
 *
 * 用法：node scripts/dump-patches.mjs [--out fixtures/patches.current.json]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encode } from "../lib/patch-codec.js";
import {
	CODE_PATCHES,
	ENGINE_PATCHES,
	NEW_TOOL_PATCHES,
	PATCH_DISPLAY_GROUPS,
	PATCHES,
} from "../lib/patch-loader.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outIdx = process.argv.indexOf("--out");
const OUT = path.resolve(ROOT, outIdx > -1 ? process.argv[outIdx + 1] : "fixtures/patches.current.json");

const all = [...PATCHES, ...CODE_PATCHES, ...ENGINE_PATCHES, ...NEW_TOOL_PATCHES];
const snapshot = {
	schema: "dsh-purge/patches-current@1",
	prompt: encode(PATCHES),
	code: encode(CODE_PATCHES),
	engine: encode(ENGINE_PATCHES),
	tools: encode(NEW_TOOL_PATCHES),
	displayGroups: encode(PATCH_DISPLAY_GROUPS),
	all: encode(all),
};
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(
	JSON.stringify({ out: path.relative(ROOT, OUT), counts: { prompt: PATCHES.length, code: CODE_PATCHES.length, engine: ENGINE_PATCHES.length, tools: NEW_TOOL_PATCHES.length, all: all.length } }, null, 2),
);
