import { AppError } from "../../common/errors/AppError.js";
import { toPagination } from "../../common/utils/pagination.js";
import { FavoritesRepository } from "./favorites.repository.js";

export class FavoritesService {
  constructor(private readonly repository = new FavoritesRepository()) {}
  async add(userId: string, postId: string) {
    const post = await this.repository.findPost(postId);
    if (!post || post.deletedAt)
      throw new AppError("POST_NOT_FOUND", "모집글을 찾을 수 없습니다.", 404);
    return this.repository.add(userId, postId);
  }
  remove(userId: string, postId: string) {
    return this.repository.remove(userId, postId);
  }
  async list(userId: string, page: number, limit: number) {
    const result = await this.repository.list(userId, page, limit);
    return { items: result.items, pagination: toPagination(page, limit, result.total) };
  }
}
