#!/usr/bin/env node
/**
 * 从 npm 拉取某个宿主版本的最小文件集，生成 hosts/<version>/ 快照。
 *
 * 只下「被补丁命中」的文件（默认沿用本机已抓快照的 rel 列表），不整包落盘。
 * @deepseek-ai/* 版本 = 目标宿主版本；其余包（如 @earendil-works/pi-ai）按源快照记录的版本取。
 *
 * 用法：
 *   node scripts/host-fetch.mjs --version 0.2.1-rc.5 [--from 0.2.2-rc.1] [--concurrency 6]
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeHostIndex } from "./lib/host-index.mjs";
import { stableCapturedAt } from "./lib/manifest-stamp.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (name, fallback) => {
	const i = process.argv.indexOf(name);
	return i > -1 ? process.argv[i + 1] : fallback;
};
const version = arg("--version", "");
if (!version) {
	console.error("用法：node scripts/host-fetch.mjs --version 0.2.1-rc.5");
	process.exit(2);
}
const hostsDir = path.join(ROOT, "hosts");
const sourceHost = arg("--from", readdirSync(hostsDir).filter((d) => existsSync(path.join(hostsDir, d, "manifest.json"))).sort().pop());
const sourceManifest = JSON.parse(readFileSync(path.join(hostsDir, sourceHost, "manifest.json"), "utf8"));
const concurrency = Number(arg("--concurrency", "6")) || 6;

const pkgOf = (rel) => {
	const parts = rel.split("/");
	return parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
};
const innerOf = (rel, pkg) => rel.slice(pkg.length + 1);

// pkg -> [{key, inner, rel}]
const wanted = new Map();
for (const f of sourceManifest.files) {
	if (f.role !== "host" || !f.rel) continue;
	const pkg = pkgOf(f.rel);
	if (!wanted.has(pkg)) wanted.set(pkg, []);
	wanted.get(pkg).push({ key: f.key, inner: innerOf(f.rel, pkg), rel: f.rel });
}

const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const tmp = mkdtempSync(path.join(tmpdir(), "dsh-host-fetch-"));
const outDir = path.join(hostsDir, version);
const packages = {};
const files = [];
const missing = [];

const tasks = [...wanted.entries()].map(([pkg, items]) => async () => {
	const ver = pkg.startsWith("@deepseek-ai/") ? version : sourceManifest.packages?.[pkg] || "";
	if (!ver) {
		missing.push({ pkg, reason: "no version recorded" });
		return;
	}
	let tgz;
	try {
		const out = execFileSync(npmBin, ["pack", `${pkg}@${ver}`, "--pack-destination", tmp, "--silent"], {
			encoding: "utf8",
			shell: process.platform === "win32",
			stdio: ["ignore", "pipe", "pipe"],
		});
		tgz = path.join(tmp, out.trim().split(/\r?\n/).pop());
	} catch (err) {
		missing.push({ pkg, ver, reason: String(err?.stderr || err?.message || err).slice(0, 200) });
		return;
	}
	const xdir = path.join(tmp, `x-${pkg.replace(/[^\w.-]/g, "_")}-${ver}`);
	mkdirSync(xdir, { recursive: true });
	execFileSync("tar", ["-xzf", tgz, "-C", xdir]);
	packages[pkg] = ver;
	for (const it of items) {
		const src = path.join(xdir, "package", ...it.inner.split("/"));
		if (!existsSync(src)) {
			missing.push({ pkg, ver, inner: it.inner, reason: "file not in tarball" });
			continue;
		}
		const dst = path.join(outDir, "node_modules", ...it.rel.split("/"));
		mkdirSync(path.dirname(dst), { recursive: true });
		copyFileSync(src, dst);
		files.push({
			key: it.key,
			bytes: statSync(dst).size,
			sha256: createHash("sha256").update(readFileSync(dst)).digest("hex"),
			role: "host",
			rel: it.rel,
			abs: null,
		});
	}
});

let cursor = 0;
await Promise.all(
	Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
		while (cursor < tasks.length) {
			const i = cursor++;
			await tasks[i]();
		}
	}),
);
rmSync(tmp, { recursive: true, force: true });

files.sort((a, b) => a.rel.localeCompare(b.rel));
const manifest = {
	schema: "dsh-purge/host-snapshot@1",
	hostVersion: version,
	source: "npm",
	fetchedFrom: sourceHost,
	capturedAt: new Date().toISOString(),
	installRoot: null,
	packages: Object.fromEntries(Object.entries(packages).sort(([a], [b]) => a.localeCompare(b))),
	counts: { files: files.length, host: files.length, external: 0, bytes: files.reduce((n, f) => n + f.bytes, 0) },
	missing,
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
			hostVersion: version,
			out: path.relative(ROOT, outDir),
			packages: Object.keys(packages).length,
			files: files.length,
			bytes: manifest.counts.bytes,
			missing: missing.length,
			missingSample: missing.slice(0, 5),
			pinned: index?.hosts?.[version]?.pinned ?? false,
		},
		null,
		2,
	),
);
process.exit(missing.filter((m) => m.reason !== "file not in tarball").length === 0 ? 0 : 1);


