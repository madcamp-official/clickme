import { useState, useRef, useEffect } from "react";
import {
  Search, Bell, Heart, Star, ChevronRight, X, Plus, ArrowLeft,
  Share2, Minus, ShoppingBag, Ticket, CheckCircle, Shield, User,
  MessageCircle, PenSquare, Clock, MapPin, ChevronDown, Megaphone,
  BookOpen, Gift, SlidersHorizontal, Store,
  Users, ExternalLink, ChevronUp,
} from "lucide-react";
import mascots    from "@/imports/image.png";
import nctWishChar from "@/imports/__.png";
import nctWishLogo from "@/imports/image-1.png";
import pixelScene  from "@/imports/image-2.png";
import fanJaehee from "@/imports/jaehee.jpeg";
import fanRiku   from "@/imports/riku.jpeg";
import fanRyo    from "@/imports/ryo.jpeg";
import fanYushi  from "@/imports/yushi.jpeg";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Tab        = "home" | "list" | "saved" | "my" | "post";
type AuthView   = "login" | "signup" | "app";
type DealStatus = "진행중" | "마감임박" | "마감";
type DrinkType  = "아메리카노" | "라떼" | "콜드브루" | "녹차라떼" | "딸기라떼" | "카페모카";

interface DrinkItem {
  name: DrinkType | string;
  originalPrice: number;
  discountPrice: number;
  emoji: string;
}

interface Deal {
  id: number;
  fan: { name: string; avatar: string; verified: boolean; rating: number; totalTickets: number };
  store: { name: string; branch: string; district: string; city: string; address: string };
  drinks: DrinkItem[];
  date: string;
  timeFrom: string;
  timeTo: string;
  totalTarget: number;
  currentOrders: number;
  status: DealStatus;
  image: string;
  liked: boolean;
  kakaoLink: string;
  note: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed data
// ─────────────────────────────────────────────────────────────────────────────
const INITIAL_DEALS: Deal[] = [
  {
    id: 1,
    fan: { name: "별이빛나는밤", avatar: fanJaehee, verified: true,  rating: 4.9, totalTickets: 3 },
    store: { name: "메가MGC커피", branch: "부산대학로점", district: "부산 금정구", city: "부산", address: "부산 금정구 부산대학로 63" },
    drinks: [
      { name: "아메리카노", originalPrice: 2500, discountPrice: 2000, emoji: "☕" },
      { name: "라떼",       originalPrice: 3000, discountPrice: 2400, emoji: "🥛" },
    ],
    date: "2025.07.20", timeFrom: "14:00", timeTo: "18:00",
    totalTarget: 10, currentOrders: 7, status: "진행중",
    image:     fanJaehee,
    liked: false,
    kakaoLink: "https://open.kakao.com/o/example1",
    note: "부산대 정문 앞 메가MGC커피입니다. 메가오더로 직접 주문 후 매장 앞에서 전달해드려요!",
  },
  {
    id: 2,
    fan: { name: "위시위시", avatar: fanRiku, verified: true,  rating: 5.0, totalTickets: 7 },
    store: { name: "메가MGC커피", branch: "홍대입구역점", district: "서울 마포구", city: "서울", address: "서울 마포구 양화로 176" },
    drinks: [
      { name: "아메리카노", originalPrice: 2500, discountPrice: 2100, emoji: "☕" },
      { name: "콜드브루",   originalPrice: 3200, discountPrice: 2700, emoji: "🧊" },
    ],
    date: "2025.07.21", timeFrom: "12:00", timeTo: "17:00",
    totalTarget: 10, currentOrders: 9, status: "마감임박",
    image:     fanRiku,
    liked: true,
    kakaoLink: "https://open.kakao.com/o/example2",
    note: "홍대입구역 2번 출구 바로 앞 매장이에요. 한 잔만 남았어요, 빠르게 연락주세요!",
  },
  {
    id: 3,
    fan: { name: "NCT사랑해", avatar: fanRyo, verified: false, rating: 4.7, totalTickets: 1 },
    store: { name: "메가MGC커피", branch: "신촌점",      district: "서울 서대문구", city: "서울", address: "서울 서대문구 신촌로 83" },
    drinks: [
      { name: "아메리카노", originalPrice: 2500, discountPrice: 2000, emoji: "☕" },
      { name: "녹차라떼",   originalPrice: 3500, discountPrice: 2900, emoji: "🍵" },
    ],
    date: "2025.07.22", timeFrom: "10:00", timeTo: "20:00",
    totalTarget: 10, currentOrders: 3, status: "진행중",
    image:     fanRyo,
    liked: false,
    kakaoLink: "https://open.kakao.com/o/example3",
    note: "신촌역 2번 출구에서 도보 3분 거리입니다. 음료 준비되면 카카오톡으로 연락드릴게요.",
  },
  {
    id: 4,
    fan: { name: "경기팬연합", avatar: fanYushi, verified: true,  rating: 4.8, totalTickets: 5 },
    store: { name: "메가MGC커피", branch: "수원역점",    district: "경기 수원시", city: "경기", address: "경기 수원시 팔달구 덕영대로 924" },
    drinks: [
      { name: "아메리카노", originalPrice: 2500, discountPrice: 1900, emoji: "☕" },
      { name: "카페모카",   originalPrice: 3500, discountPrice: 2700, emoji: "🍫" },
    ],
    date: "2025.07.23", timeFrom: "13:00", timeTo: "19:00",
    totalTarget: 10, currentOrders: 1, status: "진행중",
    image:     fanYushi,
    liked: false,
    kakaoLink: "https://open.kakao.com/o/example4",
    note: "수원역 AK플라자 근처 메가MGC커피예요. 단체 주문 환영합니다!",
  },
];

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
function LoginScreen({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void }) {
  const [email, setEmail] = useState("");
  const [pw,    setPw]    = useState("");
  return (
    <div className="flex flex-col h-full bg-white px-6 overflow-y-auto relative">
      {/* decorative stars */}
      <span className="absolute top-10 left-5  text-yellow-300 text-lg select-none">★</span>
      <span className="absolute top-20 left-14 text-purple-200 text-sm select-none">✦</span>
      <span className="absolute top-14 right-7 text-yellow-200 text-base select-none">✦</span>
      <span className="absolute top-32 right-4 text-pink-200 text-xs select-none">★</span>

      {/* mascot + logo */}
      <div className="flex flex-col items-center mt-14 mb-8">
        <div className="w-24 h-24 mb-3">
          <ImageWithFallback src={nctWishLogo} alt="NCT WISH" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-2xl font-black tracking-tight">
          <span className="text-primary">WISH </span><span className="text-gray-900">MATCH</span>
        </h1>
        <p className="text-xs text-gray-400 mt-1.5">NCT WISH와 함께하는 특별한 여정</p>
      </div>

      {/* inputs */}
      <div className="space-y-3">
        <input type="email"
          className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-sm outline-none placeholder:text-gray-300 text-gray-900 focus:border-primary transition-colors"
          placeholder="이메일을 입력해주세요" value={email} onChange={e => setEmail(e.target.value)} />
        <input type="password"
          className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-sm outline-none placeholder:text-gray-300 text-gray-900 focus:border-primary transition-colors"
          placeholder="비밀번호를 입력해주세요" value={pw} onChange={e => setPw(e.target.value)} />
        <div className="flex justify-end">
          <button className="text-xs text-gray-400">비밀번호 찾기</button>
        </div>
      </div>

      <button onClick={onLogin}
        className="w-full bg-primary text-white rounded-xl py-4 font-black text-base mt-5">
        로그인
      </button>

      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-gray-100" />
        <span className="text-xs text-gray-300">또는</span>
        <div className="flex-1 h-px bg-gray-100" />
      </div>

      {/* Kakao only */}
      <button className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-bold text-sm"
        style={{ backgroundColor: "#FEE500", color: "#191919" }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path fillRule="evenodd" clipRule="evenodd"
            d="M9 1.5C4.86 1.5 1.5 4.19 1.5 7.5c0 2.13 1.35 4.005 3.39 5.085l-.87 3.24a.225.225 0 00.345.24L8.25 13.44A9.3 9.3 0 009 13.5c4.14 0 7.5-2.69 7.5-6s-3.36-6-7.5-6z"
            fill="#191919" />
        </svg>
        카카오로 로그인
      </button>

      <p className="text-center text-xs text-gray-400 mt-8 mb-6">
        회원이 아니신가요?{" "}
        <button onClick={onSignup} className="text-primary font-black">회원가입</button>
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth — Signup
// ─────────────────────────────────────────────────────────────────────────────
function SignupScreen({ onBack, onSignup }: { onBack: () => void; onSignup: () => void }) {
  const [nickname,   setNickname]   = useState("");
  const [email,      setEmail]      = useState("");
  const [pw,         setPw]         = useState("");
  const [pwConfirm,  setPwConfirm]  = useState("");
  const [done,       setDone]       = useState(false);

  const pwMatch    = pw && pwConfirm && pw === pwConfirm;
  const pwMismatch = pw && pwConfirm && pw !== pwConfirm;
  const canSubmit  = nickname && email && pw && pwMatch;

  if (done) return (
    <div className="flex flex-col h-full items-center justify-center gap-6 px-8 text-center bg-white">
      <div className="w-24 h-24">
        <ImageWithFallback src={nctWishLogo} alt="NCT WISH" className="w-full h-full object-contain" />
      </div>
      <div>
        <h2 className="text-xl font-black text-gray-900">가입 완료!</h2>
        <p className="text-sm text-gray-400 mt-2 leading-relaxed">
          <span className="font-black text-primary">{nickname}</span>님,<br />
          WISH MATCH에 오신 걸 환영해요 🎉
        </p>
      </div>
      <button onClick={onSignup}
        className="w-full max-w-xs bg-primary text-white rounded-xl py-4 font-black text-sm">
        시작하기
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto">
      <div className="flex items-center px-4 pt-4 pb-2 flex-shrink-0">
        <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-50">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <span className="flex-1 text-center font-black text-base text-gray-900 -ml-9">회원가입</span>
      </div>
      <div className="flex-1 px-6 overflow-y-auto">
        <div className="flex flex-col items-center mt-4 mb-7">
          <div className="w-20 h-20 mb-2">
            <ImageWithFallback src={nctWishLogo} alt="NCT WISH" className="w-full h-full object-contain" />
          </div>
          <p className="text-sm font-bold text-gray-600">WISH MATCH와 함께해요!</p>
        </div>
        <div className="space-y-3">
          <input className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-sm outline-none placeholder:text-gray-300 text-gray-900 focus:border-primary transition-colors"
            placeholder="닉네임을 입력해주세요" value={nickname} onChange={e => setNickname(e.target.value)} />
          <input type="email"
            className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-sm outline-none placeholder:text-gray-300 text-gray-900 focus:border-primary transition-colors"
            placeholder="이메일을 입력해주세요" value={email} onChange={e => setEmail(e.target.value)} />
          <input type="password"
            className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-sm outline-none placeholder:text-gray-300 text-gray-900 focus:border-primary transition-colors"
            placeholder="비밀번호를 입력해주세요" value={pw} onChange={e => setPw(e.target.value)} />
          <div>
            <input type="password"
              className={`w-full border rounded-xl px-4 py-3.5 text-sm outline-none placeholder:text-gray-300 text-gray-900 transition-colors ${
                pwMismatch ? "border-red-300" : pwMatch ? "border-green-300" : "border-gray-200 focus:border-primary"
              }`}
              placeholder="비밀번호를 확인" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} />
            {pwMismatch && <p className="text-[11px] text-red-400 mt-1 ml-1">비밀번호가 일치하지 않아요</p>}
            {pwMatch    && <p className="text-[11px] text-green-500 mt-1 ml-1">비밀번호가 일치해요 ✓</p>}
          </div>
        </div>
        <button onClick={() => { if (canSubmit) setDone(true); }} disabled={!canSubmit}
          className="w-full bg-primary text-white rounded-xl py-4 font-black text-base mt-6 disabled:opacity-40">
          회원가입
        </button>
        <p className="text-center text-xs text-gray-400 mt-5 mb-8">
          이미 계정이 있으신가요?{" "}
          <button onClick={onBack} className="text-primary font-black">로그인</button>
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 모집 목록 (List)
// ─────────────────────────────────────────────────────────────────────────────
type FilterType = "전체" | "모집중" | "오늘 마감";

function ListScreen({ deals, onSelect, onLike }: {
  deals: Deal[];
  onSelect: (d: Deal) => void;
  onLike: (id: number) => void;
}) {
  const [filter, setFilter]   = useState<FilterType>("전체");
  const [sortOpen, setSortOpen] = useState(false);
  const [sort, setSort]       = useState<"오늘 마감" | "내 주변" | "할인 높은순" | "최신 등록순">("최신 등록순");
  const [regionFilter, setRegionFilter] = useState("전체");
  const [discFilter, setDiscFilter] = useState("전체");
  const [filterOpen, setFilterOpen] = useState(false);
  const nearbyCity = "서울";

  const filtered = deals
    .filter(d => filter === "전체" || filter === "오늘 마감" || d.status !== "마감")
    .filter(d => regionFilter === "전체" || d.store.city === regionFilter)
    .filter(d => discFilter === "전체" || bestDiscount(d.drinks) >= Number(discFilter))
    .sort((a, b) => {
      if (sort === "할인 높은순")  return bestDiscount(b.drinks) - bestDiscount(a.drinks);
      if (sort === "오늘 마감")    return (a.totalTarget - a.currentOrders) - (b.totalTarget - b.currentOrders);
      if (sort === "내 주변")      return (b.store.city === nearbyCity ? 1 : 0) - (a.store.city === nearbyCity ? 1 : 0);
      return b.id - a.id;
    });

  return (
    <div className="flex flex-col h-full bg-white">
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
              <p className="text-[11px] font-bold text-gray-400 mb-2">지역</p>
              <div className="flex flex-wrap gap-1.5">
                {["전체", "서울", "부산", "인천", "대구", "대전", "광주", "경기"].map(r => (
                  <button key={r} type="button" onClick={() => setRegionFilter(r)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${regionFilter === r ? "bg-primary text-white border-primary" : "bg-white text-gray-500 border-gray-200"}`}>
                    {r === "전체" ? "전체" : r}
                  </button>
                ))}
              </div>
            </div>
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
              {(["오늘 마감", "내 주변", "할인 높은순", "최신 등록순"] as const).map(s => (
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
          <ImageWithFallback src={deal.image} alt={deal.store.branch}
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
              {deal.store.city} · {deal.store.branch}
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
          <button className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <Share2 className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* hero image */}
        <div className="relative h-52">
          <ImageWithFallback src={deal.image} alt={deal.store.branch}
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
              {deal.store.city} · {deal.store.branch}
            </h1>
            <p className="text-2xl font-black text-red-500 mt-0.5">{disc}% 할인</p>
            <p className="text-sm text-gray-400 mt-0.5">총 {deal.totalTarget}잔 모집</p>
          </div>

          <div className="border-t border-gray-100" />

          {/* detail rows */}
          <div className="space-y-4">
            {/* store */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-purple-50 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                <Store className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-semibold">매장 정보</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5">{deal.store.name} {deal.store.branch}</p>
                <p className="text-xs text-gray-400 mt-0.5">{deal.store.address}</p>
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
                <p className="text-sm font-bold text-gray-900 mt-0.5">매장 앞 직접 수령</p>
                <p className="text-xs text-gray-400 mt-0.5">주문 완료 후 카카오 오픈채팅으로 픽업 시간 안내</p>
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
                <a href={deal.kakaoLink} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 mt-0.5" onClick={e => e.stopPropagation()}>
                  <span className="text-sm font-bold text-primary truncate">카카오 오픈채팅 입장하기</span>
                  <ExternalLink className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                </a>
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
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Order Modal
// ─────────────────────────────────────────────────────────────────────────────
function OrderModal({ deal, onClose, onConfirm }: {
  deal: Deal;
  onClose: () => void;
  onConfirm: (qty: number) => void;
}) {
  const [selected, setSelected] = useState(deal.drinks[0]);
  const [qty, setQty] = useState(1);
  const [done, setDone] = useState(false);
  const remaining = deal.totalTarget - deal.currentOrders;

  if (done) return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end">
      <div className="bg-white w-full rounded-t-3xl p-6 flex flex-col items-center gap-4 text-center">
        <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h3 className="font-black text-lg text-gray-900">주문 완료!</h3>
          <p className="text-sm text-gray-500 mt-1">
            {selected.emoji} {selected.name} {qty}잔<br />
            <strong className="text-gray-900">{(selected.discountPrice * qty).toLocaleString()}원</strong> 결제
          </p>
          <p className="text-xs text-primary mt-2 font-semibold">
            카카오 오픈채팅으로 픽업 안내를 받으세요!
          </p>
        </div>
        <a href={deal.kakaoLink} target="_blank" rel="noreferrer"
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm"
          style={{ backgroundColor: "#FEE500", color: "#191919" }}
          onClick={() => { onConfirm(qty); onClose(); }}>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
            <path fillRule="evenodd" clipRule="evenodd"
              d="M9 1.5C4.86 1.5 1.5 4.19 1.5 7.5c0 2.13 1.35 4.005 3.39 5.085l-.87 3.24a.225.225 0 00.345.24L8.25 13.44A9.3 9.3 0 009 13.5c4.14 0 7.5-2.69 7.5-6s-3.36-6-7.5-6z"
              fill="#191919" />
          </svg>
          오픈채팅 입장하기
        </a>
        <button onClick={() => { onConfirm(qty); onClose(); }}
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
          <div className="flex items-center gap-2 bg-purple-50 rounded-xl px-3 py-2.5">
            <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-gray-900">{deal.store.name} {deal.store.branch}</p>
              <p className="text-[10px] text-gray-400">{deal.store.address}</p>
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
            <span className="text-sm text-gray-500">총 결제금액</span>
            <span className="text-lg font-black text-primary">{(selected.discountPrice * qty).toLocaleString()}원</span>
          </div>
        </div>
        <div className="px-5 pb-6">
          <button onClick={() => setDone(true)}
            className="w-full bg-primary text-white rounded-2xl py-4 font-black text-base">
            문의하기
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 모집 작성 (Post)
// ─────────────────────────────────────────────────────────────────────────────
const CITY_SHORT_TO_FULL: Record<string, string> = {
  "서울": "서울특별시", "부산": "부산광역시", "인천": "인천광역시", "대구": "대구광역시",
  "대전": "대전광역시", "광주": "광주광역시", "경기": "경기도", "경남": "경상남도", "경북": "경상북도",
};
const CITY_FULL_TO_SHORT: Record<string, string> =
  Object.fromEntries(Object.entries(CITY_SHORT_TO_FULL).map(([short, full]) => [full, short]));

const BRANCH_OPTIONS: Record<string, string[]> = {
  "서울특별시": ["메가MGC커피 강남점", "메가MGC커피 홍대입구역점", "메가MGC커피 신촌점", "메가MGC커피 건대입구점"],
  "부산광역시": ["메가MGC커피 부산대학로점", "메가MGC커피 해운대점", "메가MGC커피 서면점"],
  "경기도":     ["메가MGC커피 수원역점", "메가MGC커피 성남분당점", "메가MGC커피 일산점"],
};
const DEFAULT_BRANCH_OPTIONS = ["메가MGC커피 시내점", "메가MGC커피 역세권점"];
function branchOptionsFor(city: string): string[] {
  if (!city) return [];
  return BRANCH_OPTIONS[city] ?? DEFAULT_BRANCH_OPTIONS;
}

function PostScreen({ onBack, initialDeal, onSubmit }: {
  onBack: () => void;
  initialDeal?: Deal;
  onSubmit?: (deal: Deal) => void;
}) {
  const mode = initialDeal ? "edit" : "create";

  const initialCity   = initialDeal ? (CITY_SHORT_TO_FULL[initialDeal.store.city] ?? "") : "";
  const initialBranch = initialDeal ? `${initialDeal.store.name} ${initialDeal.store.branch}` : "";

  const [city,       setCity]      = useState(initialCity);
  const [branch,     setBranch]    = useState(
    initialDeal && branchOptionsFor(initialCity).includes(initialBranch) ? initialBranch : ""
  );
  const [discRate,   setDiscRate]  = useState(initialDeal ? String(bestDiscount(initialDeal.drinks)) : "");
  const [qty,        setQty]       = useState(initialDeal ? initialDeal.totalTarget : 10);
  const [timeFrom,   setTimeFrom]  = useState(initialDeal?.timeFrom ?? "");
  const [timeTo,     setTimeTo]    = useState(initialDeal?.timeTo ?? "");
  const [pickup,     setPickup]    = useState(initialDeal ? "매장 앞 직접 수령" : "");
  const [kakao,      setKakao]     = useState(initialDeal?.kakaoLink ?? "");
  const [extraNote,  setExtraNote] = useState(initialDeal?.note ?? "");
  const [done,       setDone]      = useState(false);

  const discRateNum = Number(discRate);
  const discRateValid = discRate && discRateNum > 0 && discRateNum < 100;
  const canSubmit = city && branch && discRateValid && timeFrom && timeTo && pickup && kakao;

  function handleSubmit() {
    if (!canSubmit) return;
    if (mode === "edit" && initialDeal && onSubmit) {
      const rate = discRateNum / 100;
      onSubmit({
        ...initialDeal,
        store: {
          ...initialDeal.store,
          branch: branch.replace(`${initialDeal.store.name} `, ""),
          city: CITY_FULL_TO_SHORT[city] ?? initialDeal.store.city,
        },
        drinks: initialDeal.drinks.map(d => ({ ...d, discountPrice: Math.round(d.originalPrice * (1 - rate)) })),
        timeFrom, timeTo,
        totalTarget: qty,
        kakaoLink: kakao,
        note: extraNote,
      });
      onBack();
      return;
    }
    setDone(true);
  }

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

          {/* 지역 선택 */}
          <FormSection label="지역 선택">
            <div className="relative">
              <select
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3.5 text-sm outline-none text-gray-900 appearance-none focus:border-primary transition-colors"
                value={city} onChange={e => { setCity(e.target.value); setBranch(""); }}>
                <option value="">지역을 선택해주세요</option>
                <option>서울특별시</option>
                <option>부산광역시</option>
                <option>인천광역시</option>
                <option>대구광역시</option>
                <option>대전광역시</option>
                <option>광주광역시</option>
                <option>경기도</option>
                <option>경상남도</option>
                <option>경상북도</option>
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </FormSection>

          {/* 매장 선택 */}
          <FormSection label="매장 선택">
            <div className="relative">
              <select
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3.5 text-sm outline-none text-gray-900 appearance-none focus:border-primary transition-colors"
                value={branch} onChange={e => setBranch(e.target.value)}
                disabled={!city}>
                <option value="">{city ? "메가MGC커피 지점을 선택해주세요" : "지역을 먼저 선택해주세요"}</option>
                {branchOptionsFor(city).map(b => <option key={b}>{b}</option>)}
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
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

          {/* 수령 방법 */}
          <FormSection label="수령 방법">
            <div className="space-y-2">
              {["매장 앞 직접 수령", "매장 내 테이블 전달", "지정 장소 전달"].map(opt => (
                <button key={opt} type="button" onClick={() => setPickup(opt)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                    pickup === opt ? "border-primary bg-purple-50" : "border-gray-100 bg-gray-50"
                  }`}>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    pickup === opt ? "border-primary" : "border-gray-300"
                  }`}>
                    {pickup === opt && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <span className={`text-sm font-semibold ${pickup === opt ? "text-primary" : "text-gray-600"}`}>{opt}</span>
                </button>
              ))}
            </div>
          </FormSection>

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
                주문자와 소통을 위해 카카오 오픈채팅 링크를 입력해주세요. 오픈채팅방에서 픽업 장소와 시간을 안내해주세요.
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
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full bg-primary text-white rounded-2xl py-4 font-black text-base disabled:opacity-40 transition-opacity">
          {mode === "edit" ? "수정하기" : "등록하기"}
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
function HomeScreen({ deals, onSelect, onLike, onGuide, onEvent, onSearch, onList, onContact }: {
  deals: Deal[];
  onSelect: (d: Deal) => void;
  onLike: (id: number) => void;
  onGuide: () => void;
  onEvent: () => void;
  onSearch: (q: string) => void;
  onList: () => void;
  onContact: () => void;
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
          <div className="inline-flex items-center gap-1.5 bg-white/60 backdrop-blur-sm rounded-full px-3 py-1">
            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
            <span className="text-[10px] font-black text-purple-800">NCT WISH 팬사인단체 프리퀀시 이벤트</span>
            <ChevronRight className="w-3 h-3 text-purple-500" />
          </div>
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

      {/* notice */}
      <section className="px-3 mt-3">
        <button onClick={onGuide}
          className="w-full bg-white border border-gray-100 rounded-2xl flex items-center gap-2 px-3.5 py-2.5 shadow-sm text-left">
          <span className="w-6 h-6 rounded-full bg-purple-50 flex items-center justify-center flex-shrink-0">
            <Megaphone className="w-3.5 h-3.5 text-primary" />
          </span>
          <span className="flex-1 text-xs font-semibold text-gray-600 truncate">8/5(월) 팬사인회 당첨자 발표 및 안내</span>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
        </button>
      </section>

      {/* search + filters */}
      <section className="px-3 mt-2.5">
        <button onClick={() => onSearch("")}
          className="w-full bg-white border border-gray-100 rounded-2xl flex items-center gap-2.5 px-4 py-3 shadow-sm text-left">
          <Search className="w-4 h-4 text-gray-300 flex-shrink-0" />
          <span className="flex-1 text-sm text-gray-300">지역, 매장, 할인율을 검색해보세요</span>
        </button>
        <div className="flex items-center gap-1.5 mt-2 overflow-x-auto">
          {[
            { icon: MapPin, label: "지역" },
            { icon: Store,  label: "매장" },
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
  onLike: (id: number) => void;
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
        <ImageWithFallback src={deal.image} alt={deal.store.branch}
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
        <p className="text-xs font-bold text-gray-500">{deal.store.city} · {deal.store.branch}</p>
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
function MyScreen({ onMyDeals, onReviews, onNotifications, onProfile, onSaved, onAccountSettings, onLogout }: {
  onMyDeals: () => void;
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
                <ImageWithFallback src={nctWishLogo} alt="프로필" className="w-16 h-16 object-contain" />
              </div>
              <button onClick={onProfile}
                className="mb-1 text-xs font-bold text-primary bg-purple-50 border border-purple-100 px-3 py-1.5 rounded-full">
                프로필 수정
              </button>
            </div>
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <span className="text-lg font-black text-gray-900">WISH 빈</span>
                <span className="flex items-center gap-0.5 text-[10px] font-black text-primary bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full">
                  <CheckCircle className="w-2.5 h-2.5" /> 팬 인증
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">일반 회원</p>
              <div className="flex items-center gap-1 mt-1.5">
                <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                <span className="text-sm font-bold text-gray-700">4.9</span>
                <span className="text-xs text-gray-400">(후기 23개)</span>
              </div>
            </div>
          </div>
        </div>

        {/* stats */}
        <div className="mx-4 mt-3 bg-white rounded-2xl border border-gray-100 shadow-sm grid grid-cols-3 divide-x divide-gray-100">
          {[
            { v: "12", l1: "내가 작성한", l2: "모집" },
            { v: "23", l1: "작성한",    l2: "후기" },
            { v: "8",  l1: "찜한",      l2: "목록" },
          ].map(({ v, l1, l2 }) => (
            <div key={l1} className="py-4 text-center">
              <div className="text-xl font-black text-gray-900">{v}</div>
              <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">{l1}<br />{l2}</div>
            </div>
          ))}
        </div>

        {/* menu */}
        <div className="mx-4 mt-3 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
          {[
            { icon: PenSquare, label: "내 모집 관리", onTap: onMyDeals,  highlight: true },
            { icon: Star,      label: "후기 작성",     onTap: onReviews, highlight: false },
            { icon: Heart,     label: "찜한 목록",    onTap: onSaved,   highlight: false },
            { icon: Bell,      label: "알림",         onTap: onNotifications },
            { icon: User,      label: "계정 설정",    onTap: onAccountSettings },
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

const MY_MOCK_DEALS: Deal[] = [
  {
    id: 101,
    fan: { name: "WISH 빈", avatar: "🌟", verified: true, rating: 4.9, totalTickets: 3 },
    store: { name: "메가MGC커피", branch: "부산대학로점", district: "부산 금정구", city: "부산", address: "부산 금정구 부산대학로 63" },
    drinks: [{ name: "아메리카노", originalPrice: 2500, discountPrice: 1500, emoji: "☕" }],
    date: "2025.07.20", timeFrom: "14:00", timeTo: "18:00",
    totalTarget: 10, currentOrders: 4, status: "진행중",
    image: "https://images.unsplash.com/photo-1501854140801-50d01698950b?w=400&h=400&fit=crop&auto=format",
    liked: false, kakaoLink: "https://open.kakao.com/o/ex1", note: "",
  },
  {
    id: 102,
    fan: { name: "WISH 빈", avatar: "🌟", verified: true, rating: 4.9, totalTickets: 3 },
    store: { name: "메가MGC커피", branch: "강남역점", district: "서울 강남구", city: "서울", address: "서울 강남구 강남대로 396" },
    drinks: [{ name: "아메리카노", originalPrice: 2500, discountPrice: 2125, emoji: "☕" }],
    date: "2025.07.10", timeFrom: "12:00", timeTo: "17:00",
    totalTarget: 10, currentOrders: 10, status: "마감",
    image: "https://images.unsplash.com/photo-1490750967868-88df5691cc57?w=400&h=400&fit=crop&auto=format",
    liked: false, kakaoLink: "https://open.kakao.com/o/ex2", note: "",
  },
];

function MyDealsScreen({ onBack }: { onBack: () => void }) {
  const [filter, setFilter]   = useState<MyDealFilter>("전체");
  const [myDeals, setMyDeals] = useState<Deal[]>(MY_MOCK_DEALS);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);

  const visible = myDeals.filter(d =>
    filter === "전체" ? true :
    filter === "모집중" ? d.status !== "마감" :
    d.status === "마감"
  );

  function handleClose(id: number) {
    setMyDeals(prev => prev.map(d => d.id === id ? { ...d, status: "마감" as const } : d));
  }
  function handleDelete(id: number) {
    setMyDeals(prev => prev.filter(d => d.id !== id));
  }

  if (editingDeal) return (
    <PostScreen
      initialDeal={editingDeal}
      onBack={() => setEditingDeal(null)}
      onSubmit={updated => setMyDeals(prev => prev.map(d => d.id === updated.id ? updated : d))}
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

      {/* cards */}
      <div className="flex-1 overflow-y-auto bg-[#F8F6FF] px-3 py-2 space-y-3">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <span className="text-5xl">📋</span>
            <p className="text-sm text-gray-400">등록한 공고가 없어요</p>
          </div>
        ) : visible.map(d => (
          <MyDealCard key={d.id} deal={d}
            onClose={() => handleClose(d.id)}
            onDelete={() => handleDelete(d.id)}
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
          <ImageWithFallback src={deal.image} alt={deal.store.branch}
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
          <p className="text-xs text-gray-400 font-semibold">{deal.store.city} · {deal.store.branch}</p>
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
  "허위 정보 / 사기",
  "욕설 및 비방",
  "스팸 / 광고",
  "부적절한 콘텐츠",
  "미성년자 관련",
  "기타",
];

function ReportScreen({ deal, onBack }: { deal: Deal; onBack: () => void }) {
  const [reason,  setReason]  = useState("");
  const [detail,  setDetail]  = useState("");
  const [open,    setOpen]    = useState(false);
  const [done,    setDone]    = useState(false);

  const canSubmit = reason !== "";

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
        <button onClick={() => { if (canSubmit) setDone(true); }}
          className={`text-sm font-black ${canSubmit ? "text-primary" : "text-gray-300"}`}>
          제출
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
                {deal.store.city} · {deal.store.branch}
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
                  <button key={r} onClick={() => { setReason(r); setOpen(false); }}
                    className={`w-full text-left px-4 py-3 text-sm border-b border-gray-50 last:border-0 ${
                      reason === r ? "text-primary font-bold" : "text-gray-700"
                    }`}>
                    {r}
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

        {/* 증거 첨부 */}
        <div>
          <p className="text-sm font-black text-gray-800 mb-2.5">증거 첨부 <span className="text-gray-400 font-normal">(선택)</span></p>
          <button className="w-full bg-[#F8F6FF] border border-dashed border-gray-200 rounded-xl py-7 flex flex-col items-center gap-2">
            <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-500">이미지 업로드</p>
            <p className="text-xs text-gray-300">최대 5개</p>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 프로필 설정 Screen
// ─────────────────────────────────────────────────────────────────────────────
function ProfileSettingsScreen({ onBack }: { onBack: () => void }) {
  const [nickname, setNickname] = useState("WISH 빈");
  const [bio,      setBio]      = useState("WISH와 함께하는 특별한 여정 ✨");
  const [saved,    setSaved]    = useState(false);

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
        <button type="button" onClick={onBack}
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <span className="flex-1 text-center font-black text-sm text-gray-900 -ml-8 pointer-events-none">프로필 설정</span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-7">
        {/* avatar */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-purple-100 border-4 border-white shadow-md overflow-hidden flex items-center justify-center">
              <ImageWithFallback src={nctWishLogo} alt="프로필" className="w-20 h-20 object-contain" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-primary rounded-full flex items-center justify-center shadow-md border-2 border-white">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
          </div>
          <button className="flex items-center gap-1.5 text-xs font-bold text-primary bg-purple-50 border border-purple-100 px-4 py-2 rounded-full">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            프로필 사진 변경
          </button>
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
        </div>

        {/* 한줄 소개 */}
        <div>
          <p className="text-sm font-black text-gray-800 mb-2.5">
            한줄 소개 <span className="text-gray-400 font-normal">(선택)</span>
          </p>
          <div className="relative">
            <input
              className="w-full bg-[#F8F6FF] border border-gray-100 rounded-xl px-4 py-3.5 text-sm text-gray-900 outline-none focus:border-primary transition-colors pr-16"
              value={bio}
              onChange={e => setBio(e.target.value.slice(0, 50))}
              maxLength={50}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] text-gray-300">
              {bio.length} / 50
            </span>
          </div>
        </div>
      </div>

      {/* save button */}
      <div className="px-5 py-4 flex-shrink-0">
        <button onClick={() => setSaved(true)} disabled={!nickname.trim()}
          className="w-full bg-primary text-white rounded-2xl py-4 font-black text-base disabled:opacity-40">
          저장하기
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 계정 설정 Screen
// ─────────────────────────────────────────────────────────────────────────────
function AccountSettingsScreen({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("user@example.com");
  const [pw, setPw] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [phone, setPhone] = useState("010-1234-5678");
  const [saved, setSaved] = useState(false);

  const pwMatch = !pw || pw === pwConfirm;

  if (saved) return (
    <div className="flex flex-col h-full items-center justify-center gap-6 px-8 text-center bg-white">
      <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center">
        <CheckCircle className="w-8 h-8 text-primary" />
      </div>
      <div>
        <h2 className="text-lg font-black text-gray-900">저장 완료</h2>
        <p className="text-sm text-gray-400 mt-1">계정 정보가 업데이트됐어요.</p>
      </div>
      <button type="button" onClick={onBack}
        className="w-full max-w-xs bg-primary text-white rounded-xl py-3.5 font-black text-sm">
        돌아가기
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
        <span className="flex-1 text-center font-black text-sm text-gray-900 -ml-8 pointer-events-none">계정 설정</span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5">
        <div>
          <label className="text-xs font-bold text-gray-500 mb-1.5 block">이메일</label>
          <input value={email} onChange={e => setEmail(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 outline-none focus:border-primary transition-colors"
            placeholder="이메일" type="email" />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 mb-1.5 block">전화번호</label>
          <input value={phone} onChange={e => setPhone(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 outline-none focus:border-primary transition-colors"
            placeholder="전화번호" type="tel" />
        </div>
        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs font-bold text-gray-400 mb-3">비밀번호 변경</p>
          <div className="space-y-3">
            <input value={pw} onChange={e => setPw(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 outline-none focus:border-primary transition-colors"
              placeholder="새 비밀번호" type="password" />
            <input value={pwConfirm} onChange={e => setPwConfirm(e.target.value)}
              className={`w-full border rounded-xl px-4 py-3 text-sm text-gray-900 outline-none transition-colors ${!pwMatch ? "border-red-400 focus:border-red-400" : "border-gray-200 focus:border-primary"}`}
              placeholder="새 비밀번호 확인" type="password" />
            {!pwMatch && <p className="text-xs text-red-400 font-semibold">비밀번호가 일치하지 않아요</p>}
          </div>
        </div>
      </div>
      <div className="px-4 py-4 border-t border-gray-100 flex-shrink-0">
        <button type="button" onClick={() => pwMatch && setSaved(true)}
          disabled={!pwMatch}
          className="w-full bg-primary text-white rounded-xl py-3.5 font-black text-sm disabled:opacity-50">
          저장하기
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 이벤트 Screen
// ─────────────────────────────────────────────────────────────────────────────
function EventScreen({ onBack, onJoin }: { onBack: () => void; onJoin: () => void }) {
  const guideRef = useRef<HTMLDivElement>(null);
  return (
    <div className="flex flex-col h-full bg-[#F8F6FF]">
      {/* header */}
      <div className="flex items-center px-4 py-3 bg-[#F8F6FF] flex-shrink-0">
        <button type="button" onClick={onBack}
          className="w-8 h-8 rounded-full bg-white border border-gray-100 shadow-sm flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <span className="flex-1 text-center font-black text-sm text-gray-900 -ml-8 pointer-events-none">이벤트</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4">
        {/* hero card */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          {/* banner image */}
          <div className="relative h-52 overflow-hidden"
            style={{ background: "linear-gradient(160deg, #5B2BA8 0%, #9B5FE0 50%, #C9BFEF 100%)" }}>
            {/* decorative stars */}
            <span className="absolute top-4 left-5 text-yellow-200 text-lg select-none opacity-80">★</span>
            <span className="absolute top-8 right-12 text-yellow-200 text-sm select-none opacity-60">★</span>
            <span className="absolute bottom-16 left-8 text-white/30 text-xs select-none">✦</span>

            {/* pixel scene bottom layer */}
            <div className="absolute bottom-0 left-0 right-0 h-20 opacity-40">
              <ImageWithFallback src={pixelScene} alt="" className="w-full h-full object-cover object-bottom" />
            </div>
            {/* mascots */}
            <div className="absolute bottom-0 right-0 w-44 opacity-90">
              <ImageWithFallback src={mascots} alt="마스코트" className="w-full object-contain" />
            </div>

            {/* badge */}
            <div className="absolute top-4 left-4">
              <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
                <div className="w-4 h-4 rounded-full overflow-hidden">
                  <ImageWithFallback src={nctWishLogo} alt="" className="w-full h-full object-contain" />
                </div>
                <span className="text-[10px] font-black text-white">NCT WISH 팬사인회 프리퀀시 이벤트</span>
              </div>
            </div>

            {/* title */}
            <div className="absolute bottom-6 left-4">
              <h2 className="text-xl font-black text-white leading-tight drop-shadow-md">
                Find My Wish<br />캠페인
              </h2>
            </div>
          </div>

          {/* event meta */}
          <div className="px-5 py-4 space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-semibold">이벤트 기간</p>
                <p className="text-sm font-bold text-gray-900">2024.07.16 - 2024.08.04</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-yellow-50 flex items-center justify-center flex-shrink-0">
                <Gift className="w-3.5 h-3.5 text-yellow-500" />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-semibold">당첨자 발표</p>
                <p className="text-sm font-bold text-gray-900">2024.08.05</p>
              </div>
            </div>
          </div>
        </div>

        {/* event guide */}
        <div ref={guideRef} className="bg-white rounded-3xl border border-gray-100 shadow-sm px-5 py-5">
          <p className="text-sm font-black text-gray-900 mb-3">이벤트 안내</p>
          <p className="text-sm text-gray-500 leading-relaxed">
            미션 음료 3개 + 일반 메뉴 7개를 포함한 총 <span className="font-black text-primary">10개</span>의
            음료를 주문하고 프리퀀시를 완성하면 NCT WISH 팬사인회에 자동 응모됩니다.
          </p>
          <div className="mt-4 bg-purple-50 rounded-2xl p-4 space-y-2">
            {[
              "WISH MATCH에서 모집 공고를 확인하세요",
              "원하는 매장의 공고를 찜하고 문의하세요",
              "음료 10잔 달성 시 팬사인회 응모권 지급",
            ].map((t, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[10px] font-black text-white">{i + 1}</span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">{t}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA buttons */}
        <div className="flex gap-2.5">
          <button type="button" onClick={() => guideRef.current?.scrollIntoView({ behavior: "smooth" })}
            className="flex-1 border border-primary text-primary py-3.5 rounded-2xl font-black text-sm">
            자세히 보기
          </button>
          <button type="button" onClick={onJoin}
            className="flex-1 bg-primary text-white py-3.5 rounded-2xl font-black text-sm shadow-md shadow-primary/25">
            이벤트 참여하기
          </button>
        </div>
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
  onLike: (id: number) => void;
  onBack: () => void;
}) {
  const [query,  setQuery]  = useState(initialQuery);
  const [filter, setFilter] = useState<FilterType>("전체");
  const [filterOpen, setFilterOpen] = useState(false);
  const [regionFilter, setRegionFilter] = useState("전체");
  const [discFilter, setDiscFilter] = useState("전체");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = deals.filter(d => {
    const matchesQuery = !query ||
      d.store.branch.includes(query) ||
      d.store.city.includes(query) ||
      d.store.district.includes(query) ||
      d.fan.name.includes(query);
    const matchesFilter =
      filter === "전체" ? true :
      filter === "모집중" ? d.status !== "마감" :
      /* 오늘 마감 */ d.status === "마감임박";
    const matchesRegion = regionFilter === "전체" || d.store.city === regionFilter;
    const matchesDisc = discFilter === "전체" || bestDiscount(d.drinks) >= Number(discFilter);
    return matchesQuery && matchesFilter && matchesRegion && matchesDisc;
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
            placeholder="지역, 매장명 검색"
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
            <p className="text-[11px] font-bold text-gray-400 mb-2">지역</p>
            <div className="flex flex-wrap gap-1.5">
              {["전체", "서울", "부산", "인천", "대구", "대전", "광주", "경기"].map(r => (
                <button key={r} type="button" onClick={() => setRegionFilter(r)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${regionFilter === r ? "bg-primary text-white border-primary" : "bg-white text-gray-500 border-gray-200"}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>
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
        <ImageWithFallback src={deal.image} alt={deal.store.branch}
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
        <p className="text-xs font-bold text-gray-500">{deal.store.city} · {deal.store.branch}</p>
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

const INIT_NOTIFS: AppNotif[] = [
  { id: 1, type: "new_post", title: "새로운 모집이 등록됐어요!", subtitle: "부산 · 서면점",    time: "10분 전",  read: false },
  { id: 2, type: "closed",   title: "내가 찜한 모집이 마감됐어요.", subtitle: "부산 · 서면점",  time: "1시간 전", read: false },
  { id: 3, type: "review",   title: "후기가 등록됐어요.",           subtitle: "부산 · 부산대점", time: "2시간 전", read: true  },
  { id: 4, type: "admin",    title: "관리자에게 알림이 도착했어요.", subtitle: "신고 관련",       time: "1일 전",   read: true  },
];

function NotificationScreen({ onBack }: { onBack: () => void }) {
  const [notifs, setNotifs] = useState<AppNotif[]>(INIT_NOTIFS);

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
        <button onClick={markAllRead} className="text-xs font-semibold text-primary">
          전체 읽음
        </button>
      </div>

      {/* list */}
      <div className="flex-1 overflow-y-auto">
        {notifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Bell className="w-12 h-12 text-gray-200" />
            <p className="text-sm text-gray-400">알림이 없어요</p>
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
    a: "WISH MATCH는 NCT WISH 팬들이 메가MGC커피 프리퀀시 이벤트 음료를 할인된 가격에 대리 구매해주고, 일반 이용자는 저렴하게 음료를 받을 수 있도록 연결해주는 팬 매칭 플랫폼이에요.",
  },
  {
    q: "모집글은 어떻게 작성하나요?",
    a: "하단 + 버튼을 눌러 모집 작성 화면으로 이동하세요. 지역, 매장, 할인율, 가능 시간, 수령 방법, 카카오 오픈채팅 링크를 입력하면 바로 등록됩니다.",
  },
  {
    q: "할인은 어떻게 이루어지나요?",
    a: "팬이 원가보다 낮은 할인가로 음료를 제공하고, 이용자는 오픈채팅을 통해 픽업 장소와 시간을 안내받아 직접 수령합니다. 결제는 오픈채팅 내에서 협의해 진행해요.",
  },
  {
    q: "오픈채팅은 필수인가요?",
    a: "네, 주문자와의 실시간 소통을 위해 카카오 오픈채팅 링크는 필수예요. 픽업 일정 조율 및 위치 안내에 활용됩니다.",
  },
  {
    q: "사기가 걱정돼요, 안전한가요?",
    a: "팬 인증 뱃지를 통해 신뢰도 높은 팬을 확인할 수 있고, 후기 시스템으로 이용자들의 평가를 참고할 수 있어요. 문제 발생 시 고객센터로 신고해주세요.",
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

        {/* mascot illustration */}
        <div className="relative mt-4 mx-4 mb-6 h-44 rounded-3xl overflow-hidden"
          style={{ background: "linear-gradient(160deg, #EAE0FF 0%, #DDD5F8 100%)" }}>
          <span className="absolute top-3 left-5 text-yellow-300 text-sm select-none">★</span>
          <span className="absolute top-6 right-10 text-purple-300 text-xs select-none">✦</span>
          <span className="absolute bottom-16 left-10 text-pink-200 text-xs select-none">✦</span>
          <div className="absolute bottom-0 left-0 right-0 h-16 overflow-hidden opacity-50">
            <ImageWithFallback src={pixelScene} alt="" className="w-full h-full object-cover object-bottom" />
          </div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-64">
            <ImageWithFallback src={mascots} alt="마스코트" className="w-full object-contain" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 후기 작성 Screen
// ─────────────────────────────────────────────────────────────────────────────
function ReviewScreen({ deals: dealList, onBack }: { deals: Deal[]; onBack: () => void }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const deal = dealList.find(d => d.id === selectedId) ?? null;
  const [rating,    setRating]    = useState(0);
  const [hover,     setHover]     = useState(0);
  const [text,      setText]      = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const disc = deal ? bestDiscount(deal.drinks) : 0;

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

  const canSubmit = deal !== null && rating > 0 && text.length >= 10;
  const displayRating = hover || rating;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <button onClick={onBack} className="text-sm font-semibold text-gray-500">취소</button>
        <span className="font-black text-sm text-gray-900">후기 작성</span>
        <button onClick={() => { if (canSubmit) setSubmitted(true); }}
          className={`text-sm font-black ${canSubmit ? "text-primary" : "text-gray-300"}`}>
          등록
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-5 space-y-6">
          {/* deal picker */}
          <div>
            <p className="text-sm font-black text-gray-800 mb-2.5">모집 선택</p>
            <div className="space-y-2">
              {dealList.map(d => (
                <button key={d.id} type="button" onClick={() => setSelectedId(d.id)}
                  className={`w-full flex gap-3 p-3 rounded-2xl border transition-colors text-left ${selectedId === d.id ? "border-primary bg-primary/5" : "border-gray-100 bg-[#F8F6FF]"}`}>
                  <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
                    <ImageWithFallback src={d.image} alt={d.store.branch} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 font-semibold truncate">{d.store.city} · {d.store.branch}</p>
                    <p className="text-sm font-black text-red-500 mt-0.5">{bestDiscount(d.drinks)}% 할인</p>
                    <p className="text-xs text-gray-400">작성자: {d.fan.name}</p>
                  </div>
                  {selectedId === d.id && <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 self-center" />}
                </button>
              ))}
            </div>
          </div>

          {/* star rating */}
          <div>
            <p className="text-sm font-black text-gray-800 mb-3">별점 선택</p>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n}
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
            {text.length > 0 && text.length < 10 && (
              <p className="text-xs text-red-400 mt-1 ml-1">최소 10자 이상 작성해주세요</p>
            )}
          </div>

          {/* anonymous toggle */}
          <div className="flex items-center justify-between py-3.5 px-4 bg-[#F8F6FF] rounded-2xl">
            <span className="text-sm font-semibold text-gray-700">익명으로 작성</span>
            <button onClick={() => setAnonymous(a => !a)}
              className={`w-12 h-6 rounded-full transition-colors relative ${anonymous ? "bg-primary" : "bg-gray-200"}`}>
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                anonymous ? "translate-x-6" : "translate-x-0.5"
              }`} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Contact Screen
// ─────────────────────────────────────────────────────────────────────────────
function ContactScreen({ onBack }: { onBack: () => void }) {
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [sent, setSent] = useState(false);

  const categories = ["서비스 이용 문의", "계정/로그인 문의", "신고/제재 문의", "결제 문의", "기타"];

  if (sent) return (
    <div className="flex flex-col h-full items-center justify-center gap-6 px-8 text-center bg-white">
      <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center">
        <CheckCircle className="w-8 h-8 text-primary" />
      </div>
      <div>
        <h2 className="text-lg font-black text-gray-900">문의가 접수됐어요</h2>
        <p className="text-sm text-gray-400 mt-1 leading-relaxed">관리자 검토 후 3영업일 내로<br />답변을 드릴게요.</p>
      </div>
      <button type="button" onClick={onBack}
        className="w-full max-w-xs bg-primary text-white rounded-xl py-3.5 font-black text-sm">
        돌아가기
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
              <button key={c} type="button" onClick={() => setCategory(c)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-semibold transition-colors ${category === c ? "border-primary bg-primary/5 text-primary" : "border-gray-200 text-gray-600"}`}>
                {c}
                {category === c && <CheckCircle className="w-4 h-4 text-primary" />}
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
        </div>
      </div>

      <div className="px-4 py-4 border-t border-gray-100 flex-shrink-0">
        <button type="button"
          onClick={() => category && content.trim() && setSent(true)}
          disabled={!category || !content.trim()}
          className="w-full bg-primary text-white rounded-xl py-3.5 font-black text-sm disabled:opacity-40">
          문의 제출하기
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root App
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [authView,     setAuthView]     = useState<AuthView>("login");
  const [tab,          setTab]          = useState<Tab>("home");
  const [deals,        setDeals]        = useState<Deal[]>(INITIAL_DEALS);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [orderDeal,    setOrderDeal]    = useState<Deal | null>(null);
  const [mySubView,    setMySubView]    = useState<"main" | "mydeals" | "reviews">("main");
  const [topScreen,    setTopScreen]    = useState<null | "notifications" | "guide" | "event" | "search" | "report" | "profile" | "account-settings" | "contact">(null);
  const [searchQuery,  setSearchQuery]  = useState("");

  // ── auth ──────────────────────────────────────────────────────────────────
  if (authView === "login") return (
    <Shell>
      <LoginScreen onLogin={() => setAuthView("app")} onSignup={() => setAuthView("signup")} />
    </Shell>
  );
  if (authView === "signup") return (
    <Shell>
      <SignupScreen onBack={() => setAuthView("login")} onSignup={() => setAuthView("app")} />
    </Shell>
  );

  function handleLike(id: number) {
    setDeals(prev => prev.map(d => d.id === id ? { ...d, liked: !d.liked } : d));
  }
  function handleOrderConfirm(qty: number) {
    if (!orderDeal) return;
    setDeals(prev => prev.map(d =>
      d.id === orderDeal.id
        ? { ...d, currentOrders: Math.min(d.currentOrders + qty, d.totalTarget) }
        : d
    ));
    setOrderDeal(null);
    setSelectedDeal(null);
  }

  // ── top-level overlays ───────────────────────────────────────────────────
  if (topScreen === "notifications") return (
    <Shell><NotificationScreen onBack={() => setTopScreen(null)} /></Shell>
  );
  if (topScreen === "guide") return (
    <Shell><GuideScreen onBack={() => setTopScreen(null)} /></Shell>
  );
  if (topScreen === "event") return (
    <Shell><EventScreen onBack={() => setTopScreen(null)} onJoin={() => { setTopScreen(null); setTab("list"); }} /></Shell>
  );
  if (topScreen === "search") return (
    <Shell>
      <SearchScreen
        deals={deals}
        initialQuery={searchQuery}
        onSelect={d => { setSelectedDeal(d); setTopScreen(null); }}
        onLike={handleLike}
        onBack={() => setTopScreen(null)}
      />
    </Shell>
  );
  if (topScreen === "report") return (
    <Shell><ReportScreen deal={selectedDeal ?? deals[0]} onBack={() => setTopScreen(null)} /></Shell>
  );
  if (topScreen === "profile") return (
    <Shell><ProfileSettingsScreen onBack={() => setTopScreen(null)} /></Shell>
  );
  if (topScreen === "account-settings") return (
    <Shell><AccountSettingsScreen onBack={() => setTopScreen(null)} /></Shell>
  );
  if (topScreen === "contact") return (
    <Shell><ContactScreen onBack={() => setTopScreen(null)} /></Shell>
  );

  // ── full-screen tab overlays (no bottom nav) ──────────────────────────────
  if (tab === "post") return (
    <Shell><PostScreen onBack={() => setTab("home")} /></Shell>
  );
  if (tab === "my" && mySubView === "mydeals") return (
    <Shell><MyDealsScreen onBack={() => setMySubView("main")} /></Shell>
  );
  if (tab === "my" && mySubView === "reviews") return (
    <Shell><ReviewScreen deals={deals} onBack={() => setMySubView("main")} /></Shell>
  );

  // ── detail overlay ────────────────────────────────────────────────────────
  if (selectedDeal) {
    const live = deals.find(d => d.id === selectedDeal.id) ?? selectedDeal;
    return (
      <Shell>
        <DetailScreen
          deal={live}
          onBack={() => setSelectedDeal(null)}
          onOrder={() => setOrderDeal(live)}
          onLike={() => handleLike(live.id)}
          onReport={() => setTopScreen("report")}
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
          <span className="font-black text-xl text-primary tracking-tight">WISH MATCH</span>
          <div className="flex items-center gap-0.5">
            <button onClick={() => { setSearchQuery(""); setTopScreen("search"); }}
              className="w-9 h-9 flex items-center justify-center rounded-full">
              <Search style={{ width: 20, height: 20 }} className="text-gray-600" />
            </button>
            <button onClick={() => setTopScreen("notifications")}
              className="w-9 h-9 flex items-center justify-center rounded-full relative">
              <Bell style={{ width: 20, height: 20 }} className="text-gray-600" />
              <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-primary rounded-full" />
            </button>
          </div>
        </div>
      </header>

      {/* content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {tab === "home"  && <HomeScreen deals={deals} onSelect={setSelectedDeal} onLike={handleLike} onGuide={() => setTopScreen("guide")} onEvent={() => setTopScreen("event")} onSearch={q => { setSearchQuery(q); setTopScreen("search"); }} onList={() => setTab("list")} onContact={() => setTopScreen("contact")} />}
        {tab === "list"  && <ListScreen deals={deals} onSelect={setSelectedDeal} onLike={handleLike} />}
        {tab === "saved" && <SavedScreen deals={deals} onSelect={setSelectedDeal} onLike={handleLike} />}
        {tab === "my" && mySubView === "main" && <MyScreen onMyDeals={() => setMySubView("mydeals")} onReviews={() => setMySubView("reviews")} onNotifications={() => setTopScreen("notifications")} onProfile={() => setTopScreen("profile")} onSaved={() => { setTab("saved"); setMySubView("main"); }} onAccountSettings={() => setTopScreen("account-settings")} onLogout={() => { setAuthView("login"); setTab("home"); setMySubView("main"); setTopScreen(null); }} />}
      </main>

      {/* bottom nav */}
      <nav className="flex-shrink-0 bg-white border-t border-gray-100">
        <div className="flex items-center h-16">
          <BotBtn active={tab === "home"}  label="홈"       icon={HomeIcon}  onTap={() => setTab("home")} />
          <BotBtn active={tab === "list"}  label="모집 목록" icon={ListIcon}  onTap={() => setTab("list")} />
          <div className="flex-1 flex justify-center items-center">
            <button onClick={() => setTab("post")}
              className="w-12 h-12 -mt-5 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/30">
              <Plus className="w-5 h-5 text-white" />
            </button>
          </div>
          <BotBtn active={tab === "saved"} label="찜한 목록" icon={HeartIcon} onTap={() => setTab("saved")} />
          <BotBtn active={tab === "my"}    label="마이페이지" icon={UserIcon}  onTap={() => { setTab("my"); setMySubView("main" as const); }} />
        </div>
      </nav>
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
