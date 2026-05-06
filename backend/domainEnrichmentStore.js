import fs from "fs/promises";
import { normDomain } from "./domainCategoryStore.js";
 
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
 
/**
 * Persistent domain -> enrichment record (e.g. WhoisXML vendor categories).
 * Goal: once a domain is categorized by a vendor API, reuse it across devices
 * without needing to call the vendor again for the same domain.
 */
export async function createDomainEnrichmentStore({ storePath }) {
  let map = await readJsonFile(storePath, {});
 
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
    const rec = map[key];
    return rec && typeof rec === "object" ? rec : null;
  }
 
  function set(domain, rec) {
    const key = normDomain(domain);
    if (!key || !rec || typeof rec !== "object") return false;
    map[key] = { ...rec, updatedAt: Date.now() };
    persistSoon();
    return true;
  }
 
  return { get, set, raw: () => ({ ...map }) };
}

