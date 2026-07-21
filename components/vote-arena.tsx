"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";

import { motion } from "motion/react";

import { ImageWithFallback } from "./image-with-fallback";

type Choice = "dip" | "pour";
type CampaignStatus = "active" | "protected" | "read_only";

type CampaignState = {
  id?: string;
  status: CampaignStatus;
  startsAt: string | null;
  endsAt: string | null;
  revision: number;
};

type VoteResults = {
  counts: { dip: number; pour: number; total: number };
  percentages: { dip: number; pour: number };
  campaign: CampaignState;
};

type SessionContext = {
  sessionId: string;
  pageViewId: string;
  expiresAt: string;
  serverTime: string;
  expiresInMs: number;
  csrfToken: string;
  heartbeatIntervalMs: number;
  campaign: CampaignState;
  experimentVariant: "A" | "B";
  requestStartedAtMonotonic: number;
  receivedAtMonotonic: number;
  deadlineMonotonic: number;
  serverTimeAtReceiptMs: number;
};

type QueuedVote = {
  choice: Choice;
  requestId: string;
  sequence: number;
};

type AnalyticsEventName =
  | "section_impression"
  | "share_card_impression"
  | "share_cta_clicked"
  | "share_sheet_resolved"
  | "share_sheet_cancelled"
  | "share_link_copied"
  | "share_image_downloaded"
  | "referral_banner_impression"
  | "rapid_click_lock_shown"
  | "rapid_click_lock_confirmed"
  | "vote_rate_limited"
  | "vote_request_failed";

type AnalyticsEvent = {
  id: string;
  name: AnalyticsEventName;
  occurredAt: string;
  properties: Record<string, string | number | boolean>;
};

type ShareArtifact = {
  shareUrl: string;
  imageUrl: string | null;
};

type Notice = { tone: "success" | "error"; message: string };

type Burst = {
  id: number;
  emoji: string;
  choice: Choice;
  left: number;
  top: number;
  drift: number;
  rotate: number;
  delay: number;
};

const DISPLAY = {
  dip: {
    label: "엄성현",
    eyebrow: "SH",
    photo: "/images/seonghyun.webp",
    accent: "#f43f5e",
    emoji: "🔥",
    registeredText: "엄성현 최애로 등록!",
    burstTokens: ["엄성현", "🔥", "화이팅!", "SEONGHYUN", "최고"],
  },
  pour: {
    label: "안건호",
    eyebrow: "GH",
    photo: "/images/geonho.webp",
    accent: "#a8b8dc",
    emoji: "🩵",
    registeredText: "안건호 최애로 등록!",
    burstTokens: ["안건호", "🩵", "사랑해", "GEONHO", "취향저격"],
  },
} as const;

const numberFormatter = new Intl.NumberFormat("ko-KR");
const VOTE_DISPATCH_INTERVAL_MS = 80;
const VOTE_QUEUE_MAX_SIZE = 30;
const FOOTER_EASTER_EGG_CLICKS = 10;
const FOOTER_EASTER_EGG_WINDOW_MS = 5_000;
const FOOTER_EASTER_EGG_ROUTE = "/api/next";
const ACTIVE_INPUT_WINDOW_MS = 60_000;
const RESULTS_POLL_MIN_MS = 1_000;
const RESULTS_POLL_MAX_BACKOFF_MS = 60_000;
const SESSION_FINAL_FLUSH_LEAD_MS = 1_000;
// Leave room below the server's 12 batches/minute ceiling for page-hide and
// final flushes in addition to the routine timer.
const EVENT_FLUSH_INTERVAL_MS = 6_000;

class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
  }
}

function errorPayload(payload: unknown): { message: string | null; code: string | null } {
  if (!payload || typeof payload !== "object") return { message: null, code: null };
  const value = payload as { error?: unknown; message?: unknown; code?: unknown };
  return {
    message: typeof value.message === "string"
      ? value.message
      : typeof value.error === "string"
        ? value.error
        : null,
    code: typeof value.code === "string" ? value.code : null,
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (init?.body) headers.set("Content-Type", "application/json");

  const response = await fetch(url, {
    ...init,
    // Public results are deliberately cacheable at Nginx. A client-side
    // `no-store` request would send cache-bypass headers and defeat collapse.
    cache: init?.cache ?? (init?.method ? "no-store" : "default"),
    headers,
  });
  const raw = await response.text();
  let payload: unknown = null;

  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const parsed = errorPayload(payload);
    throw new ApiRequestError(
      response.status,
      parsed.code,
      parsed.message ?? "요청을 처리하지 못했어요.",
    );
  }

  return payload as T;
}

function isCampaignState(value: unknown): value is CampaignState {
  if (!value || typeof value !== "object") return false;
  const campaign = value as Partial<CampaignState>;
  return (
    ["active", "protected", "read_only"].includes(campaign.status ?? "")
    && (typeof campaign.startsAt === "string" || campaign.startsAt === null)
    && (typeof campaign.endsAt === "string" || campaign.endsAt === null)
    && typeof campaign.revision === "number"
  );
}

function isVoteResults(value: unknown): value is VoteResults {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<VoteResults>;
  return Boolean(
    result.counts
    && result.percentages
    && typeof result.counts.dip === "number"
    && typeof result.counts.pour === "number"
    && isCampaignState(result.campaign),
  );
}

type SessionResponse = Omit<
  SessionContext,
  | "requestStartedAtMonotonic"
  | "receivedAtMonotonic"
  | "deadlineMonotonic"
  | "serverTimeAtReceiptMs"
>;

function isSessionResponse(value: unknown): value is SessionResponse {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<SessionResponse>;
  return Boolean(
    typeof session.sessionId === "string"
    && typeof session.pageViewId === "string"
    && typeof session.expiresAt === "string"
    && typeof session.serverTime === "string"
    && Number.isFinite(new Date(session.serverTime).getTime())
    && typeof session.expiresInMs === "number"
    && Number.isSafeInteger(session.expiresInMs)
    && session.expiresInMs > 0
    && session.expiresInMs <= 90_000_000
    && typeof session.csrfToken === "string"
    && typeof session.heartbeatIntervalMs === "number"
    && isCampaignState(session.campaign)
    && (session.experimentVariant === "A" || session.experimentVariant === "B"),
  );
}

function isShareArtifact(value: unknown): value is ShareArtifact {
  if (!value || typeof value !== "object") return false;
  const artifact = value as Partial<ShareArtifact>;
  return (
    typeof artifact.shareUrl === "string"
    && (typeof artifact.imageUrl === "string" || artifact.imageUrl === null || artifact.imageUrl === undefined)
  );
}

type CommentEntry = {
  id: string;
  choice: Choice;
  body: string;
  createdAt: string;
};

type TopicHistoryEntry = {
  id: string;
  title: string;
  optionALabel: string;
  optionAChoice: Choice;
  optionACount: number;
  optionBLabel: string;
  optionBChoice: Choice;
  optionBCount: number;
  startsAt: string | null;
  endsAt: string | null;
  archivedAt: string;
};

function isCommentsResponse(value: unknown): value is { comments: CommentEntry[] } {
  if (!value || typeof value !== "object") return false;
  return Array.isArray((value as { comments?: unknown }).comments);
}

function isTopicHistoryResponse(value: unknown): value is { topics: TopicHistoryEntry[] } {
  if (!value || typeof value !== "object") return false;
  return Array.isArray((value as { topics?: unknown }).topics);
}

function friendlyError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 429) return "요청이 너무 빨라요. 잠시만 기다린 뒤 다시 시도해 주세요.";
    if (error.status === 410) return "지금은 투표 결과만 볼 수 있어요.";
    if (error.status >= 500) return "서버가 잠시 응답하지 않아요. 잠시 뒤 다시 눌러 주세요.";
    return error.message;
  }
  return "요청을 보내지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.";
}

function percentage(value: number, total: number): number {
  return total === 0 ? 50 : Math.round((value / total) * 100);
}

function createUuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [...bytes].map((value, index) => (
    `${index === 4 || index === 6 || index === 8 || index === 10 ? "-" : ""}${value.toString(16).padStart(2, "0")}`
  )).join("");
}

function safeHost(referrer: string): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function shortQueryValue(params: URLSearchParams, key: string): string | null {
  const value = params.get(key)?.trim();
  return value && value.length <= 100 ? value : null;
}

function isVotingOpen(status: CampaignStatus | undefined): boolean {
  return status === "active" || status === "protected";
}

function isAnalyticsOpen(status: CampaignStatus | undefined): boolean {
  return status === "active";
}

function isSharingOpen(status: CampaignStatus | undefined): boolean {
  return status === "active";
}

function isCommentsOpen(status: CampaignStatus | undefined): boolean {
  return status === "active";
}

function isSessionBeforeDeadline(session: SessionContext): boolean {
  return performance.now() < session.deadlineMonotonic;
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const control = document.createElement("textarea");
  control.value = value;
  control.setAttribute("readonly", "");
  control.style.position = "fixed";
  control.style.opacity = "0";
  document.body.append(control);
  control.select();
  const copied = document.execCommand("copy");
  control.remove();
  if (!copied) throw new Error("copy failed");
}

function shareMessage(choice: Choice): string {
  return `나는 ${DISPLAY[choice].label}파! 당신의 최애는?`;
}

// Korean topic-marker particle (은/는): 은 follows a syllable with a final
// consonant (받침), 는 follows one without. DISPLAY labels aren't fixed
// strings, so this can't be hardcoded per choice.
function topicParticle(word: string): "은" | "는" {
  const code = word.codePointAt(word.length - 1) ?? 0;
  if (code < 0xac00 || code > 0xd7a3) return "는";
  return (code - 0xac00) % 28 === 0 ? "는" : "은";
}

function formatRelativeTime(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function formatArchivedDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

export function VoteArena({
  referralToken,
  referralReceipt,
}: {
  referralToken?: string;
  referralReceipt?: string;
} = {}) {
  const [results, setResults] = useState<VoteResults | null>(null);
  const [session, setSession] = useState<SessionContext | null>(null);
  const [pendingVotes, setPendingVotes] = useState({ dip: 0, pour: 0 });
  const [confirmedVotes, setConfirmedVotes] = useState({ dip: 0, pour: 0 });
  const [lastChoice, setLastChoice] = useState<Choice | null>(null);
  const [lastAcceptedChoice, setLastAcceptedChoice] = useState<Choice | null>(null);
  const [clickCount, setClickCount] = useState(0);
  const [queuedVoteCount, setQueuedVoteCount] = useState(0);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isVoteInputLocked, setIsVoteInputLocked] = useState(false);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [shareArtifact, setShareArtifact] = useState<ShareArtifact | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [commentInput, setCommentInput] = useState("");
  const [isCommentSubmitting, setIsCommentSubmitting] = useState(false);
  const [topicHistory, setTopicHistory] = useState<TopicHistoryEntry[]>([]);
  const [showPastTopics, setShowPastTopics] = useState(false);

  const burstId = useRef(0);
  const noticeTimer = useRef<number | undefined>(undefined);
  const burstTimers = useRef<number[]>([]);
  const voteQueue = useRef<QueuedVote[]>([]);
  const pendingVoteCount = useRef(0);
  const footerClickTimes = useRef<number[]>([]);
  const rateLimitConfirmButton = useRef<HTMLButtonElement>(null);
  const voteLock = useRef(false);
  const sessionRef = useRef<SessionContext | null>(null);
  const sessionRequest = useRef<Promise<SessionContext> | null>(null);
  const resultsRequest = useRef<Promise<boolean> | null>(null);
  const resultsPollTimer = useRef<number | undefined>(undefined);
  const resultsPollFailures = useRef(0);
  const campaignRef = useRef<CampaignState | null>(null);
  const sessionRotationTimer = useRef<number | undefined>(undefined);
  const sessionRetryTimer = useRef<number | undefined>(undefined);
  const eventQueue = useRef<AnalyticsEvent[]>([]);
  const eventFlushRequest = useRef<Promise<void> | null>(null);
  const impressionKeys = useRef(new Set<string>());
  const visibleMs = useRef(0);
  const activeMs = useRef(0);
  const maxScrollPercent = useRef(0);
  const heartbeatSequence = useRef(0);
  const lastEngagementTick = useRef<number | null>(null);
  const lastActivityAt = useRef(0);
  const engagementWasVisible = useRef(true);
  const shareArtifactRequest = useRef<Promise<ShareArtifact> | null>(null);
  const shareIdempotencyKey = useRef<string | null>(null);
  const shareArtifactChoice = useRef<Choice | null>(null);
  const lastAcceptedChoiceRef = useRef<Choice | null>(null);
  const latestAcceptedSequence = useRef(-1);
  const nextVoteSequence = useRef(0);
  const confirmedVotesRef = useRef({ dip: 0, pour: 0 });
  const publicCountsRef = useRef<{ dip: number; pour: number; total: number } | null>(null);
  const publicCampaignIdRef = useRef<string | undefined>(undefined);
  const referralAttributionPending = useRef(Boolean(referralToken && referralReceipt));
  const sessionBootstrapPageViewId = useRef<string | null>(null);

  const showNotice = useCallback((nextNotice: Notice) => {
    setNotice(nextNotice);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3_200);
  }, []);

  const trackEvent = useCallback((name: AnalyticsEventName, properties: AnalyticsEvent["properties"] = {}) => {
    const activeSession = sessionRef.current;
    const campaign = campaignRef.current ?? activeSession?.campaign;
    if (!activeSession || !isAnalyticsOpen(campaign?.status)) return;

    eventQueue.current.push({
      id: createUuid(),
      name,
      occurredAt: new Date(
        activeSession.serverTimeAtReceiptMs
        + (performance.now() - activeSession.receivedAtMonotonic),
      ).toISOString(),
      properties,
    });
    eventQueue.current = eventQueue.current.slice(-100);
  }, []);

  const resetEngagement = useCallback(() => {
    visibleMs.current = 0;
    activeMs.current = 0;
    maxScrollPercent.current = 0;
    heartbeatSequence.current = 0;
    lastEngagementTick.current = performance.now();
    lastActivityAt.current = performance.now();
    engagementWasVisible.current = document.visibilityState === "visible";
  }, []);

  const createSession = useCallback(async (): Promise<SessionContext> => {
    const query = new URLSearchParams(window.location.search);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bootstrapPageViewId = sessionBootstrapPageViewId.current ?? createUuid();
    sessionBootstrapPageViewId.current = bootstrapPageViewId;
    const sessionPayload = (includeReferral: boolean) => ({
      path: window.location.pathname,
      pageViewId: bootstrapPageViewId,
      ...(includeReferral && referralToken && referralReceipt ? { referralToken, referralReceipt } : {}),
      referrerHost: safeHost(document.referrer),
      utm: {
        source: shortQueryValue(query, "utm_source"),
        medium: shortQueryValue(query, "utm_medium"),
        campaign: shortQueryValue(query, "utm_campaign"),
        content: shortQueryValue(query, "utm_content"),
        term: shortQueryValue(query, "utm_term"),
      },
      client: {
        language: navigator.language.slice(0, 32),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone.slice(0, 64),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        touch: navigator.maxTouchPoints > 0,
        reducedMotion,
      },
    });

    const requestStartedAtMonotonic = performance.now();
    const requestSession = (includeReferral: boolean) => requestJson<unknown>("/api/session", {
      method: "POST",
      body: JSON.stringify(sessionPayload(includeReferral)),
    });
    const includeReferral = referralAttributionPending.current;
    let response: unknown;
    try {
      response = await requestSession(includeReferral);
    } catch (error) {
      if (
        includeReferral
        && error instanceof ApiRequestError
        && error.code === "INVALID_REFERRAL_RECEIPT"
      ) {
        referralAttributionPending.current = false;
        response = await requestSession(false);
      } else {
        throw error;
      }
    }
    if (!isSessionResponse(response)) throw new Error("invalid session response");
    if (response.pageViewId !== bootstrapPageViewId) throw new Error("invalid session page view");
    if (includeReferral) referralAttributionPending.current = false;
    sessionBootstrapPageViewId.current = null;
    const receivedAtMonotonic = performance.now();
    return {
      ...response,
      requestStartedAtMonotonic,
      receivedAtMonotonic,
      deadlineMonotonic: requestStartedAtMonotonic + response.expiresInMs,
      serverTimeAtReceiptMs: new Date(response.serverTime).getTime(),
    };
  }, [referralReceipt, referralToken]);

  const initializeSession = useCallback(async (force = false): Promise<SessionContext> => {
    const current = sessionRef.current;
    if (!force && current && isSessionBeforeDeadline(current)) return current;
    if (sessionRequest.current) return sessionRequest.current;

    const previousSessionId = current?.sessionId;
    const request = createSession()
      .then((nextSession) => {
        sessionRef.current = nextSession;
        campaignRef.current = nextSession.campaign;
        setSession(nextSession);
        setSessionError(null);
        eventQueue.current = [];
        resetEngagement();

        if (previousSessionId && previousSessionId !== nextSession.sessionId) {
          setLastAcceptedChoice(null);
          lastAcceptedChoiceRef.current = null;
          latestAcceptedSequence.current = -1;
          setShareArtifact(null);
          shareArtifactChoice.current = null;
          shareArtifactRequest.current = null;
          shareIdempotencyKey.current = null;
        }
        return nextSession;
      })
      .finally(() => {
        sessionRequest.current = null;
      });

    sessionRequest.current = request;
    return request;
  }, [createSession, resetEngagement]);

  const refreshExpiredSession = useCallback(async (expiredSessionId: string): Promise<SessionContext> => {
    const current = sessionRef.current;
    if (current && current.sessionId !== expiredSessionId && isSessionBeforeDeadline(current)) {
      return current;
    }
    return initializeSession(true);
  }, [initializeSession]);

  const reconcileResults = useCallback((
    nextResults: VoteResults,
    confirmedAtRequestStart: { dip: number; pour: number },
  ) => {
    const previousCounts = publicCountsRef.current;
    const campaignChanged = (
      previousCounts !== null
      && publicCampaignIdRef.current !== undefined
      && nextResults.campaign.id !== publicCampaignIdRef.current
    );

    if (!previousCounts || campaignChanged) {
      const counts = {
        dip: nextResults.counts.dip,
        pour: nextResults.counts.pour,
        total: nextResults.counts.dip + nextResults.counts.pour,
      };
      publicCountsRef.current = counts;
      publicCampaignIdRef.current = nextResults.campaign.id;
      if (campaignChanged) {
        confirmedVotesRef.current = { dip: 0, pour: 0 };
        setConfirmedVotes({ dip: 0, pour: 0 });
      }
      setResults({ ...nextResults, counts });
      return;
    }

    const counts = {
      dip: Math.max(previousCounts.dip, nextResults.counts.dip),
      pour: Math.max(previousCounts.pour, nextResults.counts.pour),
      total: 0,
    };
    counts.total = counts.dip + counts.pour;
    const observedDip = Math.max(0, counts.dip - previousCounts.dip);
    const observedPour = Math.max(0, counts.pour - previousCounts.pour);
    const currentConfirmed = confirmedVotesRef.current;
    const nextConfirmed = {
      dip: Math.max(
        0,
        currentConfirmed.dip - Math.min(observedDip, confirmedAtRequestStart.dip, currentConfirmed.dip),
      ),
      pour: Math.max(
        0,
        currentConfirmed.pour - Math.min(observedPour, confirmedAtRequestStart.pour, currentConfirmed.pour),
      ),
    };

    publicCountsRef.current = counts;
    publicCampaignIdRef.current = nextResults.campaign.id;
    confirmedVotesRef.current = nextConfirmed;
    setConfirmedVotes(nextConfirmed);
    setResults({
      counts,
      percentages: {
        dip: percentage(counts.dip, counts.total),
        pour: counts.total === 0 ? 50 : 100 - percentage(counts.dip, counts.total),
      },
      campaign: nextResults.campaign,
    });
  }, []);

  const refreshResults = useCallback(async (silent = false): Promise<boolean> => {
    if (resultsRequest.current) return resultsRequest.current;
    if (!silent) setIsLoading(true);
    const confirmedAtRequestStart = { ...confirmedVotesRef.current };

    const request = (async () => {
      try {
        const nextResults = await requestJson<unknown>("/api/results");
        if (!isVoteResults(nextResults)) throw new Error("invalid results response");
        campaignRef.current = nextResults.campaign;
        // Always advance the monotonic public base. Only acknowledgements that
        // already existed when this request began are eligible for subtraction;
        // a vote response arriving later cannot be consumed by an older result.
        reconcileResults(nextResults, confirmedAtRequestStart);
        setLoadError(null);
        return true;
      } catch (error) {
        if (!silent) setLoadError(friendlyError(error));
        return false;
      } finally {
        if (!silent) setIsLoading(false);
      }
    })().finally(() => {
      resultsRequest.current = null;
    });

    resultsRequest.current = request;
    return request;
  }, [reconcileResults]);

  const flushEvents = useCallback(async (
    keepalive = false,
    refreshSessionOnExpiry = true,
  ): Promise<void> => {
    if (eventFlushRequest.current || eventQueue.current.length === 0) return eventFlushRequest.current ?? Promise.resolve();
    const activeSession = sessionRef.current;
    const campaign = campaignRef.current ?? activeSession?.campaign;
    if (!activeSession || !isAnalyticsOpen(campaign?.status)) {
      eventQueue.current = [];
      return;
    }

    const events = eventQueue.current.splice(0, 20);
    const request = requestJson<unknown>("/api/analytics/events", {
      method: "POST",
      keepalive,
      headers: { "X-Clickme-CSRF": activeSession.csrfToken },
      body: JSON.stringify({
        sessionId: activeSession.sessionId,
        pageViewId: activeSession.pageViewId,
        events,
      }),
    }).then(() => undefined).catch((error: unknown) => {
      if (
        refreshSessionOnExpiry
        && error instanceof ApiRequestError
        && error.code === "SESSION_EXPIRED"
      ) {
        void refreshExpiredSession(activeSession.sessionId).catch(() => undefined);
      } else if (!(error instanceof ApiRequestError) || error.code !== "SESSION_EXPIRED") {
        eventQueue.current = [...events, ...eventQueue.current].slice(0, 100);
      }
    }).finally(() => {
      eventFlushRequest.current = null;
    });

    eventFlushRequest.current = request;
    return request;
  }, [refreshExpiredSession]);

  const updateEngagement = useCallback(() => {
    const now = performance.now();
    const previous = lastEngagementTick.current;
    lastEngagementTick.current = now;
    if (previous === null) return;

    const elapsed = Math.max(0, Math.min(now - previous, 30_000));
    if (engagementWasVisible.current) {
      visibleMs.current += elapsed;
      const intervalStartedAt = now - elapsed;
      const activeDuringInterval = Math.max(
        0,
        Math.min(elapsed, lastActivityAt.current + ACTIVE_INPUT_WINDOW_MS - intervalStartedAt),
      );
      activeMs.current += activeDuringInterval;
    }
    engagementWasVisible.current = document.visibilityState === "visible";

    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const scrollPercent = scrollable <= 0 ? 100 : Math.round((window.scrollY / scrollable) * 100);
    maxScrollPercent.current = Math.max(maxScrollPercent.current, Math.max(0, Math.min(100, scrollPercent)));
  }, []);

  const sendHeartbeat = useCallback(async (
    keepalive = false,
    refreshSessionOnExpiry = true,
  ): Promise<void> => {
    const activeSession = sessionRef.current;
    const campaign = campaignRef.current ?? activeSession?.campaign;
    if (!activeSession || !isAnalyticsOpen(campaign?.status)) return;
    updateEngagement();
    heartbeatSequence.current += 1;

    try {
      await requestJson<unknown>("/api/analytics/heartbeat", {
        method: "POST",
        keepalive,
        headers: { "X-Clickme-CSRF": activeSession.csrfToken },
        body: JSON.stringify({
          sessionId: activeSession.sessionId,
          pageViewId: activeSession.pageViewId,
          sequence: heartbeatSequence.current,
          visibleMs: Math.round(visibleMs.current),
          activeMs: Math.round(activeMs.current),
          maxScrollPercent: maxScrollPercent.current,
        }),
      });
    } catch (error) {
      if (
        refreshSessionOnExpiry
        && error instanceof ApiRequestError
        && error.code === "SESSION_EXPIRED"
      ) {
        void refreshExpiredSession(activeSession.sessionId).catch(() => undefined);
      }
    }
  }, [refreshExpiredSession, updateEngagement]);

  useEffect(() => {
    let cancelled = false;
    const initialLoad = window.setTimeout(() => {
      void (async () => {
        let initializationError: unknown = null;
        const sessionResult = await initializeSession().catch((error: unknown) => {
          initializationError = error;
          return null;
        });
        await refreshResults(false);
        if (!cancelled && !sessionResult) {
          setIsLoading(false);
          if (!(initializationError instanceof ApiRequestError) || initializationError.status !== 410) {
            setSessionError(friendlyError(initializationError));
          }
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(initialLoad);
    };
  }, [initializeSession, refreshResults]);

  useEffect(() => {
    window.clearTimeout(sessionRetryTimer.current);
    if (session || !isVotingOpen(results?.campaign.status)) return;

    let cancelled = false;
    let attempt = 0;
    const retryDelays = [5_000, 20_000, 40_000, 60_000] as const;

    const scheduleRetry = () => {
      const delay = retryDelays[Math.min(attempt, retryDelays.length - 1)];
      sessionRetryTimer.current = window.setTimeout(async () => {
        if (cancelled || sessionRef.current) return;
        try {
          await initializeSession(true);
        } catch (error) {
          if (!cancelled) {
            setSessionError(friendlyError(error));
            attempt += 1;
            scheduleRetry();
          }
        }
      }, delay);
    };

    scheduleRetry();
    return () => {
      cancelled = true;
      window.clearTimeout(sessionRetryTimer.current);
    };
  }, [initializeSession, results?.campaign.status, session]);

  useEffect(() => {
    function clearPoll() {
      window.clearTimeout(resultsPollTimer.current);
      resultsPollTimer.current = undefined;
    }

    // Subtract the previous request's own round-trip time from the next
    // delay so request *start* times stay ~1s apart, instead of 1s plus
    // however long the fetch took (which otherwise compounds every cycle).
    function schedulePoll(previousRequestStartedAt?: number) {
      clearPoll();
      if (document.visibilityState !== "visible") return;
      const failures = resultsPollFailures.current;
      const delay = failures === 0
        ? Math.max(0, RESULTS_POLL_MIN_MS - (previousRequestStartedAt !== undefined ? performance.now() - previousRequestStartedAt : 0))
        : Math.min(RESULTS_POLL_MAX_BACKOFF_MS, RESULTS_POLL_MIN_MS * (2 ** failures));

      resultsPollTimer.current = window.setTimeout(async () => {
        if (document.visibilityState !== "visible") return;
        const requestStartedAt = performance.now();
        const succeeded = await refreshResults(true);
        resultsPollFailures.current = succeeded ? 0 : Math.min(resultsPollFailures.current + 1, 4);
        schedulePoll(requestStartedAt);
      }, delay);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        const requestStartedAt = performance.now();
        void refreshResults(true).then((succeeded) => {
          resultsPollFailures.current = succeeded ? 0 : Math.min(resultsPollFailures.current + 1, 4);
          schedulePoll(requestStartedAt);
        });
      } else {
        clearPoll();
      }
    }

    if (!isLoading) schedulePoll();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearPoll();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isLoading, refreshResults]);

  const refreshComments = useCallback(async () => {
    try {
      const response = await requestJson<unknown>("/api/comments");
      if (isCommentsResponse(response)) setComments(response.comments);
    } catch {
      // Comments are non-critical; a failed refresh just keeps the last list.
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refreshComments(), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshComments();
    }, 8_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [refreshComments]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await requestJson<unknown>("/api/topics/history");
        if (!cancelled && isTopicHistoryResponse(response)) setTopicHistory(response.topics);
      } catch {
        // Past topics are non-critical; leave the section empty on failure.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitComment() {
    const text = commentInput.trim();
    if (!text || !lastAcceptedChoice || isCommentSubmitting) return;
    setIsCommentSubmitting(true);
    try {
      const activeSession = await initializeSession();
      await requestJson<unknown>("/api/comments", {
        method: "POST",
        headers: { "X-Clickme-CSRF": activeSession.csrfToken },
        body: JSON.stringify({
          choice: lastAcceptedChoice,
          requestId: createUuid(),
          sessionId: activeSession.sessionId,
          pageViewId: activeSession.pageViewId,
          body: text,
        }),
      });
      setCommentInput("");
      void refreshComments();
    } catch (error) {
      showNotice({ tone: "error", message: friendlyError(error) });
    } finally {
      setIsCommentSubmitting(false);
    }
  }

  useEffect(() => {
    if (!session) return;
    window.clearTimeout(sessionRotationTimer.current);
    let cancelled = false;
    let rotationInFlight: Promise<void> | null = null;
    let resolveBoundaryWait: (() => void) | null = null;

    const beginRotation = () => {
      const activeSession = sessionRef.current;
      if (!activeSession || activeSession.sessionId !== session.sessionId) return;
      const remaining = activeSession.deadlineMonotonic - performance.now();
      if (remaining > SESSION_FINAL_FLUSH_LEAD_MS) {
        window.clearTimeout(sessionRotationTimer.current);
        sessionRotationTimer.current = window.setTimeout(
          beginRotation,
          remaining - SESSION_FINAL_FLUSH_LEAD_MS,
        );
        return;
      }
      if (rotationInFlight) return;

      rotationInFlight = (async () => {
        await Promise.allSettled([
          sendHeartbeat(true, false),
          flushEvents(true, false),
        ]);
        const untilDeadline = activeSession.deadlineMonotonic - performance.now();
        if (untilDeadline > 0) {
          await new Promise<void>((resolve) => {
            resolveBoundaryWait = resolve;
            sessionRotationTimer.current = window.setTimeout(resolve, untilDeadline + 1);
          });
          resolveBoundaryWait = null;
        }
        if (
          !cancelled
          && sessionRef.current?.sessionId === activeSession.sessionId
          && performance.now() >= activeSession.deadlineMonotonic
        ) {
          try {
            await refreshExpiredSession(activeSession.sessionId);
          } catch (error) {
            // Do not leave an expired session looking usable. Clearing only the
            // session we attempted preserves a newer session won by another
            // request and lets the rate-safe recovery effect resume the queue.
            if (sessionRef.current?.sessionId === activeSession.sessionId) {
              sessionRef.current = null;
              setSession(null);
              setSessionError(friendlyError(error));
            }
          }
        }
      })();
    };

    const untilFinalFlush = Math.max(
      0,
      session.deadlineMonotonic - performance.now() - SESSION_FINAL_FLUSH_LEAD_MS,
    );
    sessionRotationTimer.current = window.setTimeout(beginRotation, untilFinalFlush);
    const checkBoundary = () => beginRotation();
    window.addEventListener("focus", checkBoundary);
    window.addEventListener("pageshow", checkBoundary);
    document.addEventListener("visibilitychange", checkBoundary);

    return () => {
      cancelled = true;
      window.clearTimeout(sessionRotationTimer.current);
      resolveBoundaryWait?.();
      window.removeEventListener("focus", checkBoundary);
      window.removeEventListener("pageshow", checkBoundary);
      document.removeEventListener("visibilitychange", checkBoundary);
    };
  }, [flushEvents, refreshExpiredSession, sendHeartbeat, session]);

  useEffect(() => {
    if (!session || !isAnalyticsOpen((campaignRef.current ?? session.campaign).status)) return;
    const interval = window.setInterval(() => void sendHeartbeat(), session.heartbeatIntervalMs);
    const eventInterval = window.setInterval(() => void flushEvents(), EVENT_FLUSH_INTERVAL_MS);
    const activityEvents: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "scroll", "touchstart"];
    const markActivity = () => {
      updateEngagement();
      lastActivityAt.current = performance.now();
    };
    const handleHidden = () => {
      updateEngagement();
      if (document.visibilityState === "hidden") {
        void sendHeartbeat(true);
        void flushEvents(true);
      }
    };
    const handlePageHide = () => {
      updateEngagement();
      void sendHeartbeat(true);
      void flushEvents(true);
    };

    activityEvents.forEach((name) => window.addEventListener(name, markActivity, { passive: true }));
    document.addEventListener("visibilitychange", handleHidden);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.clearInterval(interval);
      window.clearInterval(eventInterval);
      activityEvents.forEach((name) => window.removeEventListener(name, markActivity));
      document.removeEventListener("visibilitychange", handleHidden);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [flushEvents, results?.campaign.status, sendHeartbeat, session, updateEngagement]);

  useEffect(() => {
    if (!session || !isAnalyticsOpen((campaignRef.current ?? session.campaign).status)) return;
    const visibilityTimers = new Map<Element, number>();
    const elements = document.querySelectorAll<HTMLElement>("[data-analytics-section]");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const element = entry.target as HTMLElement;
        const section = element.dataset.analyticsSection;
        if (!section) return;
        const key = `${session.pageViewId}:${section}`;
        if (impressionKeys.current.has(key)) return;

        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (visibilityTimers.has(element)) return;
          const timer = window.setTimeout(() => {
            impressionKeys.current.add(key);
            visibilityTimers.delete(element);
            if (section === "share-card" && lastAcceptedChoice) {
              trackEvent("share_card_impression", {
                choice: lastAcceptedChoice,
                variant: session.experimentVariant,
              });
            } else if (section === "referral-banner") {
              trackEvent("referral_banner_impression", {});
              void flushEvents();
            }
            else trackEvent("section_impression", { section });
          }, 1_000);
          visibilityTimers.set(element, timer);
        } else {
          window.clearTimeout(visibilityTimers.get(element));
          visibilityTimers.delete(element);
        }
      });
    }, { threshold: [0, 0.5] });

    elements.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      visibilityTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [flushEvents, lastAcceptedChoice, referralToken, results?.campaign.status, session, trackEvent]);

  useEffect(() => {
    if (!isVoteInputLocked) return;
    const frame = window.requestAnimationFrame(() => rateLimitConfirmButton.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isVoteInputLocked]);

  const submitVote = useCallback(async (item: QueuedVote) => {
    let activeSession: SessionContext | null = null;

    try {
      activeSession = await initializeSession();
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await requestJson<unknown>("/api/vote", {
            method: "POST",
            headers: { "X-Clickme-CSRF": activeSession.csrfToken },
            body: JSON.stringify({
              choice: item.choice,
              requestId: item.requestId,
              sessionId: activeSession.sessionId,
              pageViewId: activeSession.pageViewId,
            }),
          });
          const voteResponse = response as { accepted?: unknown; choice?: unknown };
          if (voteResponse.accepted !== true || voteResponse.choice !== item.choice) {
            throw new Error("invalid vote response");
          }
          if (item.sequence > latestAcceptedSequence.current) {
            latestAcceptedSequence.current = item.sequence;
            if (lastAcceptedChoiceRef.current !== item.choice) {
              setShareArtifact(null);
              shareArtifactChoice.current = null;
              shareArtifactRequest.current = null;
              shareIdempotencyKey.current = null;
            }
            lastAcceptedChoiceRef.current = item.choice;
            setLastAcceptedChoice(item.choice);
          }
          const currentConfirmed = confirmedVotesRef.current;
          const nextConfirmed = {
            ...currentConfirmed,
            [item.choice]: currentConfirmed[item.choice] + 1,
          };
          confirmedVotesRef.current = nextConfirmed;
          setConfirmedVotes(nextConfirmed);
          break;
        } catch (error) {
          if (
            attempt === 0
            && error instanceof ApiRequestError
            && error.status === 409
            && error.code === "SESSION_EXPIRED"
          ) {
            activeSession = await refreshExpiredSession(activeSession.sessionId);
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 429) {
        trackEvent("vote_rate_limited", {
          code: error.code ?? "RATE_LIMITED",
          retryAfterSeconds: 1,
        });
      } else {
        trackEvent("vote_request_failed", {
          code: error instanceof ApiRequestError ? (error.code ?? `HTTP_${error.status}`) : "CLIENT_ERROR",
        });
      }
      showNotice({ tone: "error", message: friendlyError(error) });
      if (error instanceof ApiRequestError && error.status === 410) void refreshResults(true);
    } finally {
      setPendingVotes((current) => ({ ...current, [item.choice]: Math.max(0, current[item.choice] - 1) }));
      pendingVoteCount.current = Math.max(0, pendingVoteCount.current - 1);
      if (pendingVoteCount.current === 0) {
        const crossedExistingRequest = resultsRequest.current !== null;
        void refreshResults(true).then(() => {
          if (
            crossedExistingRequest
            && pendingVoteCount.current === 0
          ) {
            void refreshResults(true);
          }
        });
      }
    }
  }, [initializeSession, refreshExpiredSession, refreshResults, showNotice, trackEvent]);

  useEffect(() => {
    const dispatch = window.setInterval(() => {
      // Keep queued votes in place while all midnight failures share one
      // session/CSRF refresh. Each shifted item still retries its UUID once.
      if (!sessionRef.current || sessionRequest.current) return;
      const item = voteQueue.current.shift();
      if (!item) return;

      setQueuedVoteCount(voteQueue.current.length);
      void submitVote(item);
    }, VOTE_DISPATCH_INTERVAL_MS);

    return () => window.clearInterval(dispatch);
  }, [submitVote]);

  function createBurst(choice: Choice, target: HTMLButtonElement, event: MouseEvent<HTMLButtonElement>) {
    const rect = target.getBoundingClientRect();
    const left = event.clientX > 0 ? ((event.clientX - rect.left) / rect.width) * 100 : 50;
    const top = event.clientY > 0 ? ((event.clientY - rect.top) / rect.height) * 100 : 50;
    const batchId = burstId.current;
    burstId.current += DISPLAY[choice].burstTokens.length;

    const nextBursts = DISPLAY[choice].burstTokens.map((emoji, index) => ({
      id: batchId + index,
      emoji,
      choice,
      left,
      top,
      drift: -86 + Math.random() * 172,
      rotate: -130 + Math.random() * 260,
      delay: Math.random() * 80,
    }));

    setBursts((current) => [...current.slice(-48), ...nextBursts]);
    const ids = new Set(nextBursts.map((burst) => burst.id));
    const timer = window.setTimeout(() => {
      setBursts((current) => current.filter((burst) => !ids.has(burst.id)));
    }, 1_150);
    burstTimers.current.push(timer);
  }

  function handleVote(choice: Choice, event: MouseEvent<HTMLButtonElement>) {
    if (voteLock.current || voteQueue.current.length >= VOTE_QUEUE_MAX_SIZE) {
      if (!voteLock.current) {
        voteLock.current = true;
        setIsVoteInputLocked(true);
        trackEvent("rapid_click_lock_shown", { queueLength: VOTE_QUEUE_MAX_SIZE });
      }
      return;
    }

    const target = event.currentTarget;
    setLastChoice(choice);
    setClickCount((count) => count + 1);
    createBurst(choice, target, event);
    setPendingVotes((current) => ({ ...current, [choice]: current[choice] + 1 }));
    pendingVoteCount.current += 1;
    const sequence = nextVoteSequence.current;
    nextVoteSequence.current += 1;
    voteQueue.current.push({ choice, requestId: createUuid(), sequence });
    setQueuedVoteCount(voteQueue.current.length);
  }

  const getShareArtifact = useCallback(async (): Promise<ShareArtifact> => {
    if (shareArtifact && shareArtifactChoice.current === lastAcceptedChoice) return shareArtifact;
    if (shareArtifactRequest.current) return shareArtifactRequest.current;
    if (!lastAcceptedChoice) throw new Error("vote required");

    const artifactChoice = lastAcceptedChoice;

    let activeSession = await initializeSession();
    const idempotencyKey = shareIdempotencyKey.current ?? createUuid();
    shareIdempotencyKey.current = idempotencyKey;
    const serverCounts = results?.counts ?? { dip: 0, pour: 0, total: 0 };
    const dip = serverCounts.dip + pendingVotes.dip + confirmedVotes.dip;
    const pour = serverCounts.pour + pendingVotes.pour + confirmedVotes.pour;
    const total = dip + pour;
    const snapshot = {
      counts: { dip, pour, total },
      percentages: { dip: percentage(dip, total), pour: total === 0 ? 50 : 100 - percentage(dip, total) },
    };

    const request = (async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await requestJson<unknown>("/api/shares", {
            method: "POST",
            headers: {
              "X-Clickme-CSRF": activeSession.csrfToken,
              "Idempotency-Key": idempotencyKey,
            },
            body: JSON.stringify({
              choice: artifactChoice,
              sessionId: activeSession.sessionId,
              pageViewId: activeSession.pageViewId,
              snapshot,
            }),
          });
          if (!isShareArtifact(response)) throw new Error("invalid share response");
          const artifact = { shareUrl: response.shareUrl, imageUrl: response.imageUrl ?? null };
          if (lastAcceptedChoiceRef.current === artifactChoice) {
            shareArtifactChoice.current = artifactChoice;
            setShareArtifact(artifact);
          }
          return artifact;
        } catch (error) {
          if (
            attempt === 0
            && error instanceof ApiRequestError
            && error.status === 409
            && error.code === "SESSION_EXPIRED"
          ) {
            activeSession = await refreshExpiredSession(activeSession.sessionId);
            continue;
          }
          throw error;
        }
      }
      throw new Error("share request failed");
    })().finally(() => {
      shareArtifactRequest.current = null;
    });

    shareArtifactRequest.current = request;
    return request;
  }, [confirmedVotes, initializeSession, lastAcceptedChoice, pendingVotes, refreshExpiredSession, results, shareArtifact]);

  async function resolveShareUrl(): Promise<{ url: string; generated: boolean }> {
    try {
      const artifact = await getShareArtifact();
      return { url: artifact.shareUrl, generated: true };
    } catch {
      return { url: `${window.location.origin}/`, generated: false };
    }
  }

  async function handleShare() {
    if (!lastAcceptedChoice || isShareLoading) return;
    setIsShareLoading(true);
    trackEvent("share_cta_clicked", {
      choice: lastAcceptedChoice,
      variant: session?.experimentVariant ?? "A",
    });

    try {
      const { url, generated } = await resolveShareUrl();
      const shareData = {
        title: "엄성현 vs 안건호",
        text: shareMessage(lastAcceptedChoice),
        url,
      };

      if (navigator.share) {
        try {
          await navigator.share(shareData);
          trackEvent("share_sheet_resolved", { method: "native", choice: lastAcceptedChoice });
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            trackEvent("share_sheet_cancelled", { method: "native", choice: lastAcceptedChoice });
          } else {
            await copyText(url);
            trackEvent("share_link_copied", { choice: lastAcceptedChoice });
            showNotice({ tone: "success", message: "링크를 복사했어요. 친구를 불러와 봐요!" });
          }
        }
      } else {
        await copyText(url);
        trackEvent("share_link_copied", { choice: lastAcceptedChoice });
        showNotice({ tone: "success", message: "링크를 복사했어요. 친구를 불러와 봐요!" });
      }

      if (!generated) {
        showNotice({ tone: "error", message: "추천 링크를 만들지 못해 기본 링크를 공유했어요." });
      }
    } catch (error) {
      showNotice({ tone: "error", message: friendlyError(error) });
    } finally {
      setIsShareLoading(false);
      void flushEvents();
    }
  }

  async function handleCopyLink() {
    if (!lastAcceptedChoice || isShareLoading) return;
    setIsShareLoading(true);
    try {
      const { url, generated } = await resolveShareUrl();
      await copyText(url);
      trackEvent("share_link_copied", { choice: lastAcceptedChoice });
      showNotice({
        tone: generated ? "success" : "error",
        message: generated ? "도전 링크를 복사했어요!" : "기본 링크를 복사했어요.",
      });
    } catch (error) {
      showNotice({ tone: "error", message: friendlyError(error) });
    } finally {
      setIsShareLoading(false);
      void flushEvents();
    }
  }

  function handleFooterClick() {
    const now = Date.now();
    const recentClicks = footerClickTimes.current.filter(
      (clickedAt) => now - clickedAt <= FOOTER_EASTER_EGG_WINDOW_MS,
    );
    recentClicks.push(now);
    footerClickTimes.current = recentClicks;

    if (recentClicks.length !== FOOTER_EASTER_EGG_CLICKS) return;

    footerClickTimes.current = [];
    window.open(FOOTER_EASTER_EGG_ROUTE, "_blank", "noopener,noreferrer");
  }

  function confirmRapidClickWarning() {
    trackEvent("rapid_click_lock_confirmed", { queueLength: voteQueue.current.length });
    voteLock.current = false;
    setIsVoteInputLocked(false);
    void flushEvents();
  }

  useEffect(() => () => {
    window.clearTimeout(noticeTimer.current);
    window.clearTimeout(resultsPollTimer.current);
    window.clearTimeout(sessionRotationTimer.current);
    window.clearTimeout(sessionRetryTimer.current);
    burstTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const campaign = results?.campaign ?? session?.campaign;
  const serverCounts = results?.counts ?? { dip: 0, pour: 0, total: 0 };
  const dipCount = serverCounts.dip + pendingVotes.dip + confirmedVotes.dip;
  const pourCount = serverCounts.pour + pendingVotes.pour + confirmedVotes.pour;
  const totalCount = dipCount + pourCount;
  const dipPercentage = percentage(dipCount, totalCount);
  const pourPercentage = totalCount === 0 ? 50 : 100 - dipPercentage;
  const canVote = Boolean(session && isVotingOpen(campaign?.status));
  const canShare = Boolean(lastAcceptedChoice && session && isSharingOpen(campaign?.status));
  const canComment = Boolean(lastAcceptedChoice && session && isCommentsOpen(campaign?.status));
  const shareCta = session?.experimentVariant === "B" ? "친구에게 선택 물어보기" : "결과 공유하기";
  const campaignReadOnly = campaign && !isVotingOpen(campaign.status);
  const campaignUnavailableMessage = "지금은 투표를 받지 않고 결과만 보여 드려요.";

  return (
    <main
      className="km-shell min-h-screen w-full bg-black overflow-x-hidden relative select-none"
      style={{ fontFamily: "'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif" }}
    >
      <div className="max-w-2xl sm:max-w-3xl lg:max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {referralToken ? (
          <aside className="km-referral-banner" data-analytics-section="referral-banner">
            <span aria-hidden="true">🔥</span>
            <div>
              <strong>친구가 당신의 최애를 기다리고 있어요</strong>
              <p>엄성현과 안건호, 누가 최애인지 골라 주세요!</p>
            </div>
          </aside>
        ) : null}

        <div className="text-center mb-8">
          <p className="km-badge">⚡ 오늘의 밸런스게임 ⚡</p>
          <h1 id="game-title" className="km-title">엄성현 vs 안건호</h1>
          <p className="km-worldcup">🔥 CORTIS · 최애 픽 🩵</p>
          <p className="km-subtitle">여러 번 클릭 가능 · 최애를 계속 눌러봐</p>
        </div>

        <section aria-label="실시간 투표 현황" className="mb-6" data-analytics-section="scoreboard">
          <div className="flex overflow-hidden h-2 rounded-full bg-neutral-900">
            <span
              className="h-full km-score-bar"
              style={{ width: `${dipPercentage}%`, backgroundColor: DISPLAY.dip.accent }}
            />
            <span
              className="h-full km-score-bar"
              style={{ width: `${pourPercentage}%`, backgroundColor: DISPLAY.pour.accent }}
            />
          </div>
          <div className="flex justify-between text-base mt-3 km-score-labels">
            <span style={{ color: DISPLAY.dip.accent }}>
              {DISPLAY.dip.label} {dipPercentage}% · {numberFormatter.format(dipCount)}표
            </span>
            <span className="km-total">총 {numberFormatter.format(totalCount)}명</span>
            <span style={{ color: DISPLAY.pour.accent }}>
              {DISPLAY.pour.label} {pourPercentage}% · {numberFormatter.format(pourCount)}표
            </span>
          </div>
        </section>

        {sessionError || loadError ? (
          <p className="km-inline-error" role="alert">{sessionError ?? loadError}</p>
        ) : null}
        {campaignReadOnly ? (
          <p className="km-campaign-state" role="status">{campaignUnavailableMessage}</p>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-8">
          <VoteButton
            choice="dip"
            isSelected={lastChoice === "dip"}
            isDisabled={isLoading || !canVote || isVoteInputLocked}
            onVote={handleVote}
            bursts={bursts.filter((burst) => burst.choice === "dip")}
          />
          <VoteButton
            choice="pour"
            isSelected={lastChoice === "pour"}
            isDisabled={isLoading || !canVote || isVoteInputLocked}
            onVote={handleVote}
            bursts={bursts.filter((burst) => burst.choice === "pour")}
          />
        </div>

        <p aria-live="polite" className="km-click-status text-center">
          {lastChoice
            ? (
              <>
                {DISPLAY[lastChoice].emoji} <b>{DISPLAY[lastChoice].registeredText}</b>
                <span className="km-click-count"> (총 {clickCount}번 클릭){queuedVoteCount > 0 ? ` · ${queuedVoteCount}개 반영 대기 중` : ""}</span>
              </>
            )
            : campaignReadOnly ? "현재 공개된 투표 결과예요." : "마음 가는 쪽을 계속 눌러 주세요!"}
        </p>

        <div className="max-w-2xl mx-auto w-full">
        {canShare && lastAcceptedChoice ? (
          <section
            className="km-share-card"
            data-analytics-section="share-card"
            style={{ borderColor: DISPLAY[lastAcceptedChoice].accent }}
          >
            <p className="km-share-eyebrow">내 선택 결과</p>
            <h2>나는 <strong style={{ color: DISPLAY[lastAcceptedChoice].accent }}>{DISPLAY[lastAcceptedChoice].label}파!</strong></h2>
            <p>
              지금 {DISPLAY[lastAcceptedChoice].label}{topicParticle(DISPLAY[lastAcceptedChoice].label)} <b>{lastAcceptedChoice === "dip" ? dipPercentage : pourPercentage}%</b>
              {dipPercentage === pourPercentage
                ? "로 팽팽해요."
                : ` · ${Math.abs(dipPercentage - pourPercentage)}%p 차이예요.`}
            </p>
            <button
              className="km-share"
              disabled={isShareLoading}
              onClick={() => void handleShare()}
              type="button"
            >
              {isShareLoading ? "도전 링크 만드는 중…" : shareCta} <span aria-hidden="true">↗</span>
            </button>
            <div className="km-share-actions">
              <button disabled={isShareLoading} onClick={() => void handleCopyLink()} type="button">링크 복사</button>
            </div>
          </section>
        ) : null}

        <div className="km-divider" />

        <section className="mb-10">
          <h2 className="km-section-title">
            익명 댓글 <span className="km-section-count">{comments.length}</span>
          </h2>

          <div className="flex gap-2 mb-5">
            <input
              type="text"
              value={commentInput}
              onChange={(event) => setCommentInput(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void submitComment()}
              placeholder={canComment ? "익명으로 댓글 달기..." : "투표 후 댓글을 남길 수 있어요"}
              maxLength={240}
              disabled={!canComment || isCommentSubmitting}
              className="km-comment-input"
            />
            <button
              onClick={() => void submitComment()}
              disabled={!canComment || isCommentSubmitting || commentInput.trim().length === 0}
              className="km-comment-submit"
              type="button"
            >
              등록
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {comments.map((comment) => (
              <div key={comment.id} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="km-comment-dot"
                  style={{ backgroundColor: DISPLAY[comment.choice].accent }}
                />
                <div className="flex-1">
                  <p className="km-comment-body">{comment.body}</p>
                  <p className="km-comment-time">{formatRelativeTime(comment.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="km-divider" />

        <section className="mb-12">
          <button
            className="km-past-toggle"
            onClick={() => setShowPastTopics((value) => !value)}
            type="button"
          >
            <h2 className="km-section-title">이전 주제</h2>
            <span className="km-past-toggle-hint">{showPastTopics ? "접기 ↑" : "펼치기 ↓"}</span>
          </button>

          {showPastTopics ? (
            <div className="km-past-list">
              {topicHistory.length === 0 ? (
                <p className="km-past-empty">아직 이전 주제가 없어요.</p>
              ) : topicHistory.map((topic) => {
                const total = topic.optionACount + topic.optionBCount;
                const pctA = total === 0 ? 50 : Math.round((topic.optionACount / total) * 100);
                const pctB = 100 - pctA;
                return (
                  <div key={topic.id} className="km-past-item">
                    <div>
                      <p className="km-past-date">{formatArchivedDate(topic.archivedAt)}</p>
                      <p className="km-past-title">{topic.title}</p>
                    </div>
                    <p className="km-past-result">
                      {topic.optionALabel} {pctA}% · {topic.optionBLabel} {pctB}%
                    </p>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>

        <footer className="km-footer">
          <span onClick={handleFooterClick}>⚡ 오늘의 밸런스게임 · 투표는 계속됩니다 ⚡</span>
          <a href="/privacy">개인정보 처리 안내</a>
        </footer>
        </div>
      </div>

      {notice ? <p className={`km-toast km-toast--${notice.tone}`} role="status">{notice.message}</p> : null}

      {isVoteInputLocked ? (
        <div className="km-rate-limit-overlay">
          <section
            aria-describedby="vote-rate-limit-description"
            aria-labelledby="vote-rate-limit-title"
            aria-modal="true"
            className="km-rate-limit-dialog"
            onKeyDown={(event) => {
              if (event.key === "Tab") {
                event.preventDefault();
                rateLimitConfirmButton.current?.focus();
              }
            }}
            role="alertdialog"
          >
            <p aria-hidden="true" className="km-rate-limit-icon">⚠️</p>
            <h2 id="vote-rate-limit-title">클릭이 너무 빠릅니다</h2>
            <p id="vote-rate-limit-description">한 번에 최대 30번까지만 반영할 수 있어요. 확인 후 다시 눌러 주세요.</p>
            <button
              className="km-rate-limit-confirm"
              onClick={confirmRapidClickWarning}
              ref={rateLimitConfirmButton}
              type="button"
            >
              확인
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function VoteButton({
  choice,
  isSelected,
  isDisabled,
  onVote,
  bursts,
}: {
  choice: Choice;
  isSelected: boolean;
  isDisabled: boolean;
  onVote: (choice: Choice, event: MouseEvent<HTMLButtonElement>) => void;
  bursts: Burst[];
}) {
  const option = DISPLAY[choice];

  return (
    <motion.button
      animate={isSelected ? { x: [0, -6, 6, -6, 6, 0] } : {}}
      aria-label={`${option.label}에 1표 더하기`}
      className="km-choice relative overflow-hidden rounded-sm"
      data-analytics-section={`choice-${choice}`}
      disabled={isDisabled}
      onClick={(event) => onVote(choice, event)}
      style={{
        aspectRatio: "3/4",
        outline: isSelected ? `2px solid ${option.accent}` : "2px solid transparent",
        boxShadow: isSelected ? `0 0 24px ${option.accent}66` : "none",
      }}
      transition={{ duration: 0.25 }}
      type="button"
      whileHover={isDisabled ? undefined : { scale: 1.02 }}
      whileTap={isDisabled ? undefined : { scale: 0.97 }}
    >
      <ImageWithFallback
        alt={option.label}
        className="absolute inset-0 w-full h-full object-cover"
        src={option.photo}
      />
      <span aria-hidden="true" className="km-choice-overlay absolute inset-0" />
      <span className="absolute bottom-0 left-0 right-0 p-4 sm:p-5 lg:p-6 text-left km-choice-content">
        <span className="km-choice-eyebrow" style={{ color: option.accent }}>{option.eyebrow}</span>
        <strong className="km-choice-label">{option.label}</strong>
      </span>
      {isSelected ? (
        <span className="km-picked" style={{ backgroundColor: option.accent }}>내 최애!</span>
      ) : null}
      <span aria-hidden="true" className="km-bursts">
        {bursts.map((burst) => (
          <i
            className="km-burst"
            key={burst.id}
            style={{
              "--burst-left": `${burst.left}%`,
              "--burst-top": `${burst.top}%`,
              "--burst-drift": `${burst.drift}px`,
              "--burst-rotate": `${burst.rotate}deg`,
              animationDelay: `${burst.delay}ms`,
              color: option.accent,
            } as CSSProperties}
          >
            {burst.emoji}
          </i>
        ))}
      </span>
    </motion.button>
  );
}
