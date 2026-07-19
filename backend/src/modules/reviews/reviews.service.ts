import { AppError } from "../../common/errors/AppError.js";
import { toPagination } from "../../common/utils/pagination.js";
import { ReviewsRepository } from "./reviews.repository.js";

export class ReviewsService {
  constructor(private readonly repository = new ReviewsRepository()) {}
  async create(writerId: string, input: { postId: string; rating: number; content: string }) {
    const post = await this.repository.findPost(input.postId);
    if (!post || post.deletedAt)
      throw new AppError("POST_NOT_FOUND", "모집글을 찾을 수 없습니다.", 404);
    if (post.status !== "CLOSED")
      throw new AppError("POST_NOT_CLOSED", "마감된 글에만 후기를 작성할 수 있습니다.", 400);
    if (post.writerId === writerId)
      throw new AppError(
        "SELF_REVIEW_NOT_ALLOWED",
        "자기 자신에게 후기를 작성할 수 없습니다.",
        400
      );
    const participation = await this.repository.findParticipation(writerId, input.postId);
    if (!participation || participation.status !== "CONFIRMED")
      throw new AppError(
        "PARTICIPATION_REQUIRED",
        "해당 모집에 참여한 사용자만 후기를 작성할 수 있습니다.",
        403
      );
    if (await this.repository.findExisting(writerId, input.postId)) {
      throw new AppError("REVIEW_ALREADY_EXISTS", "이미 후기를 작성했습니다.", 409);
    }
    return this.repository.createAndRecalculate({ ...input, writerId, sellerId: post.writerId });
  }
  async list(userId: string, page: number, limit: number) {
    const result = await this.repository.list(userId, page, limit);
    return { items: result.items, pagination: toPagination(page, limit, result.total) };
  }
  async myReviews(userId: string, page: number, limit: number) {
    const result = await this.repository.listWritten(userId, page, limit);
    return { items: result.items, pagination: toPagination(page, limit, result.total) };
  }
}
