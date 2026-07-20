import type { ColumnDef } from "./analytics/columns";
import styles from "./dashboard.module.css";
import { formatDateOnly, formatDateTime, formatNumber } from "./format";

function formatCell(column: ColumnDef, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (column.boolLabels) return value ? column.boolLabels[0] : column.boolLabels[1];
  if (column.percent && typeof value === "number") return `${(value * 100).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;
  if (column.key.endsWith("_date")) return formatDateOnly(String(value));
  if (column.key.endsWith("_at")) return formatDateTime(String(value));
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function ViewTable({ rows, columns }: { rows: Array<Record<string, unknown>>; columns: ColumnDef[] }) {
  if (rows.length === 0) return <p className={styles.empty}>데이터가 없습니다.</p>;

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td key={column.key}>{formatCell(column, row[column.key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
