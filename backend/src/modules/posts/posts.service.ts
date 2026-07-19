import type { Prisma, UserRole } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/AppError.js";
import { toPagination } from "../../common/utils/pagination.js";
import {
  ManagedImageStorage,
  type ImageStorage
} from "../../common/utils/managedImageStorage.js";
import { EventsRepository } from "../events/events.repository.js";
import { StoresRepository } from "../stores/stores.repository.js";
import { PostsRepository } from "./posts.repository.js";
import type { CreatePostInput, PostListInput, UpdatePostInput } from "./posts.schema.js";

interface Actor {
  userId: string;
  role: UserRole;
}

const defaultPostImages = new ManagedImageStorage({
  directory: "posts",
  maxBytes: 320_000,
  invalidCode: "INVALID_POST_IMAGE",
  uploadFailedCode: "POST_IMAGE_UPLOAD_FAILED",
  invalidMessage: "JPG, PNG, WEBP 형식의 올바른 사진을 선택해주세요.",
  uploadFailedMessage: "대표 사진을 저장하지 못했습니다."
});

export class PostsService {
  constructor(
    private readonly repository = new PostsRepository(),
    private readonly stores = new StoresRepository(),
    private readonly events = new EventsRepository(),
    private readonly images: ImageStorage = defaultPostImages
  ) {}

  async list(input: PostListInput) {
    const where: Prisma.PostWhereInput = {
      deletedAt: null,
      ...(input.status ? { status: input.status } : {}),
      ...(input.storeId ? { storeId: input.storeId } : {}),
      ...(input.eventId ? { eventId: input.eventId } : {}),
      ...(input.minRemainCount !== undefined ? { remainCount: { gte: input.minRemainCount } } : {}),
      ...(input.minDiscount !== undefined || input.maxDiscount !== undefined
        ? {
            discount: {
              ...(input.minDiscount !== undefined ? { gte: input.minDiscount } : {}),
              ...(input.maxDiscount !== undefined ? { lte: input.maxDiscount } : {})
            }
          }
        : {}),
      ...(input.meetingFrom || input.meetingTo
        ? {
            meetingTime: {
              ...(input.meetingFrom ? { gte: input.meetingFrom } : {}),
              ...(input.meetingTo ? { lte: input.meetingTo } : {})
            }
          }
        : {}),
      ...(input.region || input.storeName
        ? {
            store: {
              ...(input.region ? { region: { equals: input.region, mode: "insensitive" } } : {}),
              ...(input.storeName
                ? { name: { contains: input.storeName, mode: "insensitive" } }
                : {})
            }
          }
        : {})
    };
    const orderByMap: Record<PostListInput["sort"], Prisma.PostOrderByWithRelationInput> = {
      latest: { createdAt: "desc" },
      meetingSoon: { meetingTime: "asc" },
      discountHigh: { discount: "desc" },
      remainLow: { remainCount: "asc" }
    };
    const orderBy = orderByMap[input.sort];
    const result = await this.repository.list(where, orderBy, input.page, input.limit);
    return { items: result.items, pagination: toPagination(input.page, input.limit, result.total) };
  }

  async get(id: string, actor?: Actor) {
    const post = await this.repository.find(id);
    if (!post || post.deletedAt)
      throw new AppError("POST_NOT_FOUND", "모집글을 찾을 수 없습니다.", 404);
    const maySeeChat =
      Boolean(actor) &&
      (post.status === "OPEN" || actor?.userId === post.writerId || actor?.role === "ADMIN");
    if (maySeeChat) return post;
    const safePost: Partial<typeof post> = { ...post };
    delete safePost.openChatUrl;
    return safePost;
  }

  private async assertRelations(storeId: string, eventId?: string | null): Promise<void> {
    if (!(await this.stores.find(storeId)))
      throw new AppError("STORE_NOT_FOUND", "매장을 찾을 수 없습니다.", 404);
    if (eventId && !(await this.events.find(eventId)))
      throw new AppError("EVENT_NOT_FOUND", "이벤트를 찾을 수 없습니다.", 404);
  }

  async create(writerId: string, input: CreatePostInput) {
    if (input.meetingTime <= new Date())
      throw new AppError("INVALID_MEETING_TIME", "모임 시간은 미래여야 합니다.", 400);
    if (input.availableUntil && input.availableUntil <= input.meetingTime)
      throw new AppError(
        "INVALID_MEETING_TIME",
        "가능 종료 시간은 시작 시간보다 늦어야 합니다.",
        400
      );
    await this.assertRelations(input.storeId, input.eventId);
    const uploadedImageUrl = input.imageData ? await this.images.save(input.imageData) : undefined;
    const data: Prisma.PostUncheckedCreateInput = {
      writerId,
      storeId: input.storeId,
      discount: input.discount,
      totalCount: input.totalCount,
      remainCount: input.remainCount,
      meetingTime: input.meetingTime,
      ...(input.availableUntil !== undefined ? { availableUntil: input.availableUntil } : {}),
      meetingPlace: input.meetingPlace,
      openChatUrl: input.openChatUrl,
      status: input.remainCount === 0 ? "CLOSED" : "OPEN",
      ...(input.eventId !== undefined ? { eventId: input.eventId } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(uploadedImageUrl !== undefined
        ? { imageUrl: uploadedImageUrl }
        : input.imageUrl !== undefined
          ? { imageUrl: input.imageUrl }
          : {}),
      ...(input.remainCount === 0 ? { closedAt: new Date() } : {})
    };
    try {
      return await this.repository.create(data);
    } catch (error) {
      if (uploadedImageUrl) await this.images.remove(uploadedImageUrl);
      throw error;
    }
  }

  private async owned(id: string, actor: Actor) {
    const post = await this.repository.find(id);
    if (!post || post.deletedAt)
      throw new AppError("POST_NOT_FOUND", "모집글을 찾을 수 없습니다.", 404);
    if (post.writerId !== actor.userId && actor.role !== "ADMIN") {
      throw new AppError("POST_FORBIDDEN", "모집글을 변경할 권한이 없습니다.", 403);
    }
    return post;
  }

  async update(id: string, actor: Actor, input: UpdatePostInput) {
    const current = await this.owned(id, actor);
    if (input.meetingTime && input.meetingTime <= new Date())
      throw new AppError("INVALID_MEETING_TIME", "모임 시간은 미래여야 합니다.", 400);
    const meetingTime = input.meetingTime ?? current.meetingTime;
    const availableUntil = input.availableUntil ?? current.availableUntil;
    if (availableUntil && availableUntil <= meetingTime)
      throw new AppError(
        "INVALID_MEETING_TIME",
        "가능 종료 시간은 시작 시간보다 늦어야 합니다.",
        400
      );
    const total = input.totalCount ?? current.totalCount;
    const remain = input.remainCount ?? current.remainCount;
    if (remain > total)
      throw new AppError("INVALID_REMAIN_COUNT", "남은 수량은 전체 수량 이하여야 합니다.", 400);
    await this.assertRelations(
      input.storeId ?? current.storeId,
      input.eventId === undefined ? current.eventId : input.eventId
    );
    const uploadedImageUrl = input.imageData ? await this.images.save(input.imageData) : undefined;
    const data = Object.fromEntries(
      Object.entries(input).filter(
        ([key, value]) => key !== "imageData" && value !== undefined
      )
    ) as Prisma.PostUpdateInput;
    if (uploadedImageUrl) data.imageUrl = uploadedImageUrl;
    try {
      const updated = await this.repository.update(id, {
        ...data,
        ...(remain === 0
          ? { status: "CLOSED", closedAt: current.closedAt ?? new Date() }
          : {})
      });
      const nextImageUrl = uploadedImageUrl ?? input.imageUrl;
      if (nextImageUrl !== undefined && nextImageUrl !== current.imageUrl) {
        await this.images.remove(current.imageUrl);
      }
      return updated;
    } catch (error) {
      if (uploadedImageUrl) await this.images.remove(uploadedImageUrl);
      throw error;
    }
  }

  async close(id: string, actor: Actor) {
    const post = await this.owned(id, actor);
    if (post.status === "CLOSED") return post;
    return this.repository.update(id, { status: "CLOSED", closedAt: new Date() });
  }

  async updateRemain(id: string, actor: Actor, remainCount: number) {
    const post = await this.owned(id, actor);
    if (remainCount > post.totalCount)
      throw new AppError("INVALID_REMAIN_COUNT", "남은 수량이 전체 수량보다 많습니다.", 400);
    return this.repository.update(id, {
      remainCount,
      ...(remainCount === 0 ? { status: "CLOSED", closedAt: post.closedAt ?? new Date() } : {})
    });
  }

  async delete(id: string, actor: Actor) {
    const post = await this.owned(id, actor);
    if (post.deletedAt) return;
    await this.repository.update(id, { deletedAt: new Date(), imageUrl: null });
    await this.images.remove(post.imageUrl);
  }
}
