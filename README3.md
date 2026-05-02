# Graphika Frontend Refresh

Last updated: May 2, 2026

## Goal

Refresh Graphika with a mobile-first editorial dark theme inspired by Journey Digital: stark black surfaces, warm off-white text, compact bracketed labels, restrained lime/cream accents, and motion that supports navigation without distracting from reading.

## What Changed

### Single dark theme

- Removed the light-mode UI path from the header.
- Removed the light theme CSS branch from `app/globals.css`.
- The app now clears any old stored `theme` value and removes the `light` class on load.

### Design system

- Reworked `app/globals.css` around a single dark palette:
  - Base: near-black
  - Text: warm paper/off-white
  - Accent: muted lime
  - Secondary: warm cream
  - Highlight: soft mint
- Reduced the earlier neon purple/blue styling across shared screens.
- Added an `editorial-label` utility for Journey-style bracket labels.
- Tightened glass panels and card radius to feel more editorial and less bubbly.

### Mobile-first UI polish

- Header now has a quieter transparent-to-solid scroll state.
- Hero card is darker, tighter, and less visually noisy.
- Manga cards use stronger reading contrast and more restrained overlays.
- Bottom navigation and desktop sidebar use the new accent system.
- Bottom sheets use a darker, cleaner panel treatment.
- Search, detail, library, chapter picker, reader controls, and error states now use the new palette.

### Scrollbars

- Added custom global scrollbars for desktop and slim mobile scrollbars.
- Horizontal snap rows hide their scrollbar while retaining touch-friendly scrolling.
- Filter sheets avoid the extra outer scrollbar; only the meaningful inner filter areas scroll.

### Form controls

- Styled native checkboxes, radio buttons, number inputs, selects, and range sliders to match the dark editorial theme.
- Green accent buttons use dark text for contrast.
- Active navigation items use a larger glassy rounded-square state instead of a tight circle.

### Motion

- Kept existing Framer Motion transitions, but made hero/header motion softer.
- Added `prefers-reduced-motion` handling so animations reduce automatically for users who request it.
- Reader controls remain functional and non-invasive for long reading sessions.

## Key Files

| File | Change |
|------|--------|
| `app/globals.css` | New dark-only design tokens, scrollbar styling, reduced-motion support |
| `components/Header.tsx` | Removed light toggle, added scroll-aware editorial header |
| `components/HeroSection.tsx` | Rebuilt hero treatment around the new theme |
| `components/MangaCard.tsx` | Updated card overlays and badges |
| `components/BottomNav.tsx` | Rethemed mobile nav and desktop sidebar |
| `components/BottomSheet.tsx` | Cleaner dark modal/sheet style |
| `app/search/search-content.tsx` | Rethemed filter/search accents |
| `app/library/page.tsx` | Rethemed empty state, sort pills, and remove sheet |
| `app/manga/[id]/page.tsx` | Rethemed detail CTAs and badges |
| `app/manga/[id]/read/page.tsx` | Rethemed reader controls and settings |

## Notes

- The refresh is visual only; the data, linking, chapter aggregation, and reader pipeline are unchanged.
- The site remains optimized around phone usage first, with desktop layout support preserved.
