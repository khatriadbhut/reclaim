#!/usr/bin/env node
/**
 * Regenerates whoisXmlIdRollup.json from the public WhoisXML v3 taxonomy.
 * Run: node backend/scripts/build-whois-rollup-map.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { classifyTaxonomyName } from "../whoisXmlTaxonomyClassify.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const res = await fetch("https://website-categorization.whoisxmlapi.com/api/v3/categories?outputFormat=JSON&order=ID");
  if (!res.ok) throw new Error(`taxonomy fetch ${res.status}`);
  const cats = await res.json();
  const out = {};
  for (const { id, name } of cats) {
    out[id] = id === 0 ? null : classifyTaxonomyName(name);
  }
  const outPath = path.join(__dirname, "..", "whoisXmlIdRollup.json");
  fs.writeFileSync(outPath, JSON.stringify(out), "utf8");
  const counts = {};
  for (const v of Object.values(out)) {
    const k = v == null ? "null" : v;
    counts[k] = (counts[k] || 0) + 1;
  }
  console.log("wrote", outPath, "distribution:", counts);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
