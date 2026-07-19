import { useState, useRef, useEffect } from "react";
import {
  Search, Bell, Heart, Star, ChevronRight, X, Plus, ArrowLeft,
  Share2, Minus, ShoppingBag, Ticket, CheckCircle, Shield, User,
  MessageCircle, PenSquare, Clock, MapPin, ChevronDown, Megaphone,
  BookOpen, Gift, SlidersHorizontal, Store,
  Users, ExternalLink, ChevronUp, Phone, ImagePlus, Trash2,
} from "lucide-react";
import nctWishChar from "@/imports/__.png";
import nctWishLogo from "@/imports/image-1.png";
import pixelScene  from "@/imports/image-2.png";
import eventFinalJourney from "@/imports/event-final-journey.png";
import guideNctWishBanner from "@/imports/guide-nct-wish-banner.png";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import {
  api,
  ApiError,
  type ApiEvent,
  type ApiInquiry,
  type ApiInquiryCategory,
  type ApiPost,
  type ApiPurchaseRequest,
  type ApiReview,
  type ApiStore,
  type ApiUser,
  startKakaoLogin,
} from "@/app/api";

interface AuthUser {
  id: string;
  nickname: string;
  profileImage: string | null;
  role: "USER" | "ADMIN";
  rating: number;
  reviewCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Tab        = "home" | "list" | "saved" | "my" | "post";
type AuthView   = "loading" | "login" | "app";
type DealStatus = "진행중" | "마감임박" | "마감";
type DrinkType  = "아메리카노" | "라떼" | "콜드브루" | "녹차라떼" | "딸기라떼" | "카페모카";

const EVENT_DETAIL_URL = "https://app.annhouse.co.kr/deeplink?type=event&event_cd=E000268";

interface DrinkItem {
  name: DrinkType | string;
  originalPrice: number;
  discountPrice: number;
  emoji: string;
}

interface Deal {
  id: string | number;
  writerId?: string;
  storeId?: string;
  meetingTime?: string;
  meetingPlace?: string;
  createdAt?: string;
  fan: { name: string; avatar: string; verified: boolean; rating: number; totalTickets: number };
  franchise: string;
  drinks: DrinkItem[];
  date: string;
  timeFrom: string;
  timeTo: string;
  totalTarget: number;
  currentOrders: number;
  status: DealStatus;
  image: string;
  imageUrl: string | null;
  liked: boolean;
  kakaoLink: string;
  note: string;
}

interface Review {
  id: string | number;
  dealId: string | number;
  rating: number;
  text: string;
  anonymous: boolean;
  createdAt: string;
}

interface Participation {
  id: string;
  dealId: string | number;
  pickupStore: string;
  qty: number;
  orderedAt: string;
  received: boolean;
}

type RequestStatus = "대기중" | "수락됨";

interface BuyRequest {
  id: string | number;
  requesterId?: string;
  requester: { name: string; avatar: string };
  city: string;
  branch: string;
  menu: string;
  qty: number;
  desiredTime: string;
  note: string;
  kakaoLink: string;
  status: RequestStatus;
  createdAt: string;
  acceptedBy?: { name: string; avatar: string };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value)).replace(/\. /g, ".").replace(/\.$/, "");
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function dealFromApi(post: ApiPost, liked = false): Deal {
  const originalPrice = 2500;
  const meetingEnd = post.availableUntil ?? new Date(new Date(post.meetingTime).getTime() + 3 * 60 * 60_000).toISOString();
  const storeBrand = post.store.brand || "메가MGC커피";
  const storeLabel = post.store.name.startsWith(storeBrand)
    ? post.store.name
    : `${storeBrand} ${post.store.name}`;
  return {
    id: post.id,
    writerId: post.writerId,
    storeId: post.storeId,
    meetingTime: post.meetingTime,
    meetingPlace: post.meetingPlace,
    createdAt: post.createdAt,
    fan: {
      name: post.writer.nickname,
      avatar: post.writer.profileImage ?? nctWishLogo,
      verified: false,
      rating: post.writer.rating,
      totalTickets: Math.floor((post.totalCount - post.remainCount) / 10),
    },
    franchise: storeLabel,
    drinks: [{
      name: "아메리카노",
      originalPrice,
      discountPrice: Math.round(originalPrice * (1 - post.discount / 100)),
      emoji: "☕",
    }],
    date: formatDate(post.meetingTime),
    timeFrom: formatTime(post.meetingTime),
    timeTo: formatTime(meetingEnd),
    totalTarget: post.totalCount,
    currentOrders: post.totalCount - post.remainCount,
    status: post.status === "CLOSED" ? "마감" : post.remainCount <= 2 ? "마감임박" : "진행중",
    image: post.imageUrl ?? pixelScene,
    imageUrl: post.imageUrl,
    liked,
    kakaoLink: post.openChatUrl ?? "",
    note: post.description ?? "",
  };
}

function requestFromApi(request: ApiPurchaseRequest): BuyRequest {
  return {
    id: request.id,
    requesterId: request.requesterId,
    requester: {
      name: request.requester.nickname,
      avatar: request.requester.profileImage ?? nctWishLogo,
    },
    city: request.city,
    branch: request.branch,
    menu: request.menu,
    qty: request.quantity,
    desiredTime: request.desiredTime,
    note: request.note ?? "",
    kakaoLink: request.openChatUrl ?? "",
    status: request.status === "ACCEPTED" ? "수락됨" : "대기중",
    createdAt: formatDate(request.createdAt),
    ...(request.accepter ? {
      acceptedBy: {
        name: request.accepter.nickname,
        avatar: request.accepter.profileImage ?? nctWishLogo,
      },
    } : {}),
  };
}

function reviewFromApi(review: ApiReview): Review {
  return {
    id: review.id,
    dealId: review.postId,
    rating: review.rating,
    text: review.content,
    anonymous: false,
    createdAt: formatDate(review.createdAt),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function discPct(orig: number, disc: number) {
  return Math.round((1 - disc / orig) * 100);
}
function bestDiscount(drinks: DrinkItem[]) {
  return Math.max(...drinks.map(d => discPct(d.originalPrice, d.discountPrice)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth — Login
// ─────────────────────────────────────────────────────────────────────────────
function LoginScreen({ errorCode }: { errorCode?: string | null }) {
  return (
    <div className="flex flex-col h-full bg-white px-6 overflow-y-auto relative">
      {/* decorative stars */}
      <span className="absolute top-10 left-5  text-yellow-300 text-lg select-none">★</span>
      <span className="absolute top-20 left-14 text-purple-200 text-sm select-none">✦</span>
      <span className="absolute top-14 right-7 text-yellow-200 text-base select-none">✦</span>
      <span className="absolute top-32 right-4 text-pink-200 text-xs select-none">★</span>

      {/* mascot + logo */}
      <div className="flex flex-col items-center mt-24 mb-10">
        <div className="w-24 h-24 mb-3">
          <ImageWithFallback src={nctWishLogo} alt="NCT WISH" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-2xl font-black tracking-tight">
          <span className="text-primary">WISH </span><span className="text-gray-900">MATCH</span>
        </h1>
        <p className="text-xs text-gray-400 mt-1.5">NCT WISH와 함께하는 특별한 여정</p>
      </div>

      {errorCode && (
        <p className="text-center text-xs text-red-400 mb-4">
          카카오 로그인에 실패했어요. 다시 시도해주세요. ({errorCode})
        </p>
      )}

      {/* Kakao only */}
      <button onClick={startKakaoLogin}
        className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-bold text-sm"
        style={{ backgroundColor: "#FEE500", color: "#191919" }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path fillRule="evenodd" clipRule="evenodd"
            d="M9 1.5C4.86 1.5 1.5 4.19 1.5 7.5c0 2.13 1.35 4.005 3.39 5.085l-.87 3.24a.225.225 0 00.345.24L8.25 13.44A9.3 9.3 0 009 13.5c4.14 0 7.5-2.69 7.5-6s-3.36-6-7.5-6z"
            fill="#191919" />
        </svg>
        카카오로 시작하기
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth — Signup
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// 모집 목록 (List)
// ─────────────────────────────────────────────────────────────────────────────
type FilterType = "전체" | "모집중" | "오늘 마감";

function ListScreen({ deals, onSelect, onLike, requests, onRequestSelect }: {
  deals: Deal[];
  onSelect: (d: Deal) => void;
  onLike: (id: Deal["id"]) => void;
  requests: BuyRequest[];
  onRequestSelect: (r: BuyRequest) => void;
}) {
  const [board, setBoard] = useState<"deals" | "requests">("deals");
  const [filter, setFilter]   = useState<FilterType>("전체");
  const [sortOpen, setSortOpen] = useState(false);
  const [sort, setSort]       = useState<"오늘 마감" | "할인 높은순" | "최신 등록순">("최신 등록순");
  const [discFilter, setDiscFilter] = useState("전체");
  const [filterOpen, setFilterOpen] = useState(false);

  const filtered = deals
    .filter(d => filter === "전체" || filter === "오늘 마감" || d.status !== "마감")
    .filter(d => discFilter === "전체" || bestDiscount(d.drinks) >= Number(discFilter))
    .sort((a, b) => {
      if (sort === "할인 높은순")  return bestDiscount(b.drinks) - bestDiscount(a.drinks);
      if (sort === "오늘 마감")    return (a.totalTarget - a.currentOrders) - (b.totalTarget - b.currentOrders);
      return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
    });

  return (
    <div className="flex flex-col h-full bg-white">
      {/* board toggle */}
      <div className="flex gap-2 px-4 pt-3 pb-1 flex-shrink-0 bg-white">
        <button type="button" onClick={() => setBoard("deals")}
          className={`flex-1 text-sm font-black py-2.5 rounded-xl transition-colors ${
            board === "deals" ? "bg-primary text-white" : "bg-gray-100 text-gray-400"
          }`}>
          모집글
        </button>
        <button type="button" onClick={() => setBoard("requests")}
          className={`flex-1 text-sm font-black py-2.5 rounded-xl transition-colors ${
            board === "requests" ? "bg-primary text-white" : "bg-gray-100 text-gray-400"
          }`}>
          구해요
        </button>
      </div>

      {board === "requests" ? (
        <RequestBoard requests={requests} onSelect={onRequestSelect} />
      ) : (
      <>
      {/* sub-header */}
      <div className="flex-shrink-0 border-b border-gray-100 bg-white">
        {/* filter row */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <div className="flex gap-1.5 flex-1">
            {(["전체", "모집중", "오늘 마감"] as FilterType[]).map(f => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                className={`text-xs font-bold px-3.5 py-1.5 rounded-full transition-colors ${
                  filter === f ? "bg-primary text-white" : "bg-gray-100 text-gray-500"
                }`}>
                {f}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setFilterOpen(o => !o)}
            className={`w-8 h-8 flex items-center justify-center rounded-xl transition-colors ${filterOpen ? "bg-primary text-white" : "bg-gray-100 text-gray-500"}`}>
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
        {/* filter panel */}
        {filterOpen && (
          <div className="px-4 pb-3 border-t border-gray-50 pt-3 space-y-3 bg-gray-50/60">
            <div>
              <p className="text-[11px] font-bold text-gray-400 mb-2">할인율</p>
              <div className="flex flex-wrap gap-1.5">
                {[{ label: "전체", val: "전체" }, { label: "10%+", val: "10" }, { label: "20%+", val: "20" }, { label: "30%+", val: "30" }, { label: "40%+", val: "40" }, { label: "50%+", val: "50" }].map(({ label, val }) => (
                  <button key={val} type="button" onClick={() => setDiscFilter(val)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${discFilter === val ? "bg-primary text-white border-primary" : "bg-white text-gray-500 border-gray-200"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {/* sort row */}
        <div className="flex items-center justify-end px-4 py-2 relative">
          <button onClick={() => setSortOpen(!sortOpen)}
            className="flex items-center gap-1 text-xs text-gray-400 font-semibold">
            {sort} {sortOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {sortOpen && (
            <div className="absolute top-8 right-4 bg-white border border-gray-100 rounded-xl shadow-lg z-20 overflow-hidden">
              {(["오늘 마감", "할인 높은순", "최신 등록순"] as const).map(s => (
                <button key={s} onClick={() => { setSort(s); setSortOpen(false); }}
                  className={`block w-full text-left px-4 py-2.5 text-xs font-semibold ${
                    sort === s ? "text-primary" : "text-gray-600"
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* cards */}
      <div className="flex-1 overflow-y-auto bg-[#F8F6FF] px-3 py-3 space-y-2.5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <span className="text-5xl">🔍</span>
            <p className="text-sm text-gray-400 text-center">검색 결과가 없어요</p>
          </div>
        ) : filtered.map(d => (
          <ListCard key={d.id} deal={d} onTap={() => onSelect(d)} onLike={() => onLike(d.id)} />
        ))}
      </div>
      </>
      )}
    </div>
  );
}

function ListCard({ deal, onTap, onLike }: { deal: Deal; onTap: () => void; onLike: () => void }) {
  const remaining = deal.totalTarget - deal.currentOrders;
  const disc      = bestDiscount(deal.drinks);
  return (
    <div onClick={onTap}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden active:scale-[0.99] transition-transform cursor-pointer">
      <div className="flex">
        {/* thumbnail */}
        <div className="relative w-[96px] h-[96px] flex-shrink-0">
          <ImageWithFallback src={deal.image} alt={deal.franchise}
            className="w-full h-full object-cover" />
          {deal.status === "마감임박" && (
            <div className="absolute top-1.5 left-1.5 bg-amber-400 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
              마감임박
            </div>
          )}
          {deal.status === "마감" && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="text-white text-xs font-black">마감</span>
            </div>
          )}
        </div>
        {/* body */}
        <div className="flex-1 min-w-0 px-3 py-2.5">
          <div className="flex items-start justify-between gap-1">
            <p className="text-xs font-black text-gray-800 leading-snug">
              {deal.franchise}
            </p>
            <button onClick={e => { e.stopPropagation(); onLike(); }} className="flex-shrink-0 mt-0.5">
              <Heart className={`w-4 h-4 ${deal.liked ? "fill-pink-500 text-pink-500" : "text-gray-200"}`} />
            </button>
          </div>
          <p className="text-lg font-black text-red-500 leading-tight mt-0.5">{disc}% 할인</p>
          <p className="text-xs text-gray-400">총 {deal.totalTarget}잔 모집</p>
          <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-50">
            <img src={deal.fan.avatar} alt={deal.fan.name} className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
            <span className="text-[11px] text-gray-400 truncate flex-1">{deal.fan.name}</span>
            {deal.fan.verified && <CheckCircle className="w-3 h-3 text-primary flex-shrink-0" />}
            <span className="text-[11px] font-black text-white bg-pink-500 px-2 py-0.5 rounded-full flex-shrink-0">
              남은 {remaining}잔
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 구해요 게시판 (구매자 요청)
// ─────────────────────────────────────────────────────────────────────────────
function RequestBoard({ requests, onSelect }: {
  requests: BuyRequest[];
  onSelect: (r: BuyRequest) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto bg-[#F8F6FF] px-3 py-3 space-y-2.5">
      {requests.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <span className="text-5xl">🙋</span>
          <p className="text-sm text-gray-400 text-center">등록된 요청이 없어요</p>
        </div>
      ) : requests.map(r => (
        <RequestCard key={r.id} request={r} onTap={() => onSelect(r)} />
      ))}
    </div>
  );
}

function RequestCard({ request, onTap }: { request: BuyRequest; onTap: () => void }) {
  const isAccepted = request.status === "수락됨";
  return (
    <div onClick={onTap}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5 active:scale-[0.99] transition-transform cursor-pointer">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-black text-gray-800">{request.city} · {request.branch}</p>
        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${
          isAccepted ? "bg-gray-100 text-gray-400" : "bg-purple-50 text-primary"
        }`}>
          {request.status}
        </span>
      </div>
      <p className="text-sm font-black text-gray-900 mt-1">{request.menu}</p>
      <p className="text-xs text-gray-400 mt-1">{request.desiredTime}</p>
      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-50">
        <img src={request.requester.avatar} alt={request.requester.name} className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
        <span className="text-[11px] text-gray-400 truncate flex-1">{request.requester.name}</span>
        <span className="text-[11px] text-gray-300">{request.createdAt}</span>
      </div>
    </div>
  );
}

function RequestDetailScreen({ request, canAccept, canCancel, onBack, onAccept, onCancel }: {
  request: BuyRequest;
  canAccept: boolean;
  canCancel: boolean;
  onBack: () => void;
  onAccept: () => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const isAccepted = request.status === "수락됨";
  const [accepting, setAccepting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setAccepting(true);
    setError(null);
    try {
      await onAccept();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "요청을 수락하지 못했습니다.");
    } finally {
      setAccepting(false);
    }
  }

  async function cancel() {
    if (!window.confirm("이 구매 요청을 취소할까요? 취소한 요청은 목록에서 사라집니다.")) return;
    setCancelling(true);
    setError(null);
    try {
      await onCancel();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "요청을 취소하지 못했습니다.");
    } finally {
      setCancelling(false);
    }
  }
  return (
    <div className="flex flex-col h-full bg-white">
      {/* header */}
      <div className="flex items-center px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <button onClick={onBack}
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <span className="flex-1 text-center font-black text-sm text-gray-900 -ml-8 pointer-events-none">요청 상세</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
        {/* requester */}
        <div className="flex items-center gap-2.5">
          <img src={request.requester.avatar} alt={request.requester.name} className="w-9 h-9 rounded-full object-cover" />
          <div>
            <p className="text-sm font-bold text-gray-900">{request.requester.name}</p>
            <p className="text-xs text-gray-400">{request.createdAt} 등록</p>
          </div>
          <span className={`ml-auto text-[11px] font-black px-2.5 py-1 rounded-full ${
            isAccepted ? "bg-gray-100 text-gray-400" : "bg-purple-50 text-primary"
          }`}>
            {request.status}
          </span>
        </div>

        {/* details */}
        <div className="bg-[#F8F6FF] rounded-2xl p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">희망 매장</span>
            <span className="font-bold text-gray-800">{request.city} · {request.branch}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">원하는 메뉴</span>
            <span className="font-bold text-gray-800">{request.menu}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">희망 시간</span>
            <span className="font-bold text-gray-800">{request.desiredTime}</span>
          </div>
        </div>

        {request.note && (
          <div>
            <p className="text-sm font-black text-gray-800 mb-2">요청 메모</p>
            <p className="text-sm text-gray-600 leading-relaxed bg-[#F8F6FF] rounded-2xl p-4">{request.note}</p>
          </div>
        )}

        {isAccepted && request.acceptedBy && (
          <div className="flex items-center gap-2.5 bg-purple-50 border border-purple-100 rounded-2xl p-4">
            <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
            <p className="text-sm text-gray-700">
              <span className="font-black text-primary">{request.acceptedBy.name}</span>님이 이 요청을 수락했어요.
            </p>
          </div>
        )}

        {isAccepted && request.kakaoLink && (
          <a href={request.kakaoLink} target="_blank" rel="noreferrer"
            className="flex items-center justify-center gap-1.5 w-full border border-gray-200 rounded-xl py-3.5 text-sm font-bold text-gray-700">
            <ExternalLink className="w-4 h-4" /> 요청자 오픈채팅 바로가기
          </a>
        )}
        {isAccepted && !request.kakaoLink && (
          <p className="text-xs text-gray-400 text-center">오픈채팅 링크는 요청자와 수락자에게만 공개됩니다.</p>
        )}
      </div>

      {!isAccepted && (canAccept || canCancel) && (
        <div className="px-4 py-3 bg-white border-t border-gray-100 flex-shrink-0 space-y-2">
          {error && <p className="text-xs text-red-500 text-center mb-2">{error}</p>}
          {canAccept && (
            <button onClick={accept} disabled={accepting || cancelling}
              className="w-full bg-primary text-white rounded-2xl py-4 font-black text-base disabled:opacity-50">
              {accepting ? "수락 중..." : "이 요청 수락하기"}
            </button>
          )}
          {canCancel && (
            <button onClick={cancel} disabled={accepting || cancelling}
              className="w-full border border-red-100 bg-red-50 text-red-500 rounded-2xl py-3.5 font-black text-sm disabled:opacity-50">
              {cancelling ? "취소 중..." : "내 요청 취소하기"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const REQUEST_MENU_OPTIONS = [
  "저당 꿀배 XO야쿠르트",
  "골드망고 스무디",
  "초코허니 퐁크러쉬",
  "밀크쉐이크",
  "메가베리 아사이볼",
  "망고요거트 스무디",
  "제로 부스트 에이드",
  "메가리카노",
  "코코넛 커피 스무디",
  "흑당 밀크티 라떼",
] as const;

function RequestPostScreen({ onBack, stores, onSubmit }: {
  onBack: () => void;
  stores: ApiStore[];
  onSubmit: (req: Omit<BuyRequest, "id" | "requester" | "status" | "createdAt">) => Promise<void>;
}) {
  const [selectedStore, setSelectedStore] = useState<ApiStore | null>(null);
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [menu,        setMenu]        = useState("");
  const [qty,         setQty]         = useState(1);
  const [desiredTime, setDesiredTime] = useState("");
  const [note,        setNote]        = useState("");
  const [kakao,       setKakao]       = useState("");
  const [done,        setDone]        = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const canSubmit = Boolean(selectedStore && menu && desiredTime && kakao);

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        city: selectedStore!.region,
        branch: selectedStore!.name,
        menu,
        qty,
        desiredTime,
        note,
        kakaoLink: kakao,
      });
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "요청을 등록하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (storePickerOpen) return (
    <div className="flex flex-col h-full bg-[#F8F6FF]">
      <div className="flex items-center px-4 py-3 bg-white border-b border-gray-100 flex-shrink-0">
        <button type="button" onClick={() => setStorePickerOpen(false)}
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <span className="flex-1 text-center font-black text-sm text-gray-900 -ml-8 pointer-events-none">희망 매장 선택</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <StoreBrowser
          initialStores={stores}
          selectedId={selectedStore?.id}
          onSelect={(store) => {
            setSelectedStore(store);
            setStorePickerOpen(false);
          }}
        />
      </div>
    </div>
  );

  if (done) return (
    <div className="flex flex-col h-full items-center justify-center gap-6 px-8 text-center bg-white">
      <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center">
        <CheckCircle className="w-8 h-8 text-primary" />
      </div>
      <div>
        <h2 className="text-xl font-black text-gray-900">요청이 등록됐어요!</h2>
        <p className="text-sm text-gray-400 mt-2 leading-relaxed">요청 목록에서 수락 상태를 확인할 수 있어요.</p>
      </div>
      <button onClick={onBack}
        className="w-full max-w-xs bg-primary text-white rounded-xl py-4 font-black text-sm">
        확인
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-white">
      {/* header */}
      <div className="flex items-center px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <button type="button" onClick={onBack}
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <span className="flex-1 text-center font-black text-sm text-gray-900 -ml-8 pointer-events-none">음료 요청하기</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-5 space-y-6">
          <FormSection label="희망 매장">
            <button type="button" onClick={() => setStorePickerOpen(true)}
              className={`w-full rounded-2xl border p-3.5 text-left transition-colors ${selectedStore ? "bg-yellow-50 border-yellow-200" : "bg-gray-50 border-gray-100"}`}>
              {selectedStore ? (
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-[#FFE500] text-[#3A1D1D] flex items-center justify-center font-black flex-shrink-0">M</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-gray-900">{selectedStore.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{selectedStore.address}</p>
                  </div>
                  <span className="text-xs font-black text-primary flex-shrink-0">변경</span>
                </div>
              ) : (
                <div className="flex items-center gap-3 py-1">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center">
                    <Store className="w-5 h-5 text-gray-300" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-black text-gray-700">공식 매장을 선택해주세요</p>
                    <p className="text-xs text-gray-400 mt-0.5">전국 매장명·지역·주소로 검색할 수 있어요.</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </div>
              )}
            </button>
          </FormSection>

          <FormSection label="원하는 메뉴">
            <div className="relative">
              <select
                value={menu}
                onChange={e => setMenu(e.target.value)}
                className={`w-full appearance-none rounded-xl border border-gray-100 bg-gray-50 px-4 py-3.5 pr-10 text-sm outline-none transition-colors focus:border-primary ${menu ? "text-gray-900" : "text-gray-400"}`}
              >
                <option value="" disabled>메뉴를 선택해주세요</option>
                {REQUEST_MENU_OPTIONS.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </FormSection>

          <FormSection label="수량">
            <div className="flex items-center gap-5 bg-gray-50 rounded-xl px-4 py-3">
              <button onClick={() => setQty(q => Math.max(1, q - 1))}
                className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center">
                <Minus className="w-3.5 h-3.5 text-gray-600" />
              </button>
              <span className="text-lg font-black text-gray-900 flex-1 text-center">{qty}잔</span>
              <button onClick={() => setQty(q => Math.min(10, q + 1))}
                className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <Plus className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </FormSection>

          <FormSection label="희망 시간">
            <input
              className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3.5 text-sm outline-none text-gray-900 focus:border-primary transition-colors"
              placeholder="예) 오늘 15:00 ~ 18:00"
              value={desiredTime} onChange={e => setDesiredTime(e.target.value)} />
          </FormSection>

          <FormSection label="오픈 카카오톡 링크">
            <input
              className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3.5 text-sm outline-none text-gray-900 focus:border-primary transition-colors"
              placeholder="https://open.kakao.com/o/..."
              value={kakao} onChange={e => setKakao(e.target.value)} />
            <p className="text-[11px] text-gray-400 mt-2 ml-1">판매자가 수락하면 이 링크로 연결돼요.</p>
          </FormSection>

          <FormSection label="추가 메모 (선택)">
            <textarea
              className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3.5 text-sm outline-none text-gray-900 focus:border-primary transition-colors resize-none"
              placeholder="원하는 조건이나 참고사항을 적어주세요"
              rows={3}
              value={note} onChange={e => setNote(e.target.value)} />
          </FormSection>
        </div>
      </div>

      <div className="px-4 py-3 bg-white border-t border-gray-100 flex-shrink-0">
        {error && <p className="text-xs text-red-500 text-center mb-2">{error}</p>}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="w-full bg-primary text-white rounded-2xl py-4 font-black text-base disabled:opacity-40 transition-opacity">
          {submitting ? "등록 중..." : "요청 등록하기"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 모집 상세 (Detail)
// ─────────────────────────────────────────────────────────────────────────────
function DetailScreen({ deal, onBack, onOrder, onLike, onReport }: {
  deal: Deal;
  onBack: () => void;
  onOrder: () => void;
  onLike: () => void;
  onReport?: () => void;
}) {
  const remaining = deal.totalTarget - deal.currentOrders;
  const disc      = bestDiscount(deal.drinks);

  async function shareDeal() {
    const url = new URL(window.location.origin);
    url.searchParams.set("post", String(deal.id));
    if (navigator.share) {
      await navigator.share({ title: `${deal.franchise} ${disc}% 할인 모집`, url: url.toString() });
    } else {
      await navigator.clipboard.writeText(url.toString());
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* top bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 flex-shrink-0">
        <button onClick={onBack}
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <span className="flex-1 text-center font-black text-sm text-gray-900">모집 상세</span>
        <div className="flex items-center gap-1.5">
          {onReport && (
            <button onClick={onReport}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
            </button>
          )}
          <button onClick={() => void shareDeal()} aria-label="모집 공유"
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <Share2 className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* hero image */}
        <div className="relative h-52">
          <ImageWithFallback src={deal.image} alt={deal.franchise}
            className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          {deal.status !== "진행중" && (
            <div className="absolute top-3 left-3">
              <span className={`text-[11px] font-black px-2.5 py-1 rounded-full ${
                deal.status === "마감임박" ? "bg-amber-100 text-amber-700" : "bg-gray-200 text-gray-500"
              }`}>{deal.status}</span>
            </div>
          )}
        </div>

        <div className="px-4 py-5 space-y-5">
          {/* headline */}
          <div>
            <h1 className="text-lg font-black text-gray-900">
              {deal.franchise}
            </h1>
            <p className="text-2xl font-black text-red-500 mt-0.5">{disc}% 할인</p>
            <p className="text-sm text-gray-400 mt-0.5">총 {deal.totalTarget}잔 모집</p>
          </div>

          <div className="border-t border-gray-100" />

          {/* detail rows */}
          <div className="space-y-4">
            {/* franchise */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-purple-50 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                <Store className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-semibold">브랜드</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5">{deal.franchise}</p>
                <p className="text-xs text-gray-400 mt-0.5">전국 지점 원격 대리주문 가능</p>
              </div>
            </div>
            {/* date */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-purple-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-semibold">모집 기간</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5">{deal.date}</p>
              </div>
            </div>
            {/* time */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-purple-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-semibold">가능 시간</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5">{deal.timeFrom} ~ {deal.timeTo}</p>
              </div>
            </div>
            {/* pickup method */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-purple-50 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                <ShoppingBag className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-semibold">수령 방법</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5">원하는 지점에서 직접 픽업</p>
                <p className="text-xs text-gray-400 mt-0.5">참여 시 원하는 지점을 알려주시면 그 지점으로 주문을 넣어드려요</p>
              </div>
            </div>
            {/* remaining */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-purple-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400 font-semibold">모집 인원</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm font-bold text-gray-900">총 {deal.totalTarget}잔</span>
                  <span className="text-gray-300">/</span>
                  <span className="text-sm font-black text-pink-500">남은 {remaining}잔</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1.5">
                  <div className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${(deal.currentOrders / deal.totalTarget) * 100}%` }} />
                </div>
              </div>
            </div>
            {/* kakao link */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "#FEE500" }}>
                <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                  <path fillRule="evenodd" clipRule="evenodd"
                    d="M9 1.5C4.86 1.5 1.5 4.19 1.5 7.5c0 2.13 1.35 4.005 3.39 5.085l-.87 3.24a.225.225 0 00.345.24L8.25 13.44A9.3 9.3 0 009 13.5c4.14 0 7.5-2.69 7.5-6s-3.36-6-7.5-6z"
                    fill="#191919" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 font-semibold">오픈 카카오톡</p>
                {deal.kakaoLink ? (
                  <a href={deal.kakaoLink} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 mt-0.5" onClick={e => e.stopPropagation()}>
                    <span className="text-sm font-bold text-primary truncate">카카오 오픈채팅 입장하기</span>
                    <ExternalLink className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  </a>
                ) : (
                  <p className="text-xs text-gray-400 mt-0.5">마감된 모집의 링크는 작성자에게만 공개됩니다.</p>
                )}
              </div>
            </div>
          </div>

          {/* fan */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-purple-100 overflow-hidden flex-shrink-0">
                <img src={deal.fan.avatar} alt={deal.fan.name} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm text-gray-900">{deal.fan.name}</span>
                  {deal.fan.verified && (
                    <span className="flex items-center gap-0.5 text-[10px] text-primary font-black bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded-full">
                      <CheckCircle className="w-2.5 h-2.5" />팬 인증
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                  <span className="flex items-center gap-0.5">
                    <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />{deal.fan.rating}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* bottom CTAs */}
      <div className="px-4 py-3 bg-white border-t border-gray-100 flex gap-2 flex-shrink-0">
        <button onClick={onLike}
          className={`flex items-center gap-1.5 px-4 h-12 rounded-2xl border font-bold text-sm flex-shrink-0 transition-colors ${
            deal.liked ? "border-primary/30 bg-primary/5 text-primary" : "border-gray-200 text-gray-500"
          }`}>
          <Heart className={`w-4 h-4 ${deal.liked ? "fill-primary text-primary" : ""}`} />
          찜하기
        </button>
        <button onClick={onOrder} disabled={deal.status === "마감" || remaining <= 0}
          className="flex-1 bg-primary text-white rounded-2xl h-12 font-black text-sm disabled:opacity-40 transition-opacity">
          {deal.status === "마감" ? "마감된 모집이에요" : "참여하기"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Order Modal
// ─────────────────────────────────────────────────────────────────────────────
function CreateSheet({ onClose, onPostDeal, onPostRequest }: {
  onClose: () => void;
  onPostDeal: () => void;
  onPostRequest: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div className="bg-white w-full rounded-t-3xl p-5 pb-8 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-2" />
        <button type="button" onClick={onPostDeal}
          className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl border border-gray-100 bg-[#F8F6FF] text-left">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
            <PenSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-black text-gray-900">모집글 작성</p>
            <p className="text-xs text-gray-400 mt-0.5">내가 공동구매를 열어요</p>
          </div>
        </button>
        <button type="button" onClick={onPostRequest}
          className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl border border-gray-100 bg-[#F8F6FF] text-left">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
            <Ticket className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-black text-gray-900">음료 요청하기</p>
            <p className="text-xs text-gray-400 mt-0.5">원하는 지점/메뉴를 올리고 판매자를 구해요</p>
          </div>
        </button>
        <button type="button" onClick={onClose}
          className="w-full text-center text-sm font-bold text-gray-400 pt-1">취소</button>
      </div>
    </div>
  );
}

function OrderModal({ deal, onClose, onConfirm }: {
  deal: Deal;
  onClose: () => void;
  onConfirm: (qty: number, pickupStore: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState(deal.drinks[0]);
  const [qty, setQty] = useState(1);
  const [pickupStore, setPickupStore] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remaining = deal.totalTarget - deal.currentOrders;
  const canSubmit = pickupStore.trim().length > 0;

  async function submitOrder() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(qty, pickupStore.trim());
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "참여 신청에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end">
      <div className="bg-white w-full rounded-t-3xl p-6 flex flex-col items-center gap-4 text-center">
        <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-primary" />
        </div>
        <div>
        <h3 className="font-black text-lg text-gray-900">참여 신청 완료!</h3>
          <p className="text-sm text-gray-500 mt-1">
            {selected.emoji} {selected.name} {qty}잔<br />
            예상 금액 <strong className="text-gray-900">{(selected.discountPrice * qty).toLocaleString()}원</strong><br />
            픽업 지점: <strong className="text-gray-900">{pickupStore}</strong>
          </p>
          <p className="text-xs text-primary mt-2 font-semibold">
            결제와 수령 방법은 카카오 오픈채팅에서 모집자와 확인해주세요.
          </p>
        </div>
        <a href={deal.kakaoLink} target="_blank" rel="noreferrer"
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm"
          style={{ backgroundColor: "#FEE500", color: "#191919" }}
          onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
            <path fillRule="evenodd" clipRule="evenodd"
              d="M9 1.5C4.86 1.5 1.5 4.19 1.5 7.5c0 2.13 1.35 4.005 3.39 5.085l-.87 3.24a.225.225 0 00.345.24L8.25 13.44A9.3 9.3 0 009 13.5c4.14 0 7.5-2.69 7.5-6s-3.36-6-7.5-6z"
              fill="#191919" />
          </svg>
          오픈채팅 입장하기
        </a>
        <button onClick={onClose}
          className="w-full text-sm text-gray-400">닫기</button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end">
      <div className="bg-white w-full rounded-t-3xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <h3 className="font-black text-base text-gray-900">음료 주문하기</h3>
          <button onClick={onClose} className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-xs font-bold text-gray-400 mb-2">픽업 받을 지점</p>
            <div className="flex items-center gap-2 bg-purple-50 rounded-xl px-3 py-2.5">
              <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
              <input
                className="flex-1 bg-transparent text-sm font-bold text-gray-900 outline-none placeholder:text-gray-300 placeholder:font-normal"
                placeholder={`${deal.franchise} 지점명을 입력해주세요`}
                value={pickupStore} onChange={e => setPickupStore(e.target.value)} />
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 mb-2">음료 선택</p>
            <div className="space-y-2">
              {deal.drinks.map(d => (
                <button key={d.name} onClick={() => setSelected(d)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-colors ${
                    selected.name === d.name ? "border-primary bg-purple-50" : "border-gray-100"
                  }`}>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{d.emoji}</span>
                    <div className="text-left">
                      <p className="text-sm font-bold text-gray-900">{d.name}</p>
                      <p className="text-[10px] text-gray-300 line-through">{d.originalPrice.toLocaleString()}원</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-black text-primary">{d.discountPrice.toLocaleString()}원</p>
                    <p className="text-[10px] font-black text-red-500">
                      {discPct(d.originalPrice, d.discountPrice)}% OFF
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 mb-2">수량 <span className="text-gray-300">(최대 {remaining}잔)</span></p>
            <div className="flex items-center gap-4">
              <button onClick={() => setQty(q => Math.max(1, q - 1))}
                className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center">
                <Minus className="w-4 h-4 text-gray-600" />
              </button>
              <span className="text-lg font-black text-gray-900 w-6 text-center">{qty}</span>
              <button onClick={() => setQty(q => Math.min(remaining, q + 1))}
                className="w-9 h-9 rounded-full bg-primary flex items-center justify-center">
                <Plus className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
            <span className="text-sm text-gray-500">예상 주문 금액</span>
            <span className="text-lg font-black text-primary">{(selected.discountPrice * qty).toLocaleString()}원</span>
          </div>
        </div>
        <div className="px-5 pb-6">
          {error && <p className="text-xs text-red-500 text-center mb-2">{error}</p>}
          <button onClick={submitOrder} disabled={!canSubmit || submitting}
            className="w-full bg-primary text-white rounded-2xl py-4 font-black text-base disabled:opacity-40 transition-opacity">
            {submitting ? "신청 중..." : "참여 신청하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 모집 작성 (Post)
// ─────────────────────────────────────────────────────────────────────────────
interface PostFormValue {
  storeId: string;
  discount: number;
  totalCount: number;
  meetingTime: string;
  availableUntil: string;
  meetingPlace: string;
  openChatUrl: string;
  description?: string;
  imageUrl?: string | null;
  imageData?: string;
}

async function resizePostImage(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("JPG, PNG, WEBP 이미지만 선택할 수 있습니다.");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("사진은 8MB 이하만 선택할 수 있습니다.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("사진 파일을 읽지 못했습니다."));
      element.src = objectUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("사진 크기를 확인하지 못했습니다.");
    }

    const targetRatio = 16 / 9;
    let sourceWidth = image.naturalWidth;
    let sourceHeight = image.naturalHeight;
    if (sourceWidth / sourceHeight > targetRatio) sourceWidth = sourceHeight * targetRatio;
    else sourceHeight = sourceWidth / targetRatio;
    const sourceX = (image.naturalWidth - sourceWidth) / 2;
    const sourceY = (image.naturalHeight - sourceHeight) / 2;

    for (const width of [960, 800, 640]) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = Math.round(width / targetRatio);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("사진을 처리하지 못했습니다.");
      context.fillStyle = "#FFFFFF";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );
      for (const quality of [0.82, 0.7, 0.58, 0.46, 0.35]) {
        const result = canvas.toDataURL("image/jpeg", quality);
        if (result.length <= 410_000) return result;
      }
    }
    throw new Error("사진 용량을 줄인 뒤 다시 선택해주세요.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const STORE_REGION_ORDER = [
  "서울", "경기", "인천", "강원", "대전", "세종", "충남", "충북", "광주",
  "전남", "전북", "대구", "경북", "부산", "울산", "경남", "제주"
];

function StoreBrowser({ initialStores = [], selectedId, onSelect }: {
  initialStores?: ApiStore[];
  selectedId?: string;
  onSelect?: (store: ApiStore) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [region, setRegion] = useState("");
  const [stores, setStores] = useState<ApiStore[]>(initialStores);
  const [regionCounts, setRegionCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(initialStores.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.storeRegions()
      .then((items) => {
        if (active) setRegionCounts(Object.fromEntries(items.map((item) => [item.region, item.count])));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      api.stores({ keyword, region, page: 1, limit: 30 })
        .then((result) => {
          if (!active) return;
          setStores(result.items);
          setTotal(result.pagination.total);
          setPage(1);
          setHasNext(result.pagination.hasNext);
        })
        .catch((reason: unknown) => {
          if (active) setError(reason instanceof Error ? reason.message : "매장을 불러오지 못했습니다.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, keyword ? 250 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [keyword, region]);

  async function loadMore() {
    if (!hasNext || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const nextPage = page + 1;
      const result = await api.stores({ keyword, region, page: nextPage, limit: 30 });
      setStores((current) => [...current, ...result.items]);
      setPage(nextPage);
      setHasNext(result.pagination.hasNext);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "매장을 더 불러오지 못했습니다.");
    } finally {
      setLoadingMore(false);
    }
  }

  const officialTotal = Object.values(regionCounts).reduce((sum, count) => sum + count, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-3xl bg-[#FFE500] px-5 py-5">
        <div className="absolute -right-5 -top-7 w-28 h-28 rounded-full bg-white/25" />
        <div className="absolute right-16 -bottom-8 w-20 h-20 rounded-full bg-white/20" />
        <div className="relative flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#3A1D1D] text-[#FFE500] flex items-center justify-center font-black text-xl shadow-sm">M</div>
          <div>
            <p className="text-[11px] font-black text-[#5C3A00]/65">MEGA MGC COFFEE</p>
            <h2 className="text-lg font-black text-[#271400]">가까운 공식 매장을 찾아보세요</h2>
            <p className="text-xs text-[#5C3A00]/70 mt-0.5">
              {officialTotal > 0 ? `전국 ${officialTotal.toLocaleString()}개 공식 매장` : "공식 매장 데이터를 불러오는 중이에요"}
            </p>
          </div>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
        <input type="search" value={keyword} onChange={(event) => setKeyword(event.target.value)}
          placeholder="매장명, 구·군, 도로명으로 검색"
          className="w-full rounded-2xl border border-gray-100 bg-white py-3.5 pl-11 pr-10 text-sm text-gray-900 outline-none shadow-sm focus:border-yellow-300" />
        {keyword && (
          <button type="button" onClick={() => setKeyword("")} aria-label="검색어 지우기"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <button type="button" onClick={() => setRegion("")}
          className={`flex-shrink-0 rounded-full px-3.5 py-2 text-xs font-black border ${!region ? "bg-[#3A1D1D] text-white border-[#3A1D1D]" : "bg-white text-gray-500 border-gray-100"}`}>
          전체 {officialTotal > 0 && officialTotal.toLocaleString()}
        </button>
        {STORE_REGION_ORDER.filter((item) => regionCounts[item]).map((item) => (
          <button key={item} type="button" onClick={() => setRegion(item)}
            className={`flex-shrink-0 rounded-full px-3.5 py-2 text-xs font-black border ${region === item ? "bg-[#FFE500] text-[#3A1D1D] border-yellow-300" : "bg-white text-gray-500 border-gray-100"}`}>
            {item} {regionCounts[item]?.toLocaleString()}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-bold text-gray-500">
          {loading ? "매장을 찾는 중..." : `${total.toLocaleString()}개 매장`}
        </p>
        <a href="https://www.mega-mgccoffee.com/store/find/" target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-400">
          공식 매장찾기 <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 px-3 py-2.5 text-xs text-red-500">{error}</div>
      )}

      {loading ? (
        <div className="space-y-2" aria-label="매장 목록 로딩 중">
          {[1, 2, 3].map((item) => <div key={item} className="h-28 rounded-2xl bg-white border border-gray-100 animate-pulse" />)}
        </div>
      ) : stores.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl bg-white border border-gray-100 py-12 text-center">
          <Store className="w-10 h-10 text-gray-200" />
          <p className="text-sm font-bold text-gray-500 mt-3">검색 결과가 없어요</p>
          <p className="text-xs text-gray-300 mt-1">매장명이나 지역을 다르게 입력해보세요.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {stores.map((store) => {
            const selected = store.id === selectedId;
            const body = (
              <>
                <div className="w-11 h-11 rounded-2xl bg-[#FFE500] text-[#3A1D1D] flex items-center justify-center font-black flex-shrink-0">M</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-black text-gray-900">{store.name}</p>
                    <span className="text-[10px] font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">공식</span>
                    {selected && <CheckCircle className="w-4 h-4 text-primary" />}
                  </div>
                  <p className="text-[11px] font-bold text-gray-400 mt-0.5">{store.brand} · {store.region}{store.district ? ` ${store.district}` : ""}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{store.address}</p>
                  {store.phone && <p className="text-[11px] text-gray-400 mt-1">{store.phone}</p>}
                </div>
              </>
            );
            if (onSelect) return (
              <button key={store.id} type="button" onClick={() => onSelect(store)}
                className={`w-full flex gap-3 rounded-2xl border p-3.5 text-left shadow-sm transition-colors ${selected ? "bg-purple-50 border-primary/30" : "bg-white border-gray-100"}`}>
                {body}
                <ChevronRight className="w-4 h-4 text-gray-300 self-center flex-shrink-0" />
              </button>
            );
            const mapUrl = `https://map.kakao.com/link/search/${encodeURIComponent(`${store.brand} ${store.name} ${store.address}`)}`;
            return (
              <article key={store.id} className="flex gap-3 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm">
                {body}
                <div className="flex flex-col gap-2 justify-center flex-shrink-0">
                  <a href={mapUrl} target="_blank" rel="noreferrer" aria-label={`${store.name} 지도에서 보기`}
                    className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-primary" />
                  </a>
                  {store.phone && (
                    <a href={`tel:${store.phone}`} aria-label={`${store.name} 전화하기`}
                      className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center">
                      <Phone className="w-4 h-4 text-green-600" />
                    </a>
                  )}
                </div>
              </article>
            );
          })}
          {hasNext && (
            <button type="button" onClick={() => void loadMore()} disabled={loadingMore}
              className="w-full rounded-2xl border border-gray-200 bg-white py-3 text-sm font-black text-gray-500 disabled:opacity-50">
              {loadingMore ? "불러오는 중..." : "매장 더 보기"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StoreDirectoryScreen({ initialStores, onBack }: { initialStores: ApiStore[]; onBack: () => void }) {
  return (
    <div className="flex flex-col h-full bg-[#F8F6FF]">
      <div className="flex items-center px-4 py-3 bg-white border-b border-gray-100 flex-shrink-0">
        <button type="button" onClick={onBack} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <span className="flex-1 text-center font-black text-sm text-gray-900 -ml-8 pointer-events-none">메가MGC커피 매장찾기</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <StoreBrowser initialStores={initialStores} />
        <p className="text-[10px] text-gray-300 text-center px-5 py-5 leading-relaxed">
          매장 정보는 메가MGC커피 공식 매장찾기 기준이며 실제 운영 여부·영업시간은 방문 전에 매장으로 확인해주세요.
        </p>
      </div>
    </div>
  );
}

function PostScreen({ onBack, initialDeal, stores, onSubmit }: {
  onBack: () => void;
  initialDeal?: Deal;
  stores: ApiStore[];
  onSubmit: (value: PostFormValue) => Promise<void>;
}) {
  const mode = initialDeal ? "edit" : "create";
  const tomorrow = new Date(Date.now() + 24 * 60 * 60_000).toISOString().slice(0, 10);

  const [storeId,     setStoreId]    = useState(initialDeal?.storeId ?? "");
  const [selectedStore, setSelectedStore] = useState<ApiStore | null>(() => stores.find((store) => store.id === initialDeal?.storeId) ?? null);
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [date,        setDate]       = useState(initialDeal?.meetingTime?.slice(0, 10) ?? tomorrow);
  const [discRate,   setDiscRate]  = useState(initialDeal ? String(bestDiscount(initialDeal.drinks)) : "");
  const [qty,        setQty]       = useState(initialDeal ? initialDeal.totalTarget : 10);
  const [timeFrom,   setTimeFrom]  = useState(initialDeal?.timeFrom ?? "");
  const [timeTo,     setTimeTo]    = useState(initialDeal?.timeTo ?? "");
  const [kakao,      setKakao]     = useState(initialDeal?.kakaoLink ?? "");
  const [extraNote,  setExtraNote] = useState(initialDeal?.note ?? "");
  const [imageData, setImageData] = useState<string | null>(null);
  const [removeInitialImage, setRemoveInitialImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [done,       setDone]      = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const discRateNum = Number(discRate);
  const discRateValid = discRate && discRateNum > 0 && discRateNum < 100;
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imagePreview = imageData ?? (!removeInitialImage ? initialDeal?.imageUrl ?? null : null);
  const canSubmit = Boolean(storeId && date && discRateValid && timeFrom && timeTo && kakao && timeTo > timeFrom && !imageProcessing);

  async function selectImage(file: File | undefined) {
    if (!file) return;
    setImageProcessing(true);
    setImageError(null);
    try {
      setImageData(await resizePostImage(file));
      setRemoveInitialImage(false);
    } catch (reason) {
      setImageError(reason instanceof Error ? reason.message : "사진을 처리하지 못했습니다.");
    } finally {
      setImageProcessing(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  function removeImage() {
    setImageData(null);
    setRemoveInitialImage(Boolean(initialDeal?.imageUrl));
    setImageError(null);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit({
        storeId,
        discount: discRateNum,
        totalCount: qty,
        meetingTime: new Date(`${date}T${timeFrom}:00+09:00`).toISOString(),
        availableUntil: new Date(`${date}T${timeTo}:00+09:00`).toISOString(),
        meetingPlace: selectedStore?.address ?? initialDeal?.meetingPlace ?? "원하는 픽업 지점",
        openChatUrl: kakao,
        ...(extraNote.trim() ? { description: extraNote.trim() } : {}),
        ...(imageData
          ? { imageData }
          : removeInitialImage
            ? { imageUrl: null }
            : {}),
      });
      if (mode === "edit") onBack();
      else setDone(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "모집을 저장하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!initialDeal?.storeId || selectedStore) return;
    let active = true;
    api.store(String(initialDeal.storeId))
      .then((store) => { if (active) setSelectedStore(store); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [initialDeal?.storeId, selectedStore]);

  if (storePickerOpen) return (
    <div className="flex flex-col h-full bg-[#F8F6FF]">
      <div className="flex items-center px-4 py-3 bg-white border-b border-gray-100 flex-shrink-0">
        <button type="button" onClick={() => setStorePickerOpen(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <span className="flex-1 text-center font-black text-sm text-gray-900 -ml-8 pointer-events-none">기준 매장 선택</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <StoreBrowser initialStores={stores} selectedId={storeId} onSelect={(store) => {
          setSelectedStore(store);
          setStoreId(store.id);
          setStorePickerOpen(false);
        }} />
      </div>
    </div>
  );

  if (mode === "create" && done) return (
    <div className="flex flex-col h-full items-center justify-center gap-6 px-8 text-center bg-white">
      <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center">
        <Ticket className="w-10 h-10 text-primary" />
      </div>
      <div>
        <h2 className="text-xl font-black text-gray-900">공고 등록 완료!</h2>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed">
          음료를 10잔 판매하면<br />
          <span className="font-black text-primary">팬사인회 응모권 1장</span>이 지급돼요 🎫
        </p>
      </div>
      <button type="button" onClick={onBack}
        className="w-full max-w-xs bg-primary text-white rounded-xl py-4 font-black text-sm">
        홈으로 돌아가기
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-white">
      {/* header */}
      <div className="flex items-center px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <button type="button" onClick={onBack}
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <span className="flex-1 text-center font-black text-sm text-gray-900 -ml-8 pointer-events-none">{mode === "edit" ? "모집 수정" : "모집 작성"}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-5 space-y-6">

          {/* 사진 업로드 */}
          <FormSection label="대표 사진 (선택)">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => void selectImage(event.target.files?.[0])}
            />
            {imagePreview ? (
              <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 group">
                <ImageWithFallback src={imagePreview} alt="모집 대표 사진 미리보기" className="w-full h-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 p-3 bg-gradient-to-t from-black/55 to-transparent">
                  <button type="button" onClick={() => imageInputRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-black text-gray-700 shadow-sm">
                    <ImagePlus className="w-3.5 h-3.5" /> 사진 변경
                  </button>
                  <button type="button" onClick={removeImage}
                    className="flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-black text-red-500 shadow-sm">
                    <Trash2 className="w-3.5 h-3.5" /> 삭제
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => imageInputRef.current?.click()} disabled={imageProcessing}
                className="w-full aspect-video rounded-2xl border-2 border-dashed border-purple-200 bg-purple-50/60 flex flex-col items-center justify-center gap-2 text-primary disabled:opacity-50">
                <span className="w-11 h-11 rounded-full bg-white flex items-center justify-center shadow-sm">
                  <ImagePlus className="w-5 h-5" />
                </span>
                <span className="text-sm font-black">{imageProcessing ? "사진 처리 중..." : "사진 첨부하기"}</span>
                <span className="text-[11px] font-medium text-gray-400">앨범에서 대표 사진을 선택해주세요</span>
              </button>
            )}
            <p className="text-[11px] text-gray-400 mt-2 ml-1">JPG, PNG, WEBP · 최대 8MB · 16:9로 자동 조정</p>
            {imageError && <p className="text-xs text-red-500 mt-1.5 ml-1">{imageError}</p>}
          </FormSection>

          {/* 브랜드 */}
          <FormSection label="브랜드 / 기준 매장">
            <button type="button" onClick={() => setStorePickerOpen(true)}
              className={`w-full rounded-2xl border p-3.5 text-left transition-colors ${selectedStore ? "bg-yellow-50 border-yellow-200" : "bg-gray-50 border-gray-100"}`}>
              {selectedStore ? (
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-[#FFE500] text-[#3A1D1D] flex items-center justify-center font-black flex-shrink-0">M</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-gray-900">{selectedStore.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{selectedStore.address}</p>
                  </div>
                  <span className="text-xs font-black text-primary flex-shrink-0">변경</span>
                </div>
              ) : (
                <div className="flex items-center gap-3 py-1">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center"><Store className="w-5 h-5 text-gray-300" /></div>
                  <div className="flex-1">
                    <p className="text-sm font-black text-gray-700">공식 매장을 선택해주세요</p>
                    <p className="text-xs text-gray-400 mt-0.5">전국 매장명·지역·주소로 검색할 수 있어요.</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </div>
              )}
            </button>
          </FormSection>

          {/* 할인율 */}
          <FormSection label="할인율">
            <div className="relative">
              <input type="number" min="1" max="99"
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3.5 text-sm outline-none text-gray-900 focus:border-primary transition-colors pr-10"
                placeholder="예) 20"
                value={discRate} onChange={e => setDiscRate(e.target.value)} />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
            </div>
            {discRate && !discRateValid && (
              <p className="text-xs text-red-400 mt-1.5 ml-1">1~99 사이의 숫자를 입력해주세요</p>
            )}
            {discRateValid && (
              <p className="text-xs font-black text-primary mt-1.5 ml-1">{discRate}% 할인이 적용됩니다</p>
            )}
          </FormSection>

          {/* 모집 수량 */}
          <FormSection label="모집 수량">
            <div className="flex items-center gap-5 bg-gray-50 rounded-xl px-4 py-3">
              <button onClick={() => setQty(q => Math.max(1, q - 1))}
                className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center">
                <Minus className="w-3.5 h-3.5 text-gray-600" />
              </button>
              <span className="text-lg font-black text-gray-900 flex-1 text-center">{qty}잔</span>
              <button onClick={() => setQty(q => Math.min(30, q + 1))}
                className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <Plus className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5 ml-1">
              {qty}잔 판매 시 응모권 {Math.floor(qty / 10)}장 획득 가능
            </p>
          </FormSection>

          {/* 가능 시간 */}
          <FormSection label="가능 날짜">
            <input type="date" min={new Date().toISOString().slice(0, 10)}
              className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3.5 text-sm outline-none text-gray-900 focus:border-primary"
              value={date} onChange={e => setDate(e.target.value)} />
          </FormSection>
          <FormSection label="가능 시간">
            <div className="flex items-center gap-3">
              <input type="time"
                className="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3.5 text-sm outline-none text-gray-900 focus:border-primary transition-colors"
                value={timeFrom} onChange={e => setTimeFrom(e.target.value)} />
              <span className="text-gray-400 text-sm font-bold flex-shrink-0">~</span>
              <input type="time"
                className="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3.5 text-sm outline-none text-gray-900 focus:border-primary transition-colors"
                value={timeTo} onChange={e => setTimeTo(e.target.value)} />
            </div>
          </FormSection>
          {timeFrom && timeTo && timeTo <= timeFrom && (
            <p className="text-xs text-red-400 -mt-4">종료 시간은 시작 시간보다 늦어야 합니다.</p>
          )}

          {/* 카카오 오픈채팅 링크 */}
          <FormSection label="오픈 카카오톡 링크">
            <input
              className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3.5 text-sm outline-none text-gray-900 focus:border-primary transition-colors"
              placeholder="https://open.kakao.com/o/..."
              value={kakao} onChange={e => setKakao(e.target.value)} />
            <div className="flex items-start gap-2 mt-2 bg-yellow-50 border border-yellow-100 rounded-xl px-3 py-2.5">
              <svg width="14" height="14" viewBox="0 0 18 18" fill="none" className="flex-shrink-0 mt-0.5">
                <path fillRule="evenodd" clipRule="evenodd"
                  d="M9 1.5C4.86 1.5 1.5 4.19 1.5 7.5c0 2.13 1.35 4.005 3.39 5.085l-.87 3.24a.225.225 0 00.345.24L8.25 13.44A9.3 9.3 0 009 13.5c4.14 0 7.5-2.69 7.5-6s-3.36-6-7.5-6z"
                  fill="#A67C00" />
              </svg>
              <p className="text-[11px] text-yellow-700 leading-relaxed">
                참여자와 소통을 위해 카카오 오픈채팅 링크를 입력해주세요. 원하는 픽업 지점을 전달받은 뒤 대신 주문을 넣어주세요.
              </p>
            </div>
          </FormSection>

          {/* 추가 안내 */}
          <FormSection label="추가 안내 (선택)">
            <textarea
              className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3.5 text-sm outline-none text-gray-900 focus:border-primary transition-colors resize-none"
              placeholder="픽업 방법, 주의사항 등 추가로 안내할 내용을 입력해주세요"
              rows={3}
              value={extraNote} onChange={e => setExtraNote(e.target.value)} />
          </FormSection>
        </div>
      </div>

      {/* submit */}
      <div className="px-4 py-3 bg-white border-t border-gray-100 flex-shrink-0">
        {submitError && <p className="text-xs text-red-500 text-center mb-2">{submitError}</p>}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="w-full bg-primary text-white rounded-2xl py-4 font-black text-base disabled:opacity-40 transition-opacity">
          {submitting ? "저장 중..." : mode === "edit" ? "수정하기" : "등록하기"}
        </button>
      </div>
    </div>
  );
}

function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-black text-gray-800 mb-2.5">{label}</p>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Home Screen
// ─────────────────────────────────────────────────────────────────────────────
function HomeScreen({ deals, onSelect, onLike, onGuide, onEvent, onSearch, onList, onContact, onStores }: {
  deals: Deal[];
  onSelect: (d: Deal) => void;
  onLike: (id: Deal["id"]) => void;
  onGuide: () => void;
  onEvent: () => void;
  onSearch: (q: string) => void;
  onList: () => void;
  onContact: () => void;
  onStores: () => void;
}) {
  const visible = deals.slice(0, 4);
  return (
    <div className="flex-1 overflow-y-auto bg-[#F8F6FF]">
      {/* hero */}
      <section className="relative overflow-hidden mx-3 mt-3 rounded-3xl"
        style={{ background: "linear-gradient(155deg, #EAE0FF 0%, #DDD5F8 40%, #C9BFEF 100%)" }}>
        <span className="absolute top-3 left-4 text-yellow-300 text-base select-none">★</span>
        <span className="absolute top-8 left-16 text-purple-300 text-xs select-none">✦</span>
        <span className="absolute bottom-10 left-8 text-pink-300 text-xs select-none">✦</span>
        <span className="absolute top-5 right-36 text-yellow-200 text-xs select-none">★</span>
        <div className="relative z-10 px-4 pt-4">
          <a
            href={EVENT_DETAIL_URL}
            className="inline-flex items-center gap-1.5 bg-white/60 backdrop-blur-sm rounded-full px-3 py-1 transition-colors hover:bg-white/80"
            aria-label="NCT WISH 팬사인단체 프리퀀시 이벤트 자세히 보기"
          >
            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
            <span className="text-[10px] font-black text-purple-800">NCT WISH 팬사인단체 프리퀀시 이벤트</span>
            <ChevronRight className="w-3 h-3 text-purple-500" />
          </a>
        </div>
        <div className="relative z-10 flex items-end justify-between px-4 pt-2">
          <div className="pb-5">
            <h1 className="font-black text-[1.35rem] leading-tight text-purple-950">
              NCT WISH와 함께<br />특별한 순간을<br />완성해요!
            </h1>
          </div>
          <div className="relative w-36 flex-shrink-0 self-end">
            <ImageWithFallback src={nctWishChar} alt="NCT WISH 캐릭터" className="relative z-10 w-full object-contain drop-shadow-sm" />
          </div>
        </div>
      </section>

      {/* search + filters */}
      <section className="px-3 mt-3">
        <button onClick={() => onSearch("")}
          className="w-full bg-white border border-gray-100 rounded-2xl flex items-center gap-2.5 px-4 py-3 shadow-sm text-left">
          <Search className="w-4 h-4 text-gray-300 flex-shrink-0" />
          <span className="flex-1 text-sm text-gray-300">브랜드, 모집자, 할인율을 검색해보세요</span>
        </button>
        <div className="-mx-1 mt-2 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
          {[
            { icon: Store,  label: "브랜드" },
            { icon: SlidersHorizontal, label: "할인율" },
            { icon: Ticket, label: "남은 잔 수" },
          ].map(({ icon: Icon, label }) => (
            <button key={label} onClick={() => onSearch("")}
              className="flex items-center gap-1 bg-white border border-gray-100 rounded-full px-3 py-1.5 shadow-sm flex-shrink-0">
              <Icon className="w-3 h-3 text-gray-400" />
              <span className="text-[11px] font-semibold text-gray-500">{label}</span>
              <ChevronDown className="w-3 h-3 text-gray-300" />
            </button>
          ))}
        </div>
      </section>

      {/* official stores */}
      <section className="px-3 mt-3">
        <button type="button" onClick={onStores}
          className="relative overflow-hidden w-full rounded-2xl bg-[#FFE500] px-4 py-3.5 text-left shadow-sm active:scale-[0.99] transition-transform">
          <div className="absolute -right-5 -top-8 w-24 h-24 rounded-full bg-white/25" />
          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#3A1D1D] text-[#FFE500] flex items-center justify-center font-black">M</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-[#271400]">전국 메가MGC커피 공식 매장</p>
              <p className="text-[11px] text-[#5C3A00]/70 mt-0.5">매장명·지역·주소로 내 주변 지점을 찾아보세요.</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#5C3A00]" />
          </div>
        </button>
      </section>

      {/* quick actions */}
      <section className="px-3 mt-4">
        <div className="bg-white rounded-2xl px-2 py-4 flex justify-around shadow-sm border border-gray-50">
          {[
            { icon: Search,    label: "모집 찾기",   bg: "bg-purple-100", color: "text-purple-600", tap: onList         },
            { icon: Gift,      label: "이벤트",      bg: "bg-yellow-100", color: "text-yellow-600", tap: onEvent        },
            { icon: BookOpen,  label: "이용 가이드", bg: "bg-sky-100",    color: "text-sky-500",    tap: onGuide        },
            { icon: Megaphone, label: "문의사항",    bg: "bg-green-100",  color: "text-green-600",  tap: onContact      },
          ].map(({ icon: Icon, label, bg, color, tap }) => (
            <button key={label} onClick={tap} className="flex flex-col items-center gap-1.5">
              <div className={`w-12 h-12 rounded-full ${bg} flex items-center justify-center active:scale-90 transition-transform`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <span className="text-[11px] font-semibold text-gray-500">{label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* listings */}
      <section className="px-3 mt-5 pb-6">
        <div className="flex items-center gap-1.5 mb-3">
          <h2 className="font-black text-base text-gray-900">지금 모집 중이에요</h2>
          <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
        </div>
        <div className="space-y-2.5">
          {visible.map(d => (
            <ListCard key={d.id} deal={d} onTap={() => onSelect(d)} onLike={() => onLike(d.id)} />
          ))}
        </div>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Saved Screen
// ─────────────────────────────────────────────────────────────────────────────
function SavedScreen({ deals, onSelect, onLike }: {
  deals: Deal[];
  onSelect: (d: Deal) => void;
  onLike: (id: Deal["id"]) => void;
}) {
  const saved = deals.filter(d => d.liked);
  return (
    <div className="flex flex-col h-full bg-[#F8F6FF]">
      {/* header */}
      <div className="flex items-center px-4 py-3 bg-[#F8F6FF] flex-shrink-0">
        <div className="w-8" />
        <span className="flex-1 text-center font-black text-sm text-gray-900">찜한 목록</span>
        <div className="w-8" />
      </div>

      {saved.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3">
          <Heart className="w-12 h-12 text-gray-200" />
          <p className="text-sm text-gray-400">찜한 공고가 없어요</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-3">
          {saved.map(d => (
            <SavedCard key={d.id} deal={d} onTap={() => onSelect(d)} onLike={() => onLike(d.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function SavedCard({ deal, onTap, onLike }: { deal: Deal; onTap: () => void; onLike: () => void }) {
  const remaining = deal.totalTarget - deal.currentOrders;
  const disc      = bestDiscount(deal.drinks);
  return (
    <div onClick={onTap}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden active:scale-[0.99] transition-transform cursor-pointer">
      {/* image */}
      <div className="relative h-36 w-full">
        <ImageWithFallback src={deal.image} alt={deal.franchise}
          className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
        {deal.status === "마감임박" && (
          <span className="absolute top-2.5 left-2.5 text-[10px] font-black bg-amber-400 text-white px-2 py-0.5 rounded-full">마감임박</span>
        )}
        {deal.status === "마감" && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="text-white text-sm font-black">마감</span>
          </div>
        )}
        <button onClick={e => { e.stopPropagation(); onLike(); }}
          className="absolute top-2.5 right-2.5 w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow-sm">
          <Heart className="w-4 h-4 fill-pink-500 text-pink-500" />
        </button>
      </div>
      {/* content */}
      <div className="px-3.5 py-3">
        <p className="text-xs font-bold text-gray-500">{deal.franchise}</p>
        <div className="flex items-end justify-between mt-0.5">
          <div>
            <p className="text-xl font-black text-red-500 leading-tight">{disc}% 할인</p>
            <p className="text-xs text-gray-400 mt-0.5">{deal.date} · {deal.timeFrom}~{deal.timeTo}</p>
          </div>
          <span className="text-[11px] font-black text-white bg-pink-500 px-2.5 py-1 rounded-full mb-0.5">
            남은 {remaining}잔
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// My Screen
// ─────────────────────────────────────────────────────────────────────────────
function MyScreen({ user, dealCount, reviewCount, pendingReviewCount, favoriteCount, onMyDeals, onParticipations, onReviews, onNotifications, onProfile, onSaved, onAccountSettings, onLogout }: {
  user: AuthUser | null;
  dealCount: number;
  reviewCount: number;
  pendingReviewCount: number;
  favoriteCount: number;
  onMyDeals: () => void;
  onParticipations: () => void;
  onReviews: () => void;
  onNotifications: () => void;
  onProfile: () => void;
  onSaved: () => void;
  onAccountSettings: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="flex flex-col h-full bg-[#F8F6FF]">
      {/* header */}
      <div className="flex items-center justify-center px-4 py-3 bg-[#F8F6FF] flex-shrink-0">
        <span className="font-black text-sm text-gray-900">마이페이지</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* profile card */}
        <div className="mx-4 bg-white rounded-3xl border border-gray-100 shadow-sm">
          {/* purple top band — rounded-t-3xl so card border-radius shows without overflow-hidden on outer */}
          <div className="relative h-20 rounded-t-3xl overflow-hidden"
            style={{ background: "linear-gradient(135deg, #7B3FD4 0%, #A855F7 100%)" }}>
            <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
            <div className="absolute -bottom-6 right-10 w-16 h-16 rounded-full bg-white/10" />
          </div>
          {/* avatar overlapping band */}
          <div className="px-5 pb-5">
            <div className="flex items-end justify-between -mt-10 relative z-10">
              <div className="w-20 h-20 rounded-full border-4 border-white shadow-md bg-purple-100 overflow-hidden flex items-center justify-center">
                {user?.profileImage ? (
                  <ImageWithFallback src={user.profileImage} alt="프로필" className="w-full h-full object-cover" />
                ) : (
                  <ImageWithFallback src={nctWishLogo} alt="프로필" className="w-16 h-16 object-contain" />
                )}
              </div>
              <button onClick={onProfile}
                className="mb-1 text-xs font-bold text-primary bg-purple-50 border border-purple-100 px-3 py-1.5 rounded-full">
                프로필 수정
              </button>
            </div>
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <span className="text-lg font-black text-gray-900">{user?.nickname ?? "WISH 빈"}</span>
                {user?.role === "ADMIN" && (
                  <span className="flex items-center gap-0.5 text-[10px] font-black text-primary bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full">
                    <CheckCircle className="w-2.5 h-2.5" /> 관리자
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{user?.role === "ADMIN" ? "관리자" : "일반 회원"}</p>
              <div className="flex items-center gap-1 mt-1.5">
                <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                <span className="text-sm font-bold text-gray-700">{(user?.rating ?? 0).toFixed(1)}</span>
                <span className="text-xs text-gray-400">(후기 {user?.reviewCount ?? 0}개)</span>
              </div>
            </div>
          </div>
        </div>

        {/* stats */}
        <div className="mx-4 mt-3 bg-white rounded-2xl border border-gray-100 shadow-sm grid grid-cols-3 divide-x divide-gray-100">
          {[
            { v: String(dealCount), l1: "내가 작성한", l2: "모집", onTap: onMyDeals },
            { v: String(reviewCount), l1: "작성한",    l2: "후기", onTap: onReviews },
            { v: String(favoriteCount),  l1: "찜한",      l2: "목록", onTap: onSaved },
          ].map(({ v, l1, l2, onTap }) => (
            <button key={l1} onClick={onTap} className="py-4 text-center">
              <div className="text-xl font-black text-gray-900">{v}</div>
              <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">{l1}<br />{l2}</div>
            </button>
          ))}
        </div>

        {pendingReviewCount > 0 && (
          <button type="button" onClick={onReviews}
            className="mx-4 mt-3 w-[calc(100%-2rem)] flex items-center gap-3 rounded-2xl bg-gradient-to-r from-primary to-purple-500 px-4 py-3.5 text-left shadow-sm shadow-purple-200 active:scale-[0.99] transition-transform">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <Star className="w-5 h-5 fill-yellow-300 text-yellow-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-white">작성 가능한 후기가 {pendingReviewCount}개 있어요</p>
              <p className="text-[11px] text-white/75 mt-0.5">함께한 모집의 경험을 남겨주세요.</p>
            </div>
            <ChevronRight className="w-4 h-4 text-white/80 flex-shrink-0" />
          </button>
        )}

        {/* menu */}
        <div className="mx-4 mt-3 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
          {[
            { icon: PenSquare, label: "내 모집 관리",   onTap: onMyDeals,        highlight: true },
            { icon: Ticket,    label: "내가 참여한 모집", onTap: onParticipations, highlight: false },
            { icon: Star,      label: "후기 관리",       onTap: onReviews,        highlight: pendingReviewCount > 0 },
            { icon: Heart,     label: "찜한 목록",      onTap: onSaved,          highlight: false },
            { icon: Bell,      label: "알림",           onTap: onNotifications },
            { icon: User,      label: "계정 설정",      onTap: onAccountSettings },
          ].map(({ icon: Icon, label, onTap, highlight }, i, arr) => (
            <button key={label} onClick={onTap}
              className={`w-full flex items-center justify-between px-4 py-4 ${i < arr.length - 1 ? "border-b border-gray-50" : ""}`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${highlight ? "bg-primary" : "bg-gray-50"}`}>
                  <Icon className={`w-4 h-4 ${highlight ? "text-white" : "text-gray-500"}`} />
                </div>
                <span className={`text-sm font-semibold ${highlight ? "text-primary" : "text-gray-800"}`}>{label}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </button>
          ))}
        </div>

        {/* logout */}
        <div className="mx-4 mt-3 mb-8">
          <button type="button" onClick={onLogout}
            className="w-full py-3.5 rounded-2xl border border-gray-200 text-sm font-bold text-gray-400 bg-white active:bg-gray-50 transition-colors">
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 내 모집 관리 Screen
// ─────────────────────────────────────────────────────────────────────────────
type MyDealFilter = "전체" | "모집중" | "마감";

function MyDealsScreen({ deals, stores, onBack, onClose, onDelete, onUpdate }: {
  deals: Deal[];
  stores: ApiStore[];
  onBack: () => void;
  onClose: (id: Deal["id"]) => Promise<void>;
  onDelete: (id: Deal["id"]) => Promise<void>;
  onUpdate: (id: Deal["id"], value: PostFormValue) => Promise<void>;
}) {
  const [filter, setFilter]   = useState<MyDealFilter>("전체");
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const visible = deals.filter(d =>
    filter === "전체" ? true :
    filter === "모집중" ? d.status !== "마감" :
    d.status === "마감"
  );

  async function run(action: () => Promise<void>) {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "요청을 처리하지 못했습니다.");
    }
  }

  if (editingDeal) return (
    <PostScreen
      initialDeal={editingDeal}
      stores={stores}
      onBack={() => setEditingDeal(null)}
      onSubmit={(value) => onUpdate(editingDeal.id, value)}
    />
  );

  return (
    <div className="flex flex-col h-full bg-white">
      {/* header */}
      <div className="flex items-center px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <button onClick={onBack}
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <span className="flex-1 text-center font-black text-sm text-gray-900 -ml-8 pointer-events-none">내 모집 관리</span>
      </div>

      {/* filter tabs */}
      <div className="flex gap-1.5 px-4 pt-3 pb-2 flex-shrink-0">
        {(["전체", "모집중", "마감"] as MyDealFilter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs font-bold px-4 py-1.5 rounded-full transition-colors ${
              filter === f ? "bg-primary text-white" : "bg-gray-100 text-gray-500"
            }`}>
            {f}
          </button>
        ))}
      </div>

      {actionError && <p className="mx-4 text-xs text-red-500">{actionError}</p>}

      {/* cards */}
      <div className="flex-1 overflow-y-auto bg-[#F8F6FF] px-3 py-2 space-y-3">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <span className="text-5xl">📋</span>
            <p className="text-sm text-gray-400">등록한 공고가 없어요</p>
          </div>
        ) : visible.map(d => (
          <MyDealCard key={d.id} deal={d}
            onClose={() => void run(() => onClose(d.id))}
            onDelete={() => void run(() => onDelete(d.id))}
            onEdit={() => setEditingDeal(d)} />
        ))}
      </div>
    </div>
  );
}

function MyDealCard({ deal, onClose, onDelete, onEdit }: {
  deal: Deal;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const disc      = bestDiscount(deal.drinks);
  const remaining = deal.totalTarget - deal.currentOrders;
  const isClosed  = deal.status === "마감";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex">
        {/* thumbnail */}
        <div className="relative w-[96px] flex-shrink-0 self-stretch">
          <ImageWithFallback src={deal.image} alt={deal.franchise}
            className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          <span className={`absolute top-2 left-2 text-[10px] font-black px-2 py-0.5 rounded-full ${
            isClosed ? "bg-gray-800/80 text-gray-200" : "bg-emerald-500 text-white"
          }`}>
            {isClosed ? "마감" : "진행중"}
          </span>
        </div>
        {/* content */}
        <div className="flex-1 min-w-0 px-3 py-3">
          <p className="text-xs text-gray-400 font-semibold">{deal.franchise}</p>
          <p className="text-xl font-black text-red-500 leading-tight mt-0.5">{disc}% 할인</p>
          <p className="text-xs text-gray-400">총 {deal.totalTarget}잔 모집</p>
          {!isClosed && (
            <div className="mt-1.5">
              <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-primary"
                  style={{ width: `${(deal.currentOrders / deal.totalTarget) * 100}%` }} />
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">남은 {remaining}잔</p>
            </div>
          )}
        </div>
      </div>
      {/* action buttons */}
      <div className={`flex gap-2 px-3 py-2.5 border-t border-gray-50 ${isClosed ? "justify-end" : ""}`}>
        {isClosed ? (
          <button onClick={onDelete}
            className="text-xs font-bold text-red-400 border border-red-100 bg-red-50 px-5 py-2 rounded-xl">
            삭제
          </button>
        ) : (
          <>
            <button onClick={onEdit}
              className="flex-1 text-xs font-bold text-gray-600 border border-gray-200 py-2.5 rounded-xl">
              수정
            </button>
            <button onClick={onClose}
              className="flex-1 text-xs font-bold text-white bg-primary py-2.5 rounded-xl">
              마감하기
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 신고하기 Screen
// ─────────────────────────────────────────────────────────────────────────────
const REPORT_REASONS = [
  { label: "허위 정보 / 사기", code: "FRAUD" },
  { label: "약속 불이행 / 노쇼", code: "NO_SHOW" },
  { label: "욕설 및 비방", code: "ABUSE" },
  { label: "스팸 / 광고", code: "OTHER" },
  { label: "부적절한 콘텐츠", code: "OTHER" },
  { label: "기타", code: "OTHER" },
];

function ReportScreen({ deal, onBack }: { deal: Deal; onBack: () => void }) {
  const [reason,  setReason]  = useState("");
  const [detail,  setDetail]  = useState("");
  const [open,    setOpen]    = useState(false);
  const [done,    setDone]    = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedReason = REPORT_REASONS.find((item) => item.label === reason);
  const canSubmit = Boolean(selectedReason && (selectedReason.code !== "OTHER" || detail.trim()));

  async function handleSubmit() {
    if (!canSubmit || !selectedReason) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.report(String(deal.id), selectedReason.code, detail.trim() || reason);
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "신고를 접수하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) return (
    <div className="flex flex-col h-full items-center justify-center gap-5 px-8 text-center bg-white">
      <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
        <Shield className="w-8 h-8 text-red-400" />
      </div>
      <div>
        <h2 className="text-lg font-black text-gray-900">신고가 접수됐어요</h2>
        <p className="text-sm text-gray-400 mt-2 leading-relaxed">
          검토 후 조치 결과를 알려드릴게요.<br />소중한 신고 감사합니다.
        </p>
      </div>
      <button onClick={onBack}
        className="w-full max-w-xs bg-primary text-white rounded-xl py-4 font-black text-sm">
        확인
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-white">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <button onClick={onBack} className="text-sm font-semibold text-gray-500">취소</button>
        <span className="font-black text-sm text-gray-900">신고하기</span>
        <button onClick={handleSubmit} disabled={!canSubmit || submitting}
          className={`text-sm font-black ${canSubmit ? "text-primary" : "text-gray-300"}`}>
          {submitting ? "제출 중" : "제출"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
        {/* 신고 대상 */}
        <div>
          <p className="text-sm font-black text-gray-800 mb-2.5">신고 대상</p>
          <div className="flex items-center gap-2.5 bg-[#F8F6FF] rounded-xl px-4 py-3">
            <div className="w-7 h-7 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
              <MapPin className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">
                {deal.franchise}
              </p>
              <p className="text-xs text-gray-400">{deal.fan.name}</p>
            </div>
          </div>
        </div>

        {/* 신고 사유 */}
        <div>
          <p className="text-sm font-black text-gray-800 mb-2.5">신고 사유</p>
          <div className="relative">
            <button onClick={() => setOpen(!open)}
              className="w-full bg-[#F8F6FF] border border-gray-100 rounded-xl px-4 py-3.5 flex items-center justify-between">
              <span className={`text-sm ${reason ? "text-gray-900 font-semibold" : "text-gray-300"}`}>
                {reason || "선택해주세요"}
              </span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-20 overflow-hidden">
                {REPORT_REASONS.map(r => (
                  <button key={r.label} onClick={() => { setReason(r.label); setOpen(false); }}
                    className={`w-full text-left px-4 py-3 text-sm border-b border-gray-50 last:border-0 ${
                      reason === r.label ? "text-primary font-bold" : "text-gray-700"
                    }`}>
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 상세 내용 */}
        <div>
          <p className="text-sm font-black text-gray-800 mb-2.5">상세 내용 <span className="text-gray-400 font-normal">(선택)</span></p>
          <div className="relative">
            <textarea
              className="w-full bg-[#F8F6FF] border border-gray-100 rounded-xl px-4 py-3.5 text-sm text-gray-800 outline-none resize-none placeholder:text-gray-300 focus:border-primary/30 transition-colors"
              rows={5}
              placeholder="내용을 입력해주세요"
              maxLength={300}
              value={detail}
              onChange={e => setDetail(e.target.value)}
            />
            <span className="absolute bottom-3 right-4 text-[11px] text-gray-300">{detail.length} / 300</span>
          </div>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 프로필 설정 Screen
// ─────────────────────────────────────────────────────────────────────────────
interface ProfileFormValue {
  nickname: string;
  profileImageData: string | null;
  removeProfileImage: boolean;
}

async function resizeProfileImage(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("JPG, PNG, WEBP 이미지만 선택할 수 있습니다.");
  }
  if (file.size > 5 * 1024 * 1024) throw new Error("이미지는 5MB 이하만 선택할 수 있습니다.");

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("이미지 파일을 읽지 못했습니다."));
      element.src = objectUrl;
    });
    const canvas = document.createElement("canvas");
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이미지를 처리하지 못했습니다.");
    context.fillStyle = "#F3EAFF";
    context.fillRect(0, 0, size, size);
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = (image.naturalWidth - sourceSize) / 2;
    const sourceY = (image.naturalHeight - sourceSize) / 2;
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
    let result = canvas.toDataURL("image/jpeg", 0.8);
    if (result.length > 92_000) result = canvas.toDataURL("image/jpeg", 0.6);
    if (result.length > 92_000) throw new Error("이미지 용량을 줄인 뒤 다시 선택해주세요.");
    return result;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function ProfileSettingsScreen({ user, onBack, onSave }: {
  user: AuthUser;
  onBack: () => void;
  onSave: (value: ProfileFormValue) => Promise<void>;
}) {
  const [nickname, setNickname] = useState(user.nickname);
  const [profileImageData, setProfileImageData] = useState<string | null>(null);
  const [removeProfileImage, setRemoveProfileImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [saved,    setSaved]    = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const trimmedNickname = nickname.trim();
  const nicknameValid = trimmedNickname.length >= 2 && trimmedNickname.length <= 20;
  const hasChanges =
    trimmedNickname !== user.nickname || profileImageData !== null || removeProfileImage;

  function goBack() {
    if (hasChanges && !window.confirm("저장하지 않은 변경사항이 있어요. 나갈까요?")) return;
    onBack();
  }

  async function selectImage(file: File | undefined) {
    if (!file) return;
    setImageError(null);
    try {
      setProfileImageData(await resizeProfileImage(file));
      setRemoveProfileImage(false);
    } catch (reason) {
      setImageError(reason instanceof Error ? reason.message : "이미지를 처리하지 못했습니다.");
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  async function handleSave() {
    if (!nicknameValid || !hasChanges) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        nickname: trimmedNickname,
        profileImageData,
        removeProfileImage
      });
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "프로필을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (saved) return (
    <div className="flex flex-col h-full items-center justify-center gap-5 px-8 text-center bg-white">
      <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center">
        <CheckCircle className="w-8 h-8 text-primary" />
      </div>
      <div>
        <h2 className="text-lg font-black text-gray-900">프로필이 저장됐어요!</h2>
        <p className="text-sm text-gray-400 mt-2">변경된 정보가 반영됐어요 💜</p>
      </div>
      <button type="button" onClick={onBack}
        className="w-full max-w-xs bg-primary text-white rounded-xl py-4 font-black text-sm">
        확인
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-white">
      {/* header */}
      <div className="flex items-center px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <button type="button" onClick={goBack}
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <span className="flex-1 text-center font-black text-sm text-gray-900 -ml-8 pointer-events-none">프로필 설정</span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-7">
        {/* avatar */}
        <div className="flex flex-col items-center gap-3">
          <button type="button" onClick={() => imageInputRef.current?.click()}
            className="relative rounded-full focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="프로필 사진 선택">
            <div className="w-24 h-24 rounded-full bg-purple-100 border-4 border-white shadow-md overflow-hidden flex items-center justify-center">
              <ImageWithFallback
                src={removeProfileImage ? nctWishLogo : profileImageData ?? user.profileImage ?? nctWishLogo}
                alt="프로필 미리보기"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-primary rounded-full flex items-center justify-center shadow-md border-2 border-white">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
          </button>
          <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp"
            className="hidden" onChange={(event) => void selectImage(event.target.files?.[0])} />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => imageInputRef.current?.click()}
              className="text-xs font-bold text-primary bg-purple-50 border border-purple-100 px-3 py-1.5 rounded-full">
              사진 선택
            </button>
            {(user.profileImage || profileImageData) && !removeProfileImage && (
              <button type="button" onClick={() => { setProfileImageData(null); setRemoveProfileImage(true); setImageError(null); }}
                className="text-xs font-bold text-gray-400 bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-full">
                기본 이미지
              </button>
            )}
          </div>
          <p className="text-[11px] text-gray-400">JPG, PNG, WEBP · 최대 5MB · 정사각형으로 자동 조정</p>
          {imageError && <p className="text-xs text-red-500 text-center">{imageError}</p>}
        </div>

        {/* 닉네임 */}
        <div>
          <p className="text-sm font-black text-gray-800 mb-2.5">닉네임</p>
          <input
            className="w-full bg-[#F8F6FF] border border-gray-100 rounded-xl px-4 py-3.5 text-sm text-gray-900 outline-none focus:border-primary transition-colors"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            maxLength={20}
          />
          <div className="flex justify-between mt-1.5 px-1">
            <span className={`text-[11px] ${nickname.length > 0 && !nicknameValid ? "text-red-400" : "text-gray-300"}`}>
              공백 제외 2~20자로 입력해주세요.
            </span>
            <span className="text-[11px] text-gray-300">{nickname.length}/20</span>
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      {/* save button */}
      <div className="px-5 py-4 flex-shrink-0">
        <button onClick={handleSave} disabled={!nicknameValid || !hasChanges || saving}
          className="w-full bg-primary text-white rounded-2xl py-4 font-black text-base disabled:opacity-40">
          {saving ? "저장 중..." : hasChanges ? "변경사항 저장" : "변경사항 없음"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 계정 설정 Screen
// ─────────────────────────────────────────────────────────────────────────────
function AccountSettingsScreen({ onBack, onLogout }: { onBack: () => void; onLogout: () => void }) {
  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <button type="button" onClick={onBack}
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <span className="flex-1 text-center font-black text-sm text-gray-900 -ml-8 pointer-events-none">계정 설정</span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="rounded-2xl border border-yellow-100 bg-yellow-50 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FEE500] flex items-center justify-center font-black text-sm">K</div>
            <div>
              <p className="text-sm font-black text-gray-900">카카오 계정 연결됨</p>
              <p className="text-xs text-gray-500 mt-0.5">이메일·전화번호·비밀번호는 WISH MATCH에 저장하지 않습니다.</p>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400 leading-relaxed mt-4 px-1">
          계정 정보와 카카오 로그인 설정은 카카오 계정에서 관리해주세요. 이 화면에서는 현재 WISH MATCH 세션을 안전하게 종료할 수 있습니다.
        </p>
      </div>
      <div className="px-4 py-4 border-t border-gray-100 flex-shrink-0">
        <button type="button" onClick={onLogout}
          className="w-full border border-red-100 bg-red-50 text-red-500 rounded-xl py-3.5 font-black text-sm">
          이 기기에서 로그아웃
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 이벤트 Screen
// ─────────────────────────────────────────────────────────────────────────────
function EventScreen({ onBack }: { onBack: () => void }) {
  const missionMenus = ["저당 꿀배 XO요거트", "골드망고 스무디", "초코허니 퐁크러쉬"];
  const regularMenus = [
    "밀크쉐이크",
    "메가베리 아사이볼",
    "망고요거트 스무디",
    "제로 부스트 에이드",
    "메가리카노",
    "코코넛 커피 스무디",
    "흑당 밀크티라떼",
  ];
  const participationSteps = [
    "메가MGC커피 앱의 <이벤트>에서 ‘NCT WISH 팬 사인회 프리퀀시 이벤트’를 선택해주세요.",
    "이벤트 페이지에서 <프리퀀시 참여하기>를 선택해주세요. 최초 1회 선택 후 주문한 이벤트 메뉴부터 스티커가 적립됩니다.",
    "메가오더 > 추천메뉴 > [NCT WISH 픽] 카테고리 메뉴를 주문하면 스티커가 자동 적립됩니다.",
    "미션 메뉴 3개와 일반 메뉴 7개를 모두 모으면 팬 사인회에 자동 응모됩니다.",
  ];
  const notices = [
    "본 이벤트는 ‘메가오더 전용’ 이벤트이며, 매장 및 배달 주문은 해당되지 않습니다.",
    "메가오더 > 추천메뉴 > [NCT WISH 픽] 메뉴는 주문 시 자동 적립됩니다.",
    "메뉴 1개당 스티커 1개가 적립되며, 미션 3개와 일반 7개를 달성하면 자동 응모됩니다.",
    "1인 1회만 참여할 수 있으며 중복 참여는 불가능합니다.",
    "이벤트 기간에 구매한 프리퀀시 메뉴는 스탬프 쿠폰 적립 및 제휴 할인 대상에서 제외됩니다.",
    "행사 장소와 일시는 당첨자에게 추후 별도 공지됩니다.",
    "본 이벤트는 당첨자 본인만 참여할 수 있습니다.",
    "당첨 정보와 실제 행사 참석자의 정보가 다르면 입장에 불이익이 발생할 수 있으니 정확한 정보로 응모해주세요.",
    "현장 본인 확인이 진행되며 당첨 자격의 양도·판매·대리·동반 참석은 불가능합니다. 불법 거래로 의심되거나 적발되면 당첨이 취소됩니다.",
  ];

  return (
    <div className="flex flex-col h-full bg-[#F8F6FF]">
      {/* header */}
      <div className="flex items-center px-4 py-3 bg-[#F8F6FF] flex-shrink-0">
        <button type="button" onClick={onBack}
          className="w-8 h-8 rounded-full bg-white border border-gray-100 shadow-sm flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <span className="flex-1 text-center font-black text-sm text-gray-900 -ml-8 pointer-events-none">이벤트 상세</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4">
        {/* event title */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-4">
            <span className="inline-flex rounded-lg bg-yellow-100 px-2.5 py-1 text-[11px] font-black text-yellow-800">이벤트</span>
            <h1 className="mt-3 text-xl font-black leading-snug text-gray-950">
              [이벤트] NCT WISH 팬 사인회 프리퀀시 안내
            </h1>
            <p className="mt-2 text-sm font-semibold text-gray-400">2026.07.16~2026.08.04</p>
          </div>

          <div className="overflow-hidden bg-[#151419]">
            <ImageWithFallback
              src={eventFinalJourney}
              alt="NCT WISH 팬 사인회 프리퀀시 이벤트 - THE FINAL JOURNEY"
              className="block h-auto w-full"
            />
          </div>

          <div className="px-5 py-5 space-y-3">
            {[
              ["이벤트 방법", "메가MGC커피 앱 메가오더로 [NCT WISH 픽] 메뉴 주문 후 프리퀀시 완성 시 팬 사인회 응모 기회 제공"],
              ["프리퀀시 적립 기간", "7/16(목)~8/4(화) 23:59"],
              ["당첨자 발표", "8/5(수) 오후 중 · 메가MGC커피 앱 공지사항 참고"],
              ["팬 사인회 일정", "당첨자에 한해 별도 안내"],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[88px_1fr] gap-3 border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                <p className="text-[11px] font-black text-gray-500">{label}</p>
                <p className="text-xs font-semibold leading-relaxed text-gray-800">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* participation summary */}
        <section className="bg-white rounded-3xl border border-gray-100 shadow-sm px-5 py-5">
          <h2 className="text-base font-black text-gray-900 text-center">✦ 참여 방법 ✦</h2>
          <p className="mt-3 text-sm text-gray-500 leading-relaxed">
            메가오더 [NCT WISH 픽] 카테고리에서 미션 메뉴 3개와 일반 메뉴 7개, 총 10개 메뉴를 적립하면
            NCT WISH 팬 사인회 응모 기회가 제공됩니다.
          </p>
          <div className="mt-4 rounded-2xl bg-purple-50 px-4 py-4 text-center">
            <Ticket className="mx-auto h-7 w-7 text-primary" />
            <p className="mt-2 text-base font-black text-gray-900">NCT WISH 팬 사인회 참여권</p>
            <p className="mt-1 text-sm font-black text-primary">50명 추첨 증정</p>
            <p className="mt-3 text-xs font-bold text-gray-600">당첨자 발표 · 8/5(수) 오후 중</p>
            <p className="mt-1 text-[10px] text-gray-400">당첨 발표 즉시 메가쿠폰 앱 내 참여권 발급</p>
          </div>
        </section>

        {/* menu guide */}
        <section className="bg-white rounded-3xl border border-gray-100 shadow-sm px-5 py-5">
          <h2 className="text-base font-black text-gray-900 text-center">✦ 메뉴 안내 ✦</h2>
          <div className="mt-4 rounded-2xl bg-gray-900 px-4 py-4">
            <p className="text-center text-sm font-black text-white">미션 메뉴</p>
            <p className="mt-1 text-center text-[10px] text-white/60">3종 중 자유롭게 3개 주문</p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              {missionMenus.map(menu => (
                <div key={menu} className="rounded-xl bg-white/10 px-3 py-2.5 text-center text-xs font-bold text-white">{menu}</div>
              ))}
            </div>
          </div>
          <div className="mt-3 rounded-2xl bg-gray-50 px-4 py-4">
            <p className="text-center text-sm font-black text-gray-900">일반 메뉴</p>
            <p className="mt-1 text-center text-[10px] text-gray-400">7종 중 자유롭게 7개 주문</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {regularMenus.map(menu => (
                <div key={menu} className="rounded-xl bg-white border border-gray-100 px-2 py-2.5 text-center text-[11px] font-bold leading-snug text-gray-700">{menu}</div>
              ))}
            </div>
          </div>
        </section>

        {/* detailed guide */}
        <section className="bg-white rounded-3xl border border-gray-100 shadow-sm px-5 py-5">
          <h2 className="text-base font-black text-gray-900 text-center">✦ 상세 안내 ✦</h2>
          <p className="mt-2 text-center text-sm font-bold text-gray-700">프리퀀시 완성 = 팬 사인회 자동 응모!</p>
          <p className="mt-1 text-center text-[10px] text-gray-400">참여 기회는 단 한 번이며 중복 응모는 불가능합니다.</p>
          <div className="mt-5 space-y-4">
            {participationSteps.map((step, index) => (
              <div key={step} className="flex items-start gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-black text-white">
                  {index + 1}
                </div>
                <div>
                  <p className="text-[11px] font-black text-primary">STEP {index + 1}</p>
                  <p className="mt-0.5 text-xs font-semibold leading-relaxed text-gray-600">{step}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-5 rounded-2xl bg-gray-50 px-4 py-3 text-center text-xs font-semibold leading-relaxed text-gray-500">
            마지막 여정의 끝에서,<br />여섯 개의 별이 너를 기다리고 있을 거야.
          </p>
        </section>

        {/* notices */}
        <section className="bg-white rounded-3xl border border-gray-100 shadow-sm px-5 py-5">
          <h2 className="text-sm font-black text-gray-900">유의사항</h2>
          <ol className="mt-3 space-y-2.5">
            {notices.map((notice, index) => (
              <li key={notice} className="flex items-start gap-2 text-[11px] leading-relaxed text-gray-500">
                <span className="font-black text-gray-400">{index + 1}.</span>
                <span>{notice}</span>
              </li>
            ))}
          </ol>
        </section>

        <a
          href={EVENT_DETAIL_URL}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-primary py-3.5 text-sm font-black text-primary transition-colors hover:bg-purple-50"
        >
          자세히 보기
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 검색 결과 Screen
// ─────────────────────────────────────────────────────────────────────────────
function SearchScreen({ deals, initialQuery, onSelect, onLike, onBack }: {
  deals: Deal[];
  initialQuery: string;
  onSelect: (d: Deal) => void;
  onLike: (id: Deal["id"]) => void;
  onBack: () => void;
}) {
  const [query,  setQuery]  = useState(initialQuery);
  const [filter, setFilter] = useState<FilterType>("전체");
  const [filterOpen, setFilterOpen] = useState(false);
  const [discFilter, setDiscFilter] = useState("전체");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = deals.filter(d => {
    const matchesQuery = !query ||
      d.franchise.includes(query) ||
      d.fan.name.includes(query);
    const matchesFilter =
      filter === "전체" ? true :
      filter === "모집중" ? d.status !== "마감" :
      /* 오늘 마감 */ d.status === "마감임박";
    const matchesDisc = discFilter === "전체" || bestDiscount(d.drinks) >= Number(discFilter);
    return matchesQuery && matchesFilter && matchesDisc;
  });

  return (
    <div className="flex flex-col h-full bg-white">
      {/* search bar header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 flex-shrink-0">
        <button onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-full flex-shrink-0">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="flex-1 flex items-center gap-2 bg-[#F8F6FF] border border-gray-100 rounded-xl px-3 py-2">
          <Search className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <input
            ref={inputRef}
            className="flex-1 text-sm outline-none bg-transparent text-gray-900 placeholder:text-gray-300"
            placeholder="브랜드, 모집자 검색"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button onClick={() => setQuery("")}
              className="w-4 h-4 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
              <X className="w-2.5 h-2.5 text-white" />
            </button>
          )}
        </div>
        <button type="button" onClick={() => setFilterOpen(o => !o)}
          className={`w-8 h-8 flex items-center justify-center rounded-full flex-shrink-0 transition-colors ${filterOpen ? "bg-primary text-white" : "text-gray-400"}`}>
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* filter chips */}
      <div className="flex gap-1.5 px-4 pt-2.5 pb-2 flex-shrink-0">
        {(["전체", "모집중", "오늘 마감"] as FilterType[]).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs font-bold px-3.5 py-1.5 rounded-full transition-colors ${
              filter === f ? "bg-primary text-white" : "bg-gray-100 text-gray-500"
            }`}>
            {f}
          </button>
        ))}
      </div>

      {/* filter panel */}
      {filterOpen && (
        <div className="px-4 pb-3 pt-1 space-y-3 bg-gray-50/60 border-b border-gray-100 flex-shrink-0">
          <div>
            <p className="text-[11px] font-bold text-gray-400 mb-2">할인율</p>
            <div className="flex flex-wrap gap-1.5">
              {[{ label: "전체", val: "전체" }, { label: "10%+", val: "10" }, { label: "20%+", val: "20" }, { label: "30%+", val: "30" }, { label: "40%+", val: "40" }, { label: "50%+", val: "50" }].map(({ label, val }) => (
                <button key={val} type="button" onClick={() => setDiscFilter(val)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${discFilter === val ? "bg-primary text-white border-primary" : "bg-white text-gray-500 border-gray-200"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* results */}
      <div className="flex-1 overflow-y-auto bg-[#F8F6FF] px-3 py-2 space-y-3">
        {results.length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-3">
            <Search className="w-12 h-12 text-gray-200" />
            <p className="text-sm text-gray-400 text-center">
              {query ? `"${query}"에 대한 결과가 없어요` : "검색어를 입력해주세요"}
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-400 font-semibold px-1 pt-1">
              검색 결과 <span className="text-primary font-black">{results.length}건</span>
            </p>
            {results.map(d => (
              <SearchResultCard key={d.id} deal={d}
                onTap={() => onSelect(d)}
                onLike={() => onLike(d.id)} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function SearchResultCard({ deal, onTap, onLike }: {
  deal: Deal; onTap: () => void; onLike: () => void;
}) {
  const remaining = deal.totalTarget - deal.currentOrders;
  const disc      = bestDiscount(deal.drinks);
  return (
    <div onClick={onTap}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden active:scale-[0.99] transition-transform cursor-pointer">
      {/* image */}
      <div className="relative h-32">
        <ImageWithFallback src={deal.image} alt={deal.franchise}
          className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
        {deal.status === "마감임박" && (
          <span className="absolute top-2 left-2 text-[10px] font-black bg-amber-400 text-white px-2 py-0.5 rounded-full">마감임박</span>
        )}
        {deal.status === "마감" && (
          <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
            <span className="text-white text-xs font-black">마감</span>
          </div>
        )}
        <button onClick={e => { e.stopPropagation(); onLike(); }}
          className="absolute top-2 right-2 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center shadow-sm">
          <Heart className={`w-3.5 h-3.5 ${deal.liked ? "fill-pink-500 text-pink-500" : "text-gray-300"}`} />
        </button>
      </div>
      {/* content */}
      <div className="px-3.5 py-2.5">
        <p className="text-xs font-bold text-gray-500">{deal.franchise}</p>
        <div className="flex items-end justify-between mt-0.5">
          <p className="text-xl font-black text-red-500 leading-tight">{disc}% 할인</p>
          <span className="text-[11px] font-black text-white bg-pink-500 px-2.5 py-0.5 rounded-full">
            남은 {remaining}잔
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 알림 Screen
// ─────────────────────────────────────────────────────────────────────────────
interface AppNotif {
  id: number;
  type: "new_post" | "closed" | "review" | "admin";
  title: string;
  subtitle: string;
  time: string;
  read: boolean;
}

function NotificationScreen({ onBack }: { onBack: () => void }) {
  const [notifs, setNotifs] = useState<AppNotif[]>([]);

  function markAllRead() {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
  }

  const iconFor = (type: AppNotif["type"]) => {
    if (type === "new_post") return (
      <div className="w-11 h-11 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
        <Plus className="w-5 h-5 text-primary" />
      </div>
    );
    if (type === "closed") return (
      <div className="w-11 h-11 rounded-full bg-pink-100 flex items-center justify-center flex-shrink-0">
        <Heart className="w-5 h-5 text-pink-500" />
      </div>
    );
    if (type === "review") return (
      <div className="w-11 h-11 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
        <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
      </div>
    );
    return (
      <div className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
        <Bell className="w-5 h-5 text-gray-400" />
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* header */}
      <div className="flex items-center px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <button type="button" onClick={onBack}
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <span className="flex-1 text-center font-black text-sm text-gray-900 -ml-8 pointer-events-none">알림</span>
        {notifs.length > 0 && (
          <button onClick={markAllRead} className="text-xs font-semibold text-primary">
            전체 읽음
          </button>
        )}
      </div>

      {/* list */}
      <div className="flex-1 overflow-y-auto">
        {notifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Bell className="w-12 h-12 text-gray-200" />
            <p className="text-sm font-bold text-gray-500">알림 기능을 준비하고 있어요</p>
            <p className="text-xs text-gray-300 text-center leading-relaxed">현재 요청 상태와 참여 내역은<br />각 목록 화면에서 확인해주세요.</p>
          </div>
        ) : notifs.map((n, i) => (
          <button key={n.id}
            onClick={() => setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))}
            className={`w-full flex items-start gap-3 px-4 py-4 text-left transition-colors ${
              !n.read ? "bg-purple-50/60" : "bg-white"
            } ${i < notifs.length - 1 ? "border-b border-gray-50" : ""}`}>
            {iconFor(n.type)}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className={`text-sm leading-snug ${!n.read ? "font-bold text-gray-900" : "font-semibold text-gray-600"}`}>
                  {n.title}
                </p>
                {!n.read && <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{n.subtitle}</p>
              <p className="text-[11px] text-gray-300 mt-1">{n.time}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 이용 가이드 Screen
// ─────────────────────────────────────────────────────────────────────────────
const GUIDE_ITEMS = [
  {
    q: "WISH MATCH는 무엇인가요?",
    a: "WISH MATCH는 NCT WISH 팬 이벤트 음료를 함께 주문할 모집자와 참여자를 연결하는 매칭 플랫폼이에요. 앱은 모집과 참여 내역을 관리하고, 실제 결제와 수령 방법은 오픈채팅에서 서로 확인합니다.",
  },
  {
    q: "모집글은 어떻게 작성하나요?",
    a: "하단 + 버튼을 눌러 모집 작성 화면으로 이동하세요. 대표 사진, 할인율, 모집 수량, 가능 시간, 카카오 오픈채팅 링크를 입력하면 바로 등록됩니다. 특정 지점을 미리 정할 필요 없이 전국 어디서든 참여를 받을 수 있어요.",
  },
  {
    q: "할인은 어떻게 이루어지나요?",
    a: "모집자가 등록한 할인율을 기준으로 예상 금액을 보여드려요. 앱 안에서 결제되지는 않으며, 최종 금액과 결제·수령 방법은 참여 후 오픈채팅에서 확인해야 합니다.",
  },
  {
    q: "오픈채팅은 필수인가요?",
    a: "네, 참여자와의 실시간 소통을 위해 카카오 오픈채팅 링크는 필수예요. 픽업 지점 전달 및 주문 완료 안내에 활용됩니다.",
  },
  {
    q: "사기가 걱정돼요, 안전한가요?",
    a: "모집자의 평점과 참여 후기를 참고할 수 있고, 문제가 있는 모집은 상세 화면에서 신고할 수 있어요. 송금 전에는 상대방과 주문 내용을 다시 확인해주세요.",
  },
  {
    q: "후기는 꼭 작성해야 하나요?",
    a: "필수는 아니지만, 후기를 남겨주시면 다른 이용자에게 큰 도움이 돼요. 팬의 신뢰도 향상에도 기여합니다.",
  },
];

function GuideScreen({ onBack }: { onBack: () => void }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* header */}
      <div className="flex items-center px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <button type="button" onClick={onBack}
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <span className="flex-1 text-center font-black text-sm text-gray-900 -ml-8 pointer-events-none">이용 가이드</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* FAQ accordion */}
        <div className="divide-y divide-gray-50">
          {GUIDE_ITEMS.map((item, i) => (
            <div key={i}>
              <button
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left">
                <span className="text-sm font-semibold text-gray-800 pr-3 leading-snug">{item.q}</span>
                <ChevronRight className={`w-4 h-4 text-gray-300 flex-shrink-0 transition-transform ${
                  openIdx === i ? "rotate-90" : ""
                }`} />
              </button>
              {openIdx === i && (
                <div className="px-5 pb-4 -mt-1">
                  <p className="text-sm text-gray-500 leading-relaxed bg-purple-50 rounded-2xl px-4 py-3">
                    {item.a}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* bottom banner */}
        <div className="mx-4 mb-6 mt-4 overflow-hidden rounded-3xl">
          <ImageWithFallback
            src={guideNctWishBanner}
            alt="NCT WISH"
            className="block h-auto w-full"
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 후기 작성 Screen
// ─────────────────────────────────────────────────────────────────────────────
function ReviewScreen({ deal, onBack, onSubmit }: {
  deal: Deal;
  onBack: () => void;
  onSubmit: (review: { rating: number; text: string; anonymous: boolean }) => Promise<void>;
}) {
  const draftKey = `wish-match-review-draft:${deal.id}`;
  const [rating,    setRating]    = useState(() => {
    const savedRating = Number(sessionStorage.getItem(`${draftKey}:rating`) ?? 0);
    return Number.isInteger(savedRating) && savedRating >= 1 && savedRating <= 5 ? savedRating : 0;
  });
  const [hover,     setHover]     = useState(0);
  const [text,      setText]      = useState(() => sessionStorage.getItem(`${draftKey}:text`) ?? "");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disc = bestDiscount(deal.drinks);

  useEffect(() => {
    if (rating > 0) sessionStorage.setItem(`${draftKey}:rating`, String(rating));
    else sessionStorage.removeItem(`${draftKey}:rating`);
    if (text) sessionStorage.setItem(`${draftKey}:text`, text);
    else sessionStorage.removeItem(`${draftKey}:text`);
  }, [draftKey, rating, text]);

  function cancelWriting() {
    if ((rating > 0 || text.trim()) && !window.confirm("작성 중인 후기가 있어요. 나갈까요? 임시저장된 내용은 다음에 다시 불러옵니다.")) return;
    onBack();
  }

  if (submitted) return (
    <div className="flex flex-col h-full items-center justify-center gap-6 px-8 text-center bg-white">
      <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
        <Star className="w-8 h-8 fill-yellow-400 text-yellow-400" />
      </div>
      <div>
        <h2 className="text-xl font-black text-gray-900">후기가 등록됐어요!</h2>
        <p className="text-sm text-gray-400 mt-2 leading-relaxed">소중한 후기 감사해요 💜</p>
      </div>
      <button onClick={onBack}
        className="w-full max-w-xs bg-primary text-white rounded-xl py-4 font-black text-sm">
        확인
      </button>
    </div>
  );

  const canSubmit = rating > 0 && text.trim().length >= 10;
  const displayRating = hover || rating;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ rating, text: text.trim(), anonymous: false });
      sessionStorage.removeItem(`${draftKey}:rating`);
      sessionStorage.removeItem(`${draftKey}:text`);
      setSubmitted(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "후기를 등록하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <button onClick={cancelWriting} className="text-sm font-semibold text-gray-500">취소</button>
        <span className="font-black text-sm text-gray-900">후기 작성</span>
        <span className="w-8" aria-hidden="true" />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-5 space-y-6">
          {/* review target */}
          <div className="flex gap-3 p-3 rounded-2xl border border-gray-100 bg-[#F8F6FF]">
            <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
              <ImageWithFallback src={deal.image} alt={deal.franchise} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400 font-semibold truncate">{deal.franchise}</p>
              <p className="text-sm font-black text-red-500 mt-0.5">{disc}% 할인</p>
              <p className="text-xs text-gray-400">작성자: {deal.fan.name}</p>
            </div>
          </div>

          {/* star rating */}
          <div>
            <p className="text-sm font-black text-gray-800 mb-3">평점 안내</p>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n}
                  type="button"
                  aria-label={`${n}점`}
                  aria-pressed={rating === n}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  onClick={() => setRating(n)}
                  className="transition-transform active:scale-90">
                  <Star className={`w-9 h-9 transition-colors ${
                    n <= displayRating ? "fill-yellow-400 text-yellow-400" : "text-gray-200 fill-gray-100"
                  }`} />
                </button>
              ))}
              <span className="ml-2 text-lg font-black text-gray-700">
                {displayRating > 0 ? displayRating.toFixed(1) : ""}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {displayRating === 0 ? "별점을 선택해주세요." : ["", "아쉬웠어요", "조금 아쉬웠어요", "괜찮았어요", "좋았어요", "최고였어요!"][displayRating]}
            </p>
          </div>

          {/* text */}
          <div>
            <div className="relative">
              <textarea
                className="w-full bg-[#F8F6FF] rounded-2xl px-4 py-4 text-sm text-gray-800 outline-none resize-none placeholder:text-gray-300 focus:ring-1 focus:ring-primary/30 transition-all"
                rows={5}
                placeholder={"후기를 작성해주세요!\n(최소 10자)"}
                maxLength={500}
                value={text}
                onChange={e => setText(e.target.value)}
              />
              <span className="absolute bottom-3 right-4 text-[11px] text-gray-300">{text.length} / 500</span>
            </div>
            {text.length > 0 && text.trim().length < 10 && (
              <p className="text-xs text-red-400 mt-1 ml-1">최소 10자 이상 작성해주세요</p>
            )}
          </div>

          <p className="text-xs text-gray-400 bg-gray-50 rounded-xl px-3 py-3 leading-relaxed">
            후기는 모집자 평점에 반영되며 현재 등록 후 수정·삭제할 수 없어요. 내용을 한 번 더 확인해주세요.
          </p>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>
      <div className="px-4 py-4 border-t border-gray-100 flex-shrink-0">
        <button type="button" onClick={handleSubmit} disabled={!canSubmit || submitting}
          className="w-full bg-primary text-white rounded-2xl py-4 font-black text-base disabled:opacity-40">
          {submitting ? "후기 등록 중..." : "후기 등록하기"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 내가 참여한 모집 Screen (구매자 관점)
// ─────────────────────────────────────────────────────────────────────────────
function MyParticipationsScreen({ participations, deals: dealList, reviews, onBack, onWriteReview, onCancel }: {
  participations: Participation[];
  deals: Deal[];
  reviews: Review[];
  onBack: () => void;
  onWriteReview: (deal: Deal) => void;
  onCancel: (participation: Participation, deal: Deal) => Promise<void>;
}) {
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cancel(participation: Participation, deal: Deal) {
    if (!window.confirm("이 모집 참여를 취소할까요? 예약한 수량이 다시 모집에 반영됩니다.")) return;
    setCancellingId(participation.id);
    setError(null);
    try {
      await onCancel(participation, deal);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "참여를 취소하지 못했습니다.");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* header */}
      <div className="flex items-center px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <button onClick={onBack}
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <span className="flex-1 text-center font-black text-sm text-gray-900 -ml-8 pointer-events-none">내가 참여한 모집</span>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#F8F6FF] px-3 py-3 space-y-3">
        {error && <p className="text-xs text-red-500 text-center bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        {participations.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <span className="text-5xl">🧾</span>
            <p className="text-sm text-gray-400">참여한 모집이 없어요</p>
          </div>
        ) : participations.map(p => {
          const deal = dealList.find(d => d.id === p.dealId);
          if (!deal) return null;
          const disc = bestDiscount(deal.drinks);
          const hasReview = reviews.some(r => String(r.dealId) === String(deal.id));
          return (
            <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex">
                <div className="w-[88px] flex-shrink-0 self-stretch">
                  <ImageWithFallback src={deal.image} alt={deal.franchise} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0 px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-400 font-semibold truncate">{deal.franchise} · {p.pickupStore}</p>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${p.received ? "bg-purple-50 text-primary" : "bg-green-50 text-green-600"}`}>
                      {p.received ? "후기 작성 가능" : "참여 중"}
                    </span>
                  </div>
                  <p className="text-lg font-black text-red-500 leading-tight mt-0.5">{disc}% 할인</p>
                  <p className="text-xs text-gray-400">{p.qty}잔 주문 · {p.orderedAt}</p>
                  <p className="text-xs text-gray-400">모집자: {deal.fan.name}</p>
                </div>
              </div>
              {p.received && !hasReview && (
                <div className="flex px-3 py-2.5 border-t border-gray-50 justify-end">
                  <button onClick={() => onWriteReview(deal)}
                    className="text-xs font-bold text-primary border border-purple-100 bg-purple-50 px-5 py-2 rounded-xl">
                    후기 작성
                  </button>
                </div>
              )}
              {!p.received && !hasReview && (
                <div className="flex items-center px-3 py-2.5 border-t border-gray-50 justify-between gap-2">
                  <span className="text-[11px] text-gray-400">모집 마감 후 후기를 작성할 수 있어요.</span>
                  <button type="button" onClick={() => void cancel(p, deal)} disabled={cancellingId === p.id}
                    className="text-xs font-bold text-red-500 border border-red-100 bg-red-50 px-4 py-2 rounded-xl disabled:opacity-50 flex-shrink-0">
                    {cancellingId === p.id ? "취소 중..." : "참여 취소"}
                  </button>
                </div>
              )}
              {hasReview && (
                <div className="flex px-3 py-2.5 border-t border-gray-50 justify-end">
                  <span className="text-xs font-bold text-gray-300">후기 작성 완료</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 작성한 후기 목록 / 상세 Screen
// ─────────────────────────────────────────────────────────────────────────────
function MyReviewsScreen({ reviews, participations, deals: dealList, onBack, onSelect, onWriteReview }: {
  reviews: Review[];
  participations: Participation[];
  deals: Deal[];
  onBack: () => void;
  onSelect: (review: Review) => void;
  onWriteReview: (deal: Deal) => void;
}) {
  const reviewableDeals = participations.flatMap((participation) => {
    if (!participation.received || reviews.some((review) => String(review.dealId) === String(participation.dealId))) return [];
    const deal = dealList.find((candidate) => String(candidate.id) === String(participation.dealId));
    return deal ? [{ deal, participation }] : [];
  });

  return (
    <div className="flex flex-col h-full bg-white">
      {/* header */}
      <div className="flex items-center px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <button onClick={onBack}
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <span className="flex-1 text-center font-black text-sm text-gray-900 -ml-8 pointer-events-none">후기 관리</span>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#F8F6FF] px-3 py-3 space-y-3">
        {reviewableDeals.length > 0 && (
          <section className="space-y-2" aria-labelledby="reviewable-title">
            <div className="flex items-center justify-between px-1 pt-1">
              <h2 id="reviewable-title" className="text-sm font-black text-gray-800">작성 가능한 후기</h2>
              <span className="text-[11px] font-black text-primary bg-purple-100 px-2 py-0.5 rounded-full">{reviewableDeals.length}개</span>
            </div>
            {reviewableDeals.map(({ deal, participation }) => (
              <div key={participation.id} className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-purple-100 shadow-sm">
                <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0">
                  <ImageWithFallback src={deal.image} alt={deal.franchise} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400 font-semibold truncate">{deal.franchise} · {participation.pickupStore}</p>
                  <p className="text-sm font-black text-gray-800 truncate">{participation.qty}잔 참여 · 모집 종료</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">모집자 {deal.fan.name}님은 어떠셨나요?</p>
                </div>
                <button type="button" onClick={() => onWriteReview(deal)}
                  className="text-xs font-black text-white bg-primary px-3.5 py-2.5 rounded-xl flex-shrink-0">
                  작성
                </button>
              </div>
            ))}
          </section>
        )}

        {reviews.length > 0 && (
          <div className="flex items-center justify-between px-1 pt-2">
            <h2 className="text-sm font-black text-gray-800">작성 완료</h2>
            <span className="text-[11px] text-gray-400">{reviews.length}개</span>
          </div>
        )}

        {reviews.length === 0 && reviewableDeals.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <span className="text-5xl">⭐</span>
            <div className="text-center">
              <p className="text-sm font-bold text-gray-500">관리할 후기가 없어요</p>
              <p className="text-xs text-gray-400 mt-1">참여한 모집이 종료되면 이곳에서 후기를 쓸 수 있어요.</p>
            </div>
          </div>
        ) : reviews.map(r => {
          const deal = dealList.find(d => String(d.id) === String(r.dealId));
          if (!deal) return null;
          return (
            <button key={r.id} type="button" onClick={() => onSelect(r)}
              className="w-full flex gap-3 p-3 bg-white rounded-2xl border border-gray-100 shadow-sm text-left">
              <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0">
                <ImageWithFallback src={deal.image} alt={deal.franchise} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 font-semibold truncate">{deal.franchise}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  {[1, 2, 3, 4, 5].map(n => (
                    <Star key={n} className={`w-3.5 h-3.5 ${n <= r.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-200 fill-gray-100"}`} />
                  ))}
                  <span className="text-xs text-gray-400 ml-1">{r.createdAt}</span>
                </div>
                <p className="text-sm text-gray-700 mt-1 truncate">{r.text}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 self-center" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReviewDetailScreen({ review, deal, onBack }: { review: Review; deal: Deal; onBack: () => void }) {
  const disc = bestDiscount(deal.drinks);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* header */}
      <div className="flex items-center px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <button onClick={onBack}
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <span className="flex-1 text-center font-black text-sm text-gray-900 -ml-8 pointer-events-none">후기 상세</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
        {/* target deal */}
        <div className="flex gap-3 p-3 rounded-2xl border border-gray-100 bg-[#F8F6FF]">
          <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
            <ImageWithFallback src={deal.image} alt={deal.franchise} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 font-semibold truncate">{deal.franchise}</p>
            <p className="text-sm font-black text-red-500 mt-0.5">{disc}% 할인</p>
            <p className="text-xs text-gray-400">작성자: {review.anonymous ? "익명" : deal.fan.name}</p>
          </div>
        </div>

        {/* rating */}
        <div>
          <p className="text-sm font-black text-gray-800 mb-3">평점</p>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <Star key={n} className={`w-9 h-9 ${n <= review.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-200 fill-gray-100"}`} />
            ))}
            <span className="ml-2 text-lg font-black text-gray-700">{review.rating.toFixed(1)}</span>
          </div>
        </div>

        {/* text */}
        <div>
          <p className="text-sm font-black text-gray-800 mb-2.5">내용</p>
          <div className="w-full bg-[#F8F6FF] rounded-2xl px-4 py-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
            {review.text}
          </div>
        </div>

        <p className="text-xs text-gray-300 text-right">{review.createdAt} 작성{review.anonymous ? " · 익명" : ""}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Contact Screen
// ─────────────────────────────────────────────────────────────────────────────
function ContactScreen({ onBack }: { onBack: () => void }) {
  const [category, setCategory] = useState<ApiInquiryCategory | "">("");
  const [content, setContent] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inquiries, setInquiries] = useState<ApiInquiry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const categories: Array<{ code: ApiInquiryCategory; label: string }> = [
    { code: "SERVICE", label: "서비스 이용 문의" },
    { code: "ACCOUNT", label: "계정/로그인 문의" },
    { code: "MODERATION", label: "신고/제재 문의" },
    { code: "PAYMENT", label: "결제 문의" },
    { code: "OTHER", label: "기타" },
  ];

  useEffect(() => {
    let active = true;
    api.inquiries()
      .then((page) => {
        if (active) setInquiries(page.items);
      })
      .catch((reason: unknown) => {
        if (active) setHistoryError(reason instanceof Error ? reason.message : "문의 내역을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function submitInquiry() {
    if (!category || content.trim().length < 10) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createInquiry(category, content.trim());
      setInquiries((current) => [created, ...current]);
      setCategory("");
      setContent("");
      setSent(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "문의를 접수하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) return (
    <div className="flex flex-col h-full items-center justify-center gap-6 px-8 text-center bg-white">
      <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center">
        <CheckCircle className="w-8 h-8 text-primary" />
      </div>
      <div>
        <h2 className="text-lg font-black text-gray-900">문의가 접수됐어요</h2>
        <p className="text-sm text-gray-400 mt-1 leading-relaxed">문의 내용이 안전하게 저장됐어요.<br />운영팀에서 확인할게요.</p>
      </div>
      <button type="button" onClick={() => setSent(false)}
        className="w-full max-w-xs bg-primary text-white rounded-xl py-3.5 font-black text-sm">
        문의 내역 보기
      </button>
      <button type="button" onClick={onBack} className="text-sm font-bold text-gray-400">
        마이페이지로 돌아가기
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <button type="button" onClick={onBack}
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <span className="flex-1 text-center font-black text-sm text-gray-900 -ml-8 pointer-events-none">문의사항</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5">
        <div>
          <label className="text-xs font-bold text-gray-500 mb-2 block">문의 유형</label>
          <div className="space-y-2">
            {categories.map(c => (
              <button key={c.code} type="button" onClick={() => setCategory(c.code)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-semibold transition-colors ${category === c.code ? "border-primary bg-primary/5 text-primary" : "border-gray-200 text-gray-600"}`}>
                {c.label}
                {category === c.code && <CheckCircle className="w-4 h-4 text-primary" />}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 mb-1.5 block">
            문의 내용 <span className="text-gray-300 font-normal">{content.length}/500</span>
          </label>
          <textarea value={content} onChange={e => setContent(e.target.value.slice(0, 500))}
            rows={5}
            placeholder="문의하실 내용을 자세히 적어주세요."
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 outline-none focus:border-primary transition-colors resize-none placeholder:text-gray-300" />
          {content.length > 0 && content.trim().length < 10 && (
            <p className="text-xs text-red-400 mt-1">문의 내용은 10자 이상 입력해주세요.</p>
          )}
        </div>

        <div className="border-t border-gray-100 pt-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-black text-gray-800">내 문의 내역</p>
            {!historyLoading && <span className="text-xs text-gray-400">{inquiries.length}건</span>}
          </div>
          {historyLoading ? (
            <p className="text-xs text-gray-400 py-4 text-center">문의 내역을 불러오는 중...</p>
          ) : historyError ? (
            <p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-3">{historyError}</p>
          ) : inquiries.length === 0 ? (
            <p className="text-xs text-gray-400 bg-[#F8F6FF] rounded-xl px-3 py-4 text-center">접수한 문의가 없어요.</p>
          ) : (
            <div className="space-y-2">
              {inquiries.map((inquiry) => (
                <div key={inquiry.id} className="rounded-xl border border-gray-100 px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-gray-700">
                      {categories.find((item) => item.code === inquiry.category)?.label ?? inquiry.category}
                    </span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${inquiry.status === "RESOLVED" ? "bg-green-50 text-green-600" : "bg-yellow-50 text-yellow-600"}`}>
                      {inquiry.status === "RESOLVED" ? "처리 완료" : "접수됨"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed mt-2 line-clamp-2 whitespace-pre-wrap">{inquiry.content}</p>
                  <p className="text-[10px] text-gray-300 mt-2">{formatDate(inquiry.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      <div className="px-4 py-4 border-t border-gray-100 flex-shrink-0">
        <button type="button"
          onClick={submitInquiry}
          disabled={!category || content.trim().length < 10 || submitting}
          className="w-full bg-primary text-white rounded-xl py-3.5 font-black text-sm disabled:opacity-40">
          {submitting ? "접수 중..." : "문의 제출하기"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root App
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [authView,     setAuthView]     = useState<AuthView>("loading");
  const [authUser,     setAuthUser]     = useState<AuthUser | null>(null);
  const [authError,    setAuthError]    = useState<string | null>(null);
  const [tab,          setTab]          = useState<Tab>("home");
  const [deals,        setDeals]        = useState<Deal[]>([]);
  const [myDeals,      setMyDeals]      = useState<Deal[]>([]);
  const [stores,       setStores]       = useState<ApiStore[]>([]);
  const [events,       setEvents]       = useState<ApiEvent[]>([]);
  const [dataLoading,  setDataLoading]  = useState(true);
  const [dataError,    setDataError]    = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [orderDeal,    setOrderDeal]    = useState<Deal | null>(null);
  const [mySubView,    setMySubView]    = useState<"main" | "mydeals" | "participations" | "reviews">("main");
  const [topScreen,    setTopScreen]    = useState<null | "notifications" | "guide" | "event" | "search" | "stores" | "report" | "profile" | "account-settings" | "contact">(null);
  const [searchQuery,  setSearchQuery]  = useState("");
  const [myReviews,        setMyReviews]        = useState<Review[]>([]);
  const [participations, setParticipations] = useState<Participation[]>([]);
  const [reviewTargetDeal, setReviewTargetDeal] = useState<Deal | null>(null);
  const [selectedReview,   setSelectedReview]   = useState<Review | null>(null);
  const [requests,          setRequests]          = useState<BuyRequest[]>([]);
  const [selectedRequest,   setSelectedRequest]   = useState<BuyRequest | null>(null);
  const [postingRequest,    setPostingRequest]    = useState(false);
  const [createSheetOpen,   setCreateSheetOpen]   = useState(false);

  // ── auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const path = window.location.pathname;
    if (path === "/auth/callback/failure") {
      const code = new URLSearchParams(window.location.search).get("error");
      window.history.replaceState(null, "", "/");
      setAuthError(code ?? "UNKNOWN_ERROR");
      setAuthView("login");
      return;
    }
    if (path === "/auth/callback/success") {
      window.history.replaceState(null, "", "/");
    }
    api.me()
      .then((user) => {
        const auth = { ...user, role: user.role ?? "USER" } as AuthUser;
        setAuthUser(auth);
        setAuthView("app");
        return loadAppData(auth);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status !== 401) setAuthError(error.message);
        setAuthView("login");
        setDataLoading(false);
      });
  }, []);

  async function loadAppData(user: AuthUser): Promise<void> {
    setDataLoading(true);
    setDataError(null);
    try {
      const [postPage, favoritePage, storePage, eventPage, participationPage, reviewPage, requestPage, myPostPage] =
        await Promise.all([
          api.posts(),
          api.favorites(),
          api.stores(),
          api.events(),
          api.participations(),
          api.myReviews(),
          api.purchaseRequests(),
          api.myPosts(),
        ]);
      const favoriteIds = new Set(favoritePage.items.map((item) => item.post.id));
      const nextDeals = postPage.items.map((post) => dealFromApi(post, favoriteIds.has(post.id)));
      for (const participation of participationPage.items) {
        if (!nextDeals.some((deal) => String(deal.id) === participation.postId)) {
          nextDeals.push(dealFromApi(participation.post, favoriteIds.has(participation.postId)));
        }
      }
      setDeals(nextDeals);
      setMyDeals(myPostPage.items.map((post) => dealFromApi(post, favoriteIds.has(post.id))));
      setStores(storePage.items);
      setEvents(eventPage.items);
      setParticipations(
        participationPage.items
          .filter((item) => item.status === "CONFIRMED")
          .map((item) => ({
            id: item.id,
            dealId: item.postId,
            pickupStore: item.pickupStore,
            qty: item.quantity,
            orderedAt: formatDate(item.createdAt),
            received: item.post.status === "CLOSED",
          }))
      );
      setMyReviews(reviewPage.items.map(reviewFromApi));
      setRequests(requestPage.items.map(requestFromApi));
      setAuthUser(user);
      const sharedPostId = new URLSearchParams(window.location.search).get("post");
      const sharedDeal = nextDeals.find((deal) => String(deal.id) === sharedPostId);
      if (sharedDeal) {
        const detail = await api.post(String(sharedDeal.id));
        setSelectedDeal(dealFromApi(detail, sharedDeal.liked));
      }
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setDataLoading(false);
    }
  }

  if (authView === "loading") return (
    <Shell>
      <div className="flex h-full items-center justify-center bg-white">
        <div className="w-16 h-16">
          <ImageWithFallback src={nctWishLogo} alt="NCT WISH" className="w-full h-full object-contain" />
        </div>
      </div>
    </Shell>
  );
  if (authView === "login") return (
    <Shell>
      <LoginScreen errorCode={authError} />
    </Shell>
  );

  async function handleLike(id: Deal["id"]) {
    const deal = deals.find((item) => item.id === id);
    if (!deal) return;
    setDeals(prev => prev.map(d => d.id === id ? { ...d, liked: !d.liked } : d));
    setMyDeals(prev => prev.map(d => d.id === id ? { ...d, liked: !d.liked } : d));
    setSelectedDeal(current => current?.id === id ? { ...current, liked: !current.liked } : current);
    try {
      if (deal.liked) await api.removeFavorite(String(id));
      else await api.addFavorite(String(id));
    } catch (error) {
      setDeals(prev => prev.map(d => d.id === id ? { ...d, liked: deal.liked } : d));
      setMyDeals(prev => prev.map(d => d.id === id ? { ...d, liked: deal.liked } : d));
      setSelectedDeal(current => current?.id === id ? { ...current, liked: deal.liked } : current);
      setDataError(error instanceof Error ? error.message : "찜 상태를 변경하지 못했습니다.");
    }
  }
  async function handleOrderConfirm(qty: number, pickupStore: string) {
    if (!orderDeal) return;
    try {
      const created = await api.participate(String(orderDeal.id), qty, pickupStore);
      const updatedDeal = dealFromApi(created.post, orderDeal.liked);
      setDeals(prev => prev.map(d => d.id === orderDeal.id ? updatedDeal : d));
      setSelectedDeal(updatedDeal);
      setParticipations(prev => [
        {
          id: created.id,
          dealId: created.postId,
          pickupStore: created.pickupStore,
          qty: created.quantity,
          orderedAt: formatDate(created.createdAt),
          received: created.post.status === "CLOSED",
        },
        ...prev,
      ]);
    } catch (error) {
      throw error instanceof Error ? error : new Error("참여 신청에 실패했습니다.");
    }
  }

  async function handleCancelParticipation(participation: Participation, deal: Deal): Promise<void> {
    await api.cancelParticipation(participation.id);
    setParticipations((current) => current.filter((item) => item.id !== participation.id));
    const fallback: Deal = {
      ...deal,
      currentOrders: Math.max(0, deal.currentOrders - participation.qty),
      status: "진행중",
    };
    setDeals((current) => current.map((item) => item.id === deal.id ? fallback : item));
    try {
      const latest = await api.post(String(deal.id));
      const refreshed = dealFromApi(latest, deal.liked);
      setDeals((current) => current.map((item) => item.id === deal.id ? refreshed : item));
      setSelectedDeal((current) => current?.id === deal.id ? refreshed : current);
    } catch (reason) {
      setDataError(reason instanceof Error ? reason.message : "취소 후 모집 정보를 갱신하지 못했습니다.");
    }
  }

  async function handleAcceptRequest(id: BuyRequest["id"]) {
    const accepted = requestFromApi(await api.acceptPurchaseRequest(String(id)));
    setRequests(prev => prev.map(r => r.id === id ? accepted : r));
    setSelectedRequest(accepted);
  }

  async function handleCancelRequest(id: BuyRequest["id"]): Promise<void> {
    await api.cancelPurchaseRequest(String(id));
    setRequests((current) => current.filter((request) => request.id !== id));
    setSelectedRequest(null);
  }

  async function handleSelectDeal(deal: Deal): Promise<void> {
    try {
      const post = await api.post(String(deal.id));
      setSelectedDeal(dealFromApi(post, deal.liked));
      const url = new URL(window.location.href);
      url.searchParams.set("post", String(deal.id));
      window.history.replaceState(null, "", url);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "모집 상세를 불러오지 못했습니다.");
    }
  }

  function closeSelectedDeal(): void {
    setSelectedDeal(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("post");
    window.history.replaceState(null, "", url);
  }

  async function handleSelectRequest(request: BuyRequest): Promise<void> {
    try {
      setSelectedRequest(requestFromApi(await api.purchaseRequest(String(request.id))));
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "요청 상세를 불러오지 못했습니다.");
    }
  }

  async function handleCreatePost(value: PostFormValue): Promise<void> {
    const post = await api.createPost({ ...value, remainCount: value.totalCount });
    const deal = dealFromApi(post);
    setDeals((current) => [deal, ...current]);
    setMyDeals((current) => [deal, ...current]);
  }

  async function handleUpdatePost(id: Deal["id"], value: PostFormValue): Promise<void> {
    const current = myDeals.find((deal) => deal.id === id);
    const post = await api.updatePost(String(id), {
      ...value,
      remainCount: Math.max(0, value.totalCount - (current?.currentOrders ?? 0)),
    });
    const updated = dealFromApi(post, current?.liked ?? false);
    setDeals((items) => items.map((deal) => deal.id === id ? updated : deal));
    setMyDeals((items) => items.map((deal) => deal.id === id ? updated : deal));
  }

  async function handleClosePost(id: Deal["id"]): Promise<void> {
    const current = myDeals.find((deal) => deal.id === id);
    const updated = dealFromApi(await api.closePost(String(id)), current?.liked ?? false);
    setDeals((items) => items.map((deal) => deal.id === id ? updated : deal));
    setMyDeals((items) => items.map((deal) => deal.id === id ? updated : deal));
  }

  async function handleDeletePost(id: Deal["id"]): Promise<void> {
    await api.deletePost(String(id));
    setDeals((items) => items.filter((deal) => deal.id !== id));
    setMyDeals((items) => items.filter((deal) => deal.id !== id));
  }

  async function handleProfileSave(value: ProfileFormValue): Promise<void> {
    if (!authUser) throw new Error("로그인 정보를 확인하지 못했습니다.");
    let user: ApiUser = authUser;

    const applyUser = (updatedUser: ApiUser) => {
      setAuthUser((current) => current ? { ...current, ...updatedUser, role: current.role } : current);
      const updateWriter = (deal: Deal) =>
        deal.writerId === updatedUser.id
          ? {
              ...deal,
              fan: {
                ...deal.fan,
                name: updatedUser.nickname,
                avatar: updatedUser.profileImage ?? nctWishLogo,
              },
            }
          : deal;
      setDeals((items) => items.map(updateWriter));
      setMyDeals((items) => items.map(updateWriter));
    };

    if (value.nickname !== user.nickname) {
      user = await api.updateProfile(value.nickname);
      applyUser(user);
    }
    if (value.profileImageData) {
      user = await api.uploadProfileImage(value.profileImageData);
      applyUser(user);
    } else if (value.removeProfileImage) {
      user = await api.removeProfileImage();
      applyUser(user);
    }
  }

  async function handleLogout(): Promise<void> {
    try {
      await api.logout();
    } finally {
      setAuthUser(null);
      setAuthView("login");
      setTab("home");
      setMySubView("main");
      setTopScreen(null);
      setSelectedReview(null);
      setDeals([]);
      setMyDeals([]);
      setEvents([]);
      setParticipations([]);
      setRequests([]);
    }
  }

  // ── top-level overlays ───────────────────────────────────────────────────
  if (topScreen === "notifications") return (
    <Shell><NotificationScreen onBack={() => setTopScreen(null)} /></Shell>
  );
  if (topScreen === "guide") return (
    <Shell><GuideScreen onBack={() => setTopScreen(null)} /></Shell>
  );
  if (topScreen === "event") return (
    <Shell><EventScreen onBack={() => setTopScreen(null)} /></Shell>
  );
  if (topScreen === "search") return (
    <Shell>
      <SearchScreen
        deals={deals}
        initialQuery={searchQuery}
        onSelect={d => { setTopScreen(null); void handleSelectDeal(d); }}
        onLike={handleLike}
        onBack={() => setTopScreen(null)}
      />
    </Shell>
  );
  if (topScreen === "stores") return (
    <Shell><StoreDirectoryScreen initialStores={stores} onBack={() => setTopScreen(null)} /></Shell>
  );
  if (topScreen === "report" && selectedDeal) return (
    <Shell><ReportScreen deal={selectedDeal} onBack={() => setTopScreen(null)} /></Shell>
  );
  if (topScreen === "profile" && authUser) return (
    <Shell><ProfileSettingsScreen user={authUser} onBack={() => setTopScreen(null)} onSave={handleProfileSave} /></Shell>
  );
  if (topScreen === "account-settings") return (
    <Shell><AccountSettingsScreen onBack={() => setTopScreen(null)} onLogout={() => void handleLogout()} /></Shell>
  );
  if (topScreen === "contact") return (
    <Shell><ContactScreen onBack={() => setTopScreen(null)} /></Shell>
  );

  // ── full-screen tab overlays (no bottom nav) ──────────────────────────────
  if (tab === "post") return (
    <Shell><PostScreen stores={stores} onBack={() => setTab("home")} onSubmit={handleCreatePost} /></Shell>
  );
  if (postingRequest) return (
    <Shell>
      <RequestPostScreen
        stores={stores}
        onBack={() => setPostingRequest(false)}
        onSubmit={async req => {
          const created = await api.createPurchaseRequest({
            city: req.city,
            branch: req.branch,
            menu: req.menu,
            quantity: req.qty,
            desiredTime: req.desiredTime,
            ...(req.note ? { note: req.note } : {}),
            openChatUrl: req.kakaoLink,
          });
          setRequests(prev => [requestFromApi(created), ...prev]);
        }}
      />
    </Shell>
  );
  if (selectedRequest) return (
    <Shell>
      <RequestDetailScreen
        request={selectedRequest}
        canAccept={selectedRequest.requesterId !== authUser?.id}
        canCancel={selectedRequest.requesterId === authUser?.id}
        onBack={() => setSelectedRequest(null)}
        onAccept={() => handleAcceptRequest(selectedRequest.id)}
        onCancel={() => handleCancelRequest(selectedRequest.id)}
      />
    </Shell>
  );
  if (reviewTargetDeal) return (
    <Shell>
      <ReviewScreen
        deal={reviewTargetDeal}
        onBack={() => setReviewTargetDeal(null)}
        onSubmit={async ({ rating, text }) => {
          const created = await api.createReview(String(reviewTargetDeal.id), rating, text);
          setMyReviews(prev => [reviewFromApi(created), ...prev]);
        }}
      />
    </Shell>
  );
  if (tab === "my" && mySubView === "mydeals") return (
    <Shell>
      <MyDealsScreen
        deals={myDeals}
        stores={stores}
        onBack={() => setMySubView("main")}
        onClose={handleClosePost}
        onDelete={handleDeletePost}
        onUpdate={handleUpdatePost}
      />
    </Shell>
  );
  if (tab === "my" && mySubView === "participations") return (
    <Shell>
      <MyParticipationsScreen
        participations={participations}
        deals={deals}
        reviews={myReviews}
        onBack={() => setMySubView("main")}
        onWriteReview={deal => setReviewTargetDeal(deal)}
        onCancel={handleCancelParticipation}
      />
    </Shell>
  );
  if (tab === "my" && mySubView === "reviews") {
    if (selectedReview) {
      const deal = deals.find(d => String(d.id) === String(selectedReview.dealId));
      if (deal) return (
        <Shell><ReviewDetailScreen review={selectedReview} deal={deal} onBack={() => setSelectedReview(null)} /></Shell>
      );
    }
    return (
      <Shell>
        <MyReviewsScreen
          reviews={myReviews}
          participations={participations}
          deals={deals}
          onBack={() => setMySubView("main")}
          onSelect={r => setSelectedReview(r)}
          onWriteReview={deal => setReviewTargetDeal(deal)}
        />
      </Shell>
    );
  }

  // ── detail overlay ────────────────────────────────────────────────────────
  if (selectedDeal) {
    const live = selectedDeal;
    return (
      <Shell>
        <DetailScreen
          deal={live}
          onBack={closeSelectedDeal}
          onOrder={() => setOrderDeal(live)}
          onLike={() => handleLike(live.id)}
          onReport={live.writerId === authUser?.id ? undefined : () => setTopScreen("report")}
        />
        {orderDeal && (
          <OrderModal deal={orderDeal} onClose={() => setOrderDeal(null)} onConfirm={handleOrderConfirm} />
        )}
      </Shell>
    );
  }

  // ── main shell ────────────────────────────────────────────────────────────
  return (
    <Shell>
      {/* header */}
      <header className="flex-shrink-0 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between px-4 h-12">
          <button onClick={() => setTab("home")} className="font-black text-xl text-primary tracking-tight">WISH MATCH</button>
          <div className="flex items-center gap-0.5">
            <button onClick={() => { setSearchQuery(""); setTopScreen("search"); }}
              className="w-9 h-9 flex items-center justify-center rounded-full">
              <Search style={{ width: 20, height: 20 }} className="text-gray-600" />
            </button>
            <button onClick={() => setTopScreen("notifications")}
              className="w-9 h-9 flex items-center justify-center rounded-full relative">
              <Bell style={{ width: 20, height: 20 }} className="text-gray-600" />
            </button>
          </div>
        </div>
      </header>

      {dataError && (
        <div className="flex items-center gap-2 bg-red-50 border-b border-red-100 px-3 py-2 flex-shrink-0">
          <p className="text-[11px] text-red-600 flex-1 line-clamp-2">{dataError}</p>
          <button type="button" onClick={() => authUser && void loadAppData(authUser)}
            className="text-[11px] font-black text-red-600 px-2 py-1 bg-white rounded-lg">
            다시 시도
          </button>
          <button type="button" onClick={() => setDataError(null)} aria-label="오류 닫기">
            <X className="w-3.5 h-3.5 text-red-400" />
          </button>
        </div>
      )}

      {/* content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {dataLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-white">
            <div className="w-12 h-12"><ImageWithFallback src={nctWishLogo} alt="로딩 중" className="w-full h-full object-contain animate-pulse" /></div>
            <p className="text-xs text-gray-400">데이터를 불러오는 중...</p>
          </div>
        ) : (
          <>
            {tab === "home"  && <HomeScreen deals={deals} onSelect={d => void handleSelectDeal(d)} onLike={handleLike} onGuide={() => setTopScreen("guide")} onEvent={() => setTopScreen("event")} onSearch={q => { setSearchQuery(q); setTopScreen("search"); }} onList={() => setTab("list")} onContact={() => setTopScreen("contact")} onStores={() => setTopScreen("stores")} />}
            {tab === "list"  && <ListScreen deals={deals} onSelect={d => void handleSelectDeal(d)} onLike={handleLike} requests={requests} onRequestSelect={request => void handleSelectRequest(request)} />}
            {tab === "saved" && <SavedScreen deals={deals} onSelect={d => void handleSelectDeal(d)} onLike={handleLike} />}
            {tab === "my" && mySubView === "main" && <MyScreen user={authUser} dealCount={myDeals.length} reviewCount={myReviews.length} pendingReviewCount={participations.filter(participation => participation.received && !myReviews.some(review => String(review.dealId) === String(participation.dealId))).length} favoriteCount={deals.filter(deal => deal.liked).length} onMyDeals={() => setMySubView("mydeals")} onParticipations={() => setMySubView("participations")} onReviews={() => setMySubView("reviews")} onNotifications={() => setTopScreen("notifications")} onProfile={() => setTopScreen("profile")} onSaved={() => { setTab("saved"); setMySubView("main"); }} onAccountSettings={() => setTopScreen("account-settings")} onLogout={() => void handleLogout()} />}
          </>
        )}
      </main>

      {/* bottom nav */}
      <nav className="flex-shrink-0 bg-white border-t border-gray-100">
        <div className="flex items-center h-16">
          <BotBtn active={tab === "home"}  label="홈"       icon={HomeIcon}  onTap={() => setTab("home")} />
          <BotBtn active={tab === "list"}  label="모집 목록" icon={ListIcon}  onTap={() => setTab("list")} />
          <div className="flex-1 flex justify-center items-center">
            <button onClick={() => setCreateSheetOpen(true)}
              className="w-12 h-12 -mt-5 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/30">
              <Plus className="w-5 h-5 text-white" />
            </button>
          </div>
          <BotBtn active={tab === "saved"} label="찜한 목록" icon={HeartIcon} onTap={() => setTab("saved")} />
          <BotBtn active={tab === "my"}    label="마이페이지" icon={UserIcon}  onTap={() => { setTab("my"); setMySubView("main" as const); setSelectedReview(null); }} />
        </div>
      </nav>

      {createSheetOpen && (
        <CreateSheet
          onClose={() => setCreateSheetOpen(false)}
          onPostDeal={() => { setCreateSheetOpen(false); setTab("post"); }}
          onPostRequest={() => { setCreateSheetOpen(false); setPostingRequest(true); }}
        />
      )}
    </Shell>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh flex flex-col max-w-sm mx-auto bg-white overflow-hidden shadow-2xl">
      {children}
    </div>
  );
}
function BotBtn({ active, label, icon: Icon, onTap }: {
  active: boolean; label: string;
  icon: (p: React.SVGProps<SVGSVGElement>) => JSX.Element;
  onTap: () => void;
}) {
  return (
    <button onClick={onTap} className="flex-1 flex flex-col items-center gap-0.5 py-1">
      <Icon className={`w-5 h-5 ${active ? "text-primary" : "text-gray-300"}`} />
      <span className={`text-[10px] font-semibold ${active ? "text-primary" : "text-gray-400"}`}>{label}</span>
    </button>
  );
}
function HomeIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  );
}
function ListIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <line x1="8" y1="6"  x2="21" y2="6"  />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="3" cy="6"  r="1" fill="currentColor" stroke="none" />
      <circle cx="3" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="3" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function HeartIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  );
}
function UserIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
