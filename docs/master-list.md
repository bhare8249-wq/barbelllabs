# Barbell Labs — Code Reference List

**Purpose:** Quick-scan status of all items so Code knows what's done, what's pending, what's coming. Use to spot bundling opportunities and avoid duplicate work.

**Last updated:** May 6, 2026
**Total items:** 227

---

## How to use this file

- **Don't execute from this list.** Each session, Brian gives you a focused prompt with full scope notes for the specific task.
- **Use this for context.** When working on item X, scan for related pending items that could bundle naturally.
- **Flag bundling opportunities.** If you spot a small related fix that's cheap to include, mention it in your sync report.
- **Don't scope-creep.** Stick to the prompted task; suggest bundles, don't unilaterally execute them.

---

## Status legend

- ✅ Done / shipped
- 🔄 In progress
- ❌ Blocked / deferred
- ⏳ Pending (default)
- 🚨 Critical / launch-blocking

---

## Items

### 1–31 ✅ Done — initial quick-wins + structural fixes

### 32–94 — Original list

| # | Status | Item |
|---|--------|------|
| 34 | ⏳ | Progress charts break with single data point |
| 40 | ⏳ | Strength analytics (tonnage, heatmap, balance, streaks, rep PRs, strength standards) |
| 41 | ✅ | (PR-tracked) |
| 42 | ❌ | Profile avatar upload — blocked on Firebase Storage |
| 43 | ✅ | (PR-tracked) |
| 44 | ⏳ | Goal-aware UI follow-through |
| 45 | ✅ | (PR-tracked) |
| 46 | ⏳ | Delete Account flow (App Store/GDPR) |
| 47 | ⏳ | Missing profile fields (sex, DOB, units, experience) |
| 51 | ⏳ | Body measurements tracking |
| 52 | ⏳ | Social features (foundational) |
| 57 | ⏳ | Settings panel expansion |
| 61 | ⏳ | Privacy Policy |
| 62 | ⏳ | Terms of Service |
| 63 | ⏳ | Cookie banner |
| 64 | ⏳ | Support email setup |
| 65 | ⏳ | App Store assets |
| 66 | ⏳ | Offline mode |
| 67 | ⏳ | Backup/restore |
| 68 | ⏳ | Sentry crash reporting |
| 69 | ✅ | Optimistic UI on Finish Workout |
| 71 | ⏳ | Paywall design |
| 72 | ⏳ | Free trial |
| 73 | ⏳ | Referral program |
| 74 | ⏳ | A/B testing |
| 75 | ⏳ | Product analytics |
| 77 | ⏳ | Haptic feedback (folds into #225 Phase 1) |
| 78 | ⏳ | Sound effects (folds into #225 Phase 2) |
| 79 | ⏳ | Keyboard UX |
| 80 | 🔄 | Rest Timer Robustness — may bundle with #217 |
| 81 | ⏳ | Plate calc improvements (see #96) |
| 82 | ⏳ | 1RM transparency |
| 83 | ⏳ | RPE/RIR toggle |
| 84 | ⏳ | Exercise videos |
| 85 | ⏳ | Warmup calculator |
| 86 | ⏳ | Public profiles |
| 87 | ⏳ | Friends |
| 88 | ⏳ | Challenges |
| 89 | ⏳ | Coach mode (also #214) |
| 90 | ⏳ | Marketing site |
| 91 | ⏳ | Email list |
| 92 | ⏳ | Blog/SEO |
| 93 | ⏳ | Brand guidelines |
| 94 | ⏳ | Social media |

### 95–107 — Mobile testing pass

| # | Status | Item |
|---|--------|------|
| 95 | ⏳ | Remove auto-focus on Log search (verify if PR #45 covers it) |
| 96 | ⏳ | Plate calculator visual rebuild |
| 97 | ✅ | Warm-up + drop sets support — `set.type` field (working / warmup / dropset). One-tap cycle on the set-number indicator. Warmup ✓ skips timer auto-start; drop sets fire timer normally. Analytics: PRs working-only, tonnage/frequency exclude warmup. CSV column added. History shows W/D pills. |
| 228 | ✅ | Apple-tier visual polish (`fix-batch-49`). Unified opacity-layered recipe across W/D pill, ✓ button, RPE chip, Coach card (now Steel Blue brand voice for all tones), ghost buttons, Rest Timer, sticky Finish bar. Inputs use translucent ghost layer with global Steel Blue `:focus` ring. Inline X delete removed; swipe-only. |
| 98 | ⏳ | Profile saved toast positioning |
| 99 | ⏳ | Bodyweight trend goal-aware |
| 100 | ❌ | Firebase cloud sync new account — deferred |
| 101 | ❌ | Dros Mode — deferred to closer to launch |
| 102 | ⏳ | Cookie consent persistence |
| 103 | ⏳ | Reposition + Add Exercise button on Log |
| 104 | ⏳ | Smarter Recent exercises |
| 105 | ⏳ | Search-X vs delete-X disambiguation (implementation = #220) |
| 106 | ⏳ | RPE/Notes collapse affordance after entry |
| 107 | ⏳ | Edit completed workouts from History |

### 108–116 — Profile/Progress/Home reimagining

| # | Status | Item |
|---|--------|------|
| 108 | ⏳ | Save button overflow on Bodyweight tracker |
| 109 | ⏳ | Progress nav 3-zone hierarchy — folds into #224 |
| 110 | ⏳ | Post-workout Session at a Glance summary |
| 111 | ⏳ | Exercise Progression card cleanup — partly addressed by #224 |
| 112 | ⏳ | Per-exercise advanced metrics |
| 113 | ⏳ | Context-aware Home nav |
| 114 | ⏳ | Insights engine |
| 115 | ⏳ | Cardio logging support |
| 116 | ⏳ | Customizable Home (3-tier rollout) |

### 117–146 — App-wide audit

| # | Status | Item |
|---|--------|------|
| 117 | ⏳ | Onboarding carousel polish |
| 118 | ⏳ | Sign-in completeness (forgot password etc.) |
| 119 | ⏳ | Inline form validation |
| 120 | ⏳ | Per-set notes |
| 121 | ⏳ | Supersets/circuits |
| 122 | ⏳ | Replace exercise mid-workout |
| 123 | ⏳ | Reorder exercises |
| 124 | ⏳ | Verify Finish Workout reachable with keyboard open |
| 125 | ⏳ | Greeting variation |
| 126 | ⏳ | Streak zero CTA |
| 127 | ⏳ | Recent Sessions content priority |
| 128 | ⏳ | Filter History by tag |
| 129 | ⏳ | Workout-level notes |
| 130 | ⏳ | Pinch-to-zoom Progress charts |
| 131 | ⏳ | Per-exercise data export |
| 132 | ⏳ | Goal-aware progress indicators |
| 133 | ⏳ | Settings panel search |
| 134 | ⏳ | Loading states audit (folds into #225 Phase 7) |
| 135 | ⏳ | Error states audit (folds into #225 Phase 8) |
| 136 | ⏳ | Empty states audit (folds into #225 Phase 6) |
| 137 | ⏳ | Page transition consistency (folds into #225 Phase 3) |
| 138 | ⏳ | Touch target audit 44×44 (folds into #225 Phase 9) |
| 139 | ⏳ | Long-press menus |
| 140 | ⏳ | Pull-to-refresh |
| 141 | ⏳ | Date/time formatting consistency |
| 142 | ⏳ | i18n framework |
| 143 | ⏳ | Accessibility WCAG AA audit |
| 144 | ⏳ | App.jsx refactor (split into per-screen components, Zustand state, code-splitting) |
| 145 | ⏳ | Notifications inbox/feed view |
| 146 | ⏳ | Centralized share image generator |

### 147–151 — Competitor audit additions

| # | Status | Item |
|---|--------|------|
| 147 | ⏳ | Native Apple Watch + Wear OS app |
| 148 | ⏳ | Apple Health / Google Fit integration |
| 149 | ⏳ | Auto-progression within Starter Programs (extends #12) |
| 150 | ⏳ | Heart rate tracking + zone analysis |
| 151 | ⏳ | Routine scheduling + weekly calendar view |

### 152–216 — Strategic launch/business

These are mostly NOT Code's domain — they're business operations, legal, marketing. Listed here so Code knows context:

| # | Status | Item |
|---|--------|------|
| 152 | ⏳ | iOS 26 SDK / Xcode 26 build (mandatory Apr 28, 2026) — **may impact Code's build setup** |
| 153 | ⏳ | PrivacyInfo.xcprivacy manifests for all SDKs — **may impact Code's iOS work** |
| 154 | ⏳ | App Store age rating questionnaire |
| 155 | ⏳ | App Store screenshots |
| 156 | ⏳ | App preview video |
| 157 | ⏳ | Localized App Store metadata |
| 158 | ⏳ | D-U-N-S Number |
| 159 | ⏳ | Google Play 14-day closed test |
| 160 | ⏳ | AI transparency disclosures |
| 161 | ⏳ | UGC moderation tools — **Code-relevant when social ships** |
| 162 | ⏳ | Tax/banking/contracts in App Store Connect |
| 163 | ⏳ | Don't launch on Friday |
| 164 | ⏳ | MMP integration — **Code-relevant** |
| 165 | ⏳ | Deep linking — **Code-relevant** |
| 166 | ⏳ | Push notification infra (FCM + APNs) — **Code-relevant** |
| 167 | ⏳ | Email service provider |
| 168 | ⏳ | Database backup automation |
| 169 | ⏳ | Status page |
| 170 | ⏳ | CI/CD pipeline — **Code-relevant** |
| 171 | ⏳ | Beta testing (TestFlight, Play Internal Test) — **Code-relevant** |
| 172 | ⏳ | Incorporated entity decision |
| 173 | ⏳ | Trademark filings |
| 174 | ⏳ | Business insurance |
| 175 | ⏳ | Privacy Policy + ToS by lawyer |
| 176 | ⏳ | Apple/RevenueCat tax setup |
| 177 | ⏳ | Refund policy |
| 178 | ⏳ | Open-source license compliance — **Code-relevant** |
| 179 | ⏳ | DPAs with Firebase/RevenueCat/processors |
| 180 | ⏳ | Sign in with Apple entitlement — **Code-relevant** |
| 181 | ⏳ | Product analytics setup — **Code-relevant** |
| 182 | ⏳ | Define North Star Metric |
| 183 | ⏳ | Retention cohort dashboards |
| 184 | ⏳ | Activation rate target |
| 185 | ⏳ | Time-to-aha measurement |
| 186 | ⏳ | Trial-to-paid conversion baseline |
| 187 | ⏳ | Revenue dashboards |
| 188 | ⏳ | Support ticketing |
| 189 | ⏳ | In-app feedback widget — **Code-relevant** |
| 190 | ⏳ | FAQ/Knowledge Base |
| 191 | ⏳ | In-app rating prompt timing — **Code-relevant** |
| 192 | ⏳ | Founder personal email outreach |
| 193 | ⏳ | ProductHunt launch |
| 194 | ⏳ | Hacker News + Indie Hackers |
| 195 | ⏳ | Reddit launch strategy |
| 196 | ⏳ | Influencer seeding |
| 197 | ⏳ | Personal launch story content |
| 198 | ⏳ | Press kit |
| 199 | ⏳ | Founder Twitter/LinkedIn build-in-public |
| 200 | ⏳ | Cohort retention review ritual |
| 201 | ⏳ | Push re-engagement campaigns — **Code-relevant** |
| 202 | ⏳ | Email lifecycle sequences |
| 203 | ⏳ | In-app NPS surveys — **Code-relevant** |
| 204 | ⏳ | Win-back campaigns |
| 205 | ⏳ | Cancellation flow optimization — **Code-relevant** |
| 206 | ⏳ | Cross-platform testing matrix |
| 207 | ⏳ | Annual plan as primary upsell — **Code-relevant** |
| 208 | ⏳ | Lifetime purchase option (post-v2) |
| 209 | ⏳ | Quarterly subscriber surveys |
| 210 | ⏳ | Public roadmap |
| 211 | ⏳ | In-app subscription management UI — **Code-relevant** |
| 212 | ⏳ | Re-engagement for lapsed subscribers — **Code-relevant** |
| 213 | ⏳ | Group/family plans (post 10K subs) |
| 214 | ⏳ | Coach mode / multi-client support (also #89) |
| 215 | ⏳ | Gift subscriptions — **Code-relevant** |
| 216 | ⏳ | Affiliate/partner program |

### 217–226 — Recent additions (high-priority queue)

| # | Status | Item |
|---|--------|------|
| 217 | ✅ | Rest Timer manual-start + Workout Preferences sub-panel + Smart Rest Timer system (PRs #58 + #59) |
| 218 | ✅ | Swipe-to-delete state persistence bug fixed via stable IDs (`makeId`/`normalizeWorkoutIds`). Sets and workouts now have stable identity; React reconciles by id not index. |
| 219 | ⏳ | App-wide motion polish — folds into #225 Phase 3 |
| 220 | ✅ | Destructive-action coverage audit — verified comprehensive from PRs #48/#49. No gaps. |
| 221 | ✅ | Finish Workout confirmation modal with risk-tier messaging (`requestFinishWorkout`). |
| 222 | ✅ | Finish moved to sticky bottom bar above nav; top button removed; "All done" banner kept as visual cue. |
| 223 | ✅ | Re-open within 2-hour grace window. `finishedAt` timestamp on commit; History card renders Re-open button while in window; blocks if active workout already in flight. |
| 224 | ⏳ | Progress nav restructure (3-layer architecture, multi-pass) |
| 225 | ⏳ | Premium polish initiative (10 phases, 2-3 month effort) |
| 226 | 🔄 | **Workout data persistence — code shipped on `fix-batch-47`, awaiting real-device test (iPhone 12+/iOS 17+, Samsung) before merge.** Module: `src/workoutSession/`. Firestore offline persistence enabled. Capacitor `@capacitor/app` lifecycle wiring + 10s heartbeat. |
| 227 | ✅ | Husky pre-commit version-bump hook (`fix-batch-50`). Auto-installs on `npm install`. Auto-bumps patch + APP_VERSION + BUILD_DATE; skips if user manually bumped. |
| 228 | ✅ | Apple-tier polish system app-wide (`fix-batch-49` + `fix-batch-50`). Unified opacity recipe, gestural set completion, bidirectional History swipe, haptic audit. |
| 68  | ⏳ | (re-flagged) Sentry crash reporting — DSN needed before wiring. Will plug into the workoutSession layer's IDB-failure paths once installed. |

### #12 — Browse Starter Programs expansion

Existing 10 programs stay. Adding 10 more (12k–12t): Dumbbell-Only Full Body, Bodyweight, Wendler 5/3/1 Standard, GZCLP, 2-Day Full Body Minimalist, nSuns 5/3/1, Madcow 5×5, Texas Method, GreySkull LP, Powerbuilding 4-Day. Plus 12u: filter chip system (Goal, Level, Days/Week, Equipment).

---

## Currently in flight

🔄 **Workout safety bundle (#218 + #220 + #221 + #222 + #223)** — code complete on `fix-batch-48`, awaiting merge. v2.6.0.

## Recommended priority queue (next sessions)

1. **#227 — Husky migration of pre-commit version-bump hook** (small infrastructure — would prevent more manual version bumps)
2. **#224 Pass 1 — Progress restructure surface** (biggest UX upgrade)
3. **#225 Phase 1 + Phase 3 — Premium polish foundation** (haptics + motion — animation library decision needed first)
4. **#12 expansion — Browse Programs additions + filter chips**
5. **Real-device test for #226** (still pending — iPhone 12+/iOS 17+ and Samsung)
6. **#107 — Edit completed workouts from History** (complementary to #223 grace window for older sessions)

---

## Bundling guidance

When working on a prompted task, scan this list for items that:
- Touch the **same files / components**
- Are **thematically related** (e.g. workout safety, motion polish, settings panel)
- Are **cheap to include** (under 30 min of incremental work)

Examples of natural bundles:
- #80 with #217 (both rest timer)
- #218 with #220 (both about destructive actions)
- #220 with #221 (both confirmation modals)
- #134/#135/#136 with #225 (loading/error/empty states are part of polish initiative)
- #138 with anything that touches buttons/icons (touch target audit)

If you spot a bundle opportunity, **flag it in your sync report** rather than executing unilaterally. Brian decides what bundles.
