#!/usr/bin/env node
/** 重建 hosts/index.json（版本号变更后调用）。 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeHostIndex } from "./lib/host-index.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const index = writeHostIndex(ROOT);
console.log(JSON.stringify(index, null, 2));
