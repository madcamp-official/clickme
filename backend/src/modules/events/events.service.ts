import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/AppError.js";
import { toPagination } from "../../common/utils/pagination.js";
import { EventsRepository } from "./events.repository.js";

export class EventsService {
  constructor(private readonly repository = new EventsRepository()) {}
  async list(active: boolean | undefined, page: number, limit: number) {
    const result = await this.repository.list(
      active === undefined ? {} : { isActive: active },
      page,
      limit
    );
    return { items: result.items, pagination: toPagination(page, limit, result.total) };
  }
  async get(id: string) {
    const event = await this.repository.find(id);
    if (!event) throw new AppError("EVENT_NOT_FOUND", "이벤트를 찾을 수 없습니다.", 404);
    return event;
  }
  create(data: Prisma.EventCreateInput) {
    return this.repository.create(data);
  }
  async update(id: string, data: Prisma.EventUpdateInput) {
    const current = await this.get(id);
    const startDate = data.startDate instanceof Date ? data.startDate : current.startDate;
    const endDate = data.endDate instanceof Date ? data.endDate : current.endDate;
    if (startDate >= endDate) {
      throw new AppError("VALIDATION_ERROR", "이벤트 종료일은 시작일보다 늦어야 합니다.", 400);
    }
    return this.repository.update(id, data);
  }
  async delete(id: string) {
    await this.get(id);
    return this.repository.delete(id);
  }
}
