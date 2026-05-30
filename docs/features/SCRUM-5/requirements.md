# Requirements — SCRUM-5: Add Responsive Mobile Layout Support to Vyasa UI

## Status: Draft

---

## Problem Statement

Mobile users accessing the Vyasa Intelligence chat interface at `d2j5xbveesoc8s.cloudfront.net` (dev) and `vyasa.nshinde.xyz` (production) encounter a desktop-only layout that renders poorly on screens narrower than 768px: the fixed 264px sidebar consumes the majority of the viewport, suggestion chips overflow horizontally, and interactive touch targets fall below the 44×44px minimum recommended by WCAG and Apple/Google HIG guidelines. This prevents adoption from on-the-go users who want to query the Mahabharata knowledge base on phones and tablets, limiting the reach of the Vyasa product beyond desktop contexts.

---

## User Stories

- As a **mobile user**, I want the Vyasa chat interface to adapt to my screen size so that I can comfortably read and type messages on my phone without horizontal scrolling or overlapping elements.
- As a **mobile user**, I want the session sidebar to appear as a slide-over drawer (not always visible) so that the full viewport width is available for the chat conversation.
- As a **tablet user**, I want the layout to gracefully transition between mobile and desktop behaviours at appropriate breakpoints so that I get an optimised experience on both orientations.
- As **any user**, I want all interactive elements (buttons, suggestion chips, textarea) to have touch targets of at least 44×44px so that I can tap them accurately without misfire.

---

## Acceptance Criteria

1. **Given** a viewport width < 768px **when** the application loads **then** the session sidebar is hidden by default and a hamburger/toggle button is visible in the header, allowing the user to open the sidebar as a modal overlay or slide-over drawer.

2. **Given** a viewport width < 768px **and** the sidebar drawer is open **when** the user taps outside the sidebar area or selects any session from the list **then** the sidebar closes automatically and the chat area returns to full viewport width.

3. **Given** a viewport width < 768px **when** viewing the chat conversation **then** message bubbles use a maximum width of 90% of the viewport and the chat input area spans the full viewport width with appropriate horizontal padding.

4. **Given** a viewport width < 768px **when** the suggestion chips (quick-start prompts) are displayed in ChatInput **then** the chips scroll horizontally in a single row or wrap to a maximum of two rows without overflowing or causing horizontal scroll on the page.

5. **Given** any viewport width **when** interactive elements (buttons, suggestion chips, textarea) are rendered **then** every touch target is at minimum 44×44px in hit area.

6. **Given** a viewport width ≥ 768px **when** the application loads **then** the current desktop layout with the persistent sidebar is preserved exactly as it was before this change — no visual regressions on desktop.

7. **Given** a viewport width < 768px **when** the soft keyboard opens on iOS or Android **then** the chat input field remains visible above the keyboard and the message list scrolls correctly without a layout jump or the input being obscured.

---

## Constraints

- **Styling**: Must use TailwindCSS utility classes exclusively — no CSS modules, styled-components, or inline style objects (per `apps/vyasa-ui/CLAUDE.md` code conventions and root `CLAUDE.md` standards).
- **Breakpoints**: Must use Tailwind's standard responsive breakpoints only (`sm: 640px`, `md: 768px`, `lg: 1024px`) — no `tailwind.config.js` `extend.screens` additions.
- **Component architecture**: Must remain React 18 functional-component-only with hooks — no class components introduced.
- **Dependencies**: No new npm packages for responsive behaviour (no headless UI, no Radix drawer, no framer-motion) — implement with Tailwind utility classes and React `useState`/`useEffect` state management.
- **Lighthouse**: The production build must achieve a Lighthouse mobile accessibility score ≥ 90 (enforced by `pr-checks.yml` CI workflow).
- **Regression**: All existing unit tests and the current desktop UX must continue to pass unchanged after this change is merged.
- **Viewport meta**: `index.html` must include `<meta name="viewport" content="width=device-width, initial-scale=1">` — verify before implementation.
- **Tailwind version**: TailwindCSS 3 is in use — `h-dvh` / dynamic viewport height utilities are available (Tailwind 3.4+); use these for iOS Safari address-bar–safe full-height layouts instead of `100vh`.
- **Animation**: Any sidebar slide-in animation must use `transform: translateX()` (GPU-accelerated) via Tailwind `translate-x` utilities to maintain 60fps on mobile hardware.

---

## Edge Cases

1. **Device rotation mid-conversation**: When the user rotates from portrait to landscape (or vice versa), the layout must reflow to the correct breakpoint state without losing scroll position in the message list or clearing text already typed in the input field.

2. **iOS Safari dynamic viewport height**: On iOS Safari, the address bar dynamically resizes the viewport when the user scrolls, and the soft keyboard shrinks the visual viewport when open. The chat input must remain anchored at the bottom of the visual viewport and not be obscured — use `dvh` / `svh` units rather than `100vh` to handle this.

3. **Very small screens (320px — iPhone SE 1st gen)**: All content must remain accessible and functional at 320px viewport width; no horizontal scrollbar must appear on the main layout. Message text must break correctly (`break-words`) and suggestion chips must not overflow beyond the viewport edge.

4. **Long messages on mobile**: A message containing a very long unbroken string (URL, code snippet, or continuous text) must not cause horizontal overflow. `whitespace-pre-wrap` combined with `break-words` (or `overflow-wrap: break-word`) must prevent any horizontal scroll in the message area.

5. **Pull-to-refresh interaction**: On mobile browsers that support pull-to-refresh (Chrome Android, Safari iOS), the gesture must not conflict with or interrupt the chat message list's normal vertical scroll behaviour. Overscroll behaviour in the message container should be contained.

---

## Out of Scope

- Native mobile app or PWA capabilities (service worker, offline mode, add-to-home-screen install prompts).
- Tablet-specific multi-pane layouts (e.g. iPad split-view with sidebar and chat simultaneously visible below a larger breakpoint).
- Dark mode or any theming changes.
- Performance optimisations for low-end mobile devices (image lazy-loading, bundle splitting, etc.).
- Touch gesture navigation (swipe-to-open sidebar, swipe-to-delete session).
- Mobile-specific onboarding, tutorial screens, or empty-state illustrations.
- Changes to `vyasa-rag-service` backend or any AWS infrastructure (`infra/`).
- Custom domain or CDN configuration changes (covered by ADR-012).
- Any changes to `libs/shared-types/` or `libs/testing-utils/`.

---

## Affected Services

- **`apps/vyasa-ui/`** — All responsive changes are contained within this service:
  - `src/App.tsx` — Add responsive sidebar visibility logic: persistent on desktop (`md:` and above), hidden by default on mobile with a toggle button in the header.
  - `src/components/SessionSidebar.tsx` — Convert to a conditional overlay/drawer on mobile with a backdrop; retain current persistent behaviour on desktop.
  - `src/components/ChatInput.tsx` — Adjust suggestion chip layout to scroll horizontally or wrap (max 2 rows) on mobile; ensure textarea and send button meet 44×44px touch-target requirement.
  - `src/components/MessageBubble.tsx` — Adjust `max-w-*` to `max-w-[90%]` on mobile viewports; add `break-words` to prevent horizontal overflow.
  - `src/components/ChatPage.tsx` — Ensure message-list scroll container uses dynamic viewport height units (`h-dvh` or `min-h-svh`) so the iOS Safari soft keyboard does not obscure the input.
  - `tailwind.config.js` — May require additional animation keyframes (e.g. `slide-in-left`) for the drawer transition if not expressible with built-in Tailwind utilities alone.
  - `index.html` — Verify the `viewport` meta tag is correctly set to `width=device-width, initial-scale=1`.

---

## Design Decisions

### Q1: Sidebar drawer direction

Should the mobile sidebar drawer slide in from the left or slide up from the bottom?
Option1: Left slide-in — matching desktop position, preserving muscle memory
Option2: Bottom sheet — more native mobile pattern common in iOS/Android apps
**Recommendation**: Left slide-in — preserves muscle memory and stays consistent with the desktop layout.
Decision: Left slide-in

### Q2: Suggestion chip count on mobile

Should all four quick-start suggestion chips be shown in a horizontally scrollable strip, or reduced to two on mobile?
Option1: Horizontal scroll — all chips visible
Option2: Reduce to two chips on mobile to minimise vertical space and cognitive load
**Recommendation**: Horizontal scroll — maintains full feature parity with desktop; off-screen chips discoverable via scroll affordance.
Decision: Horizontal scroll — all chips visible

### Q3: iOS safe-area bottom inset

Should the chat input area account for the iOS home indicator safe area using `env(safe-area-inset-bottom)` padding?
Option1: Apply — prevents send button from sitting behind the home indicator on iPhone X and later
Option2: Skip — simpler implementation but degrades UX on modern iPhones
**Recommendation**: Apply — a targeted one-line CSS addition that prevents a known iOS UX pitfall with minimal added complexity.
Decision: Apply
