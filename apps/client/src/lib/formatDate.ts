/**
 * Long-form batch date — "May 10, 2026". Batch dates appear inside derived
 * labels ("Default · …") and metadata lines; the bare toLocaleDateString()
 * form ("5/10/2026") read as machine output against the editorial type
 * around it.
 */
export function formatBatchDate(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
