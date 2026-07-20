import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/AppError.js";
import { toPagination } from "../../common/utils/pagination.js";
import { PurchaseRequestsRepository } from "./purchase-requests.repository.js";
import type {
  CreatePurchaseRequestInput,
  PurchaseRequestListInput,
  UpdatePurchaseRequestInput
} from "./purchase-requests.schema.js";
import { nctWishEventMenuDisplayName } from "../menus/nct-wish-event-menus.js";

export class PurchaseRequestsService {
  constructor(private readonly repository = new PurchaseRequestsRepository()) {}

  async list(input: PurchaseRequestListInput) {
    const where: Prisma.PurchaseRequestWhereInput = {
      ...(input.status ? { status: input.status } : { status: { not: "CANCELLED" } }),
      ...(input.city ? { city: { equals: input.city, mode: "insensitive" } } : {})
    };
    const result = await this.repository.list(where, input.page, input.limit);
    return { items: result.items, pagination: toPagination(input.page, input.limit, result.total) };
  }

  async get(id: string, actorId: string) {
    const request = await this.repository.find(id);
    if (!request || request.status === "CANCELLED")
      throw new AppError("PURCHASE_REQUEST_NOT_FOUND", "구매 요청을 찾을 수 없습니다.", 404);
    if (request.requesterId === actorId || request.accepterId === actorId) return request;
    const safeRequest: Partial<typeof request> = { ...request };
    delete safeRequest.openChatUrl;
    return safeRequest;
  }

  private async selection(storeId: string, menuId: string) {
    const selection = await this.repository.findSelection(storeId, menuId);
    if (!selection.store) throw new AppError("STORE_NOT_FOUND", "매장을 찾을 수 없습니다.", 404);
    if (!selection.menu)
      throw new AppError("MENU_UNAVAILABLE", "선택한 매장에서 판매하지 않는 메뉴입니다.", 400);
    return selection as {
      store: NonNullable<typeof selection.store>;
      menu: NonNullable<typeof selection.menu>;
    };
  }

  private menuName(menu: { name: string; variant: string }) {
    return nctWishEventMenuDisplayName(menu.name);
  }

  async create(requesterId: string, input: CreatePurchaseRequestInput) {
    const { store, menu } = await this.selection(input.storeId, input.menuId);
    return this.repository.create(requesterId, {
      storeId: store.id,
      menuId: menu.id,
      city: store.region,
      branch: store.name,
      menu: this.menuName(menu),
      quantity: input.quantity,
      desiredTime: input.desiredTime,
      openChatUrl: input.openChatUrl,
      ...(input.note !== undefined ? { note: input.note } : {})
    });
  }

  async update(id: string, requesterId: string, input: UpdatePurchaseRequestInput) {
    const request = await this.repository.find(id);
    if (!request || request.status === "CANCELLED")
      throw new AppError("PURCHASE_REQUEST_NOT_FOUND", "구매 요청을 찾을 수 없습니다.", 404);
    if (request.requesterId !== requesterId)
      throw new AppError("PURCHASE_REQUEST_FORBIDDEN", "요청을 수정할 권한이 없습니다.", 403);
    if (request.status !== "OPEN")
      throw new AppError(
        "PURCHASE_REQUEST_ALREADY_ACCEPTED",
        "수락된 요청은 수정할 수 없습니다.",
        409
      );
    const selection =
      input.storeId && input.menuId ? await this.selection(input.storeId, input.menuId) : null;
    const data = Object.fromEntries(
      Object.entries(input).filter(
        ([key, value]) => key !== "storeId" && key !== "menuId" && value !== undefined
      )
    ) as Prisma.PurchaseRequestUncheckedUpdateManyInput;
    if (selection) {
      data.storeId = selection.store.id;
      data.menuId = selection.menu.id;
      data.city = selection.store.region;
      data.branch = selection.store.name;
      data.menu = this.menuName(selection.menu);
    }
    return this.repository.updateOpen(id, requesterId, data);
  }

  async accept(id: string, userId: string) {
    const request = await this.repository.find(id);
    if (!request || request.status === "CANCELLED")
      throw new AppError("PURCHASE_REQUEST_NOT_FOUND", "구매 요청을 찾을 수 없습니다.", 404);
    if (request.requesterId === userId)
      throw new AppError("SELF_ACCEPT_NOT_ALLOWED", "자신의 요청은 수락할 수 없습니다.", 400);
    if (request.status !== "OPEN")
      throw new AppError(
        "PURCHASE_REQUEST_ALREADY_ACCEPTED",
        "이미 수락되었거나 마감된 요청입니다.",
        409
      );
    return this.repository.accept(id, userId);
  }

  async cancel(id: string, userId: string) {
    const request = await this.repository.find(id);
    if (!request || request.status === "CANCELLED")
      throw new AppError("PURCHASE_REQUEST_NOT_FOUND", "구매 요청을 찾을 수 없습니다.", 404);
    if (request.requesterId !== userId)
      throw new AppError("PURCHASE_REQUEST_FORBIDDEN", "요청을 취소할 권한이 없습니다.", 403);
    if (request.status === "ACCEPTED")
      throw new AppError(
        "PURCHASE_REQUEST_ALREADY_ACCEPTED",
        "수락된 요청은 취소할 수 없습니다.",
        409
      );
    return this.repository.setStatus(id, "CANCELLED");
  }
}
