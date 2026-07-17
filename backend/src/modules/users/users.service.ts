import { AppError } from "../../common/errors/AppError.js";
import { toPagination } from "../../common/utils/pagination.js";
import { UsersRepository } from "./users.repository.js";

export class UsersService {
  constructor(private readonly repository = new UsersRepository()) {}

  async get(id: string) {
    const user = await this.repository.findPublic(id);
    if (!user) throw new AppError("USER_NOT_FOUND", "사용자를 찾을 수 없습니다.", 404);
    return user;
  }

  async updateNickname(userId: string, nickname: string) {
    const duplicate = await this.repository.findNickname(nickname);
    if (duplicate && duplicate.id !== userId) {
      throw new AppError("NICKNAME_ALREADY_EXISTS", "이미 사용 중인 닉네임입니다.", 409);
    }
    return this.repository.updateNickname(userId, nickname);
  }

  async posts(userId: string, page: number, limit: number) {
    await this.get(userId);
    const result = await this.repository.posts(userId, page, limit);
    return { items: result.items, pagination: toPagination(page, limit, result.total) };
  }

  async reviews(userId: string, page: number, limit: number) {
    await this.get(userId);
    const result = await this.repository.reviews(userId, page, limit);
    return { items: result.items, pagination: toPagination(page, limit, result.total) };
  }
}
