/**
 * 补丁表的序列化编解码（运行时与脚本共用）。
 *
 * 表里有 8 个 RegExp 型 pattern（引擎用 `pattern instanceof RegExp` 判定），
 * 直接 JSON.stringify 会变成 `{}` 丢值。这里统一编码为
 * `{ "regex": "<source>", "flags": "<flags>" }`，载入时再还原成 RegExp。
 */

const REGEX_KEYS = new Set(["regex", "flags"]);

export function assertSupported(value, path = "$") {
	const t = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
	if (t === "null" || t === "string" || t === "number" || t === "boolean") return;
	if (t === "object" && value instanceof RegExp) return;
	if (t === "array") {
		value.forEach((v, i) => assertSupported(v, `${path}[${i}]`));
		return;
	}
	if (t === "object") {
		if (value instanceof Map || value instanceof Set || value instanceof Date || Buffer.isBuffer(value)) {
			throw new Error(`不可序列化类型 ${value.constructor?.name} @ ${path}`);
		}
		for (const [k, v] of Object.entries(value)) assertSupported(v, `${path}.${k}`);
		return;
	}
	throw new Error(`不可序列化类型 ${t} @ ${path}`);
}

export function encode(value) {
	assertSupported(value);
	if (value instanceof RegExp) return { regex: value.source, flags: value.flags };
	if (Array.isArray(value)) return value.map(encode);
	if (value && typeof value === "object") {
		const out = {};
		for (const [k, v] of Object.entries(value)) out[k] = encode(v);
		return out;
	}
	return value;
}

export function isEncodedRegex(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const keys = Object.keys(value);
	return keys.length > 0 && keys.every((k) => REGEX_KEYS.has(k)) && typeof value.regex === "string";
}

export function decode(value) {
	if (isEncodedRegex(value)) return new RegExp(value.regex, value.flags || "");
	if (Array.isArray(value)) return value.map(decode);
	if (value && typeof value === "object") {
		const out = {};
		for (const [k, v] of Object.entries(value)) out[k] = decode(v);
		return out;
	}
	return value;
}

/** RegExp 感知的深比较；数组顺序敏感（补丁顺序即应用顺序）。 */
export function deepEqual(a, b) {
	if (a instanceof RegExp || b instanceof RegExp) {
		return a instanceof RegExp && b instanceof RegExp && a.source === b.source && a.flags === b.flags;
	}
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
		return a.every((v, i) => deepEqual(v, b[i]));
	}
	if (a && b && typeof a === "object" && typeof b === "object") {
		const ka = Object.keys(a);
		const kb = Object.keys(b);
		if (ka.length !== kb.length) return false;
		return ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
	}
	return a === b;
}

/** 描述第一个差异的位置，便于验收失败时定位。 */
export function firstDiff(a, b, path = "$") {
	if (deepEqual(a, b)) return null;
	if (a instanceof RegExp || b instanceof RegExp) return `${path}: ${String(a)} != ${String(b)}`;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return `${path}: length ${a.length} != ${b.length}`;
		for (let i = 0; i < a.length; i += 1) {
			const d = firstDiff(a[i], b[i], `${path}[${i}]`);
			if (d) return d;
		}
		return `${path}: unknown diff`;
	}
	if (a && b && typeof a === "object" && typeof b === "object") {
		for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
			const d = firstDiff(a[k], b[k], `${path}.${k}`);
			if (d) return d;
		}
		return `${path}: unknown diff`;
	}
	return `${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`;
}
