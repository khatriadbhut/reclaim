import fs from "fs/promises";
import crypto from "crypto";

async function readJson(path, fallback) {
  try {
    const raw = await fs.readFile(path, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
    return fallback;
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(path, obj) {
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(obj, null, 2) + "\n", "utf-8");
  await fs.rename(tmp, path);
}

function hashKey(key) {
  return crypto.createHash("sha256").update(String(key)).digest("hex").slice(0, 16);
}

export async function createApiUsageStore({ storePath, defaultLimit = 100 }) {
  const state = await readJson(storePath, { keys: {} });
  let saveTimer = null;
  function persistSoon() {
    if (saveTimer) return;
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      await writeJsonAtomic(storePath, state);
    }, 500);
  }

  function ensure(key, limit = defaultLimit) {
    const k = hashKey(key);
    if (!state.keys[k]) {
      state.keys[k] = {
        used: 0,
        limit: Number.isFinite(limit) ? limit : defaultLimit,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
      };
      persistSoon();
    }
    return { keyId: k, rec: state.keys[k] };
  }

  function canUse(key, limit = defaultLimit) {
    const { rec } = ensure(key, limit);
    return rec.used < rec.limit;
  }

  function increment(key, limit = defaultLimit) {
    const { rec } = ensure(key, limit);
    rec.used += 1;
    rec.limit = Number.isFinite(limit) ? limit : rec.limit;
    rec.lastUsedAt = new Date().toISOString();
    persistSoon();
    return { used: rec.used, limit: rec.limit, remaining: Math.max(0, rec.limit - rec.used) };
  }

  function status(key, limit = defaultLimit) {
    const { keyId, rec } = ensure(key, limit);
    return { keyId, used: rec.used, limit: rec.limit, remaining: Math.max(0, rec.limit - rec.used), lastUsedAt: rec.lastUsedAt };
  }

  return { canUse, increment, status };
}
