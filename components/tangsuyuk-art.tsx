type TangsuyukArtProps = {
  choice: "dip" | "pour";
};

export function TangsuyukArt({ choice }: TangsuyukArtProps) {
  const isDip = choice === "dip";
  const prefix = isDip ? "dip" : "pour";

  return (
    <svg
      aria-hidden="true"
      className={`food-art food-art--${choice}`}
      focusable="false"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 480 300"
    >
      <defs>
        <linearGradient id={`${prefix}-plate`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fffdf8" />
          <stop offset="1" stopColor="#e7ded0" />
        </linearGradient>
        <linearGradient id={`${prefix}-fry`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#f5c560" />
          <stop offset="0.55" stopColor="#d99128" />
          <stop offset="1" stopColor="#ad5a1e" />
        </linearGradient>
        <linearGradient id={`${prefix}-sauce`} x1="0" x2="0.9" y1="0" y2="1">
          <stop offset="0" stopColor="#f1734e" />
          <stop offset="1" stopColor="#c93629" />
        </linearGradient>
        <filter id={`${prefix}-shadow`} height="160%" width="160%" x="-30%" y="-30%">
          <feDropShadow dx="0" dy="8" floodColor="#3b2412" floodOpacity=".18" stdDeviation="8" />
        </filter>
      </defs>

      <ellipse cx="235" cy="252" fill="#3e2e20" opacity=".12" rx="172" ry="25" />
      <g filter={`url(#${prefix}-shadow)`}>
        <path
          d="M65 180c15-54 76-84 172-84 98 0 163 30 178 84l-15 46c-22 35-82 54-163 54-80 0-140-19-163-54Z"
          fill={`url(#${prefix}-plate)`}
        />
        <ellipse cx="240" cy="178" fill="#f6eee2" rx="176" ry="87" />
        <ellipse cx="240" cy="173" fill="#fffdfa" rx="156" ry="70" />
      </g>

      <g fill={`url(#${prefix}-fry)`} stroke="#a85b20" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3">
        <path d="m108 174 27-27 46 12 7 31-31 26-43-9Z" />
        <path d="m164 132 35-25 42 15 2 35-38 21-38-13Z" />
        <path d="m221 150 39-34 45 14 4 38-34 28-48-10Z" />
        <path d="m287 171 29-31 45 10 13 33-27 31-48-5Z" />
        <path d="m178 192 37-31 45 16-1 39-39 24-42-16Z" />
        <path d="m244 206 38-34 44 16 1 37-38 24-43-12Z" />
      </g>
      <g fill="#ffd97c" opacity=".68">
        <circle cx="139" cy="170" r="4" />
        <circle cx="193" cy="131" r="5" />
        <circle cx="267" cy="143" r="4" />
        <circle cx="329" cy="176" r="5" />
        <circle cx="216" cy="194" r="4" />
        <circle cx="287" cy="210" r="4" />
      </g>

      {isDip ? (
        <g className="dip-scene">
          <ellipse cx="390" cy="224" fill="#3e2e20" opacity=".14" rx="50" ry="10" />
          <path d="M343 183h96l-8 53c-2 16-20 27-40 27s-38-11-40-27Z" fill="#f7efe4" stroke="#c9baa5" strokeWidth="3" />
          <ellipse cx="391" cy="184" fill="#d6c7b3" rx="48" ry="19" />
          <ellipse cx="391" cy="181" fill={`url(#${prefix}-sauce)`} rx="40" ry="13" />
          <path d="m307 33 9 6-80 107-9-6Z" fill="#352920" />
          <path d="m330 46 9 6-85 103-9-6Z" fill="#352920" />
          <path d="m218 128 27-10 26 19-8 28-30 7-22-20Z" fill={`url(#${prefix}-fry)`} stroke="#a85b20" strokeWidth="3" />
          <path d="M247 164c9 4 14 12 11 20-2 6-11 9-15 2-5-8 5-11 4-22Z" fill={`url(#${prefix}-sauce)`} />
        </g>
      ) : (
        <g className="pour-scene">
          <path
            d="M103 165c24-5 38 12 57 8 25-6 33-28 62-24 25 3 31 24 51 25 26 1 37-20 69-12 15 4 22 17 26 33-28 27-71 41-128 41-62 0-107-17-137-48Z"
            fill={`url(#${prefix}-sauce)`}
            opacity=".88"
          />
          <path d="M194 167c8 11 5 26-3 36-5 7-14 3-13-6 2-12 11-18 16-30Z" fill="#bf3027" />
          <path d="M303 174c9 12 8 29 1 40-5 8-15 4-14-5 0-13 9-23 13-35Z" fill="#bf3027" />
          <g transform="rotate(22 345 63)">
            <path d="M298 12h83l-7 67c-2 21-17 35-35 35s-33-14-35-35Z" fill="#fffaf2" stroke="#c9baa5" strokeWidth="3" />
            <ellipse cx="339" cy="13" fill="#e0d3c1" rx="41" ry="13" />
            <ellipse cx="339" cy="13" fill={`url(#${prefix}-sauce)`} rx="34" ry="8" />
            <path d="M380 31c28 3 35 17 22 39-7 12-18 18-29 18" fill="none" stroke="#c9baa5" strokeWidth="8" />
          </g>
          <path d="M325 103c-8 14-12 26-4 34 5 6 13 2 12-6-1-9-5-17-8-28Z" fill={`url(#${prefix}-sauce)`} />
        </g>
      )}
    </svg>
  );
}
