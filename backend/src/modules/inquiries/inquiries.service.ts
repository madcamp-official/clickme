import { toPagination } from "../../common/utils/pagination.js";
import { InquiriesRepository } from "./inquiries.repository.js";
import type { CreateInquiryInput } from "./inquiries.schema.js";

export class InquiriesService {
  constructor(private readonly repository = new InquiriesRepository()) {}

  create(userId: string, input: CreateInquiryInput) {
    return this.repository.create(userId, input.category, input.content);
  }

  async list(userId: string, page: number, limit: number) {
    const result = await this.repository.list(userId, page, limit);
    return { items: result.items, pagination: toPagination(page, limit, result.total) };
  }
}
