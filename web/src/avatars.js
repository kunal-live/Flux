// ==========================================================================
// FLUX CARTOON AVATARS — Luxury Obsidian & Gold Vector Characters
// Provides 8 unique, high-detail cartoon character avatars for device identity.
// ==========================================================================

export const AVATARS = [
  {
    id: "dog",
    name: "Astro Dog",
    tagline: "Space explorer pup",
    primaryColor: "#00A3FF",
    svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="dog-helmet" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stop-color="#2D3748" />
          <stop offset="85%" stop-color="#111625" />
          <stop offset="100%" stop-color="#080C14" />
        </radialGradient>
        <linearGradient id="dog-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#38BDF8" />
          <stop offset="100%" stop-color="#00A3FF" />
        </linearGradient>
        <linearGradient id="dog-visor" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.9" />
          <stop offset="100%" stop-color="#0284C7" stop-opacity="0.7" />
        </linearGradient>
      </defs>
      <!-- Helmet Outer Ring -->
      <circle cx="50" cy="50" r="46" fill="url(#dog-helmet)" stroke="url(#dog-gold)" stroke-width="2.5"/>
      <circle cx="50" cy="50" r="40" stroke="rgba(0, 163, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 3"/>
      <!-- Dog Ears (Outside Helmet) -->
      <path d="M18 28 C12 12, 28 8, 34 20" fill="#E29547" stroke="url(#dog-gold)" stroke-width="2" stroke-linecap="round"/>
      <path d="M82 28 C88 12, 72 8, 66 20" fill="#E29547" stroke="url(#dog-gold)" stroke-width="2" stroke-linecap="round"/>
      <path d="M22 25 C18 16, 26 14, 30 20" fill="#FDBA74"/>
      <path d="M78 25 C82 16, 74 14, 70 20" fill="#FDBA74"/>
      <!-- Dog Head -->
      <circle cx="50" cy="52" r="26" fill="#FDBA74"/>
      <ellipse cx="50" cy="58" rx="17" ry="13" fill="#FFFBEB"/>
      <!-- Golden Astronaut Patches on Cheeks -->
      <circle cx="35" cy="58" r="4" fill="#00A3FF" fill-opacity="0.3"/>
      <circle cx="65" cy="58" r="4" fill="#00A3FF" fill-opacity="0.3"/>
      <!-- Friendly Dog Eyes -->
      <circle cx="41" cy="46" r="4.5" fill="#0F172A"/>
      <circle cx="59" cy="46" r="4.5" fill="#0F172A"/>
      <circle cx="43" cy="44.5" r="1.6" fill="#FFFFFF"/>
      <circle cx="61" cy="44.5" r="1.6" fill="#FFFFFF"/>
      <!-- Cute Dog Nose -->
      <ellipse cx="50" cy="54" rx="4" ry="2.8" fill="#1E293B"/>
      <ellipse cx="49" cy="53" rx="1.2" ry="0.8" fill="#64748B"/>
      <!-- Happy Mouth -->
      <path d="M47 57 Q50 60 53 57" stroke="#1E293B" stroke-width="1.8" stroke-linecap="round" fill="none"/>
      <!-- Visor Reflection Arc -->
      <path d="M26 36 Q50 24 74 36" stroke="url(#dog-visor)" stroke-width="3" stroke-linecap="round" fill="none"/>
      <circle cx="71" cy="38" r="2" fill="#38BDF8"/>
      <!-- Astronaut Collar Badge -->
      <rect x="42" y="74" width="16" height="5" rx="2.5" fill="url(#dog-gold)"/>
      <circle cx="50" cy="76.5" r="1.5" fill="#0F172A"/>
    </svg>`
  },
  {
    id: "cat",
    name: "Cyber Cat",
    tagline: "Neon tech kitty",
    primaryColor: "#38BDF8",
    svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="cat-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#1E1B4B" />
          <stop offset="100%" stop-color="#090514" />
        </radialGradient>
        <linearGradient id="cat-neon" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#38BDF8" />
          <stop offset="100%" stop-color="#818CF8" />
        </linearGradient>
        <linearGradient id="cat-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#38BDF8" />
          <stop offset="100%" stop-color="#00A3FF" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#cat-bg)" stroke="url(#cat-neon)" stroke-width="2.5"/>
      <!-- Pointy Cat Ears -->
      <polygon points="26,44 14,14 42,28" fill="#4338CA" stroke="url(#cat-neon)" stroke-width="2"/>
      <polygon points="74,44 86,14 58,28" fill="#4338CA" stroke="url(#cat-neon)" stroke-width="2"/>
      <polygon points="27,39 20,21 38,29" fill="#F472B6"/>
      <polygon points="73,39 80,21 62,29" fill="#F472B6"/>
      <!-- Cat Head -->
      <circle cx="50" cy="54" r="26" fill="#312E81"/>
      <ellipse cx="50" cy="62" rx="16" ry="12" fill="#4338CA"/>
      <!-- Neon Cyber Visor Sunglasses -->
      <polygon points="28,45 72,45 68,55 32,55" fill="url(#cat-neon)" stroke="url(#cat-gold)" stroke-width="1.8"/>
      <line x1="33" y1="48" x2="67" y2="48" stroke="#FFFFFF" stroke-width="1" stroke-linecap="round"/>
      <line x1="36" y1="52" x2="64" y2="52" stroke="#FFFFFF" stroke-width="0.8" stroke-dasharray="2 2"/>
      <!-- Tiny Pink Nose -->
      <polygon points="50,61 47,58 53,58" fill="#F472B6"/>
      <!-- Cute Mouth -->
      <path d="M47 62 Q50 65 50 62 Q50 65 53 62" stroke="#A5B4FC" stroke-width="1.5" stroke-linecap="round" fill="none"/>
      <!-- Whiskers -->
      <line x1="20" y1="60" x2="33" y2="61" stroke="url(#cat-neon)" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="22" y1="65" x2="34" y2="64" stroke="url(#cat-neon)" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="80" y1="60" x2="67" y2="61" stroke="url(#cat-neon)" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="78" y1="65" x2="66" y2="64" stroke="url(#cat-neon)" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: "fox",
    name: "Neon Fox",
    tagline: "Cyberpunk golden fox",
    primaryColor: "#FB923C",
    svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="fox-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#311505" />
          <stop offset="100%" stop-color="#120600" />
        </radialGradient>
        <linearGradient id="fox-orange" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FB923C" />
          <stop offset="100%" stop-color="#EA580C" />
        </linearGradient>
        <linearGradient id="fox-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#38BDF8" />
          <stop offset="100%" stop-color="#00A3FF" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#fox-bg)" stroke="url(#fox-gold)" stroke-width="2.5"/>
      <!-- Fox Large Ears -->
      <polygon points="26,45 10,12 40,24" fill="url(#fox-orange)" stroke="url(#fox-gold)" stroke-width="1.8"/>
      <polygon points="74,45 90,12 60,24" fill="url(#fox-orange)" stroke="url(#fox-gold)" stroke-width="1.8"/>
      <polygon points="27,38 18,20 36,27" fill="#18181B"/>
      <polygon points="73,38 82,20 64,27" fill="#18181B"/>
      <!-- Fox Face -->
      <path d="M26 44 C26 68 50 78 50 78 C50 78 74 68 74 44 C74 34 62 38 50 38 C38 38 26 34 26 44 Z" fill="url(#fox-orange)"/>
      <path d="M30 48 C30 68 50 78 50 78 C50 78 40 64 36 50 Z" fill="#FFFBEB"/>
      <path d="M70 48 C70 68 50 78 50 78 C50 78 60 64 64 50 Z" fill="#FFFBEB"/>
      <!-- Fox Cyber Eyes -->
      <ellipse cx="40" cy="48" rx="4" ry="5" fill="#10B981"/>
      <ellipse cx="60" cy="48" rx="4" ry="5" fill="#10B981"/>
      <circle cx="41" cy="46" r="1.5" fill="#FFFFFF"/>
      <circle cx="61" cy="46" r="1.5" fill="#FFFFFF"/>
      <!-- Cyber Brow Lines -->
      <path d="M35 41 L45 43" stroke="#00A3FF" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M65 41 L55 43" stroke="#00A3FF" stroke-width="1.8" stroke-linecap="round"/>
      <!-- Dark Nose -->
      <polygon points="50,75 46,70 54,70" fill="#18181B"/>
      <!-- Forehead Cyber Diamond -->
      <polygon points="50,33 53,38 50,43 47,38" fill="url(#fox-gold)"/>
    </svg>`
  },
  {
    id: "owl",
    name: "Quantum Owl",
    tagline: "Steampunk luminous owl",
    primaryColor: "#A855F7",
    svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="owl-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#2E1065" />
          <stop offset="100%" stop-color="#0F051D" />
        </radialGradient>
        <linearGradient id="owl-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#38BDF8" />
          <stop offset="100%" stop-color="#00A3FF" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#owl-bg)" stroke="url(#owl-gold)" stroke-width="2.5"/>
      <!-- Owl Feather Tufts -->
      <path d="M32 25 C22 15 28 35 34 40" fill="#581C87" stroke="url(#owl-gold)" stroke-width="2"/>
      <path d="M68 25 C78 15 72 35 66 40" fill="#581C87" stroke="url(#owl-gold)" stroke-width="2"/>
      <!-- Head -->
      <ellipse cx="50" cy="52" rx="27" ry="24" fill="#3B0764"/>
      <!-- Giant Spectacles / Quantum Goggles -->
      <circle cx="39" cy="50" r="12" fill="#1E1B4B" stroke="url(#owl-gold)" stroke-width="2.5"/>
      <circle cx="61" cy="50" r="12" fill="#1E1B4B" stroke="url(#owl-gold)" stroke-width="2.5"/>
      <line x1="51" y1="50" x2="49" y2="50" stroke="url(#owl-gold)" stroke-width="3"/>
      <!-- Glowing Purple Eyes -->
      <circle cx="39" cy="50" r="6" fill="#C084FC"/>
      <circle cx="61" cy="50" r="6" fill="#C084FC"/>
      <circle cx="41" cy="48" r="2" fill="#FFFFFF"/>
      <circle cx="63" cy="48" r="2" fill="#FFFFFF"/>
      <!-- Beak -->
      <polygon points="50,65 46,55 54,55" fill="url(#owl-gold)"/>
      <!-- Chest Feathers Pattern -->
      <path d="M44 68 Q50 71 56 68" stroke="#9333EA" stroke-width="2" stroke-linecap="round" fill="none"/>
      <path d="M42 73 Q50 76 58 73" stroke="#9333EA" stroke-width="2" stroke-linecap="round" fill="none"/>
    </svg>`
  },
  {
    id: "panda",
    name: "Robo Panda",
    tagline: "Futuristic bamboo bot",
    primaryColor: "#10B981",
    svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="panda-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#064E3B" />
          <stop offset="100%" stop-color="#021E17" />
        </radialGradient>
        <linearGradient id="panda-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#38BDF8" />
          <stop offset="100%" stop-color="#00A3FF" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#panda-bg)" stroke="#10B981" stroke-width="2.5"/>
      <!-- Panda Black Ears with Neon Rings -->
      <circle cx="27" cy="30" r="11" fill="#0F172A" stroke="#10B981" stroke-width="1.8"/>
      <circle cx="73" cy="30" r="11" fill="#0F172A" stroke="#10B981" stroke-width="1.8"/>
      <!-- Head Base -->
      <circle cx="50" cy="54" r="26" fill="#F8FAFC"/>
      <!-- Eye Patches -->
      <ellipse cx="38" cy="50" rx="8" ry="10" fill="#0F172A" transform="rotate(-15 38 50)"/>
      <ellipse cx="62" cy="50" rx="8" ry="10" fill="#0F172A" transform="rotate(15 62 50)"/>
      <!-- Glowing Emerald Eyes -->
      <circle cx="39" cy="50" r="3.5" fill="#34D399"/>
      <circle cx="61" cy="50" r="3.5" fill="#34D399"/>
      <circle cx="40" cy="49" r="1.2" fill="#FFFFFF"/>
      <circle cx="62" cy="49" r="1.2" fill="#FFFFFF"/>
      <!-- Nose & Mouth -->
      <ellipse cx="50" cy="59" rx="4.5" ry="3" fill="#0F172A"/>
      <path d="M47 64 Q50 67 53 64" stroke="#0F172A" stroke-width="1.8" stroke-linecap="round" fill="none"/>
      <!-- Antenna Bamboo on Top -->
      <line x1="50" y1="28" x2="50" y2="16" stroke="url(#panda-gold)" stroke-width="2" stroke-linecap="round"/>
      <circle cx="50" cy="14" r="4" fill="#10B981" stroke="url(#panda-gold)" stroke-width="1.5"/>
      <circle cx="50" cy="14" r="1.5" fill="#FFFFFF"/>
    </svg>`
  },
  {
    id: "tiger",
    name: "Thunder Tiger",
    tagline: "Electric cyber tiger",
    primaryColor: "#F59E0B",
    svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="tiger-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#451A03" />
          <stop offset="100%" stop-color="#1A0700" />
        </radialGradient>
        <linearGradient id="tiger-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FCD34D" />
          <stop offset="100%" stop-color="#D97706" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#tiger-bg)" stroke="#F59E0B" stroke-width="2.5"/>
      <!-- Tiger Round Ears -->
      <circle cx="28" cy="30" r="10" fill="#D97706" stroke="#FCD34D" stroke-width="1.8"/>
      <circle cx="72" cy="30" r="10" fill="#D97706" stroke="#FCD34D" stroke-width="1.8"/>
      <circle cx="28" cy="30" r="5" fill="#18181B"/>
      <circle cx="72" cy="30" r="5" fill="#18181B"/>
      <!-- Tiger Head -->
      <circle cx="50" cy="54" r="26" fill="url(#tiger-gold)"/>
      <ellipse cx="50" cy="64" rx="14" ry="10" fill="#FFFBEB"/>
      <!-- Forehead Stripes (Thunder Bolts) -->
      <polygon points="50,34 52,42 48,42" fill="#18181B"/>
      <polygon points="43,36 46,43 42,44" fill="#18181B"/>
      <polygon points="57,36 54,43 58,44" fill="#18181B"/>
      <!-- Cheek Stripes -->
      <polygon points="26,52 33,54 27,56" fill="#18181B"/>
      <polygon points="74,52 67,54 73,56" fill="#18181B"/>
      <!-- Fierce Cute Eyes -->
      <circle cx="40" cy="50" r="4" fill="#18181B"/>
      <circle cx="60" cy="50" r="4" fill="#18181B"/>
      <circle cx="41.5" cy="48.5" r="1.5" fill="#FDE047"/>
      <circle cx="61.5" cy="48.5" r="1.5" fill="#FDE047"/>
      <!-- Nose & Mouth -->
      <polygon points="50,60 46,56 54,56" fill="#F43F5E"/>
      <path d="M46 62 Q50 65 54 62" stroke="#18181B" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    </svg>`
  },
  {
    id: "dragon",
    name: "Gold Dragon",
    tagline: "Mythic flux guardian",
    primaryColor: "#EAB308",
    svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="drag-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#3A2E05" />
          <stop offset="100%" stop-color="#140E00" />
        </radialGradient>
        <linearGradient id="drag-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FEF08A" />
          <stop offset="50%" stop-color="#00A3FF" />
          <stop offset="100%" stop-color="#B45309" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#drag-bg)" stroke="url(#drag-gold)" stroke-width="2.5"/>
      <!-- Dragon Horns -->
      <path d="M34 32 C26 12 16 16 12 24 C18 28 28 34 34 38" fill="url(#drag-gold)"/>
      <path d="M66 32 C74 12 84 16 88 24 C82 28 72 34 66 38" fill="url(#drag-gold)"/>
      <!-- Dragon Head -->
      <path d="M30 46 C30 32 70 32 70 46 C70 66 58 74 50 74 C42 74 30 66 30 46 Z" fill="#047857"/>
      <!-- Golden Scale Crest -->
      <polygon points="50,28 53,36 47,36" fill="url(#drag-gold)"/>
      <polygon points="50,38 54,46 46,46" fill="url(#drag-gold)"/>
      <!-- Golden Snout -->
      <ellipse cx="50" cy="62" rx="14" ry="9" fill="#065F46"/>
      <!-- Fiery Eyes -->
      <circle cx="41" cy="46" r="4.5" fill="#FEF08A"/>
      <circle cx="59" cy="46" r="4.5" fill="#FEF08A"/>
      <line x1="41" y1="43" x2="41" y2="49" stroke="#991B1B" stroke-width="2"/>
      <line x1="59" y1="43" x2="59" y2="49" stroke="#991B1B" stroke-width="2"/>
      <!-- Nostrils -->
      <circle cx="46" cy="62" r="1.5" fill="#022C22"/>
      <circle cx="54" cy="62" r="1.5" fill="#022C22"/>
      <!-- Tiny Fire Spark -->
      <path d="M50 68 Q52 72 50 75 Q48 72 50 68" fill="#F97316"/>
    </svg>`
  },
  {
    id: "bunny",
    name: "Cosmic Bunny",
    tagline: "High-speed space rabbit",
    primaryColor: "#EC4899",
    svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bunny-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#500724" />
          <stop offset="100%" stop-color="#19020B" />
        </radialGradient>
        <linearGradient id="bunny-pink" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#F472B6" />
          <stop offset="100%" stop-color="#DB2777" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#bunny-bg)" stroke="#EC4899" stroke-width="2.5"/>
      <!-- Bunny Long Ears with Star Tips -->
      <ellipse cx="36" cy="24" rx="7" ry="18" fill="#FDF2F8" stroke="#EC4899" stroke-width="1.8" transform="rotate(-8 36 24)"/>
      <ellipse cx="64" cy="24" rx="7" ry="18" fill="#FDF2F8" stroke="#EC4899" stroke-width="1.8" transform="rotate(8 64 24)"/>
      <ellipse cx="36" cy="25" rx="3.5" ry="12" fill="url(#bunny-pink)" transform="rotate(-8 36 25)"/>
      <ellipse cx="64" cy="25" rx="3.5" ry="12" fill="url(#bunny-pink)" transform="rotate(8 64 25)"/>
      <!-- Star on Ear -->
      <polygon points="36,8 37,11 40,11 38,13 39,16 36,14 33,16 34,13 32,11 35,11" fill="#FDE047"/>
      <!-- Bunny Head -->
      <circle cx="50" cy="58" r="24" fill="#FDF2F8"/>
      <!-- Rosy Cheeks -->
      <circle cx="34" cy="62" r="4" fill="#FBCFE8"/>
      <circle cx="66" cy="62" r="4" fill="#FBCFE8"/>
      <!-- Big Sparkling Eyes -->
      <circle cx="41" cy="54" r="4.5" fill="#18181B"/>
      <circle cx="59" cy="54" r="4.5" fill="#18181B"/>
      <circle cx="42.5" cy="52.5" r="1.8" fill="#FFFFFF"/>
      <circle cx="60.5" cy="52.5" r="1.8" fill="#FFFFFF"/>
      <!-- Cute Bunny Nose & Mouth -->
      <polygon points="50,60 48,58 52,58" fill="#EC4899"/>
      <path d="M47 62 Q50 64 53 62" stroke="#18181B" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    </svg>`
  }
];

export function getAvatarById(id) {
  return AVATARS.find((a) => a.id === id) || AVATARS[0];
}

export function getAvatarSvg(id, size = 48) {
  const av = getAvatarById(id);
  return av.svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
}
