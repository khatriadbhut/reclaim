/**
 * Contract check: DATA_CATEGORIES[].exportColumns (dashboard) vs CUSTOM_CATEGORY_EXPORT_COLUMNS (server).
 * Run from repo root: node backend/scripts/verify-export-columns.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const dashPath = path.join(repoRoot, "dashboard/src/pages/CompanyDashboard.jsx");
const serverPath = path.join(__dirname, "..", "server.js");

const dash = fs.readFileSync(dashPath, "utf8");
const server = fs.readFileSync(serverPath, "utf8");

function extractDashboardExportColumns() {
  const out = [];
  const re = /id:\s*"([^"]+)"[\s\S]*?exportColumns:\s*\[([\s\S]*?)\],\s*\n    description:/g;
  let m;
  while ((m = re.exec(dash)) !== null) {
    const id = m[1];
    const cols = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    out.push({ id, cols });
  }
  return out;
}

function extractBracketStringArrays(objText, keys) {
  const start = objText.indexOf("{");
  const body = objText.slice(start);
  const result = {};
  for (const key of keys) {
    const needle = `${key}:`;
    const idx = body.indexOf(needle);
    if (idx < 0) throw new Error(`server: missing key ${key}`);
    const rest = body.slice(idx + needle.length).trimStart();
    if (!rest.startsWith("[")) throw new Error(`server: ${key} not an array`);
    let depth = 0;
    let end = -1;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === "[") depth++;
      else if (rest[i] === "]") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) throw new Error(`server: unclosed array ${key}`);
    const inner = rest.slice(1, end);
    result[key] = [...inner.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  }
  return result;
}

const serverBlockMatch = server.match(/const CUSTOM_CATEGORY_EXPORT_COLUMNS = (\{[\s\S]*?\n\});\n/);
if (!serverBlockMatch) {
  console.error("Could not find CUSTOM_CATEGORY_EXPORT_COLUMNS in server.js");
  process.exit(1);
}

const keys = [
  "demographics",
  "browsing_behavior",
  "purchase_intent",
  "brand_affinity",
  "content_signals",
  "temporal_patterns",
  "ecommerce_signals",
  "finance_signals",
  "tech_affinity",
  "audience_segments",
];

const srv = extractBracketStringArrays(serverBlockMatch[1], keys);
const dashCats = extractDashboardExportColumns();

if (dashCats.length !== keys.length) {
  console.error(`Expected ${keys.length} categories in dashboard, got ${dashCats.length}`);
  process.exit(1);
}

let ok = true;
for (const { id, cols } of dashCats) {
  const a = cols.join("\n");
  const b = (srv[id] || []).join("\n");
  if (a !== b) {
    console.error(`Mismatch: ${id}\n--- dashboard (${cols.length})\n${cols.join(", ")}\n--- server (${(srv[id] || []).length})\n${(srv[id] || []).join(", ")}\n`);
    ok = false;
  }
}

if (ok) console.log("exportColumns: dashboard ↔ server OK");
process.exit(ok ? 0 : 1);
