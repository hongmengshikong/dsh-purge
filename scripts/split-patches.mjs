#!/usr/bin/env node
/**
 * P1 拆分：fixtures/patches.baseline.json → patches/*.json。
 *
 * - 逐组输出（prompt/code/engine/tools），保持原数组顺序
 * - 同时生成 patches/display-groups.json
 * - 把 core.js 里散落在补丁表之间的注释按 id 收进 patches/NOTES.md
 *   （JSON 装不下注释，但那些 rc 版本情报不能丢）
 *
 * 用法：node scripts/split-patches.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASELINE = path.join(ROOT, "fixtures", "patches.baseline.json");
const OUT_DIR = path.join(ROOT, "patches");

const base = JSON.parse(readFileSync(BASELINE, "utf8"));
const groups = [
	["prompt", base.prompt, "提示词层：系统提示/身份/审批话术"],
	["code", base.code, "代码层：宿主分包里的实现细节"],
	["engine", base.engine, "引擎层：审批、沙箱、权限默认值"],
	["tools", base.tools, "工具层：bash/pwsh/fs/web 等工具描述与行为"],
];

mkdirSync(OUT_DIR, { recursive: true });
for (const [group, patches, note] of groups) {
	const doc = { group, note, patches };
	writeFileSync(path.join(OUT_DIR, `${group}.json`), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
	console.log(`${group}.json  patches=${patches.length}  bytes=${JSON.stringify(doc).length}`);
}

writeFileSync(
	path.join(OUT_DIR, "display-groups.json"),
	`${JSON.stringify({ schema: "dsh-purge/display-groups@1", groups: base.displayGroups }, null, 2)}\n`,
	"utf8",
);
console.log(`display-groups.json  groups=${Object.keys(base.displayGroups).length}`);

// ---- 注释迁移：按 id 把 core.js 里的 // 注释收拢 ----
const coreLines = readFileSync(path.join(ROOT, "lib", "core.js"), "utf8").split(/\r?\n/);
const notes = [];
let current = { id: null, name: "(表头)", lines: [] };
const idRe = /^\s*id:\s*(\d+),\s*name:\s*"([^"]+)"/;
for (const line of coreLines) {
	const m = idRe.exec(line);
	if (m) {
		notes.push(current);
		current = { id: Number(m[1]), name: m[2], lines: [] };
	}
	const c = /^\s*\/\/\s?(.*)$/.exec(line);
	if (c && current.lines.length < 40) current.lines.push(c[1]);
}
notes.push(current);

const byId = new Map();
for (const block of notes) {
	const text = block.lines.filter((l) => l.trim()).join("\n");
	if (!text) continue;
	const key = block.id ?? "header";
	byId.set(key, { name: block.name, text });
}

const md = [
	"# 补丁注释存档（从 core.js 迁移）",
	"",
	"`patches/*.json` 不能写注释，这里保留重构前散落在补丁表里的 `//` 说明。",
	"每条对应一个补丁 id；`表头` 是数组声明之前的公共说明。",
	"",
];
for (const [id, { name, text }] of byId) {
	md.push(`## ${id === "header" ? "表头" : `#${id} ${name}`}`, "", "```", text, "```", "");
}
writeFileSync(path.join(OUT_DIR, "NOTES.md"), `${md.join("\n").trimEnd()}\n`, "utf8");
console.log(`NOTES.md  blocks=${byId.size}`);

