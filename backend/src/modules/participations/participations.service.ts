import { AppError } from "../../common/errors/AppError.js";
import { toPagination } from "../../common/utils/pagination.js";
import { ParticipationsRepository } from "./participations.repository.js";
import type { CreateParticipationInput } from "./participations.schema.js";

export class ParticipationsService {
  constructor(private readonly repository = new ParticipationsRepository()) {}

  async create(userId: string, postId: string, input: CreateParticipationInput) {
    const post = await this.repository.findPost(postId);
    if (!post || post.deletedAt)
      throw new AppError("POST_NOT_FOUND", "모집글을 찾을 수 없습니다.", 404);
    if (post.writerId === userId)
      throw new AppError(
        "SELF_PARTICIPATION_NOT_ALLOWED",
        "자신의 모집에는 참여할 수 없습니다.",
        400
      );
    if (post.status !== "OPEN" || post.remainCount < input.quantity)
      throw new AppError(
        "PARTICIPATION_SOLD_OUT",
        "남은 수량이 부족하거나 마감된 모집입니다.",
        409
      );
    if (await this.repository.findForUser(userId, postId))
      throw new AppError("PARTICIPATION_ALREADY_EXISTS", "이미 참여한 모집입니다.", 409);
    return this.repository.createAndReserve(userId, postId, input.quantity, input.pickupStore);
  }

  async cancel(userId: string, id: string) {
    const participation = await this.repository.find(id);
    if (!participation)
      throw new AppError("PARTICIPATION_NOT_FOUND", "참여 기록을 찾을 수 없습니다.", 404);
    if (participation.userId !== userId)
      throw new AppError("PARTICIPATION_FORBIDDEN", "참여를 취소할 권한이 없습니다.", 403);
    if (participation.status === "CANCELLED") return participation;
    if (participation.post.status !== "OPEN")
      throw new AppError(
        "PARTICIPATION_CANCELLATION_CLOSED",
        "마감된 모집의 참여는 취소할 수 없습니다.",
        409
      );
    return this.repository.cancelAndRestore(id, participation.quantity, participation.postId);
  }

  async list(userId: string, page: number, limit: number) {
    const result = await this.repository.list(userId, page, limit);
    return { items: result.items, pagination: toPagination(page, limit, result.total) };
  }
}
