# Barbell Labs — Session Brief (Save Point)
**Last updated:** 2026-05-13 · **Version:** 2.7.0 · **Workout safety bundle merged (PR #61). `fix-batch-49` open with #97 — Warm-up + drop set support (data model, UI, analytics, CSV, history). Real-device test for #226 still pending.**

> ✅ **Pre-commit version-bump hook is now in the repo** via Husky (`fix-batch-50`, #227 closed). Auto-installs on `npm install`. Auto-bumps patch + APP_VERSION + BUILD_DATE on every commit, skips if user manually bumped. Cross-machine consistency restored.

This file is a handoff doc for continuing the Barbell Labs build in a new Claude conversation. Paste the **"Prompt for new Claude session"** block at the bottom into the new chat as your first message.

---

## Who / what

- **User:** Brian (`bhare8249-wq` on GitHub, `bhare8249@gmail.com`). Solo founder. Building toward gym app → clothing → supplements, Gymshark-scale brand ambition.
- **Project:** Barbell Labs — a React gym-tracking app currently in pre-launch polish.
- **Stack:** Create React App + React 19, Firebase (auth/Firestore/Analytics), Capacitor for iOS/Android wrappers, deployed on Vercel.
- **Repo:** https://github.com/bhare8249-wq/barbelllabs
- **Production URL:** https://gymtrack-frontend-three.vercel.app
- **Domain (future primary):** www.barbelllabs.ca
- **Parallel work:** React Native Expo migration in progress (separate project, `GymTrackApp`).
- **Main file:** `src/App.jsx` (~5,200 lines, intentionally single-file).
- **Help content:** `src/helpContent.js`
- **Firebase wiring:** `src/firebase.js`

## Status by fix # (master list now 107 items as of 2026-04-25 sync)

| # | Status | Notes |
|---|---|---|
| 1, 2 | ✅ | theme-color, 100dvh |
| 3, 4, 5 | ✅ | login fit, Apple demoted, trust footer; **Apple sign-in itself deferred** |
| 6 | ✅ | top-right actions + Profile gear consolidation |
| 7 | ✅ | notification bell + client-side gen (PR / streak / nudge) |
| 8 | ✅ | log header overflow → ⋯ Tools menu |
| 9 | ✅ | smart template names + top-3 + recent-exercise pills (pills later removed) |
| 10 | ✅ | swipe-to-delete templates; **swipe-right Rename + Log inline templates deferred** |
| 11 | ✅ | sticky date headers + month jump |
| 12 | ✅ | 10-program library; **paywall + progression deferred** |
| 13, 14 | ✅ | set row delete + swipe; notes placeholder shortened |
| 15, 16 | ✅ | filter pills polish + Steel-Blue palette refresh |
| 17, 19, 20, 21 | ✅ | tags during log + auto-suggest + cap 5 + history compact (tag editor later removed from Log; auto-applied on Finish) |
| 18 | ✅ | custom tags + Manage Tags screen |
| 22 | ✅ | History search + custom date range + 90D |
| 23, 24, 25 | ✅ | duration display; export relocation; CSV correctness |
| 26 | ❌ | export premium — waits on #70 paywall |
| 27, 28, 29, 30, 31 | ✅ | help refresh; onboarding tour; centralized help; tappable version; emojis |
| 32 | ❌ | custom icon system — design call deferred |
| 33 | ✅ | single-point chart (already shipped) |
| 34, 37 | ✅ | chart axis labels + reps delta; tappable Not-Logged cards |
| 35 | ✅ | same-day sessions (already handled) |
| 36 | ⚠️ | Top Lifts customization works, **unlimited slots deferred** |
| 38 | ❌ | muscle group bar colors — design call |
| 39 | ❌ | Progress analytics (tonnage / heatmap / standards / streaks) — huge feature |
| 40 | ❌ | Progress freemium wall — waits on #70 |
| 41 | ✅ | avatar Google pull; **upload deferred** |
| 42, 43, 44, 47 | ✅ | remove duplicate email; goal color (red→amber); sign out gray; city disambiguation |
| 45, 52, 57 | ✅ | delete account + email security + password forgot; **soft-delete + alert old email + force-sign-out deferred** |
| 46 | ✅ | sex/experience/training-location/units pref; **bodyfat + real unit conversion deferred** |
| 48, 53, 54, 55 | ✅ | lifetime stats; validation; save toast; theme tri-option |
| 49 | ✅ | bodyweight: historical entry + goal weight + trend + range picker |
| 50 | ❌ | body measurements — premium, waits on #70 |
| 51 | ❌ | social share — post-launch |
| 56 | ⚠️ | settings panel — main sections done; **notifications/quiet-hours/integrations/language deferred** |
| 58, 78, 81, 82 | ✅ | close-button consistency; keyboard UX; 1RM formula picker; RPE/RIR toggle |
| 59 | ❌ | biometric / 2FA / device mgmt — post-v1 |
| 60, 61, 62, 63 | ✅ | privacy/terms links; cookie banner; age gate (13+); support contact |
| 64 | ❌ | App Store listing assets — not code |
| 65 | ❌ | offline mode — large |
| 66 | ✅ | JSON backup + restore |
| 67 | ❌ | Sentry / crash reporting — needs DSN |
| 68 | ❌ | loading/empty/error state audit — not started |
| 69 | ✅ | optimistic UI Finish Workout + sync error retry banner + offline indicator (PR #43) |
| 70 | ❌ | paywall — large, central to monetization |
| 71-75 | ❌ | growth infra (free trial / referral / A-B / analytics / session recordings) |
| 76, 77 | ✅ | haptic audit; sound effects toggle |
| 79, 84 | ✅ | plate calc custom plates; warmup generator |
| 80 | ✅ | rest timer robustness — timestamp-based, localStorage persisted, visibility-change catch-up, pause/resume bug fixed (PR #46). **Note:** native iOS/Android notifications via `@capacitor/local-notifications` deferred — web Service Worker notif works inside Capacitor shell, native plugin only needed if App Store review flags it. |
| 83 | ❌ | form videos/GIFs — premium |
| 85 | ❌ | public profile / share link — post-v1 |
| 86–94 | ❌ | post-launch / marketing / content / brand |
| 95 | ✅ | Log search auto-focus removed (covered by PR #45 — verified no other Log-tab search input exists) |
| 96 | ❌ | Plate calculator visualization rebuild — proper plate ordering / mirroring / proportional sizing / colors / responsive scaling. **Merges with parts of #79.** Dedicated session. |
| 97 | ❌ | Warm-up + drop sets — adds `type` field on set objects (`working` / `warmup` / `dropset`). Analytics rules: PRs use working only; tonnage = working+drop; muscle counts exclude warm-ups. CSV gets Set Type column. Dedicated session — touches data model + analytics + UI + History + CSV. |
| 98 | ✅ | Toast positioning standardized via shared `TOAST_BOTTOM` const (PR #47). Clears Sign Out button cleanly. |
| 99 | ❌ | Bodyweight trend indicator goal-aware (Build/Maintain → down=warning amber up=positive green; Cut → reversed; Strength → neutral). Auto-softens on distress signals. |
| 100 | ⚠️ | Firebase cloud sync bug on new account creation — partially mitigated by #43 offline + sync error banners. Full fix deferred. Promote when cross-device beta starts. |
| 101 | ❌ | "Dros Mode" — opt-in 18+ NSFW alt-tone Easter egg, 3 tiers (Lite/Classic/Unhinged), strict guardrails (no body shaming / no PED mentions / auto-soften on distress). Architecture: `src/copy/tones.js` + `useToneCopy(key, params)` hook. Defer to closer to launch. |
| 102 | ✅ | Cookie consent: versioned localStorage key + Firestore mirror + cross-device sync + Settings → Manage Cookie Preferences withdraw button + auto-migration from legacy unversioned key (PR #47). |
| 103 | ✅ | "+ Add Exercise" moved up, full-width primary affordance, redundant empty-state hint removed (PR #48). |
| 104 | ❌ | Smarter "Recent" exercises — frequency + day-of-week + program awareness. Defer if scope creep. |
| 105 | ✅ | Reusable ConfirmDialog + UndoToast components (PR #48); applied to exercise card delete (hybrid) + set delete (undo) + template delete (modal+undo) + history workout delete (modal+undo) (PRs #48 + #49). Full destructive-action audit complete. |
| 106 | ✅ | Collapsible RPE pill (auto-collapse 1.8s after last value change) + Notes (collapse-on-blur with content, expand-on-tap with refocus) (PR #51). Fast-paced detection deferred — see deferred items memory. |
| 107 | ❌ | Edit completed workouts from History — add/remove exercises, edit sets, recalculate PRs/tonnage on edit, lock date editing. Dedicated session. |
| 217 | ✅ | **Rest timer manual default + Smart Rest Timer system** (PRs #58 + #59). Manual-start by default; new Settings → Workout Preferences sub-panel houses the Smart Rest Timer toggle (and migrates existing inline 1RM/Effort/Sound/Units prefs). Per-set ✓ button on every `SetRow` (`set.done` field). Unified trigger model when Smart is ON: "first signal after timer is idle starts it; later signals don't reset it." **Spec divergence:** spec mentioned per-exercise rest duration; app has only a single global preset — flag for future feature. |
| 226 | ✅ | **Workout data persistence shipped (PR #60).** Dexie + Capacitor lifecycle + 12h auto-restore + 7d soft-delete graveyard + Firestore offline persistence. Real-device verification still pending. |
| 218 | ✅ | Swipe-to-delete state persistence bug fixed via stable set + workout IDs (`fix-batch-48`). `makeId`/`normalizeWorkoutIds` helpers; React keys by identity. |
| 220 | ✅ | Destructive-action audit verified — coverage comprehensive from PRs #48/#49. No gaps. |
| 221 | ✅ | Finish Workout confirmation modal (`requestFinishWorkout`) with risk-tier messaging — half-filled sets = destructive variant, unmarked ✓ = warning, clean = soft confirm. |
| 222 | ✅ | Finish button moved to sticky bottom bar above nav. Top button removed; celebration banner kept as visual cue. |
| 223 | ✅ | Re-open recently finished workout (2-hour grace) — `finishedAt` timestamp on commit, History card renders Re-open button in window, blocks if active workout in flight. ConfirmDialog now supports single-button info mode. |
| 97  | ✅ | **Warm-up + drop set support** (`fix-batch-49`). `set.type` ∈ {working,warmup,dropset}. Sleek-by-default: working sets render unchanged, only tagged sets show a W/D pill. One-tap cycle on the set-number indicator. Warmup ✓ skips rest-timer auto-start; drop sets trigger normally. Analytics: PRs working-only; tonnage / frequency exclude warmups. CSV gets new "Set Type" column. History rows show W/D pill in the same scheme. WarmupCalculator integration deferred (it's reference-only — no auto-insert button to pre-tag yet). |
| 228 | ✅ | **Apple-tier visual polish pass** (`fix-batch-49`, on top of #97). New unified iOS-style opacity recipe — `${color}1f` fill + `${color}66` border + `inset 0 1px 0 rgba(255,255,255,0.06-0.18)` inner highlight — applied to W/D pill, ✓ button (when done), RPE chip, Coach card, ghost buttons (`S.ghostBtn`), Rest Timer compact row, Save as Template, sticky Finish bar. Inputs now translucent (`rgba(255,255,255,0.04)`) with Steel Blue focus ring via global `:focus` rule. Coach cards unified on Steel Blue brand (was orange/red/green per-tone) — tone label carries semantic. Row tint on warmup/dropset is now a horizontal gradient instead of a flat wash. Inline X delete removed from set rows; swipe-to-delete is the only path. |
| 227 | ✅ | **Husky pre-commit version-bump hook** (`fix-batch-50`). Hook lives at `.husky/pre-commit` and travels with the repo. Auto-installed on `npm install` via `"prepare": "husky"`. Auto-bumps patch version + APP_VERSION + BUILD_DATE on every commit; skips if user already manually bumped (detected via staged-vs-HEAD diff). Bypassable with `git commit --no-verify`. Cross-machine consistency: solved. |
| 228 | ✅ | **Apple-tier polish system** (`fix-batch-49` + `fix-batch-50`). Unified opacity-layered recipe applied app-wide: set rows, RPE/W-D pills, Coach card (now Steel-Blue brand voice), all ghost buttons, all primary CTAs, all segmented toggles, picker filter chips, inputs with global Steel-Blue `:focus` ring, queued/done exercise pills, Cookie banner (frosted glass), Onboarding carousel, Settings rows, Notifications sheet, 1RM Calculator result card, Sign-in button, Warmup Calculator ladder, History card bidirectional swipe (#223 synergy). Gestural set completion: hold-to-confirm with green fill + swipe-right Done panel. Removed inline X delete + ✓ button from set rows. Haptic audit on every meaningful state change. |

## Bonus work NOT on the 94-list (UX rebuild around active workout)

These were the user-driven adjustments during the last few sessions:

- **Day-1 security pass** — email verification gate, dead Railway client removed, .gitignore hardened, .env.local OIDC token scrubbed
- **Swipe-conflict fix (PR #35)** — view-swipe no longer hijacks rows / pickers / charts. `data-hswipe-safe` opt-out + tightened thresholds.
- **Done-Exercise flow (PR #36)** — green "Done with this exercise" button per active card. Tap → collapses to compact green pill ("4 sets · top 185 × 8 ✓"). Tap pill to re-expand.
- **Compact Rest Timer (PR #36)** — slim row by default (~40px), tap chevron to expand for full preset/ring/controls.
- **Single-active focus mode (PR #37)** — only one exercise expanded at a time. Others render as queued pills (blue stripe, numbered) or done pills (green). `currentExerciseIdx` state tracks focus. Tap a queued pill to jump to it.
- **Tag editor removed from Log top (PR #37)** — auto-applied via `suggestTags` on Finish if user didn't manually set any. History expanded view still allows editing.
- **Picker focus mode + Recent pills removed (PR #38)** — when "Add Exercise" picker is open, all other Log surfaces hide (templates, programs, exercise blocks, finish button). Empty Log = quick-start; picker open = picker only; workout active = focused exercise.
- **Finish at top + auto-open picker on last Done (PR #39)** — Finish moved from bottom to top of Log. When user marks last queued exercise Done, picker auto-opens with `pickerAutoFocus=false` (no keyboard pop).
- **Finish always green + search revamp (PR #40)** — Finish uses green gradient regardless of allDone. Search ignores filter pills when query active, matches name + muscles + equipment, ranks by relevance. Green Finish button also added at top of picker for in-picker save.
- **PR #43 — three-in-one network/data PR** —
  1. **#69 Optimistic UI on Finish Workout** — `useStorage` now exposes `saveError` + retry handle. Red bottom banner appears on genuine Firestore errors (auth, permissions, quota). Auto-clears on next successful save. `save()` accepts `opts.errorContext` for per-callsite labeling.
  2. **Exercise database expanded 215 → 1,640.** Imported `barbell_labs_taxonomy.json` (1,530 entries minus 105 collisions = 1,425 net new). Extracted `GYM_BIBLE` from `App.jsx` to new `src/exerciseDatabase.js`. Original 215 curated entries preserved verbatim (intentional dups too). Mapping: 7 incoming cats → 9 ours (strength split by primary_muscles[0]; olympic/strongman/plyometric → full); 61 equipment IDs → 6 buckets; primary_muscles + secondary_muscles joined comma-string with primary FIRST (critical for Tier 2 search). All new entries default to `level: "intermediate"`. Bundle: 230 → 245 KB gzipped.
  3. **New Mobility category** — added to `EX_CATS` (#7DC4B7 calming teal-mint) and `CAT_COLORS`. 129 mobility/stretching exercises now under their own filter pill.
  4. **Offline indicator banner** — `useOnlineStatus` hook subscribes to window online/offline events. Top-of-screen amber banner ("You're offline · changes will sync when reconnected") with pulsing dot. Different from the bottom red sync-error banner: amber/top = informational network state, red/bottom = actionable error. Both pair to give users full visibility into save/sync state.
- **Picker search redesigned (PRs #41 + #42)** — multi-step revamp once we saw the original "match across name + muscles + equipment" was too noisy. Final design:
  - **Tier 1 (top):** name matches, ranked exact > startsWith > word-startsWith > contains.
  - **Tier 2 (below `TARGETS {term}` divider):** exercises whose PRIMARY muscle (first entry in `muscles`) matches the query.
  - **Muscle families** map (`MUSCLE_FAMILIES` near `CAT_COLORS`) so gym vernacular works — e.g. "bicep" matches Brachialis (Hammer Curl), Brachioradialis (Reverse Curl), Brachii. "calf" matches Soleus, Gastrocnemius. "back" matches Lats/Rhomboids/Traps/Teres/Erectors. Etc.
  - **Whole-word + optional-s** prevents false positives ("lat" doesn't match "Lateral Delts").
  - **Filter pills stay active during search** and intersect with both tiers (no more "filters suspended").
  - **Dedupe by name** (GYM_BIBLE has Pullover under chest+back, RDL under back+legs intentionally for the muscle pills — picker shows one row).
  - **Counter UX:** `1 by name · 11 by muscle` when both tiers populated; falls back to `{N} matches`. 0 matches with non-default filters → inline "Clear filters" link.
  - **Still excludes correctly:** Chin-Up under "bicep" (primary is Lats), Bench Press under "tricep" (primary is Pecs), etc.

## Pending desktop dashboard items (security audit follow-ups)

These need user action — they require dashboard access:
1. **Verify Firestore rules** in Firebase console aren't the default `allow read, write: if true;` — single biggest risk.
2. **`GENERATE_SOURCEMAP=false`** on Vercel project Environment Variables (Production scope).
3. **Shut down Railway backend** at `gymtrack-backend-production.up.railway.app` if defunct.
4. **Enable WHOIS privacy** on `barbelllabs.ca` at the registrar.

## How we work together

1. **Trust-first design.** On signup / paywall flows, favor the trust signal over minimalism.
2. **Version bumping is automatic** via `.git/hooks/pre-commit`.
3. **Bundle related fixes** — same data model or component → one PR.
4. **Branch fresh off main** before each fix: `git checkout main && git pull --ff-only && git branch -D <prev> && git checkout -b fix-batch-N`.
5. **Merge method:** "Create a merge commit" for readable history.
6. **Skip pre-fix proposals** for routine copy/placeholder/UI-compression. **Do flag** strategic calls (new features, data models, architecture).
7. **Verification path:** Vercel preview after push (local `npm start` is Firebase-blocked — `.env.local` was scrubbed during the security pass; can fix with `vercel env pull .env.local --environment=development`).

## Reasonable next directions

**Ship-blocker-ish (App Store + reliability):**
- #80 Rest timer robustness (screen-locked notification + sound persistence)
- #67 Sentry crash reporting (needs you to create a Sentry account first)
- #68 Loading/empty/error state audit
- #69 Optimistic UI on Finish Workout

**Big features (each their own session):**
- #70 Paywall screen + RevenueCat wiring
- #39 Progress analytics suite (tonnage / heatmap / strength standards)
- #65 Offline mode (local-first → sync queue)

**Design-call territory:**
- #32 Custom icon system (commission or design 30+ SVGs)
- #38 Muscle group bar colors

**Post-v1 / marketing:**
- #41 Avatar upload (Firebase Storage)
- #51 Social share, #85 public profile
- #89 Marketing website
- #86-94 brand/content/social

## Desktop sync — run these when you arrive

```bash
# First time on this machine:
git clone https://github.com/bhare8249-wq/barbelllabs.git
cd barbelllabs
npm install
vercel env pull .env.local --environment=development
npm start

# Returning visit (already cloned):
cd barbelllabs
git checkout main
git pull --ff-only
npm install   # only if package.json changed
```

**SESSION_BRIEF.md (this file) lives at the repo root.** It auto-syncs via `git pull`, so whichever machine you're on, you always get the latest handoff doc. To start a fresh Claude Code session on a new machine, paste the prompt block from the bottom of this file as your first message.

---

## Prompt for new Claude session (copy-paste this whole block)

```
I'm Brian, solo founder building Barbell Labs — a React gym-tracking
app at https://github.com/bhare8249-wq/barbelllabs (deployed at
https://gymtrack-frontend-three.vercel.app). Stack: CRA + React 19 +
Firebase + Capacitor on Vercel. Main file: src/App.jsx (~5,200
lines). Brand: Steel Blue (#5B9BD5) on #0A0A0A dark, Bebas Neue +
DM Sans + Space Mono.

We've been working through a 107-item UX/UI fix list pre-launch (plus
#217 added recently). As of 2026-05-06 we're at version 2.4.53 with
PRs merged through #57. Most recent merged work: PR #51 (#106
collapsible RPE pill + Notes), PRs #53-57 (fix-batch-45 Done transition
polish series), PR #50 (picker search aliases), PR #49 (#105 destructive
pattern audit). #80 rest-timer robustness shipped in PR #46.

OPEN BRANCH: `fix-batch-46` — implements #217 (rest timer manual default
+ Workout Preferences sub-panel) plus a Smart Rest Timer system.
Per-set ✓ button on every set row, unified trigger model: "first signal
after timer is idle starts it; later signals don't reset it." Three
triggers (focus on input, ✓, Add Set after complete) all use
gt-start-timer-if-idle. Force-reset only via manual Reset or Add Set
"Yes, reset" prompt. Awaits Vercel preview testing + merge.

⚠️ Pre-commit version-bump hook didn't fire across fix-batch-46's
9 commits — investigate `.git/hooks/pre-commit` or bump version
manually before merging.

Roughly 65+ items shipped, with paywall (#70), analytics (#39),
offline mode (#65), Sentry (#67) as the biggest remaining items.

Most recent session (open on `fix-batch-46`): rebuilt the rest timer
into a Smart Rest Timer system (#217). Manual-start by default; new
Settings → Workout Preferences sub-panel; per-set ✓ button on every
SetRow; unified trigger model where the first signal after the timer
goes idle starts it and later signals don't reset it. The Add Set
prompt is the only auto force-reset path. Manual Reset button now
visible during running/paused states. helpContent.js entries for
Rest Timer + Smart Rest Timer rewritten.

Recent UX rebuild around the active-workout Log view (last ~10 PRs):
single-active exercise focus mode, queued + done pills, picker focus
mode (hides everything else), tag editor moved off-screen and
auto-applied on Finish, compact rest timer, green Finish button at
top of view, Finish also at top of picker, auto-open picker on last
Done without popping keyboard, and a major picker-search redesign:
two tiers (name match + primary-muscle match below a TARGETS divider),
muscle families so "bicep" surfaces Hammer Curl / Reverse Curl
(brachialis/brachioradialis count as bicep training), word-boundary
matching to prevent "lat" matching "Lateral Delts", dedupe by name,
filter pills stay active during search.

PENDING — surface these at session start, especially before launch:
1. Firestore rules — verify in Firebase console aren't 'allow if true'
2. GENERATE_SOURCEMAP=false on Vercel env
3. Shut down old Railway backend if defunct
4. WHOIS privacy on barbelllabs.ca

Conventions:
- Branch fresh off main per fix: 'git checkout main && pull --ff-only
  && checkout -b fix-batch-N'
- Pre-commit hook auto-bumps version + APP_VERSION + BUILD_DATE
- Bundle 3-5 related fixes per PR for speed
- Trust-first design on new-user/signup/paywall flows
- Use 'Create a merge commit' merge method
- Local preview is Firebase-blocked (env scrubbed during security
  pass) — verify via Vercel preview after push, or run
  'vercel env pull .env.local --environment=development' to fix
- Flag strategic / architectural / new-feature decisions before
  coding; skip pre-proposals for routine copy/placeholder fixes
- Skipped sub-items get logged in
  ~/.claude/projects/.../memory/project_deferred_items_pre_launch.md
  for a pre-launch sweep

Please read SESSION_BRIEF.md at the repo root (or
C:\Users\brian\Claude\gymtrack-frontend\SESSION_BRIEF.md if you have
the repo cloned at the standard location) for the full status table
of all 107 fixes + deferred sub-items + reasonable next directions.
The brief is committed to the repo so it stays in sync across
machines via git pull. Then ask me what to work on, or pick the next
item from the Reasonable Next Directions section if I just say 'go'.
```
