export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
}

export const ok = <T>(data: T): { success: true; data: T } => ({ success: true, data });
