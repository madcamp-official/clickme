import { access, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { ManagedImageStorage } from "../../src/common/utils/managedImageStorage.js";

const testRoot = path.join(os.tmpdir(), `wish-match-image-test-${randomUUID()}`);
const storage = new ManagedImageStorage({
  directory: "posts",
  maxBytes: 32,
  invalidCode: "INVALID_POST_IMAGE",
  uploadFailedCode: "POST_IMAGE_UPLOAD_FAILED",
  invalidMessage: "invalid",
  uploadFailedMessage: "failed",
  rootDirectory: testRoot,
  publicBaseUrl: "https://wishmatch.test"
});

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

describe("ManagedImageStorage", () => {
  it("writes and removes validated image data", async () => {
    const url = await storage.save("data:image/jpeg;base64,/9j/2Q==");
    const filename = url.split("/").at(-1) as string;
    expect(await readFile(path.join(testRoot, "posts", filename))).toEqual(
      Buffer.from([0xff, 0xd8, 0xff, 0xd9])
    );
    await storage.remove(url);
    await expect(access(path.join(testRoot, "posts", filename))).rejects.toThrow();
  });

  it("rejects a MIME type that does not match the file signature", async () => {
    await expect(storage.save("data:image/png;base64,/9j/2Q==")).rejects.toMatchObject({
      code: "INVALID_POST_IMAGE"
    });
  });
});
