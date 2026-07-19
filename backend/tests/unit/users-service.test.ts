import { readdir, rm } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UsersRepository } from "../../src/modules/users/users.repository.js";
import { UsersService } from "../../src/modules/users/users.service.js";

const uploadRoot = "/tmp/wish-match-test-uploads";
const publicUser = {
  id: "user-1",
  nickname: "위시메이트",
  profileImage: null,
  rating: 0,
  reviewCount: 0,
  createdAt: new Date()
};

afterEach(async () => {
  await rm(uploadRoot, { recursive: true, force: true });
});

describe("UsersService profile image", () => {
  it("rejects base64 data whose file signature does not match the declared image type", async () => {
    const repository = {
      findPublic: vi.fn().mockResolvedValue(publicUser)
    } as unknown as UsersRepository;

    await expect(
      new UsersService(repository).updateProfileImage(
        "user-1",
        "data:image/jpeg;base64,bm90IGFuIGltYWdl"
      )
    ).rejects.toMatchObject({ code: "INVALID_PROFILE_IMAGE" });
  });

  it("stores a validated image under a unique public URL and removes it on reset", async () => {
    let storedUrl: string | null = null;
    const findPublic = vi.fn().mockImplementation(() =>
      Promise.resolve({ ...publicUser, profileImage: storedUrl })
    );
    const updateProfileImage = vi.fn().mockImplementation((_id: string, profileImage: string | null) => {
      storedUrl = profileImage;
      return Promise.resolve({ ...publicUser, profileImage });
    });
    const repository = { findPublic, updateProfileImage } as unknown as UsersRepository;
    const service = new UsersService(repository);

    const uploaded = await service.updateProfileImage(
      "user-1",
      `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64")}`
    );
    expect(uploaded.profileImage).toMatch(
      /^http:\/\/localhost:4000\/api\/v1\/uploads\/profiles\/user-1-[\w-]+\.jpg$/
    );
    expect(await readdir(`${uploadRoot}/profiles`)).toHaveLength(1);

    const reset = await service.removeProfileImage("user-1");
    expect(reset.profileImage).toBeNull();
    expect(await readdir(`${uploadRoot}/profiles`)).toHaveLength(0);
  });
});
