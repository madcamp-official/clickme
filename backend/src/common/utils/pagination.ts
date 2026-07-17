import type { Pagination } from "../types/api.js";

export const toPagination = (page: number, limit: number, total: number): Pagination => {
  const totalPages = Math.ceil(total / limit);
  return { page, limit, total, totalPages, hasNext: page < totalPages };
};
