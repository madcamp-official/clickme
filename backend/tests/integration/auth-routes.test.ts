import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../src/app.js";

describe("Kakao auth routes", () => {
  it("sets a signed state cookie and redirects with only profile scopes", async () => {
    const response = await request(app).get("/api/v1/auth/kakao/start").expect(302);
    expect(response.headers["set-cookie"]?.[0]).toContain("wm_oauth_state=");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    const location = new URL(response.headers.location as string);
    expect(location.hostname).toBe("kauth.kakao.com");
    expect(location.searchParams.get("scope")).toBe("profile_nickname,profile_image");
    expect(location.search).not.toContain("email");
    expect(location.searchParams.get("state")).toBeTruthy();
  });

  it("rejects a missing or mismatched state through the fixed failure URL", async () => {
    const response = await request(app)
      .get("/api/v1/auth/kakao/callback?code=test&state=forged")
      .expect(302);
    const location = new URL(response.headers.location as string);
    expect(location.origin + location.pathname).toBe("http://localhost:3000/auth/callback/failure");
    expect(location.searchParams.get("error")).toBe("KAKAO_STATE_INVALID");
  });

  it("handles user cancellation without calling Kakao", async () => {
    const response = await request(app)
      .get("/api/v1/auth/kakao/callback?error=access_denied")
      .expect(302);
    expect(new URL(response.headers.location as string).searchParams.get("error")).toBe(
      "KAKAO_LOGIN_CANCELLED"
    );
  });

  it.each(["signup", "login", "password-reset"])("does not expose POST /auth/%s", async (path) => {
    const response = await request(app).post(`/api/v1/auth/${path}`).send({}).expect(404);
    const body = response.body as { error: { code: string } };
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
  });
});
