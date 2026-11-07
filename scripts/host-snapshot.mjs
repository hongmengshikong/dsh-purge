#!/usr/bin/env node
/**
 * 宿主快照：把「本机安装的 dsh」被补丁命中的文件固化成 hosts/<version>/。
 *
 * 目录结构与真实安装同构，故 patchStatus(fixtureAiBase) 无需改引擎：
 *   hosts/<ver>/node_modules/@deepseek-ai/<pkg>/...
 *   hosts/<ver>/node_modules/@earendil-works/pi-ai/dist/api/...
 *   hosts/<ver>/manifest.json
 *
 * 用法：node scripts/host-snapshot.mjs [--version 0.2.2-rc.1] [--out hosts]
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "../lib/core.js";
import { writeHostIndex } from "./lib/host-index.mjs";
import { stableCapturedAt } from "./lib/manifest-stamp.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (name, fallback) => {
	const i = process.argv.indexOf(name);
	return i > -1 ? process.argv[i + 1] : fallback;
};
const OUT_ROOT = path.resolve(ROOT, arg("--out", "hosts"));

const aiBase = core.findAiBase();
if (!aiBase) {
	console.error("找不到 aiBase，无法抓宿主快照");
	process.exit(2);
}
const installRoot = path.dirname(aiBase); // .../node_modules
const sha256 = (fp) => createHash("sha256").update(readFileSync(fp)).digest("hex");
const pkgVersion = (fp) => {
	try {
		return JSON.parse(readFileSync(fp, "utf8")).version || "";
	} catch {
		return "";
	}
};

const packages = {};
const versionOfPkg = (name) => {
	if (name in packages) return packages[name];
	const fp = path.join(installRoot, ...name.split("/"), "package.json");
	packages[name] = existsSync(fp) ? pkgVersion(fp) : "";
	return packages[name];
};

const dshVersion = versionOfPkg("@deepseek-ai/dsh-base");
if (!dshVersion) {
	console.error(`读不到 @deepseek-ai/dsh-base 版本：${installRoot}`);
	process.exit(2);
}
const want = arg("--version", "");
if (want && want !== dshVersion) {
	console.error(`本机宿主是 ${dshVersion}，与 --version ${want} 不一致；快照按本机实际版本命名。`);
}

const outDir = path.join(OUT_ROOT, dshVersion);
const files = [];
const targetFiles = core.targetFiles(aiBase);

for (const key of Object.keys(targetFiles).sort()) {
	const list = (Array.isArray(targetFiles[key]) ? targetFiles[key] : [targetFiles[key]]).filter(Boolean);
	for (const abs of list) {
		if (!existsSync(abs)) continue;
		const relInstall = path.relative(installRoot, abs);
		const inside = !relInstall.startsWith("..") && !path.isAbsolute(relInstall);
		const row = {
			key,
			bytes: statSync(abs).size,
			sha256: sha256(abs),
			role: inside ? "host" : "external",
			rel: inside ? relInstall.replace(/\\/g, "/") : null,
			abs: inside ? null : abs,
		};
		if (inside) {
			const dst = path.join(outDir, "node_modules", relInstall);
			mkdirSync(path.dirname(dst), { recursive: true });
			copyFileSync(abs, dst);
			const seg = relInstall.split(path.sep);
			const pkg = seg[0].startsWith("@") ? `${seg[0]}/${seg[1]}` : seg[0];
			versionOfPkg(pkg);
		}
		files.push(row);
	}
}

files.sort((a, b) => (a.rel || a.abs || "").localeCompare(b.rel || b.abs || ""));

const manifest = {
	schema: "dsh-purge/host-snapshot@1",
	hostVersion: dshVersion,
	capturedAt: new Date().toISOString(),
	installRoot: "<installRoot>",
	packages: Object.fromEntries(Object.entries(packages).sort(([a], [b]) => a.localeCompare(b))),
	counts: {
		files: files.length,
		host: files.filter((f) => f.role === "host").length,
		external: files.filter((f) => f.role === "external").length,
		bytes: files.reduce((n, f) => n + f.bytes, 0),
	},
	files,
};
mkdirSync(outDir, { recursive: true });
const manifestPath = path.join(outDir, "manifest.json");
manifest.capturedAt = stableCapturedAt(manifestPath, manifest);
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const index = writeHostIndex(ROOT);

console.log(
	JSON.stringify(
		{
			hostVersion: dshVersion,
			out: path.relative(ROOT, outDir),
			counts: manifest.counts,
			packages: Object.keys(packages).length,
			index: "hosts/index.json",
			pinned: index?.hosts?.[dshVersion]?.pinned ?? false,
		},
		null,
		2,
	),
);



