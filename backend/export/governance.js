/**
 * Export floors so small-N slices are not sold as if they were stable segments.
 * Production default 100 when unset; set RECLAIM_MIN_EXPORT_ROWS=0 to disable.
 */

const IS_PROD = String(process.env.NODE_ENV || "").toLowerCase() === "production";

export function exportRowFloor() {
  const raw = process.env.RECLAIM_MIN_EXPORT_ROWS;
  if (raw === undefined || raw === "") {
    return IS_PROD ? 100 : 0;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function checkExportAllowed(rowCount) {
  const min = exportRowFloor();
  if (min <= 0) return { ok: true };
  if (rowCount >= min) return { ok: true };
  return {
    ok: false,
    error: "export_below_minimum_row_floor",
    message:
      "Export withheld: matching row count is below RECLAIM_MIN_EXPORT_ROWS. Larger panel or broader criteria required.",
    min_rows: min,
    row_count: rowCount,
  };
}
