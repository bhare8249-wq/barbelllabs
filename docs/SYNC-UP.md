# Claude Code — Sync-Up Instructions

**Read this file when starting a fresh session. Brian will reference it.**

---

## Context

This is the Barbell Labs project. Brian works in two parallel chats:

- **Strategy chat** — keeps the master list, generates focused prompts, captures all roadmap discussion. Lives at: ChatGPT-style strategy chat (separate from this Code session).
- **Claude Code (you)** — executes one focused task per session, syncs back to strategy chat with results.

Brian has been working in the strategy chat to expand the master list and lock in priorities. Before continuing execution, you need to (1) sync Brian up on where you left off, (2) read the updated master list at `/docs/master-list.md`, and (3) flag anything you see that's relevant.

---

## Step 1 — Tell Brian where things stand

Generate a markdown report covering:

### A. Status of #217 (Rest Timer manual-start + Workout Preferences sub-panel)

- PR number(s) merged and version bump
- Whether #80 (Rest Timer Robustness) was bundled in or shipped separately
- Any acceptance criteria from the original prompt that didn't get met
- Any decisions you made that diverged from spec, and why

### B. Codebase state relevant to upcoming work

- Is App.jsx still single-file (~3,500+ lines) or has the #144 refactor started splitting it?
- Is Firestore offline persistence currently enabled on iOS and Android Capacitor builds?
- Current state of localStorage / Capacitor Preferences / IndexedDB usage for active workout state — what persists and what doesn't right now?
- Any existing Capacitor lifecycle listeners (`App.addListener` for `pause`, `appStateChange`, etc.)?
- Is Sentry installed yet (#68)?
- Any existing offline-mode work (#66)?
- Current state of any haptic feedback usage (#77)?
- Current state of any animation library usage (Framer Motion, React Spring, CSS transitions)?

### C. Anything you discovered along the way

- New items you'd add to the master list
- Anything broken, blocked, or deferred Brian should know about
- Anything that surprised you in the codebase

### D. What you're currently working on, if anything

Be specific — file paths, function names, version numbers. Format as markdown so Brian can paste cleanly into the strategy chat.

---

## Step 2 — Read the updated master list

There's an updated reference list of all 226 items at `/docs/master-list.md` in this repo.

**This is for context only.** Don't execute from it. Each session you'll get a focused prompt for one specific task. Use the master list to:

- Understand what's done (don't duplicate work)
- Spot bundling opportunities when working on prompted tasks
- Avoid architectural decisions that close off planned future work

---

## Step 3 — Flag bundling opportunities

After reading the master list, tell Brian if you see any natural bundling opportunities. Specifically:

- Items that touch the same files/components as #217 (already in flight) and could ship in the same PR cheaply
- Items adjacent to the upcoming critical priority (#226 — workout data persistence) that share infrastructure
- Items in the workout safety bundle (#218, #220, #221, #222, #223) that share code paths

**Don't execute bundles. Flag them.** Brian decides what bundles.

---

## Critical priority context

Before you do anything else, you should know: **#226 (workout data persistence) is the next critical priority and is launch-blocking.** Two real users have lost active workout data on iPhone — likely iOS aggressive memory reclamation killing the background process. The app cannot ship without solving this.

The planned fix involves:

- Write-through architecture: every meaningful state change saves to IndexedDB immediately
- Capacitor lifecycle hooks (`appStateChange`) to force-save on background
- 10-second heartbeat saves during active workouts
- Recovery flow on app relaunch (auto-restore recent, prompt for older)
- Verifying Firestore offline persistence is enabled
- Test matrix: force-quit, background+kill, network loss, long sessions, older iPhones, Samsung Android

After you give Brian the sync report, the strategy chat will write the focused #226 prompt with full scope.

**Don't start on #226 yet — wait for the prompt.** Just get the report ready so the prompt can be accurate to the current codebase.

---

## Recap of priority queue (after sync-up)

1. 🚨 **#226 — Workout data persistence (CRITICAL, launch-blocking)**
2. **#218 + #220 + #221 + #222 + #223 — Workout flow safety bundle**
3. **#224 Pass 1 — Progress restructure surface**
4. **#225 Phase 1 + Phase 3 — Premium polish foundation (haptics + motion)**
5. **#12 expansion — Browse Programs additions + filter chips**

---

## What to do right now

Just generate the sync report. **Don't write code. Don't start fixes.** Just give Brian the markdown report covering A, B, C, D above, plus any bundling opportunities spotted from the master list.

Brian will paste the report into the strategy chat. The strategy chat will then send back a focused prompt for #226 with accurate codebase context.
