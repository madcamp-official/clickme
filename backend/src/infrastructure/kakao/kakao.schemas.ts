import { z } from "zod";

export const kakaoTokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  token_type: z.string(),
  expires_in: z.number()
});

export const kakaoProfileSchema = z.object({
  id: z.union([z.string(), z.number()]),
  kakao_account: z
    .object({
      profile: z
        .object({ nickname: z.string().optional(), profile_image_url: z.string().optional() })
        .optional()
    })
    .optional()
});
