import fs from "fs/promises";

function normalizeLabel(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parseTsv(content) {
  const lines = content.split("\n").map((l) => l.replace(/\r$/, ""));
  // File starts with 2 title rows; row 3 is header; data begins row 4 (1-based in viewer)
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (i <= 2) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const id = parts[0]?.trim();
    const parent = parts[1]?.trim() || null;
    const name = parts[2]?.trim();
    if (!id || !name) continue;
    const tier1 = parts[3]?.trim() || null;
    const tier2 = parts[4]?.trim() || null;
    const tier3 = parts[5]?.trim() || null;
    const tier4 = parts[6]?.trim() || null;
    rows.push({ id, parent, name, tier1, tier2, tier3, tier4 });
  }
  return rows;
}

export async function loadIabContentTaxonomyV3(tsvPath) {
  const raw = await fs.readFile(tsvPath, "utf-8");
  const rows = parseTsv(raw);
  const byId = new Map();
  const exactNameToIds = new Map();

  for (const r of rows) {
    byId.set(r.id, r);
    const key = normalizeLabel(r.name);
    if (!key) continue;
    if (!exactNameToIds.has(key)) exactNameToIds.set(key, []);
    exactNameToIds.get(key).push(r.id);
  }

  function lookupExactName(name) {
    const key = normalizeLabel(name);
    if (!key) return null;
    const ids = exactNameToIds.get(key) || [];
    if (ids.length === 1) return byId.get(ids[0]) || null;
    if (ids.length > 1) return null;
    return null;
  }

  return {
    version: "3.0",
    byId,
    lookupExactName,
    normalizeLabel,
  };
}
