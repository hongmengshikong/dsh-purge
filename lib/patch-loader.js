/**
 * 补丁表载入器：patches/*.json → 运行时数组。
 *
 * 设计要点：
 * - 数据在 JSON 里（可 diff、可 review、可自动生成兼容矩阵），引擎只留逻辑。
 * - 载入即校验（lib/patch-schema.js，零依赖），字段拼写/类型/未知键都会当场报错。
 * - RegExp 型 pattern 以 {regex,flags} 存储，这里还原成 RegExp（引擎靠 instanceof 判定）。
 * - 顺序即应用顺序，不允许在运行期重排。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decode } from "./patch-codec.js";
import { formatErrors, validateSchema } from "./patch-schema.js";

const DATA_DIR = new URL("../patches/", import.meta.url);
const SCHEMA_URL = new URL("patch.schema.json", DATA_DIR);

function readJson(url, label) {
	try {
		return JSON.parse(readFileSync(url, "utf8"));
	} catch (err) {
		throw new Error(`读取 ${label} 失败（${fileURLToPath(url)}）：${err?.message || err}`);
	}
}

const schema = readJson(SCHEMA_URL, "patches/patch.schema.json");

function loadGroup(group, label) {
	const url = new URL(`${group}.json`, DATA_DIR);
	const doc = readJson(url, `patches/${group}.json`);
	const errors = validateSchema(schema, doc);
	if (errors.length > 0) {
		throw new Error(`patches/${group}.json 不符合 patch.schema.json：\n${formatErrors(errors)}`);
	}
	if (doc.group !== group) {
		throw new Error(`patches/${group}.json 的 group 字段是 "${doc.group}"，应为 "${group}"（${label}）`);
	}
	return decode(doc.patches);
}

/** 提示词层（原 PATCHES） */
export const PATCHES = loadGroup("prompt", "PATCHES");
/** 代码层（原 CODE_PATCHES） */
export const CODE_PATCHES = loadGroup("code", "CODE_PATCHES");
/** 引擎/审批层（原 ENGINE_PATCHES） */
export const ENGINE_PATCHES = loadGroup("engine", "ENGINE_PATCHES");
/** 工具层（原 NEW_TOOL_PATCHES） */
export const NEW_TOOL_PATCHES = loadGroup("tools", "NEW_TOOL_PATCHES");

const seen = new Map();
for (const p of [...PATCHES, ...CODE_PATCHES, ...ENGINE_PATCHES, ...NEW_TOOL_PATCHES]) {
	if (seen.has(p.id)) throw new Error(`补丁 id 重复：${p.id}（${seen.get(p.id)} / ${p.name}）`);
	seen.set(p.id, p.name);
}

const displayDoc = readJson(new URL("display-groups.json", DATA_DIR), "patches/display-groups.json");
const groups = displayDoc?.groups;
if (!groups || typeof groups !== "object" || Array.isArray(groups)) {
	throw new Error("patches/display-groups.json 缺少 groups 对象");
}
for (const [key, ids] of Object.entries(groups)) {
	if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== "number")) {
		throw new Error(`display-groups.${key} 必须是非空数字数组`);
	}
	for (const id of ids) {
		if (!seen.has(id)) throw new Error(`display-groups.${key} 引用了不存在的补丁 id ${id}`);
	}
}

/** 展示分组（原 PATCH_DISPLAY_GROUPS） */
export const PATCH_DISPLAY_GROUPS = groups;

/** 数据来源与规模，供状态页/调试输出 */
export const PATCH_DATA_META = Object.freeze({
	dir: fileURLToPath(DATA_DIR),
	schema: fileURLToPath(SCHEMA_URL),
	counts: Object.freeze({
		prompt: PATCHES.length,
		code: CODE_PATCHES.length,
		engine: ENGINE_PATCHES.length,
		tools: NEW_TOOL_PATCHES.length,
		total: seen.size,
	}),
});
