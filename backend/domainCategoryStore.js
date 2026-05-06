import fs from "fs/promises";

async function readJsonFile(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
    return fallback;
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(filePath, obj) {
  const tmp = `${filePath}.tmp`;
  const data = JSON.stringify(obj, null, 2) + "\n";
  await fs.writeFile(tmp, data, "utf-8");
  await fs.rename(tmp, filePath);
}

export function normDomain(domain) {
  return String(domain || "").trim().toLowerCase().replace(/^www\./, "");
}

/**
 * Persistent domain -> rollup category (your 13 buckets).
 * Seeded via domain-categories.json; may grow when high-confidence Whois mappings are learned.
 */
export async function createDomainCategoryStore({ storePath, legacyLearnedPath }) {
  let map = await readJsonFile(storePath, {});

  if (legacyLearnedPath) {
    const learned = await readJsonFile(legacyLearnedPath, null);
    if (learned && typeof learned === "object") {
      let changed = false;
      for (const [k, v] of Object.entries(learned)) {
        const dk = normDomain(k);
        const cat = String(v || "").trim().toLowerCase();
        if (!dk || !cat) continue;
        if (!map[dk]) {
          map[dk] = cat;
          changed = true;
        }
      }
      if (changed) await writeJsonAtomic(storePath, map);
    }
  }

  let saveTimer = null;
  function persistSoon() {
    if (saveTimer) return;
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      await writeJsonAtomic(storePath, map);
    }, 750);
  }

  function get(domain) {
    const key = normDomain(domain);
    if (!key) return null;
    return map[key] || null;
  }

  /**
   * Only persist externally-verified mappings (e.g., high-confidence Whois).
   */
  function setVerified(domain, category) {
    const key = normDomain(domain);
    const cat = String(category || "").trim().toLowerCase();
    if (!key || !cat) return false;
    if (map[key] === cat) return false;
    map[key] = cat;
    persistSoon();
    return true;
  }

  return { get, setVerified, raw: () => ({ ...map }) };
}
