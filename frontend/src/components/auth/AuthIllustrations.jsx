function SoftBlob({ cx, cy, rx, ry, fill = '#eef3f8' }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={fill} />
}

function GroundShadow({ cx, cy, rx = 28, ry = 6 }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#e8e4dc" opacity="0.85" />
}

/** Passwordless - laptop + floating auth cues + two people */
export function PasswordlessIllustration() {
  return (
    <svg className="auth-illu" viewBox="0 0 420 250" aria-hidden="true">
      <SoftBlob cx="210" cy="128" rx="168" ry="92" fill="#f3f6fa" />
      <SoftBlob cx="300" cy="70" rx="54" ry="36" fill="#eaf1f8" />
      <SoftBlob cx="96" cy="188" rx="48" ry="22" fill="#f7f1e8" />

      {/* Laptop */}
      <rect x="108" y="28" width="204" height="132" rx="10" fill="#3f5166" />
      <rect x="116" y="36" width="188" height="108" rx="4" fill="#fff" />
      <rect x="116" y="144" width="188" height="9" rx="2" fill="#334455" />
      <rect x="170" y="154" width="80" height="5" rx="2.5" fill="#9aa7b5" />

      {/* Dashed connection arcs */}
      <path
        d="M250 78 C290 48 328 62 336 96 C346 130 318 148 294 138"
        fill="none"
        stroke="#c5d0db"
        strokeWidth="1.5"
        strokeDasharray="3.5 3.5"
        strokeLinecap="round"
      />
      <path
        d="M170 86 C132 58 96 82 90 114 C86 146 120 156 148 140"
        fill="none"
        stroke="#c5d0db"
        strokeWidth="1.5"
        strokeDasharray="3.5 3.5"
        strokeLinecap="round"
      />

      {/* Email chip on screen */}
      <rect x="148" y="74" width="124" height="30" rx="7" fill="#fff" stroke="#d7dee6" strokeWidth="1.5" />
      <circle cx="164" cy="89" r="8.5" fill="#f5c518" />
      <rect x="160.4" y="87" width="7.2" height="6.4" rx="1.2" fill="#fff" />
      <path d="M164 84 a3.5 3.5 0 0 1 0 7" fill="none" stroke="#fff" strokeWidth="1.4" />
      <text
        x="178"
        y="93"
        fontSize="10"
        fontWeight="600"
        fill="#2b2b2b"
        fontFamily="Nunito Sans, Segoe UI, sans-serif"
      >
        hr@bda.co.in
      </text>

      {/* Auth icon bubbles */}
      <g transform="translate(128 48)">
        <circle r="21" fill="#1f4e9a" />
        <circle r="21" fill="none" stroke="#fff" strokeOpacity="0.18" strokeWidth="3" />
        <path d="M-7 5 h14 v-7.5 a5.2 5.2 0 0 0-10.4 0 z" fill="none" stroke="#fff" strokeWidth="2.1" />
        <circle cy="-1.5" r="1.7" fill="#fff" />
      </g>
      <g transform="translate(294 48)">
        <circle r="21" fill="#1f4e9a" />
        <circle r="21" fill="none" stroke="#fff" strokeOpacity="0.18" strokeWidth="3" />
        <rect x="-8" y="-8" width="5.2" height="5.2" fill="none" stroke="#fff" strokeWidth="1.7" />
        <rect x="2.8" y="-8" width="5.2" height="5.2" fill="none" stroke="#fff" strokeWidth="1.7" />
        <rect x="-8" y="2.8" width="5.2" height="5.2" fill="none" stroke="#fff" strokeWidth="1.7" />
        <rect x="2.8" y="2.8" width="5.2" height="5.2" fill="none" stroke="#fff" strokeWidth="1.7" />
        <circle cy="-1.4" r="2.3" fill="#fff" />
        <path d="M-4.2 5.5 q4.2-3.5 8.4 0" fill="none" stroke="#fff" strokeWidth="1.6" />
      </g>
      <g transform="translate(294 148)">
        <circle r="21" fill="#1f4e9a" />
        <circle r="21" fill="none" stroke="#fff" strokeOpacity="0.18" strokeWidth="3" />
        <circle r="8.4" fill="none" stroke="#fff" strokeWidth="1.9" />
        <circle r="4.7" fill="none" stroke="#fff" strokeWidth="1.5" />
        <circle r="1.9" fill="#fff" />
        <path d="M0 -8.4 v2.5 M0 5.9 v2.5 M-8.4 0 h2.5 M5.9 0 h2.5" stroke="#fff" strokeWidth="1.45" />
      </g>

      {/* Woman - thinking pose */}
      <g transform="translate(34 88)">
        <GroundShadow cx="22" cy="156" rx="24" ry="5.5" />
        <path d="M8 18 C6 6 16 0 24 2 C34 4 38 14 34 24 C28 22 14 22 8 18 Z" fill="#2c241e" />
        <circle cx="22" cy="22" r="13.5" fill="#d7a17a" />
        <path d="M12 16 C14 10 20 8 26 10" fill="#2c241e" />
        <circle cx="17.5" cy="21" r="1.1" fill="#5a3d2e" />
        <circle cx="26.5" cy="21" r="1.1" fill="#5a3d2e" />
        <path d="M19.5 26.5 q2.5 1.8 5 0" fill="none" stroke="#a06b4a" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M22 36 L22 46" stroke="#d7a17a" strokeWidth="5.2" strokeLinecap="round" />
        <path d="M8 52 C10 42 34 42 36 54 C36 78 34 96 30 112 L14 112 C10 94 8 74 8 52 Z" fill="#2f6ec4" />
        <path d="M36 58 C48 62 50 78 42 86" fill="none" stroke="#2f6ec4" strokeWidth="8.5" strokeLinecap="round" />
        <path d="M42 86 C34 78 28 70 26 58" fill="none" stroke="#d7a17a" strokeWidth="5.2" strokeLinecap="round" />
        <circle cx="30" cy="50" r="4.2" fill="#d7a17a" />
        <path d="M10 112 C8 136 12 154 14 156 L22 156 L22 112 Z" fill="#5d6670" />
        <path d="M22 112 C24 136 28 154 30 156 L38 156 L36 112 Z" fill="#4e565f" />
        <ellipse cx="16" cy="156" rx="7" ry="3" fill="#3d444c" />
        <ellipse cx="34" cy="156" rx="7" ry="3" fill="#3d444c" />
      </g>

      {/* Man - walking with phone */}
      <g transform="translate(316 92)">
        <GroundShadow cx="20" cy="152" rx="24" ry="5.5" />
        <circle cx="16" cy="20" r="13.5" fill="#c48b64" />
        <path d="M6 16 C8 8 16 6 24 10 C26 16 24 22 20 24 C12 22 6 20 6 16 Z" fill="#3a2f28" />
        <circle cx="11.5" cy="19.5" r="1.1" fill="#5a3d2e" />
        <circle cx="20.5" cy="19.5" r="1.1" fill="#5a3d2e" />
        <path d="M13 25 q3 1.6 6 0" fill="none" stroke="#9a6544" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M10 28 C8 32 10 36 16 36 C22 36 24 32 22 28 Z" fill="#8a5a3c" />
        <path d="M16 34 L16 44" stroke="#c48b64" strokeWidth="5.2" strokeLinecap="round" />
        <path d="M4 50 C6 42 26 42 28 52 C30 78 28 98 24 114 L8 114 C4 96 2 72 4 50 Z" fill="#2f6ec4" />
        <path d="M28 58 C40 70 36 86 30 92" fill="none" stroke="#2f6ec4" strokeWidth="8.5" strokeLinecap="round" />
        <path d="M30 92 L38 104" fill="none" stroke="#c48b64" strokeWidth="5.2" strokeLinecap="round" />
        <rect x="36" y="98" width="9" height="15" rx="2" fill="#eef3f7" stroke="#9aa7b5" strokeWidth="0.9" />
        <rect x="37.5" y="100" width="6" height="3" rx="0.8" fill="#4E5BBE" />
        <path d="M6 114 C2 134 0 150 6 154 L16 154 L16 114 Z" fill="#4e565f" />
        <path d="M16 114 C22 132 30 146 34 150 L42 146 L28 114 Z" fill="#5d6670" />
        <ellipse cx="10" cy="154" rx="7" ry="3" fill="#3d444c" />
        <ellipse cx="38" cy="148" rx="7" ry="3" fill="#3d444c" />
      </g>
    </svg>
  )
}

/** Team portal - three teammates on warm panel */
export function TeamIllustration() {
  return (
    <svg className="auth-illu" viewBox="0 0 420 250" aria-hidden="true">
      <SoftBlob cx="210" cy="130" rx="170" ry="88" fill="#f7f1e8" />
      <rect x="68" y="40" width="284" height="164" rx="22" fill="#f3e2c8" />
      <rect x="68" y="40" width="284" height="164" rx="22" fill="none" stroke="#ead5b4" strokeWidth="1.2" />

      {/* Left teammate */}
      <g transform="translate(102 74)">
        <GroundShadow cx="28" cy="150" rx="26" ry="5" />
        <circle cx="28" cy="22" r="18.5" fill="#d7a17a" />
        <path d="M12 16 C14 4 28 0 40 8 C42 16 36 24 28 24 C20 24 12 22 12 16 Z" fill="#1f4e9a" />
        <circle cx="22" cy="21" r="1.15" fill="#5a3d2e" />
        <circle cx="33" cy="21" r="1.15" fill="#5a3d2e" />
        <path d="M25 27 q3 1.7 6 0" fill="none" stroke="#a06b4a" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M28 40 L28 50" stroke="#d7a17a" strokeWidth="6.2" strokeLinecap="round" />
        <path d="M8 58 C10 48 46 48 48 60 C48 92 44 112 40 122 L16 122 C12 104 8 84 8 58 Z" fill="#1f4e9a" />
        <path d="M10 122 C8 146 12 162 14 164 L26 164 L26 122 Z" fill="#3d4a7a" />
        <path d="M26 122 C28 146 32 162 34 164 L46 164 L44 122 Z" fill="#33406c" />
        <ellipse cx="18" cy="164" rx="7" ry="2.8" fill="#2a3358" />
        <ellipse cx="38" cy="164" rx="7" ry="2.8" fill="#2a3358" />
      </g>

      {/* Center teammate */}
      <g transform="translate(172 56)">
        <GroundShadow cx="32" cy="168" rx="28" ry="5.5" />
        <circle cx="32" cy="24" r="20.5" fill="#e0aa82" />
        <path d="M14 18 C18 4 34 0 48 10 C50 18 44 28 32 28 C22 28 14 24 14 18 Z" fill="#c0392b" />
        <circle cx="26" cy="23" r="1.2" fill="#5a3d2e" />
        <circle cx="38" cy="23" r="1.2" fill="#5a3d2e" />
        <path d="M29 29.5 q3 1.8 6 0" fill="none" stroke="#a06b4a" strokeWidth="1.15" strokeLinecap="round" />
        <path d="M32 44 L32 54" stroke="#e0aa82" strokeWidth="6.2" strokeLinecap="round" />
        <path d="M10 62 C12 50 52 50 54 64 C54 100 50 124 44 136 L20 136 C14 116 10 90 10 62 Z" fill="#e42527" />
        <rect x="22" y="78" width="20" height="14" rx="3" fill="#fff" opacity="0.28" />
        <path d="M12 136 C10 160 14 176 16 178 L30 178 L30 136 Z" fill="#8e1e1a" />
        <path d="M30 136 C32 160 36 176 38 178 L52 178 L50 136 Z" fill="#7a1916" />
        <ellipse cx="20" cy="178" rx="7.5" ry="3" fill="#5c1411" />
        <ellipse cx="42" cy="178" rx="7.5" ry="3" fill="#5c1411" />
      </g>

      {/* Right teammate */}
      <g transform="translate(252 74)">
        <GroundShadow cx="28" cy="150" rx="26" ry="5" />
        <circle cx="28" cy="22" r="18.5" fill="#c48b64" />
        <path d="M14 14 C16 4 30 0 40 8 C40 16 34 24 28 24 C20 22 14 20 14 14 Z" fill="#1b6b3a" />
        <circle cx="22" cy="21" r="1.15" fill="#5a3d2e" />
        <circle cx="33" cy="21" r="1.15" fill="#5a3d2e" />
        <path d="M25 27 q3 1.7 6 0" fill="none" stroke="#9a6544" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M28 40 L28 50" stroke="#c48b64" strokeWidth="6.2" strokeLinecap="round" />
        <path d="M8 58 C10 48 46 48 48 60 C48 92 44 112 40 122 L16 122 C12 104 8 84 8 58 Z" fill="#21a05a" />
        <circle cx="40" cy="78" r="6.5" fill="#d5f3e0" />
        <path d="M37.5 78 l2 2 3.5-4" fill="none" stroke="#21a05a" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M10 122 C8 146 12 162 14 164 L26 164 L26 122 Z" fill="#146b3a" />
        <path d="M26 122 C28 146 32 162 34 164 L46 164 L44 122 Z" fill="#0f5a30" />
        <ellipse cx="18" cy="164" rx="7" ry="2.8" fill="#0b4728" />
        <ellipse cx="38" cy="164" rx="7" ry="2.8" fill="#0b4728" />
      </g>
    </svg>
  )
}

/** BDA OS live - dashboard laptop with two people */
export function PayrollIllustration() {
  return (
    <svg className="auth-illu" viewBox="0 0 420 250" aria-hidden="true">
      <SoftBlob cx="210" cy="126" rx="168" ry="90" fill="#eef4f9" />
      <SoftBlob cx="88" cy="70" rx="40" ry="28" fill="#e8f3ea" />
      <SoftBlob cx="340" cy="176" rx="42" ry="24" fill="#f7f1e8" />

      {/* Laptop */}
      <rect x="116" y="30" width="188" height="126" rx="11" fill="#3f5166" />
      <rect x="124" y="38" width="172" height="102" rx="5" fill="#fff" />
      <rect x="124" y="140" width="172" height="8" rx="2" fill="#334455" />
      <rect x="176" y="150" width="68" height="5" rx="2.5" fill="#9aa7b5" />

      {/* Dashboard UI */}
      <rect x="136" y="52" width="70" height="9" rx="4.5" fill="#0091ff" />
      <rect x="136" y="70" width="148" height="6" rx="3" fill="#e6eef3" />
      <rect x="136" y="84" width="120" height="6" rx="3" fill="#e6eef3" />
      <rect x="136" y="106" width="44" height="20" rx="5" fill="#d9f1fb" />
      <rect x="186" y="106" width="44" height="20" rx="5" fill="#e5ebdd" />
      <rect x="236" y="106" width="44" height="20" rx="5" fill="#fde68a" />

      {/* Mini chart bars */}
      <rect x="148" y="112" width="6" height="10" rx="1.5" fill="#4E5BBE" opacity="0.55" />
      <rect x="158" y="108" width="6" height="14" rx="1.5" fill="#21a05a" opacity="0.55" />
      <rect x="168" y="110" width="6" height="12" rx="1.5" fill="#f5c400" opacity="0.7" />

      {/* Left person */}
      <g transform="translate(32 98)">
        <GroundShadow cx="22" cy="128" rx="22" ry="5" />
        <circle cx="22" cy="18" r="14.5" fill="#d7a17a" />
        <path d="M10 12 C12 4 22 2 30 8 C32 14 28 20 22 20 C14 20 10 16 10 12 Z" fill="#2c241e" />
        <circle cx="17" cy="17.5" r="1.05" fill="#5a3d2e" />
        <circle cx="26.5" cy="17.5" r="1.05" fill="#5a3d2e" />
        <path d="M19.5 23 q2.5 1.5 5 0" fill="none" stroke="#a06b4a" strokeWidth="1" strokeLinecap="round" />
        <path d="M22 32 L22 40" stroke="#d7a17a" strokeWidth="5.2" strokeLinecap="round" />
        <path d="M8 48 C10 40 34 40 36 50 C36 74 34 92 30 104 L14 104 C10 88 8 68 8 48 Z" fill="#21a05a" />
        <path d="M10 104 C8 126 12 140 14 142 L22 142 L22 104 Z" fill="#146b3a" />
        <path d="M22 104 C24 126 28 140 30 142 L38 142 L36 104 Z" fill="#0f5a30" />
        <ellipse cx="16" cy="142" rx="6.5" ry="2.6" fill="#0b4728" />
        <ellipse cx="32" cy="142" rx="6.5" ry="2.6" fill="#0b4728" />
      </g>

      {/* Right person with phone */}
      <g transform="translate(326 100)">
        <GroundShadow cx="20" cy="126" rx="22" ry="5" />
        <circle cx="20" cy="18" r="14.5" fill="#c48b64" />
        <path d="M8 14 C10 6 20 4 28 10 C30 16 26 22 20 22 C12 20 8 18 8 14 Z" fill="#3a2f28" />
        <circle cx="15" cy="17.5" r="1.05" fill="#5a3d2e" />
        <circle cx="24.5" cy="17.5" r="1.05" fill="#5a3d2e" />
        <path d="M17.5 23 q2.5 1.5 5 0" fill="none" stroke="#9a6544" strokeWidth="1" strokeLinecap="round" />
        <path d="M20 32 L20 40" stroke="#c48b64" strokeWidth="5.2" strokeLinecap="round" />
        <path d="M6 48 C8 40 32 40 34 50 C34 74 32 92 28 104 L12 104 C8 88 6 68 6 48 Z" fill="#1f4e9a" />
        <path d="M34 58 C42 68 40 80 34 86" fill="none" stroke="#1f4e9a" strokeWidth="7.5" strokeLinecap="round" />
        <path d="M34 86 L40 96" fill="none" stroke="#c48b64" strokeWidth="4.8" strokeLinecap="round" />
        <rect x="38" y="90" width="8" height="14" rx="1.6" fill="#eef3f7" stroke="#9aa7b5" strokeWidth="0.8" />
        <path d="M8 104 C6 126 10 140 12 142 L20 142 L20 104 Z" fill="#33406c" />
        <path d="M20 104 C22 126 26 140 28 142 L36 142 L34 104 Z" fill="#2a365c" />
        <ellipse cx="14" cy="142" rx="6.5" ry="2.6" fill="#1d2648" />
        <ellipse cx="30" cy="142" rx="6.5" ry="2.6" fill="#1d2648" />
      </g>
    </svg>
  )
}
