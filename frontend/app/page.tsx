export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <div className="hero-label">WishMatch</div>
        <h1>팬사인회 프리퀀시 공동구매 매칭 플랫폼</h1>
        <p>팬과 일반인을 연결해 프리퀀시 구매를 쉽게 찾고 공유합니다.</p>
      </section>

      <section className="filters-card">
        <div className="section-title">검색 필터</div>
        <div className="filter-row">
          <span>지역</span>
          <span>매장</span>
          <span>할인율</span>
        </div>
      </section>

      <section className="list-card">
        <div className="section-title">오늘 등록된 모집</div>

        <article className="match-card">
          <div className="match-header">
            <div>
              <div className="region">📍 부산대</div>
              <div className="store">메가커피 부산대점</div>
            </div>
            <div className="badge">20% 할인</div>
          </div>
          <div className="match-body">
            <span>남은 3잔</span>
            <button type="button">채팅</button>
          </div>
        </article>

        <article className="match-card">
          <div className="match-header">
            <div>
              <div className="region">📍 강남역</div>
              <div className="store">메가커피 강남역점</div>
            </div>
            <div className="badge">15% 할인</div>
          </div>
          <div className="match-body">
            <span>남은 5잔</span>
            <button type="button">채팅</button>
          </div>
        </article>
      </section>

      <section className="info-card">
        <div className="section-title">서비스 개요</div>
        <ul>
          <li>지역, 매장, 할인율로 모집글을 검색합니다.</li>
          <li>팬 모집글의 남은 잔 수와 마감 상태를 한눈에 확인할 수 있습니다.</li>
          <li>후기와 인증으로 신뢰도를 높입니다.</li>
        </ul>
      </section>
    </main>
  );
}
