/**
 * 极简 JSON Schema 校验器（零依赖）。
 *
 * 只实现 patches/patch.schema.json 用到的子集：
 *   $ref（文档内）、type（字符串或数组）、required、properties、
 *   additionalProperties(false)、items、enum、const、minLength、minItems、
 *   pattern、anyOf。
 *
 * 之所以自己写而不用 ajv：本插件 `dependencies` 为空是设计约束
 * （宿主直接 import 源码，不跑安装期构建），运行期不能引第三方包。
 */

const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

function resolveRef(root, ref) {
	if (ref === "#") return root;
	if (!ref.startsWith("#/")) throw new Error(`只支持文档内 $ref：${ref}`);
	let node = root;
	for (const raw of ref.slice(2).split("/")) {
		const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
		node = node?.[key];
		if (node === undefined) throw new Error(`$ref 解析失败：${ref}`);
	}
	return node;
}

function checkType(expected, value) {
	const types = Array.isArray(expected) ? expected : [expected];
	return types.some((t) => (t === "integer" ? Number.isInteger(value) : typeOf(value) === t));
}

function validateNode(schema, value, root, path, errors) {
	if (schema === true || schema === undefined) return;
	if (schema === false) {
		errors.push({ path, message: "schema 显式禁止该值" });
		return;
	}
	if (schema.$ref) {
		validateNode(resolveRef(root, schema.$ref), value, root, path, errors);
		return;
	}
	if (schema.anyOf) {
		const matched = schema.anyOf.some((sub) => {
			const local = [];
			validateNode(sub, value, root, path, local);
			return local.length === 0;
		});
		if (!matched) errors.push({ path, message: `anyOf 全部未命中（实际 ${typeOf(value)}）` });
		return;
	}
	if (schema.type && !checkType(schema.type, value)) {
		errors.push({ path, message: `type 期望 ${[].concat(schema.type).join("|")}，实际 ${typeOf(value)}` });
		return;
	}
	if (schema.enum && !schema.enum.includes(value)) {
		errors.push({ path, message: `enum 不含 ${JSON.stringify(value)}` });
	}
	if (Object.hasOwn(schema, "const") && value !== schema.const) {
		errors.push({ path, message: `const 期望 ${JSON.stringify(schema.const)}` });
	}
	if (typeof value === "string") {
		if (schema.minLength !== undefined && value.length < schema.minLength) {
			errors.push({ path, message: `minLength ${schema.minLength}，实际 ${value.length}` });
		}
		if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
			errors.push({ path, message: `pattern ${schema.pattern} 不匹配` });
		}
	}
	if (Array.isArray(value)) {
		if (schema.minItems !== undefined && value.length < schema.minItems) {
			errors.push({ path, message: `minItems ${schema.minItems}，实际 ${value.length}` });
		}
		if (schema.items) value.forEach((item, i) => validateNode(schema.items, item, root, `${path}[${i}]`, errors));
	}
	if (value && typeof value === "object" && !Array.isArray(value)) {
		for (const key of schema.required || []) {
			if (!Object.hasOwn(value, key)) errors.push({ path, message: `缺少必填字段 ${key}` });
		}
		const props = schema.properties || {};
		for (const [key, val] of Object.entries(value)) {
			if (Object.hasOwn(props, key)) validateNode(props[key], val, root, `${path}.${key}`, errors);
			else if (schema.additionalProperties === false) errors.push({ path, message: `未知字段 ${key}` });
		}
	}
}

/** @returns {{path: string, message: string}[]} */
export function validateSchema(schema, value) {
	const errors = [];
	validateNode(schema, value, schema, "$", errors);
	return errors;
}

export function formatErrors(errors, limit = 10) {
	return errors
		.slice(0, limit)
		.map((e) => `${e.path}: ${e.message}`)
		.join("\n");
}
