import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../errors/AppError.js";
import type { ErrorCode } from "../errors/errorCodes.js";
import { env } from "../../config/env.js";

type ImageExtension = "jpg" | "png" | "webp";

interface ManagedImageStorageOptions {
  directory: string;
  maxBytes: number;
  invalidCode: ErrorCode;
  uploadFailedCode: ErrorCode;
  invalidMessage: string;
  uploadFailedMessage: string;
  rootDirectory?: string;
  publicBaseUrl?: string;
}

function parseImageData(
  imageData: string,
  maxBytes: number,
  invalidCode: ErrorCode,
  invalidMessage: string
): { buffer: Buffer; extension: ImageExtension } {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(imageData);
  if (!match) throw new AppError(invalidCode, invalidMessage, 400);

  const mime = match[1] as "jpeg" | "png" | "webp";
  const buffer = Buffer.from(match[2] as string, "base64");
  const validSignature =
    (mime === "jpeg" &&
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff) ||
    (mime === "png" &&
      buffer.length >= 8 &&
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
    (mime === "webp" &&
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP");

  if (!validSignature || buffer.length === 0 || buffer.length > maxBytes) {
    throw new AppError(invalidCode, invalidMessage, 400);
  }
  return { buffer, extension: mime === "jpeg" ? "jpg" : mime };
}

export interface ImageStorage {
  save(imageData: string): Promise<string>;
  remove(imageUrl: string | null): Promise<void>;
}

export class ManagedImageStorage implements ImageStorage {
  private readonly storagePath: string;
  private readonly publicPrefix: string;

  constructor(private readonly options: ManagedImageStorageOptions) {
    if (!/^[a-z0-9-]+$/.test(options.directory)) {
      throw new Error("Invalid managed image directory");
    }
    this.storagePath = path.join(options.rootDirectory ?? env.UPLOAD_DIR, options.directory);
    this.publicPrefix = `${(options.publicBaseUrl ?? env.PUBLIC_BASE_URL).replace(/\/$/, "")}/api/v1/uploads/${options.directory}/`;
  }

  async save(imageData: string): Promise<string> {
    const image = parseImageData(
      imageData,
      this.options.maxBytes,
      this.options.invalidCode,
      this.options.invalidMessage
    );
    await mkdir(this.storagePath, { recursive: true, mode: 0o750 });
    const filename = `${randomUUID()}.${image.extension}`;
    const filePath = path.join(this.storagePath, filename);
    try {
      await writeFile(filePath, image.buffer, { flag: "wx", mode: 0o640 });
      return `${this.publicPrefix}${filename}`;
    } catch {
      await rm(filePath, { force: true }).catch(() => undefined);
      throw new AppError(
        this.options.uploadFailedCode,
        this.options.uploadFailedMessage,
        500
      );
    }
  }

  async remove(imageUrl: string | null): Promise<void> {
    if (!imageUrl?.startsWith(this.publicPrefix)) return;
    const filename = imageUrl.slice(this.publicPrefix.length);
    if (!/^[a-f0-9-]+\.(?:jpg|png|webp)$/.test(filename)) return;
    await rm(path.join(this.storagePath, filename), { force: true }).catch(() => undefined);
  }
}
