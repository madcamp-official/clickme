import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const campaign = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "active",
  startsAt: null,
  endsAt: null,
  revision: 1,
} as const;

async function mockSessionAndAnalytics(
  page: Page,
  variant: "A" | "B" = "B",
  onSessionRequest?: (body: Record<string, unknown>) => void,
  onAnalyticsRequest?: (body: Record<string, unknown>) => void,
) {
  await page.route("**/api/session", async (route) => {
    const requestBody = route.request().postDataJSON() as Record<string, unknown>;
    onSessionRequest?.(requestBody);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        sessionId: "22222222-2222-4222-8222-222222222222",
        pageViewId: requestBody.pageViewId,
        expiresAt: "2099-01-01T15:00:00.000Z",
        serverTime: "2026-07-16T12:00:00.000Z",
        expiresInMs: 86_400_000,
        csrfToken: "test-csrf-token",
        heartbeatIntervalMs: 15_000,
        campaign,
        experimentVariant: variant,
      }),
    });
  });
  await page.route("**/api/analytics/**", async (route) => {
    if (route.request().url().includes("/events")) {
      onAnalyticsRequest?.(route.request().postDataJSON() as Record<string, unknown>);
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ accepted: true }) });
  });
}

async function mockResults(page: Page, dip = 12, pour = 9) {
  await page.route("**/api/results", async (route) => {
    const total = dip + pour;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        counts: { dip, pour, total },
        percentages: {
          dip: total === 0 ? 50 : Math.round((dip / total) * 100),
          pour: total === 0 ? 50 : Math.round((pour / total) * 100),
        },
        campaign,
      }),
    });
  });
}

test("레퍼런스형 밸런스 게임에서 같은 선택지를 계속 누를 수 있다", async ({ page }) => {
  let dip = 12;
  let pour = 9;
  let voteRequests = 0;

  await mockSessionAndAnalytics(page);

  await page.route("**/api/results", async (route) => {
    const total = dip + pour;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        counts: { dip, pour, total },
        percentages: { dip: Math.round((dip / total) * 100), pour: Math.round((pour / total) * 100) },
        campaign,
      }),
    });
  });

  await page.route("**/api/vote", async (route) => {
    voteRequests += 1;
    const body = route.request().postDataJSON() as { choice: "dip" | "pour" };
    if (body.choice === "pour") pour += 1;
    else dip += 1;

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ accepted: true, choice: body.choice }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "탕수육" })).toBeVisible();
  await expect(page.getByText(/여러 번 클릭 가능합니다 \(진심을 담아서\)/)).toBeVisible();
  await expect(page.getByText("총 21명이 불타는 중")).toBeVisible();

  const pourButton = page.getByRole("button", { name: "부먹에 1표 더하기" });
  await expect(pourButton).toBeEnabled();
  await pourButton.click();
  await pourButton.click();
  await pourButton.click();

  await expect.poll(() => voteRequests).toBe(3);
  await expect(page.getByText("부먹파로 등록됨!", { exact: false })).toBeVisible();
  await expect(page.getByText("(총 3번 클릭)")).toBeVisible();
  await expect(page.getByRole("button", { name: /친구에게 선택 물어보기/ })).toBeVisible();
});

test("투표 큐가 30개를 넘으면 확인 전까지 입력을 잠근다", async ({ page }) => {
  let dip = 0;
  let pour = 0;
  let voteRequests = 0;
  const voteRequestTimes: number[] = [];

  await mockSessionAndAnalytics(page);

  await page.route("**/api/results", async (route) => {
    const total = dip + pour;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        counts: { dip, pour, total },
        percentages: { dip: total === 0 ? 50 : Math.round((dip / total) * 100), pour: total === 0 ? 50 : Math.round((pour / total) * 100) },
        campaign,
      }),
    });
  });

  await page.route("**/api/vote", async (route) => {
    voteRequests += 1;
    voteRequestTimes.push(performance.now());
    const body = route.request().postDataJSON() as { choice: "dip" | "pour" };
    if (body.choice === "pour") pour += 1;
    else dip += 1;

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ accepted: true, choice: body.choice }),
    });
  });

  await page.goto("/");

  const pourButton = page.getByRole("button", { name: "부먹에 1표 더하기" });
  await expect(pourButton).toBeEnabled();
  await pourButton.evaluate((button) => {
    if (!(button instanceof HTMLButtonElement)) throw new Error("vote control must be a button");
    for (let index = 0; index < 31; index += 1) button.click();
  });

  const dialog = page.getByRole("alertdialog");
  const confirmButton = page.getByRole("button", { name: "확인" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("클릭이 너무 빠릅니다");
  await expect(dialog).toContainText("한 번에 최대 30번까지만 반영할 수 있어요. 확인 후 다시 눌러 주세요.");
  await expect(confirmButton).toBeFocused();
  await expect(pourButton).toBeDisabled();
  await expect(page.getByText("(총 30번 클릭)")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(confirmButton).toBeFocused();

  await page.locator(".viral-rate-limit-overlay").click({ position: { x: 4, y: 4 } });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();

  await expect.poll(() => voteRequests).toBe(30);
  const dispatchDurationMs = voteRequestTimes[29] - voteRequestTimes[0];
  expect(dispatchDurationMs).toBeGreaterThan(1_800);
  expect(dispatchDurationMs).toBeLessThan(5_000);

  await confirmButton.click();
  await expect(dialog).toBeHidden();
  await expect(pourButton).toBeEnabled();
  await pourButton.click();
  await expect(page.getByText("(총 31번 클릭)")).toBeVisible();
  await expect.poll(() => voteRequests).toBe(31);
});

test("stale 공개 결과가 와도 확인된 낙관 표가 사라지거나 이중 집계되지 않는다", async ({ page }) => {
  let resultRequests = 0;

  await mockSessionAndAnalytics(page);
  await page.route("**/api/results", async (route) => {
    resultRequests += 1;
    const dip = 10;
    const pour = resultRequests < 3 ? 10 : 11;
    const total = dip + pour;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        counts: { dip, pour, total },
        percentages: { dip: Math.round((dip / total) * 100), pour: Math.round((pour / total) * 100) },
        campaign,
      }),
    });
  });
  await page.route("**/api/vote", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ accepted: true, choice: "pour" }),
    });
  });

  await page.goto("/");
  await expect(page.getByText("총 20명이 불타는 중")).toBeVisible();
  await page.evaluate(() => {
    const target = document.querySelector(".viral-score-labels p:first-child small");
    if (!target) throw new Error("pour count was not rendered");
    const testWindow = window as typeof window & { observedPourCounts?: number[] };
    testWindow.observedPourCounts = [];
    const record = () => {
      const match = target.textContent?.match(/\(([\d,]+)표\)/);
      if (match) testWindow.observedPourCounts?.push(Number(match[1].replaceAll(",", "")));
    };
    new MutationObserver(record).observe(target, { childList: true, characterData: true, subtree: true });
  });

  await page.getByRole("button", { name: "부먹에 1표 더하기" }).click();
  await expect.poll(() => resultRequests).toBeGreaterThanOrEqual(2);
  await expect(page.locator(".viral-score-labels p").first()).toContainText("(11표)");
  await expect.poll(() => resultRequests, { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
  await expect(page.locator(".viral-score-labels p").first()).toContainText("(11표)");

  const observedCounts = await page.evaluate(() => (
    (window as typeof window & { observedPourCounts?: number[] }).observedPourCounts ?? []
  ));
  expect(observedCounts.length).toBeGreaterThan(0);
  expect(Math.min(...observedCounts)).toBeGreaterThanOrEqual(11);
  expect(Math.max(...observedCounts)).toBe(11);
});

test("투표 응답 순서가 뒤바뀌어도 가장 나중에 수락한 클릭의 선택을 유지한다", async ({ page }) => {
  let dip = 0;
  let pour = 0;
  const responseOrder: Array<"dip" | "pour"> = [];

  await mockSessionAndAnalytics(page);
  await page.route("**/api/results", async (route) => {
    const total = dip + pour;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        counts: { dip, pour, total },
        percentages: {
          dip: total === 0 ? 50 : Math.round((dip / total) * 100),
          pour: total === 0 ? 50 : Math.round((pour / total) * 100),
        },
        campaign,
      }),
    });
  });
  await page.route("**/api/vote", async (route) => {
    const body = route.request().postDataJSON() as { choice: "dip" | "pour" };
    if (body.choice === "pour") pour += 1;
    else dip += 1;
    await new Promise((resolve) => setTimeout(resolve, body.choice === "pour" ? 500 : 20));
    responseOrder.push(body.choice);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ accepted: true, choice: body.choice }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "부먹에 1표 더하기" }).click();
  await page.getByRole("button", { name: "찍먹에 1표 더하기" }).click();

  await expect.poll(() => responseOrder).toEqual(["dip", "pour"]);
  await expect(page.getByRole("heading", { name: /나는 찍먹파/ })).toBeVisible();
  await page.waitForTimeout(150);
  await expect(page.getByRole("heading", { name: /나는 찍먹파/ })).toBeVisible();
});

test("클라이언트 시계와 무관하게 갱신하고 추천 receipt는 최초 세션에만 보낸다", async ({ page }) => {
  let sessionRequests = 0;
  let finalHeartbeats = 0;
  const sessionBodies: Array<Record<string, unknown>> = [];

  await page.addInitScript(() => {
    Date.now = () => 0;
  });
  await page.route("**/api/session", async (route) => {
    sessionBodies.push(route.request().postDataJSON() as Record<string, unknown>);
    const index = sessionRequests;
    sessionRequests += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        sessionId: index === 0
          ? "22222222-2222-4222-8222-222222222222"
          : "44444444-4444-4444-8444-444444444444",
        pageViewId: sessionBodies[index].pageViewId,
        // Intentionally contradict the browser clock; expiresInMs is authoritative.
        expiresAt: "1970-01-01T00:00:00.000Z",
        serverTime: "2026-07-16T12:00:00.000Z",
        expiresInMs: index === 0 ? 1_500 : 86_400_000,
        csrfToken: `csrf-${index}`,
        heartbeatIntervalMs: 15_000,
        campaign,
        experimentVariant: "A",
      }),
    });
  });
  await page.route("**/api/analytics/heartbeat", async (route) => {
    finalHeartbeats += 1;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ accepted: true }) });
  });
  await page.route("**/api/analytics/events", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ accepted: true }) });
  });
  await mockResults(page);

  await page.goto("/r/abcdefghijklmnopqrstuv");
  await expect(page.getByRole("button", { name: "부먹에 1표 더하기" })).toBeEnabled();
  await page.waitForTimeout(250);
  expect(sessionRequests).toBe(1);
  expect(sessionBodies[0]).toMatchObject({
    path: "/r/abcdefghijklmnopqrstuv",
    referralToken: "abcdefghijklmnopqrstuv",
    referralReceipt: expect.any(String),
  });

  await expect.poll(() => finalHeartbeats, { timeout: 1_500 }).toBeGreaterThanOrEqual(1);
  await expect.poll(() => sessionRequests, { timeout: 3_000 }).toBe(2);
  expect(sessionBodies[1]).toMatchObject({ path: "/r/abcdefghijklmnopqrstuv" });
  expect(sessionBodies[1]).not.toHaveProperty("referralToken");
  expect(sessionBodies[1]).not.toHaveProperty("referralReceipt");
});

test("세션 만료 투표는 같은 요청 ID로 한 번만 다시 보낸다", async ({ page }) => {
  const sessionIds = [
    "22222222-2222-4222-8222-222222222222",
    "44444444-4444-4444-8444-444444444444",
  ];
  let sessionRequests = 0;
  const voteBodies: Array<{ requestId: string; sessionId: string; pageViewId: string }> = [];
  const csrfHeaders: string[] = [];

  await page.route("**/api/session", async (route) => {
    const requestBody = route.request().postDataJSON() as Record<string, unknown>;
    const index = Math.min(sessionRequests, sessionIds.length - 1);
    sessionRequests += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        sessionId: sessionIds[index],
        pageViewId: requestBody.pageViewId,
        expiresAt: "2099-01-01T15:00:00.000Z",
        serverTime: "2026-07-16T12:00:00.000Z",
        expiresInMs: 86_400_000,
        csrfToken: `csrf-${index}`,
        heartbeatIntervalMs: 15_000,
        campaign,
        experimentVariant: "A",
      }),
    });
  });
  await page.route("**/api/analytics/**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ accepted: true }) });
  });
  await mockResults(page);
  await page.route("**/api/vote", async (route) => {
    voteBodies.push(route.request().postDataJSON() as typeof voteBodies[number]);
    csrfHeaders.push(route.request().headers()["x-clickme-csrf"] ?? "");
    if (voteBodies.length === 1) {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "오늘의 세션을 다시 시작해 주세요.", code: "SESSION_EXPIRED" }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ accepted: true, choice: "pour" }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "부먹에 1표 더하기" }).click();

  await expect.poll(() => voteBodies.length).toBe(2);
  expect(sessionRequests).toBe(2);
  expect(voteBodies[0].requestId).toBe(voteBodies[1].requestId);
  expect(voteBodies.map((body) => body.sessionId)).toEqual(sessionIds);
  expect(csrfHeaders).toEqual(["csrf-0", "csrf-1"]);
});

test("추천 경로를 세션과 새 공유 링크의 상위 토큰으로 연결한다", async ({ page }) => {
  const referralToken = "abcdefghijklmnopqrstuv";
  let sessionBody: Record<string, unknown> | null = null;
  let sessionPageViewId: unknown = null;
  let shareBody: Record<string, unknown> | null = null;
  let shareIdempotencyKey = "";
  const analyticsEvents: Array<Record<string, unknown>> = [];

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as typeof window & { copiedShareUrl?: string }).copiedShareUrl = value;
        },
      },
    });
  });
  await mockSessionAndAnalytics(page, "B", (body) => {
    sessionBody = body;
    sessionPageViewId = body.pageViewId;
  }, (body) => {
    const events = Array.isArray(body.events) ? body.events : [];
    analyticsEvents.push(...events as Array<Record<string, unknown>>);
  });
  await mockResults(page);
  await page.route("**/api/vote", async (route) => {
    const body = route.request().postDataJSON() as { choice: "dip" | "pour" };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ accepted: true, choice: body.choice }),
    });
  });
  await page.route("**/api/shares", async (route) => {
    shareBody = route.request().postDataJSON() as Record<string, unknown>;
    shareIdempotencyKey = route.request().headers()["idempotency-key"] ?? "";
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        shareUrl: `http://127.0.0.1:3100/r/${referralToken}`,
        imageUrl: `http://127.0.0.1:3100/api/share-images/${referralToken}.png`,
      }),
    });
  });

  await page.goto(`/r/${referralToken}`);
  await expect(page.getByText("친구가 당신의 선택을 기다리고 있어요")).toBeVisible();
  await expect.poll(() => sessionBody).not.toBeNull();
  expect(sessionBody).toMatchObject({ path: `/r/${referralToken}`, referralToken });
  expect(sessionBody).toHaveProperty("referralReceipt", expect.any(String));
  await expect.poll(() => analyticsEvents.find((event) => (
    event.name === "referral_banner_impression"
  ))).toMatchObject({ name: "referral_banner_impression", properties: {} });

  await page.getByRole("button", { name: "찍먹에 1표 더하기" }).click();
  await expect(page.getByRole("heading", { name: /나는 찍먹파/ })).toBeVisible();
  await page.getByRole("button", { name: "링크 복사" }).click();

  await expect.poll(() => shareBody).not.toBeNull();
  expect(shareBody).toMatchObject({
    choice: "dip",
    sessionId: "22222222-2222-4222-8222-222222222222",
    pageViewId: sessionPageViewId,
  });
  expect(shareBody).not.toHaveProperty("parentToken");
  expect(shareIdempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  await expect.poll(() => page.evaluate(() => (
    (window as typeof window & { copiedShareUrl?: string }).copiedShareUrl
  ))).toBe(`http://127.0.0.1:3100/r/${referralToken}`);
});

test("푸터 문구를 10번 누르면 이스터에그 사이트가 새 탭으로 열린다", async ({ page }) => {
  await mockSessionAndAnalytics(page);
  await page.route("**/api/results", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        counts: { dip: 0, pour: 0, total: 0 },
        percentages: { dip: 50, pour: 50 },
        campaign,
      }),
    });
  });

  await page.goto("/");

  const footer = page.getByText("⚡ 오늘의 밸런스게임 · 투표는 계속됩니다 ⚡");
  await footer.click({ clickCount: 9 });
  await page.getByRole("link", { name: "개인정보 처리 안내" }).evaluate((link) => {
    link.addEventListener("click", (event) => event.preventDefault(), { once: true });
    (link as HTMLAnchorElement).click();
  });
  await expect(page.context().pages()).toHaveLength(1);

  const popupPromise = page.waitForEvent("popup");
  await footer.click();
  const popup = await popupPromise;
  await expect.poll(() => popup.url()).toBe("https://seojiny.com/");
});

test("푸터 이스터에그는 5초 안에 10번 눌러야 열린다", async ({ page }) => {
  await mockSessionAndAnalytics(page);
  await page.route("**/api/results", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        counts: { dip: 0, pour: 0, total: 0 },
        percentages: { dip: 50, pour: 50 },
        campaign,
      }),
    });
  });

  await page.goto("/");
  await page.evaluate(() => {
    let now = 0;
    Date.now = () => now;
    const testWindow = window as typeof window & {
      advanceFooterEasterEggClock?: (milliseconds: number) => void;
    };
    testWindow.advanceFooterEasterEggClock = (milliseconds) => {
      now += milliseconds;
    };
  });

  const footer = page.getByText("⚡ 오늘의 밸런스게임 · 투표는 계속됩니다 ⚡");
  await footer.click({ clickCount: 9 });
  await page.evaluate(() => {
    const testWindow = window as typeof window & {
      advanceFooterEasterEggClock?: (milliseconds: number) => void;
    };
    testWindow.advanceFooterEasterEggClock?.(5_001);
  });
  await footer.click();
  await page.waitForTimeout(100);

  await expect(page.context().pages()).toHaveLength(1);
});
