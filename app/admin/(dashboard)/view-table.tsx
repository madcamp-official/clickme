import styles from "./dashboard.module.css";
import { formatDateTime, formatNumber } from "./format";

function isDateKey(key: string): boolean {
  return key.endsWith("_at") || key.endsWith("_date");
}

function formatCell(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (isDateKey(key)) return formatDateTime(String(value));
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function ViewTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (rows.length === 0) return <p className={styles.empty}>데이터가 없습니다.</p>;
  const columns = Object.keys(rows[0]);

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td key={column}>{formatCell(column, row[column])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
