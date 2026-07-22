"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";

import { motion } from "motion/react";

type TeamChoice =
  | "kia"
  | "samsung"
  | "lg"
  | "doosan"
  | "kt"
  | "ssg"
  | "lotte"
  | "hanwha"
  | "nc"
  | "kiwoom";

type Team = {
  id: TeamChoice;
  name: string;
  color: string;
  glow: string;
  logo: string;
  burstTokens: string[];
};

type CampaignStatus = "active" | "protected" | "read_only";

type CampaignState = {
  id?: string;
  status: CampaignStatus;
  startsAt: string | null;
  endsAt: string | null;
  revision: number;
};

type TeamVoteResults = {
  counts: Record<TeamChoice, number>;
  total: number;
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
  choice: TeamChoice;
  requestId: string;
  sequence: number;
};

type CommentEntry = {
  id: string;
  choice: TeamChoice;
  body: string;
  createdAt: string;
};

type TopicHistoryResult = {
  label: string;
  voteCount: number;
};

type TopicHistoryEntry = {
  id: string;
  title: string;
  archivedAt: string;
  results: TopicHistoryResult[];
};

// The team-voting system (this component) and the earlier binary dip/pour
// system (components/vote-arena.tsx) keep fully separate history tables, so
// team_topic_history alone only goes back to the first team topic. Every
// earlier day's topic (탕수육, 카리나 vs 장원영, 스페인 vs 아르헨티나, ...) still
// lives in the binary topic_history table via /api/topics/history. Both are
// fetched and merged below so "이전 주제" reads as one continuous timeline.
type BinaryTopicHistoryEntry = {
  id: string;
  title: string;
  optionALabel: string;
  optionACount: number;
  optionBLabel: string;
  optionBCount: number;
  archivedAt: string;
};

type Notice = { tone: "success" | "error"; message: string };

type ShareArtifact = {
  shareUrl: string;
  imageUrl: string | null;
};

type Burst = {
  id: number;
  emoji: string;
  choice: TeamChoice;
  left: number;
  top: number;
  drift: number;
  rotate: number;
  delay: number;
};

const TEAMS: Team[] = [
  { id: "kia", name: "KIA 타이거즈", color: "#E61E23", glow: "rgba(230,30,35,0.35)", logo: "/logos/kia.svg", burstTokens: ["KIA", "🐯", "화이팅!", "타이거즈", "우승!"] },
  { id: "samsung", name: "삼성 라이온즈", color: "#0066B3", glow: "rgba(0,102,179,0.35)", logo: "/logos/samsung.svg", burstTokens: ["삼성", "🦁", "화이팅!", "라이온즈", "우승!"] },
  { id: "lg", name: "LG 트윈스", color: "#C60C30", glow: "rgba(198,12,48,0.35)", logo: "/logos/lg.svg", burstTokens: ["LG", "💫", "화이팅!", "트윈스", "우승!"] },
  { id: "doosan", name: "두산 베어스", color: "#5A7FC2", glow: "rgba(90,127,194,0.35)", logo: "/logos/doosan.svg", burstTokens: ["두산", "🐻", "화이팅!", "베어스", "우승!"] },
  { id: "kt", name: "KT 위즈", color: "#D0021B", glow: "rgba(208,2,27,0.35)", logo: "/logos/kt.svg", burstTokens: ["KT", "⚡", "화이팅!", "위즈", "우승!"] },
  { id: "ssg", name: "SSG 랜더스", color: "#CE0E2D", glow: "rgba(206,14,45,0.35)", logo: "/logos/ssg.svg", burstTokens: ["SSG", "🦅", "화이팅!", "랜더스", "우승!"] },
  { id: "lotte", name: "롯데 자이언츠", color: "#0055A4", glow: "rgba(0,85,164,0.35)", logo: "/logos/lotte.svg", burstTokens: ["롯데", "🔱", "화이팅!", "자이언츠", "우승!"] },
  { id: "hanwha", name: "한화 이글스", color: "#FF6600", glow: "rgba(255,102,0,0.35)", logo: "/logos/hanwha.svg", burstTokens: ["한화", "🦅", "화이팅!", "이글스", "우승!"] },
  { id: "nc", name: "NC 다이노스", color: "#315288", glow: "rgba(49,82,136,0.35)", logo: "/logos/nc.svg", burstTokens: ["NC", "🦖", "화이팅!", "다이노스", "우승!"] },
  { id: "kiwoom", name: "키움 히어로즈", color: "#820024", glow: "rgba(130,0,36,0.35)", logo: "/logos/kiwoom.svg", burstTokens: ["키움", "🦸", "화이팅!", "히어로즈", "우승!"] },
];

const TEAM_CHOICES: TeamChoice[] = TEAMS.map((team) => team.id);

const numberFormatter = new Intl.NumberFormat("ko-KR");
const VOTE_DISPATCH_INTERVAL_MS = 80;
const VOTE_QUEUE_MAX_SIZE = 30;
const RESULTS_POLL_MIN_MS = 1_000;
const RESULTS_POLL_MAX_BACKOFF_MS = 60_000;
const FOOTER_EASTER_EGG_CLICKS = 10;
const FOOTER_EASTER_EGG_WINDOW_MS = 5_000;
const FOOTER_EASTER_EGG_ROUTE = "/api/next";

function zeroCounts(): Record<TeamChoice, number> {
  return Object.fromEntries(TEAM_CHOICES.map((id) => [id, 0])) as Record<TeamChoice, number>;
}

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

function isTeamVoteResults(value: unknown): value is TeamVoteResults {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<TeamVoteResults>;
  return Boolean(
    result.counts
    && typeof result.total === "number"
    && TEAM_CHOICES.every((id) => typeof (result.counts as Record<string, unknown>)[id] === "number")
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

function isCommentsResponse(value: unknown): value is { comments: CommentEntry[] } {
  if (!value || typeof value !== "object") return false;
  const response = value as { comments?: unknown };
  return Array.isArray(response.comments);
}

function isTopicHistoryResponse(value: unknown): value is { topics: TopicHistoryEntry[] } {
  if (!value || typeof value !== "object") return false;
  const response = value as { topics?: unknown };
  return Array.isArray(response.topics);
}

function isBinaryTopicHistoryResponse(value: unknown): value is { topics: BinaryTopicHistoryEntry[] } {
  if (!value || typeof value !== "object") return false;
  const response = value as { topics?: unknown };
  return Array.isArray(response.topics);
}

function isShareArtifact(value: unknown): value is ShareArtifact {
  if (!value || typeof value !== "object") return false;
  const artifact = value as Partial<ShareArtifact>;
  return (
    typeof artifact.shareUrl === "string"
    && (typeof artifact.imageUrl === "string" || artifact.imageUrl === null || artifact.imageUrl === undefined)
  );
}

function friendlyError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 429) return "너무 빠르게 요청하고 있어요. 잠시 후 다시 시도해 주세요.";
    if (error.status === 409) return "세션이 만료되어 다시 시작했어요. 다시 시도해 주세요.";
    if (error.status === 410) return "지금은 참여할 수 없어요.";
    return error.message;
  }
  return "네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.";
}

function percentage(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function createUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => {
    const n = Number(c);
    return (n ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (n / 4)))).toString(16);
  });
}

function safeHost(referrer: string): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.slice(0, 128);
  } catch {
    return null;
  }
}

function shortQueryValue(params: URLSearchParams, key: string): string | null {
  const value = params.get(key);
  return value ? value.slice(0, 128) : null;
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

function shareMessage(team: Team): string {
  return `나는 ${team.name}파! 당신의 최애 구단은?`;
}

function isCommentsOpen(status: CampaignStatus | undefined): boolean {
  return status === "active";
}

function isSessionBeforeDeadline(session: SessionContext): boolean {
  return performance.now() < session.deadlineMonotonic;
}

function formatArchivedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

export function TeamVoteArena({ referralToken }: { referralToken?: string } = {}) {
  const [results, setResults] = useState<TeamVoteResults | null>(null);
  const [session, setSession] = useState<SessionContext | null>(null);
  const [confirmedVotes, setConfirmedVotes] = useState<Record<TeamChoice, number>>(zeroCounts());
  const [lastAcceptedChoice, setLastAcceptedChoice] = useState<TeamChoice | null>(null);
  const [lastClicked, setLastClicked] = useState<TeamChoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [commentInput, setCommentInput] = useState("");
  const [isCommentSubmitting, setIsCommentSubmitting] = useState(false);
  const [topicHistory, setTopicHistory] = useState<TopicHistoryEntry[]>([]);
  const [showPastTopics, setShowPastTopics] = useState(false);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [shareArtifact, setShareArtifact] = useState<ShareArtifact | null>(null);

  const sessionRef = useRef<SessionContext | null>(null);
  const sessionRequest = useRef<Promise<SessionContext> | null>(null);
  const campaignRef = useRef<CampaignState | null>(null);
  const confirmedVotesRef = useRef<Record<TeamChoice, number>>(zeroCounts());
  const lastAcceptedChoiceRef = useRef<TeamChoice | null>(null);
  const publicCountsRef = useRef<Record<TeamChoice, number> | null>(null);
  const publicCampaignIdRef = useRef<string | undefined>(undefined);
  const resultsRequest = useRef<Promise<boolean> | null>(null);
  const voteQueue = useRef<QueuedVote[]>([]);
  const voteSequence = useRef(0);
  const latestAcceptedSequence = useRef(-1);
  const pendingVoteCount = useRef(0);
  const noticeTimer = useRef<number | undefined>(undefined);
  const resultsPollTimer = useRef<number | undefined>(undefined);
  const resultsPollFailures = useRef(0);
  const footerClickTimes = useRef<number[]>([]);
  const burstId = useRef(0);
  const burstTimers = useRef<number[]>([]);
  const shareArtifactRequest = useRef<Promise<ShareArtifact> | null>(null);
  const shareArtifactChoice = useRef<TeamChoice | null>(null);
  const shareIdempotencyKey = useRef<string | null>(null);

  const showNotice = useCallback((next: Notice) => {
    window.clearTimeout(noticeTimer.current);
    setNotice(next);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4_000);
  }, []);

  const createSession = useCallback(async (): Promise<SessionContext> => {
    const query = new URLSearchParams(window.location.search);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const payload = {
      path: window.location.pathname,
      pageViewId: createUuid(),
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
    };

    const requestStartedAtMonotonic = performance.now();
    const response = await requestJson<unknown>("/api/session", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!isSessionResponse(response)) throw new Error("invalid session response");
    const receivedAtMonotonic = performance.now();
    return {
      ...response,
      requestStartedAtMonotonic,
      receivedAtMonotonic,
      deadlineMonotonic: requestStartedAtMonotonic + response.expiresInMs,
      serverTimeAtReceiptMs: new Date(response.serverTime).getTime(),
    };
  }, []);

  const initializeSession = useCallback(async (force = false): Promise<SessionContext> => {
    const current = sessionRef.current;
    if (!force && current && isSessionBeforeDeadline(current)) return current;
    if (sessionRequest.current) return sessionRequest.current;

    const request = createSession()
      .then((nextSession) => {
        sessionRef.current = nextSession;
        campaignRef.current = nextSession.campaign;
        setSession(nextSession);
        return nextSession;
      })
      .finally(() => {
        sessionRequest.current = null;
      });

    sessionRequest.current = request;
    return request;
  }, [createSession]);

  const refreshExpiredSession = useCallback(async (expiredSessionId: string): Promise<SessionContext> => {
    const current = sessionRef.current;
    if (current && current.sessionId !== expiredSessionId && isSessionBeforeDeadline(current)) {
      return current;
    }
    return initializeSession(true);
  }, [initializeSession]);

  const reconcileResults = useCallback((
    nextResults: TeamVoteResults,
    confirmedAtRequestStart: Record<TeamChoice, number>,
  ) => {
    const previousCounts = publicCountsRef.current;
    const campaignChanged = (
      previousCounts !== null
      && publicCampaignIdRef.current !== undefined
      && nextResults.campaign.id !== publicCampaignIdRef.current
    );

    if (!previousCounts || campaignChanged) {
      publicCountsRef.current = nextResults.counts;
      publicCampaignIdRef.current = nextResults.campaign.id;
      if (campaignChanged) {
        confirmedVotesRef.current = zeroCounts();
        setConfirmedVotes(zeroCounts());
      }
      setResults(nextResults);
      return;
    }

    const counts = zeroCounts();
    let total = 0;
    for (const id of TEAM_CHOICES) {
      counts[id] = Math.max(previousCounts[id], nextResults.counts[id]);
      total += counts[id];
    }

    const currentConfirmed = confirmedVotesRef.current;
    const nextConfirmed = zeroCounts();
    for (const id of TEAM_CHOICES) {
      const observed = Math.max(0, counts[id] - previousCounts[id]);
      nextConfirmed[id] = Math.max(
        0,
        currentConfirmed[id] - Math.min(observed, confirmedAtRequestStart[id], currentConfirmed[id]),
      );
    }

    publicCountsRef.current = counts;
    publicCampaignIdRef.current = nextResults.campaign.id;
    confirmedVotesRef.current = nextConfirmed;
    setConfirmedVotes(nextConfirmed);
    setResults({ counts, total, campaign: nextResults.campaign });
  }, []);

  const refreshResults = useCallback(async (silent = false): Promise<boolean> => {
    if (resultsRequest.current) return resultsRequest.current;
    if (!silent) setIsLoading(true);
    const confirmedAtRequestStart = { ...confirmedVotesRef.current };

    const request = (async () => {
      try {
        const nextResults = await requestJson<unknown>("/api/team-results");
        if (!isTeamVoteResults(nextResults)) throw new Error("invalid results response");
        campaignRef.current = nextResults.campaign;
        reconcileResults(nextResults, confirmedAtRequestStart);
        setLoadError(null);
        return true;
      } catch (error) {
        setLoadError(friendlyError(error));
        return false;
      } finally {
        setIsLoading(false);
      }
    })();

    resultsRequest.current = request;
    try {
      return await request;
    } finally {
      resultsRequest.current = null;
    }
  }, [reconcileResults]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refreshResults(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [refreshResults]);

  // The vote dispatch loop below only shifts queued votes once a session
  // already exists (sessionRef.current), and only initializeSession() ever
  // sets that ref. Bootstrap it eagerly on mount so the very first click
  // doesn't sit in the queue waiting on a session that nothing has asked for.
  useEffect(() => {
    let cancelled = false;
    const bootstrap = window.setTimeout(() => {
      void initializeSession().catch((error: unknown) => {
        if (!cancelled) showNotice({ tone: "error", message: friendlyError(error) });
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(bootstrap);
    };
  }, [initializeSession, showNotice]);

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
      const response = await requestJson<unknown>("/api/team-comments");
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
      const [teamResult, binaryResult] = await Promise.allSettled([
        requestJson<unknown>("/api/team-topics/history"),
        requestJson<unknown>("/api/topics/history"),
      ]);
      if (cancelled) return;

      const teamTopics = teamResult.status === "fulfilled" && isTopicHistoryResponse(teamResult.value)
        ? teamResult.value.topics
        : [];
      const binaryTopics = binaryResult.status === "fulfilled" && isBinaryTopicHistoryResponse(binaryResult.value)
        ? binaryResult.value.topics.map((topic): TopicHistoryEntry => ({
          id: topic.id,
          title: topic.title,
          archivedAt: topic.archivedAt,
          results: [
            { label: topic.optionALabel, voteCount: topic.optionACount },
            { label: topic.optionBLabel, voteCount: topic.optionBCount },
          ],
        }))
        : [];

      const merged = [...teamTopics, ...binaryTopics].sort(
        (a, b) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime(),
      );
      setTopicHistory(merged);
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
      await requestJson<unknown>("/api/team-comments", {
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

  const getShareArtifact = useCallback(async (): Promise<ShareArtifact> => {
    if (shareArtifact && shareArtifactChoice.current === lastAcceptedChoice) return shareArtifact;
    if (shareArtifactRequest.current) return shareArtifactRequest.current;
    if (!lastAcceptedChoice) throw new Error("vote required");

    const artifactChoice = lastAcceptedChoice;
    let activeSession = await initializeSession();
    const idempotencyKey = shareIdempotencyKey.current ?? createUuid();
    shareIdempotencyKey.current = idempotencyKey;

    const request = (async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await requestJson<unknown>("/api/team-shares", {
            method: "POST",
            headers: {
              "X-Clickme-CSRF": activeSession.csrfToken,
              "Idempotency-Key": idempotencyKey,
            },
            body: JSON.stringify({
              choice: artifactChoice,
              sessionId: activeSession.sessionId,
              pageViewId: activeSession.pageViewId,
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
  }, [initializeSession, lastAcceptedChoice, refreshExpiredSession, shareArtifact]);

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
    const team = TEAMS.find((t) => t.id === lastAcceptedChoice);

    try {
      const { url, generated } = await resolveShareUrl();
      const shareData = {
        title: "오늘의 밸런스게임 - 가장 좋아하는 KBO 야구팀은?",
        text: team ? shareMessage(team) : "가장 좋아하는 KBO 야구팀은?",
        url,
      };

      if (navigator.share) {
        try {
          await navigator.share(shareData);
        } catch (error) {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            await copyText(url);
            showNotice({ tone: "success", message: "링크를 복사했어요. 친구를 불러와 봐요!" });
          }
        }
      } else {
        await copyText(url);
        showNotice({ tone: "success", message: "링크를 복사했어요. 친구를 불러와 봐요!" });
      }

      if (!generated) {
        showNotice({ tone: "error", message: "추천 링크를 만들지 못해 기본 링크를 공유했어요." });
      }
    } catch (error) {
      showNotice({ tone: "error", message: friendlyError(error) });
    } finally {
      setIsShareLoading(false);
    }
  }

  async function handleCopyLink() {
    if (!lastAcceptedChoice || isShareLoading) return;
    setIsShareLoading(true);
    try {
      const { url, generated } = await resolveShareUrl();
      await copyText(url);
      showNotice({
        tone: generated ? "success" : "error",
        message: generated ? "도전 링크를 복사했어요!" : "기본 링크를 복사했어요.",
      });
    } catch (error) {
      showNotice({ tone: "error", message: friendlyError(error) });
    } finally {
      setIsShareLoading(false);
    }
  }

  const submitVote = useCallback(async (item: QueuedVote) => {
    let activeSession: SessionContext | null = null;

    try {
      activeSession = await initializeSession();
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await requestJson<unknown>("/api/team-vote", {
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
          const nextConfirmed = { ...currentConfirmed, [item.choice]: currentConfirmed[item.choice] + 1 };
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
      showNotice({ tone: "error", message: friendlyError(error) });
      if (error instanceof ApiRequestError && error.status === 410) void refreshResults(true);
    } finally {
      pendingVoteCount.current = Math.max(0, pendingVoteCount.current - 1);
      if (pendingVoteCount.current === 0) void refreshResults(true);
    }
  }, [initializeSession, refreshExpiredSession, refreshResults, showNotice]);

  useEffect(() => {
    const dispatch = window.setInterval(() => {
      if (!sessionRef.current || sessionRequest.current) return;
      const item = voteQueue.current.shift();
      if (!item) return;
      void submitVote(item);
    }, VOTE_DISPATCH_INTERVAL_MS);
    return () => window.clearInterval(dispatch);
  }, [submitVote]);

  useEffect(() => () => {
    burstTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  function createBurst(choice: TeamChoice, target: HTMLButtonElement, event: MouseEvent<HTMLButtonElement>) {
    const rect = target.getBoundingClientRect();
    const left = event.clientX > 0 ? ((event.clientX - rect.left) / rect.width) * 100 : 50;
    const top = event.clientY > 0 ? ((event.clientY - rect.top) / rect.height) * 100 : 50;
    const tokens = TEAMS.find((team) => team.id === choice)?.burstTokens ?? [];
    const batchId = burstId.current;
    burstId.current += tokens.length;

    const nextBursts = tokens.map((emoji, index) => ({
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

  function handleVote(choice: TeamChoice, event: MouseEvent<HTMLButtonElement>) {
    // Campaign status isn't known client-side until the first /api/team-results
    // response lands, so this doesn't pre-block on isVotingOpen (that would
    // reject every click during the brief initial-load window). The server is
    // the actual enforcement point: cast_team_vote rejects with
    // campaign_not_active/campaign_ended, handled below via the 410 branch.
    if (voteQueue.current.length >= VOTE_QUEUE_MAX_SIZE) return;
    setLastClicked(choice);
    createBurst(choice, event.currentTarget, event);
    voteSequence.current += 1;
    pendingVoteCount.current += 1;
    voteQueue.current.push({ choice, requestId: createUuid(), sequence: voteSequence.current });
  }

  // Server counts already fold in confirmed votes absorbed by earlier polls
  // (see reconcileResults); adding the remaining un-absorbed confirmedVotes
  // gives instant feedback the moment a vote is accepted, without waiting
  // for the next ~1s poll to reflect it.
  const displayCounts = zeroCounts();
  let totalVotes = 0;
  for (const id of TEAM_CHOICES) {
    displayCounts[id] = (results?.counts[id] ?? 0) + confirmedVotes[id];
    totalVotes += displayCounts[id];
  }
  const hasVoted = lastAcceptedChoice !== null;
  const maxVotes = totalVotes > 0 ? Math.max(...TEAM_CHOICES.map((id) => displayCounts[id])) : 0;
  const topTeams = totalVotes > 0 ? TEAMS.filter((team) => displayCounts[team.id] === maxVotes && maxVotes > 0) : [];
  const topLabel = `현재 1위${topTeams.length > 1 ? ` (${topTeams.length}팀 동률)` : ""}`;
  const rankedTeams = [...TEAMS].sort((a, b) => displayCounts[b.id] - displayCounts[a.id]);
  const campaignStatus = (results?.campaign ?? session?.campaign)?.status;

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

  return (
    <div style={{ minHeight: "100vh", background: "#09090f", color: "#f5f5fa", fontFamily: "'Noto Sans KR',sans-serif" }}>
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px 80px" }}>
        {referralToken && (
          <aside
            data-analytics-section="referral-banner"
            style={{
              marginTop: 24,
              display: "flex",
              alignItems: "center",
              gap: 12,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "#12121e",
              padding: "12px 16px",
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 16, flexShrink: 0 }}>🔥</span>
            <div>
              <strong style={{ display: "block", fontSize: 14 }}>친구가 당신의 최애 구단을 기다리고 있어요</strong>
              <p style={{ margin: "2px 0 0", fontSize: 13, color: "#8a8aa0" }}>가장 좋아하는 KBO 야구팀, 골라 주세요!</p>
            </div>
          </aside>
        )}

        <div style={{ paddingTop: 40, paddingBottom: 24, textAlign: "center" }} data-analytics-section="header">
          <p
            style={{
              fontSize: 12,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              margin: "0 0 12px",
              fontWeight: 700,
              color: "#f5f5fa",
            }}
          >
            ⚡ 오늘의 밸런스게임 ⚡
          </p>
          <h1
            style={{
              fontFamily: "'Barlow Condensed',sans-serif",
              fontSize: 44,
              fontWeight: 900,
              lineHeight: 1.1,
              letterSpacing: "-0.01em",
              margin: "0 0 8px",
            }}
          >
            가장 좋아하는
            <br />
            <span style={{ color: "#ffffff" }}>KBO 야구팀</span>은?
          </h1>
          <p style={{ fontSize: 14, color: "#8a8aa0", margin: "12px 0 0" }}>
            좋아하는 팀을 클릭하세요! 클릭할수록 더 많이 투표돼요 🔥
          </p>
        </div>

        {loadError && !results && (
          <p style={{ textAlign: "center", color: "#8a8aa0", fontSize: 13, marginBottom: 16 }}>{loadError}</p>
        )}

        {totalVotes > 0 && (
          <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "#12121e",
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>🏆</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, color: "#8a8aa0", margin: "0 0 2px" }}>{topLabel}</p>
                <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
                  {topTeams.map((team, i) => (
                    <span key={team.id}>
                      {i > 0 && <span style={{ color: "#8a8aa0" }}> · </span>}
                      <span style={{ color: team.color }}>
                        {team.name} {percentage(displayCounts[team.id], totalVotes)}%
                      </span>
                    </span>
                  ))}
                </p>
              </div>
            </div>
            <div
              style={{
                flexShrink: 0,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "#12121e",
                padding: "12px 16px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "flex-end",
              }}
            >
              <p style={{ fontSize: 12, color: "#8a8aa0", margin: "0 0 2px" }}>총 투표수</p>
              <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{numberFormatter.format(totalVotes)}</p>
            </div>
          </div>
        )}

        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 32 }}
          data-analytics-section="team-grid"
        >
          {TEAMS.map((team) => {
            const pct = percentage(displayCounts[team.id], totalVotes);
            const isLastVoted = lastClicked === team.id;
            const isLeading = totalVotes > 0 && topTeams.some((t) => t.id === team.id);
            const [nameLine1, nameLine2 = ""] = team.name.split(" ");
            const teamBursts = bursts.filter((burst) => burst.choice === team.id);

            return (
              <motion.button
                key={team.id}
                type="button"
                animate={isLastVoted ? { x: [0, -6, 6, -6, 6, 0] } : {}}
                transition={{ duration: 0.25 }}
                onClick={(event) => handleVote(team.id, event)}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  borderRadius: 16,
                  border: `1px solid ${isLastVoted ? `${team.color}80` : "rgba(255,255,255,0.07)"}`,
                  transition: "all 0.2s",
                  cursor: "pointer",
                  overflow: "hidden",
                  aspectRatio: "3/4",
                  background: isLastVoted
                    ? `linear-gradient(160deg, ${team.color}28 0%, #0d0d1a 60%)`
                    : "#12121e",
                  boxShadow: isLastVoted ? `0 0 24px ${team.glow}` : "none",
                  padding: 0,
                  boxSizing: "border-box",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 56,
                    padding: 14,
                    boxSizing: "border-box",
                    opacity: isLastVoted ? 0.75 : 0.35,
                    transition: "opacity 0.3s",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- static team crest SVG, next/image blocks SVG optimization by default */}
                  <img
                    src={team.logo}
                    alt={team.name}
                    style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "50% 50%" }}
                  />
                </div>
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: totalVotes > 0 ? `${pct}%` : "0%",
                    background:
                      totalVotes > 0 && pct > 0 ? `linear-gradient(to top, ${team.color}30, transparent)` : "transparent",
                    transition: "all 0.5s ease-out",
                  }}
                />
                {isLeading && (
                  <span style={{ position: "absolute", top: 8, right: 8, fontSize: 14 }}>🏆</span>
                )}
                <div
                  style={{
                    position: "relative",
                    zIndex: 1,
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "32px 8px 12px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 2,
                    background: "linear-gradient(to top, #09090fcc 70%, transparent)",
                  }}
                >
                  <span style={{ fontSize: 12, textAlign: "center", lineHeight: 1.2, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>
                    {nameLine1}
                    <br />
                    {nameLine2}
                  </span>
                  <span
                    style={{
                      fontFamily: "'Barlow Condensed',sans-serif",
                      fontSize: 16,
                      fontWeight: 900,
                      lineHeight: 1,
                      color: team.color,
                    }}
                  >
                    클릭!
                  </span>
                </div>
                <span aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 2 }}>
                  {teamBursts.map((burst) => (
                    <i
                      key={burst.id}
                      style={{
                        position: "absolute",
                        left: `${burst.left}%`,
                        top: `${burst.top}%`,
                        fontSize: "clamp(13px, 2vw, 16px)",
                        fontWeight: 800,
                        fontStyle: "normal",
                        color: team.color,
                        textShadow: "0 1px 3px rgba(0,0,0,.7)",
                        animation: "km-burst 1s cubic-bezier(.15,.7,.2,1) forwards",
                        animationDelay: `${burst.delay}ms`,
                        "--burst-drift": `${burst.drift}px`,
                        "--burst-rotate": `${burst.rotate}deg`,
                      } as CSSProperties}
                    >
                      {burst.emoji}
                    </i>
                  ))}
                </span>
              </motion.button>
            );
          })}
        </div>

        {totalVotes > 0 && (
          <div
            style={{
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "#12121e",
              padding: 20,
              marginBottom: 32,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <h2
              style={{
                fontFamily: "'Barlow Condensed',sans-serif",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "#8a8aa0",
                margin: "0 0 6px",
              }}
            >
              전체 순위
            </h2>
            {rankedTeams.map((team, i) => {
              const pct = percentage(displayCounts[team.id], totalVotes);
              const isTop = topTeams.some((t) => t.id === team.id);
              const [nameLine1] = team.name.split(" ");
              return (
                <div key={team.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    style={{
                      fontFamily: "'Barlow Condensed',sans-serif",
                      fontSize: 12,
                      fontWeight: 700,
                      width: 16,
                      textAlign: "right",
                      flexShrink: 0,
                      color: isTop ? "#fbbf24" : "#3a3a55",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "rgba(245,245,250,0.8)",
                      width: 80,
                      flexShrink: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {nameLine1}
                  </span>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: "#1c1c2c", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        borderRadius: 4,
                        transition: "all 0.7s ease-out",
                        width: `${pct}%`,
                        background: team.color,
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontFamily: "'Barlow Condensed',sans-serif",
                      fontSize: 12,
                      fontWeight: 700,
                      width: 32,
                      textAlign: "right",
                      flexShrink: 0,
                      color: pct > 0 ? team.color : "#3a3a55",
                    }}
                  >
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {hasVoted && lastAcceptedChoice && campaignStatus === "active" && (() => {
          const team = TEAMS.find((t) => t.id === lastAcceptedChoice);
          if (!team) return null;
          const pct = percentage(displayCounts[lastAcceptedChoice], totalVotes);
          return (
            <section
              data-analytics-section="share-card"
              style={{
                borderRadius: 16,
                border: `1px solid ${team.color}80`,
                background: "#12121e",
                padding: 20,
                marginBottom: 24,
              }}
            >
              <p style={{ fontSize: 12, color: "#8a8aa0", margin: "0 0 6px" }}>내 선택 결과</p>
              <h2 style={{ fontSize: 20, margin: "0 0 8px" }}>
                나는 <strong style={{ color: team.color }}>{team.name}파!</strong>
              </h2>
              <p style={{ fontSize: 13, color: "#8a8aa0", margin: "0 0 16px" }}>
                지금 {team.name}는 <b style={{ color: "#f5f5fa" }}>{pct}%</b>예요.
              </p>
              <button
                type="button"
                disabled={isShareLoading}
                onClick={() => void handleShare()}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: 12,
                  background: team.color,
                  border: "none",
                  color: "#ffffff",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: isShareLoading ? "default" : "pointer",
                  opacity: isShareLoading ? 0.6 : 1,
                }}
              >
                {isShareLoading ? "도전 링크 만드는 중…" : "결과 공유하기"} <span aria-hidden="true">↗</span>
              </button>
              <div style={{ marginTop: 8, textAlign: "center" }}>
                <button
                  type="button"
                  disabled={isShareLoading}
                  onClick={() => void handleCopyLink()}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#8a8aa0",
                    fontSize: 13,
                    cursor: isShareLoading ? "default" : "pointer",
                    textDecoration: "underline",
                  }}
                >
                  링크 복사
                </button>
              </div>
            </section>
          );
        })()}

        <section
          style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)", background: "#12121e", padding: 20, marginBottom: 24 }}
          data-analytics-section="comments"
        >
          <h2
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "'Barlow Condensed',sans-serif",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.05em",
              margin: "0 0 16px",
            }}
          >
            💬 익명 댓글 <span style={{ color: "#8a8aa0", fontWeight: 400 }}>{comments.length}</span>
          </h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <input
              type="text"
              value={commentInput}
              onChange={(event) => setCommentInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submitComment();
              }}
              placeholder={hasVoted ? "응원 메시지를 남겨보세요!" : "투표하면 댓글을 남길 수 있어요"}
              maxLength={100}
              disabled={!hasVoted || !isCommentsOpen(campaignStatus)}
              style={{
                flex: 1,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "#1a1a28",
                padding: "10px 12px",
                fontSize: 14,
                color: "#f5f5fa",
                outline: "none",
                opacity: hasVoted ? 1 : 0.5,
              }}
            />
            <button
              type="button"
              onClick={() => void submitComment()}
              disabled={!hasVoted || !commentInput.trim() || isCommentSubmitting}
              style={{
                padding: "10px 16px",
                borderRadius: 12,
                background: "#e94560",
                border: "none",
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 700,
                opacity: hasVoted && commentInput.trim() ? 1 : 0.3,
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: hasVoted && commentInput.trim() ? "pointer" : "default",
              }}
            >
              ➤ 등록
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {comments.length === 0 && (
              <p style={{ fontSize: 13, color: "#8a8aa0", margin: 0 }}>아직 댓글이 없어요. 첫 댓글을 남겨보세요!</p>
            )}
            {comments.map((comment) => (
              <div key={comment.id} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "#1c1c2c",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    color: "#8a8aa0",
                  }}
                >
                  ⚾
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, color: "rgba(245,245,250,0.9)", lineHeight: 1.5, margin: 0 }}>{comment.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section
          style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)", background: "#12121e", overflow: "hidden", marginBottom: 24 }}
          data-analytics-section="past-topics"
        >
          <button
            type="button"
            onClick={() => setShowPastTopics((v) => !v)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 20px",
              fontSize: 14,
              fontWeight: 700,
              color: "rgba(245,245,250,0.7)",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: "0.05em" }}>이전 주제 보기</span>
            <span>{showPastTopics ? "▲" : "▼"}</span>
          </button>
          {showPastTopics && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              {topicHistory.length === 0 && (
                <p style={{ padding: "12px 20px", fontSize: 13, color: "#8a8aa0", margin: 0 }}>아직 이전 주제가 없어요.</p>
              )}
              {topicHistory.map((topic) => {
                const topicTotal = topic.results.reduce((sum, r) => sum + r.voteCount, 0);
                const ranked = [...topic.results].sort((a, b) => b.voteCount - a.voteCount);
                return (
                  <div
                    key={topic.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 16,
                      padding: "12px 20px",
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 12, color: "#8a8aa0", margin: "0 0 4px" }}>{formatArchivedDate(topic.archivedAt)}</p>
                      <p style={{ fontSize: 14, color: "rgba(245,245,250,0.8)", margin: 0 }}>{topic.title}</p>
                    </div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "#a0a0c0", margin: 0, textAlign: "right", flexShrink: 0 }}>
                      {ranked.map((r) => `${r.label} ${percentage(r.voteCount, topicTotal)}%`).join(" · ")}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {notice && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: notice.tone === "success" ? "#1a3a2a" : "#3a1a22",
            color: "#f5f5fa",
            borderRadius: 12,
            padding: "10px 18px",
            fontSize: 13,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            zIndex: 50,
          }}
        >
          {notice.message}
        </div>
      )}

      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "24px 0", textAlign: "center" }}>
        <p
          onClick={handleFooterClick}
          style={{
            fontSize: 12,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            fontWeight: 700,
            margin: 0,
            color: "#f5f5fa",
            cursor: "default",
          }}
        >
          ⚡ 오늘의 밸런스게임 · 투표는 계속됩니다 ⚡
        </p>
        <a href="/privacy" style={{ fontSize: 12, color: "#8a8aa0", margin: "4px 0 0", display: "inline-block" }}>개인정보 처리 안내</a>
      </footer>
    </div>
  );
}

export default TeamVoteArena;
