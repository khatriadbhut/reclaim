import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exportRowFloor, checkExportAllowed } from "./governance.js";
import { distributionShrinkLambda } from "./shrinkage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SCHEMA_VERSION = 2;

let templateCache = null;

function loadTemplate() {
  if (templateCache) return templateCache;
  const p = path.join(__dirname, "..", "data-label-template.json");
  templateCache = JSON.parse(fs.readFileSync(p, "utf8"));
  return templateCache;
}

/**
 * Machine-readable disclosure payload (Data Label–style) attached to JSON exports.
 */
export function buildExportDataLabel({
  purchase,
  rows,
  panelUniverseSize,
  exportColumns = null,
}) {
  const base = loadTemplate();
  const floor = exportRowFloor();
  const floorCheck = checkExportAllowed(rows?.length ?? 0);
  const label = {
    ...base,
    provider: {
      ...base.provider,
      name: base.provider?.name || "Reclaim",
      domain: process.env.RECLAIM_PROVIDER_DOMAIN || base.provider?.domain || null,
      contact: process.env.RECLAIM_PROVIDER_CONTACT || base.provider?.contact || null,
    },
    segment_disclosure: {
      ...base.segment_disclosure,
      criteria_summary: purchase?.isCustom
        ? `custom_modules:${(purchase.categoryIds || []).join(",")}`
        : `curated_package:${purchase?.packageId || "unknown"}`,
      collection_window: "user_history_as_synced_server_side",
    },
    quality_governance: {
      ...base.quality_governance,
      min_export_rows_enforced: floor,
      min_export_rows_satisfied: floorCheck.ok,
      panel_universe_size: panelUniverseSize ?? null,
      distribution_shrinkage_lambda: distributionShrinkLambda(),
      schema_version: SCHEMA_VERSION,
      export_row_count: rows?.length ?? 0,
      generated_at: new Date().toISOString(),
    },
    export_manifest: {
      schema_version: SCHEMA_VERSION,
      ...(exportColumns?.length ? { column_list: exportColumns } : {}),
    },
  };
  return label;
}

export function getSchemaVersion() {
  return SCHEMA_VERSION;
}
