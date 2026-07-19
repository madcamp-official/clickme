import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../../common/errors/AppError.js";
import { toPagination } from "../../common/utils/pagination.js";
import { env } from "../../config/env.js";
import { UsersRepository } from "./users.repository.js";

const profilePath = path.join(env.UPLOAD_DIR, "profiles");
const profilePublicPrefix = `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/api/v1/uploads/profiles/`;

function parseProfileImage(imageData: string): { buffer: Buffer; extension: "jpg" | "png" | "webp" } {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(imageData);
  if (!match) throw new AppError("INVALID_PROFILE_IMAGE", "지원하지 않는 이미지 형식입니다.", 400);
  const mime = match[1] as "jpeg" | "png" | "webp";
  const buffer = Buffer.from(match[2] as string, "base64");
  const valid =
    (mime === "jpeg" && buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) ||
    (mime === "png" && buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
    (mime === "webp" && buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP");
  if (!valid || buffer.length === 0 || buffer.length > 70_000) {
    throw new AppError("INVALID_PROFILE_IMAGE", "이미지 파일을 확인해주세요.", 400);
  }
  return { buffer, extension: mime === "jpeg" ? "jpg" : mime };
}

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

  async updateProfileImage(userId: string, imageData: string) {
    const current = await this.get(userId);
    const image = parseProfileImage(imageData);
    await mkdir(profilePath, { recursive: true, mode: 0o750 });
    const filename = `${userId}-${randomUUID()}.${image.extension}`;
    const filePath = path.join(profilePath, filename);
    try {
      await writeFile(filePath, image.buffer, { flag: "wx", mode: 0o640 });
      const user = await this.repository.updateProfileImage(
        userId,
        `${profilePublicPrefix}${filename}`
      );
      await this.removeManagedProfileImage(current.profileImage);
      return user;
    } catch (error) {
      await rm(filePath, { force: true }).catch(() => undefined);
      if (error instanceof AppError) throw error;
      throw new AppError(
        "PROFILE_IMAGE_UPLOAD_FAILED",
        "프로필 이미지를 저장하지 못했습니다.",
        500
      );
    }
  }

  async removeProfileImage(userId: string) {
    const current = await this.get(userId);
    const user = await this.repository.updateProfileImage(userId, null);
    await this.removeManagedProfileImage(current.profileImage);
    return user;
  }

  private async removeManagedProfileImage(profileImage: string | null): Promise<void> {
    if (!profileImage?.startsWith(profilePublicPrefix)) return;
    const filename = profileImage.slice(profilePublicPrefix.length);
    if (!/^[a-zA-Z0-9_-]+\.(?:jpg|png|webp)$/.test(filename)) return;
    await rm(path.join(profilePath, filename), { force: true }).catch(() => undefined);
  }

  async posts(userId: string, page: number, limit: number) {
    await this.get(userId);
    const result = await this.repository.posts(userId, page, limit);
    return { items: result.items, pagination: toPagination(page, limit, result.total) };
  }

  async myPosts(userId: string, page: number, limit: number) {
    const result = await this.repository.myPosts(userId, page, limit);
    return { items: result.items, pagination: toPagination(page, limit, result.total) };
  }

  async reviews(userId: string, page: number, limit: number) {
    await this.get(userId);
    const result = await this.repository.reviews(userId, page, limit);
    return { items: result.items, pagination: toPagination(page, limit, result.total) };
  }
}
