#!/usr/bin/env node
/**
 * 导出重构前的补丁表快照（fixtures/patches.baseline.json）。
 *
 * 4 个数组在 core.js 里是模块私有，这里把它们的声明临时加上 export 后
 * 从同目录临时模块导入，取完即删，不改动 lib/core.js。
 *
 * 用法：node scripts/dump-patches.mjs [--out fixtures/patches.baseline.json]
 */
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { encode } from "../lib/patch-codec.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outIdx = process.argv.indexOf("--out");
const OUT = path.resolve(ROOT, outIdx > -1 ? process.argv[outIdx + 1] : "fixtures/patches.baseline.json");

const corePath = path.join(ROOT, "lib", "core.js");
const source = readFileSync(corePath, "utf8");
const patched = source.replace(
	/^const (PATCHES|CODE_PATCHES|ENGINE_PATCHES|NEW_TOOL_PATCHES) = \[/gm,
	"export const $1 = [",
);
if (patched === source) {
	console.error("未找到补丁数组声明，core.js 结构可能已改变");
	process.exit(2);
}

const tmp = path.join(ROOT, "lib", `_dump-patches-${process.pid}.mjs`);
writeFileSync(tmp, patched, "utf8");
try {
	const m = await import(pathToFileURL(tmp).href);
	const snapshot = {
		schema: "dsh-purge/patches-baseline@1",
		prompt: encode(m.PATCHES),
		code: encode(m.CODE_PATCHES),
		engine: encode(m.ENGINE_PATCHES),
		tools: encode(m.NEW_TOOL_PATCHES),
		displayGroups: encode(m.PATCH_DISPLAY_GROUPS),
		all: encode(m.ALL_PATCHES),
	};
	mkdirSync(path.dirname(OUT), { recursive: true });
	writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
	console.log(
		JSON.stringify(
			{
				out: path.relative(ROOT, OUT),
				counts: {
					prompt: snapshot.prompt.length,
					code: snapshot.code.length,
					engine: snapshot.engine.length,
					tools: snapshot.tools.length,
					all: snapshot.all.length,
				},
			},
			null,
			2,
		),
	);
} finally {
	unlinkSync(tmp);
}

