/**
 * Ensures activation export profile strips search/price/platform lists and banned keys never survive.
 */
import {
  applyExportProfile,
  ACTIVATION_STRIP_KEYS,
  BANNED_FROM_ACTIVATION_ROWS,
} from "../export/exportProfiles.js";

let failed = false;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed = true;
  }
}

const stripSet = new Set(ACTIVATION_STRIP_KEYS);
for (const k of BANNED_FROM_ACTIVATION_ROWS) {
  assert(stripSet.has(k), `BANNED_FROM_ACTIVATION_ROWS includes "${k}" but ACTIVATION_STRIP_KEYS does not — add it`);
}

const dummy = {};
for (const k of ACTIVATION_STRIP_KEYS) {
  dummy[k] = k.endsWith("_hits") || k === "keywords" ? { x: 1 } : "sensitive";
}

const stripped = applyExportProfile([dummy], "activation")[0];
for (const k of ACTIVATION_STRIP_KEYS) {
  assert(!(k in stripped), `activation row should omit "${k}"`);
}

for (const k of BANNED_FROM_ACTIVATION_ROWS) {
  assert(!(k in stripped), `banned key "${k}" still present after activation profile`);
}

if (!failed) console.log("export governance: OK");
process.exit(failed ? 1 : 0);
