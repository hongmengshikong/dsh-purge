import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/** 重建 hosts/index.json：宿主版本 ↔ 插件版本 双向索引。 */
export function writeHostIndex(root) {
	const hostsDir = path.join(root, "hosts");
	if (!existsSync(hostsDir)) return null;
	const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
	const hosts = {};
	for (const name of readdirSync(hostsDir).sort()) {
		const mf = path.join(hostsDir, name, "manifest.json");
		if (!existsSync(mf)) continue;
		const m = JSON.parse(readFileSync(mf, "utf8"));
		hosts[m.hostVersion] = {
			manifest: `hosts/${m.hostVersion}/manifest.json`,
			pluginVersion: m.hostVersion === pkg.dshTarget ? pkg.version : null,
			dshTarget: m.hostVersion === pkg.dshTarget ? pkg.dshTarget : null,
			pinned: m.hostVersion === pkg.dshTarget,
			files: m.counts?.files ?? m.files?.length ?? 0,
			bytes: m.counts?.bytes ?? 0,
			source: m.source || "local-install",
			capturedAt: m.capturedAt || "",
		};
	}
	const index = {
		schema: "dsh-purge/host-index@1",
		note: "正查：宿主版本 → 插件版本；反查：pluginVersion/dshTarget 相同的条目。只有 pinned=true 的那条是当前发版目标。",
		hosts,
	};
	writeFileSync(path.join(hostsDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");
	return index;
}
