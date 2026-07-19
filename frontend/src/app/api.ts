export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export interface ApiUser {
  id: string;
  nickname: string;
  profileImage: string | null;
  role?: "USER" | "ADMIN";
  rating: number;
  reviewCount: number;
  createdAt?: string;
}

export interface ApiStore {
  id: string;
  brand: string;
  name: string;
  region: string;
  district: string | null;
  address: string;
  phone: string | null;
  latitude: string | null;
  longitude: string | null;
  source: string;
  sourceUrl: string | null;
  isActive: boolean;
  lastSyncedAt: string | null;
}

export interface ApiStoreRegion {
  region: string;
  count: number;
}

export interface ApiEvent {
  id: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  bannerImage: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiPost {
  id: string;
  writerId: string;
  storeId: string;
  eventId: string | null;
  discount: number;
  totalCount: number;
  remainCount: number;
  meetingTime: string;
  availableUntil: string | null;
  meetingPlace: string;
  openChatUrl?: string;
  description: string | null;
  imageUrl: string | null;
  status: "OPEN" | "CLOSED";
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  writer: ApiUser;
  store: ApiStore;
  event?: { id: string; title: string } | null;
}

export interface ApiReview {
  id: string;
  writerId: string;
  sellerId: string;
  postId: string;
  rating: number;
  content: string;
  createdAt: string;
  writer?: ApiUser;
  post?: ApiPost;
}

export interface ApiParticipation {
  id: string;
  postId: string;
  quantity: number;
  pickupStore: string;
  status: "CONFIRMED" | "CANCELLED";
  createdAt: string;
  post: ApiPost;
}

export interface ApiPurchaseRequest {
  id: string;
  requesterId: string;
  accepterId: string | null;
  city: string;
  branch: string;
  menu: string;
  quantity: number;
  desiredTime: string;
  note: string | null;
  openChatUrl?: string;
  status: "OPEN" | "ACCEPTED" | "CANCELLED";
  createdAt: string;
  requester: ApiUser;
  accepter: ApiUser | null;
}

export type ApiInquiryCategory = "SERVICE" | "ACCOUNT" | "MODERATION" | "PAYMENT" | "OTHER";

export interface ApiInquiry {
  id: string;
  userId: string;
  category: ApiInquiryCategory;
  content: string;
  status: "PENDING" | "RESOLVED";
  createdAt: string;
  updatedAt: string;
}

interface ApiEnvelope<T> {
  success: true;
  data: T;
}

interface ApiErrorEnvelope {
  success: false;
  error: { code: string; message: string; details?: unknown; requestId?: string };
}

export interface ApiPage<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
  };
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      credentials: "include"
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function apiFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: "include" });
  } catch {
    throw new ApiError("NETWORK_ERROR", "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.", 0);
  }

  if (response.status === 401 && retry && path !== "/api/v1/auth/refresh") {
    if (await refreshSession()) return apiFetch<T>(path, init, false);
  }
  if (response.status === 204) return undefined as T;

  const body = (await response.json().catch(() => null)) as ApiEnvelope<T> | ApiErrorEnvelope | null;
  if (!response.ok || !body || !body.success) {
    const error = body && !body.success ? body.error : null;
    throw new ApiError(
      error?.code ?? "INVALID_RESPONSE",
      error?.message ?? "요청을 처리하지 못했습니다.",
      response.status
    );
  }
  return body.data;
}

const json = (value: unknown) => JSON.stringify(value);

export const api = {
  me: () => apiFetch<ApiUser>("/api/v1/auth/me"),
  logout: () => apiFetch<void>("/api/v1/auth/logout", { method: "POST" }, false),
  updateProfile: (nickname: string) =>
    apiFetch<ApiUser>("/api/v1/users/me", { method: "PATCH", body: json({ nickname }) }),
  uploadProfileImage: (imageData: string) =>
    apiFetch<ApiUser>("/api/v1/users/me/profile-image", {
      method: "PUT",
      body: json({ imageData })
    }),
  removeProfileImage: () =>
    apiFetch<ApiUser>("/api/v1/users/me/profile-image", { method: "DELETE" }),

  stores: (input: { keyword?: string; region?: string; page?: number; limit?: number } = {}) => {
    const query = new URLSearchParams({
      page: String(input.page ?? 1),
      limit: String(input.limit ?? 30)
    });
    if (input.keyword?.trim()) query.set("keyword", input.keyword.trim());
    if (input.region?.trim()) query.set("region", input.region.trim());
    return apiFetch<ApiPage<ApiStore>>(`/api/v1/stores?${query.toString()}`);
  },
  store: (id: string) => apiFetch<ApiStore>(`/api/v1/stores/${id}`),
  storeRegions: () => apiFetch<ApiStoreRegion[]>("/api/v1/stores/regions"),
  events: () => apiFetch<ApiPage<ApiEvent>>("/api/v1/events?active=true&limit=20"),
  posts: () => apiFetch<ApiPage<ApiPost>>("/api/v1/posts?limit=100&sort=latest"),
  post: (id: string) => apiFetch<ApiPost>(`/api/v1/posts/${id}`),
  myPosts: () => apiFetch<ApiPage<ApiPost>>("/api/v1/users/me/posts?limit=100"),
  createPost: (input: {
    storeId: string;
    discount: number;
    totalCount: number;
    remainCount: number;
    meetingTime: string;
    availableUntil?: string;
    meetingPlace: string;
    openChatUrl: string;
    description?: string;
    imageUrl?: string | null;
    imageData?: string;
  }) => apiFetch<ApiPost>("/api/v1/posts", { method: "POST", body: json(input) }),
  updatePost: (id: string, input: Partial<{
    storeId: string;
    discount: number;
    totalCount: number;
    remainCount: number;
    meetingTime: string;
    availableUntil: string | null;
    meetingPlace: string;
    openChatUrl: string;
    description: string | null;
    imageUrl: string | null;
    imageData: string;
  }>) => apiFetch<ApiPost>(`/api/v1/posts/${id}`, { method: "PATCH", body: json(input) }),
  closePost: (id: string) => apiFetch<ApiPost>(`/api/v1/posts/${id}/close`, { method: "PATCH" }),
  deletePost: (id: string) => apiFetch<void>(`/api/v1/posts/${id}`, { method: "DELETE" }),

  favorites: () => apiFetch<ApiPage<{ id: string; post: ApiPost }>>("/api/v1/favorites?limit=100"),
  addFavorite: (postId: string) =>
    apiFetch(`/api/v1/posts/${postId}/favorite`, { method: "POST" }),
  removeFavorite: (postId: string) =>
    apiFetch<void>(`/api/v1/posts/${postId}/favorite`, { method: "DELETE" }),

  participations: () =>
    apiFetch<ApiPage<ApiParticipation>>("/api/v1/participations/me?limit=100"),
  participate: (postId: string, quantity: number, pickupStore: string) =>
    apiFetch<ApiParticipation>(`/api/v1/posts/${postId}/participations`, {
      method: "POST",
      body: json({ quantity, pickupStore })
    }),
  cancelParticipation: (id: string) =>
    apiFetch<{ id: string; postId: string; status: "CONFIRMED" | "CANCELLED" }>(
      `/api/v1/participations/${id}`,
      { method: "DELETE" }
    ),

  reviewsForUser: (userId: string) =>
    apiFetch<ApiPage<ApiReview>>(`/api/v1/reviews/users/${userId}?limit=100`),
  myReviews: () => apiFetch<ApiPage<ApiReview>>("/api/v1/reviews/me?limit=100"),
  createReview: (postId: string, rating: number, content: string) =>
    apiFetch<ApiReview>("/api/v1/reviews", {
      method: "POST",
      body: json({ postId, rating, content })
    }),
  report: (targetPostId: string, reason: string, detail?: string) =>
    apiFetch("/api/v1/reports", {
      method: "POST",
      body: json({ targetPostId, reason, ...(detail ? { detail } : {}) })
    }),
  inquiries: () => apiFetch<ApiPage<ApiInquiry>>("/api/v1/inquiries?limit=100"),
  createInquiry: (category: ApiInquiryCategory, content: string) =>
    apiFetch<ApiInquiry>("/api/v1/inquiries", { method: "POST", body: json({ category, content }) }),

  purchaseRequests: () =>
    apiFetch<ApiPage<ApiPurchaseRequest>>("/api/v1/purchase-requests?limit=100"),
  purchaseRequest: (id: string) => apiFetch<ApiPurchaseRequest>(`/api/v1/purchase-requests/${id}`),
  createPurchaseRequest: (input: {
    city: string;
    branch: string;
    menu: string;
    quantity: number;
    desiredTime: string;
    note?: string;
    openChatUrl: string;
  }) => apiFetch<ApiPurchaseRequest>("/api/v1/purchase-requests", { method: "POST", body: json(input) }),
  acceptPurchaseRequest: (id: string) =>
    apiFetch<ApiPurchaseRequest>(`/api/v1/purchase-requests/${id}/accept`, { method: "POST" }),
  cancelPurchaseRequest: (id: string) =>
    apiFetch<ApiPurchaseRequest>(`/api/v1/purchase-requests/${id}`, { method: "DELETE" })
};

export function startKakaoLogin(): void {
  window.location.assign(`${API_BASE}/api/v1/auth/kakao/start`);
}
