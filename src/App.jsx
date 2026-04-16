import { useState, useEffect, useRef, createContext, useContext } from "react";

// ── Theme ─────────────────────────────────────────────────────────────
const ThemeCtx = createContext("dark");
const useT = () => {
  const theme = useContext(ThemeCtx);
  return THEMES[theme];
};
const useS = () => {
  const theme = useContext(ThemeCtx);
  return makeStyles(THEMES[theme]);
};

const THEMES = {
  dark: {
    bg: "#0d0d0d", surface: "#161616", surfaceHigh: "#1e1e1e",
    border: "#2a2a2a", text: "#ffffff", textSub: "#bbbbbb",
    textMuted: "#666666", inputBg: "#111111", inputBorder: "#333333",
    navBg: "#111111", navBorder: "#222222",
  },
  light: {
    bg: "#f0f0f0", surface: "#ffffff", surfaceHigh: "#ffffff",
    border: "#e0e0e0", text: "#111111", textSub: "#444444",
    textMuted: "#999999", inputBg: "#f8f8f8", inputBorder: "#dddddd",
    navBg: "#ffffff", navBorder: "#e8e8e8",
  },
};
const accent = "#e8ff47";
const haptic = (pattern = 10) => { try { navigator.vibrate(pattern); } catch (_) {} };

const makeStyles = (t) => ({
  card: (extra = {}) => ({ background: t.surfaceHigh, borderRadius: 16, padding: "16px 18px", marginBottom: 14, border: `1px solid ${t.border}`, boxShadow: "0 2px 12px rgba(0,0,0,0.18)", ...extra }),
  inputStyle: (extra = {}) => ({ background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 8, color: t.text, padding: "10px 12px", fontSize: 16, outline: "none", width: 120, ...extra }),
  iconBtn: (color) => ({ background: "transparent", border: "none", cursor: "pointer", color: color || t.textMuted, padding: 4, display: "flex", alignItems: "center", borderRadius: 6 }),
  ghostBtn: (extra = {}) => ({ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px dashed ${t.border}`, borderRadius: 8, color: t.textMuted, padding: "6px 12px", fontSize: 13, cursor: "pointer", ...extra }),
  solidBtn: (extra = {}) => ({ background: accent, color: "#000", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontFamily: "'Bebas Neue', cursive", letterSpacing: 1, fontSize: 16, touchAction: "manipulation", ...extra }),
  select: (extra = {}) => ({ background: t.surfaceHigh, color: accent, border: `1px solid ${accent}44`, borderRadius: 8, padding: "7px 28px 7px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer", outline: "none", appearance: "none", WebkitAppearance: "none", letterSpacing: 0.3, ...extra }),
});

// ── Version ───────────────────────────────────────────────────────────
// Versioning convention:
//   MAJOR.MINOR.PATCH
//   • MAJOR — complete redesign or breaking change (1.x.x → 2.x.x)
//   • MINOR — new feature added (1.0.x → 1.1.x)
//   • PATCH — bug fix, small tweak, or UI polish (1.0.0 → 1.0.1)
//
// ── Changelog ────────────────────────────────────────────────────────
// v1.0.1  2026-04-08  Export button moved from History header to fixed centre-bottom bar
// v1.0.2  2026-04-08  Fixed CSV export using data URI for sandbox compatibility
// v1.0.3  2026-04-08  User manual PDF filename now includes version and build date
// v1.0.4  2026-04-08  Replaced jsPDF generator with direct link to pre-built PDF in public folder
// v1.0.5  2026-04-08  Rest timer now supports manual custom time input (minutes and seconds)
// v1.0.6  2026-04-08  Profile: Country and City fields added; Sign Out moved to fixed bottom centre
// v1.1.0  2026-04-08  Admin account and panel added (user management, stats, delete accounts)
// v1.1.1  2026-04-08  Height field split into separate feet and inches inputs
// v1.1.2  2026-04-08  Inches input now supports 0.5 increments
// v1.1.3  2026-04-08  Home nav icon changed from dumbbell to house icon
// v1.1.4  2026-04-08  Removed floating dumbbell icon from Home empty state
// v1.1.5  2026-04-08  Help button replaced with compact ? icon on all pages
// v1.1.6  2026-04-08  Help button now shows ? Help label
// v1.1.7  2026-04-08  Help button ? moved after Help text in orange badge
// v1.1.8  2026-04-08  Help badge redesigned — borderless, orange circle, clean
// v1.1.9  2026-04-08  Help badge colour changed from orange to app accent yellow
// v1.2.0  2026-04-08  Help button redesigned as consistent pill button across all pages
// v1.2.1  2026-04-08  Profile: Security Settings added — change email and password with verification flow
// v1.2.2  2026-04-08  Fixed critical bug: useStorage useEffect was resetting user data on profile edits
const APP_VERSION = "1.2.2";
const BUILD_DATE  = "2026-04-08";

const getUserKey = (u) => `gymtrack-data-${u}`;
const AUTH_KEY = "gymtrack-auth";
const getUsers = () => { try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "{}"); } catch { return {}; } };
const saveUsers = (u) => { try { localStorage.setItem(AUTH_KEY, JSON.stringify(u)); } catch {} };

function useStorage(username) {
  const key = getUserKey(username || "__guest__");
  const [data, setData] = useState(() => {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : { workouts: [], bodyweight: [] }; }
    catch { return { workouts: [], bodyweight: [] }; }
  });
  const save = (next) => { setData(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch {} };
  return [data, save];
}

// ── Admin ─────────────────────────────────────────────────────────────
const ADMIN_USER = "admin";
const ADMIN_HASH = btoa("1.Billion*");

// Seed admin account into localStorage if it doesn't exist
(() => {
  try {
    const users = getUsers();
    if (!users[ADMIN_USER]) {
      users[ADMIN_USER] = { passwordHash: ADMIN_HASH, email: "admin@gymtrack.app", verified: true, isAdmin: true };
      saveUsers(users);
    }
  } catch {}
})();

const isAdminUser = (u) => u === ADMIN_USER;


const BIG3 = ["Bench Press", "Squat", "Deadlift"];
const DEFAULT_EXERCISES = [
  "Bench Press", "Squat", "Deadlift", "Overhead Press", "Pull-Up",
  "Barbell Row", "Dumbbell Curl", "Tricep Pushdown", "Leg Press",
  "Lat Pulldown", "Cable Row", "Incline Press",
];
const WORKOUT_LABELS = [
  { id: "legs",      label: "Legs",       emoji: "🦵", color: "#5bb85b", bg: "rgba(91,184,91,0.12)",  border: "rgba(91,184,91,0.3)" },
  { id: "push",      label: "Push",       emoji: "💪", color: "#5b9bd5", bg: "rgba(91,155,213,0.12)", border: "rgba(91,155,213,0.3)" },
  { id: "pull",      label: "Pull",       emoji: "🔗", color: "#b55bd5", bg: "rgba(181,91,213,0.12)", border: "rgba(181,91,213,0.3)" },
  { id: "upperbody", label: "Upper Body", emoji: "🏋️", color: "#d5a55b", bg: "rgba(213,165,91,0.12)", border: "rgba(213,165,91,0.3)" },
  { id: "lowerbody", label: "Lower Body", emoji: "⚡", color: "#d55b5b", bg: "rgba(213,91,91,0.12)",  border: "rgba(213,91,91,0.3)" },
  { id: "shoulders", label: "Shoulders",  emoji: "🎯", color: "#5bd5d5", bg: "rgba(91,213,213,0.12)", border: "rgba(91,213,213,0.3)" },
  { id: "arms",      label: "Arms",       emoji: "💥", color: "#d55ba0", bg: "rgba(213,91,160,0.12)", border: "rgba(213,91,160,0.3)" },
  { id: "abs",       label: "Abs",        emoji: "🔥", color: "#e8ff47", bg: "rgba(232,255,71,0.08)", border: "rgba(232,255,71,0.3)" },
  { id: "glutes",    label: "Glutes",     emoji: "🍑", color: "#ff9500", bg: "rgba(255,149,0,0.12)",  border: "rgba(255,149,0,0.3)" },
];

const GOALS = [
  { id: "muscle",   label: "Build Muscle",  emoji: "💪", desc: "Hypertrophy & size",    color: "#5b9bd5" },
  { id: "strength", label: "Strength",      emoji: "🏋️", desc: "Max power & 1RM",      color: "#d55b5b" },
  { id: "cardio",   label: "Cardio",        emoji: "🏃", desc: "Endurance & fitness",   color: "#5bb85b" },
  { id: "cut",      label: "Cut / Lean Out",emoji: "🔥", desc: "Fat loss & definition", color: "#ff9500" },
  { id: "maintain", label: "Maintain",      emoji: "⚖️", desc: "Stay consistent",       color: "#b55bd5" },
];

// ── Helpers ───────────────────────────────────────────────────────────
const todayISO = () => new Date().toISOString().split("T")[0];
const formatDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const formatDay  = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// ── Icons ─────────────────────────────────────────────────────────────
const Icon = ({ name, size = 18 }) => {
  const p = {
    plus:     <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    trash:    <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></>,
    dumbbell: <><path d="M6.5 6.5h11"/><path d="M6.5 17.5h11"/><path d="M3 9.5h3v5H3z"/><path d="M18 9.5h3v5h-3z"/></>,
    chart:    <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
    history:  <><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></>,
    x:        <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    trophy:   <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></>,
    chevronDown: <polyline points="6 9 12 15 18 9"/>,
    tag:      <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>,
    user:     <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    check:    <polyline points="20 6 9 20 4 14"/>,
    edit2:    <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    timer:    <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    sun:      <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>,
    moon:     <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>,
    home:     <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
    book:     <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>,
    shield:   <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{p[name]}</svg>;
};

// ── Help Content ──────────────────────────────────────────────────────
const HELP_CONTENT = {
  home: {
    title: "Home",
    emoji: "🏠",
    sections: [
      { heading: "Overview", body: "The Home screen is your dashboard. It shows your total workout count, sessions this week, and the number of unique exercises you've logged." },
      { heading: "Start Workout", body: "Tap '+ Start Workout' to jump to the Log tab and begin a new session. The timer starts automatically when you add your first exercise." },
      { heading: "Recent Sessions", body: "Your last 5 workouts are listed here for a quick reference — date, duration, and exercises performed." },
    ],
  },
  log: {
    title: "Log",
    emoji: "📋",
    sections: [
      { heading: "Rest Timer", body: "Use the built-in rest timer between sets. Choose a preset (30s, 1m, 1.5m, 2m, 3m), tap Start, and a ring counts down. It turns green and shows 'Rest complete!' when done." },
      { heading: "Load Previous Workout", body: "If you've tagged past sessions, a dropdown lets you reload the exercises and sets from that template — great for repeating a routine." },
      { heading: "Adding Exercises", body: "Tap 'Add Exercise' to search the built-in list or type any custom name to create your own. Exercises you add are remembered for future sessions." },
      { heading: "Logging Sets", body: "For each exercise, enter weight (lbs) and reps per set. Tap '+ Add Set' to add more sets. Use the × to remove any set or the trash icon to remove the whole exercise." },
      { heading: "Finishing", body: "When done, tap 'Finish Workout' to save the session. Duration is calculated automatically from when you started." },
    ],
  },
  history: {
    title: "History",
    emoji: "📅",
    sections: [
      { heading: "Browsing Sessions", body: "All your workouts are listed newest first. Tap any card to expand it and see the full exercise breakdown with all sets and reps." },
      { heading: "Tagging Workouts", body: "When a card is expanded, tap up to 3 tags (e.g. Legs, Push, Pull) to categorise the session. Tags appear as coloured badges on the collapsed card." },
      { heading: "Jump To", body: "Use the 'Jump to…' dropdown to scroll instantly to workouts from the last 7, 14, or 21 days." },
      { heading: "Deleting Workouts", body: "Expand any card and tap 'Delete Workout'. A confirmation prompt appears before the session is permanently removed." },
      { heading: "Export Data", body: "Tap 'Export' to download all your workout data as a CSV file — includes date, exercise, set number, weight, reps, and tags." },
    ],
  },
  progress: {
    title: "Progress",
    emoji: "📈",
    sections: [
      { heading: "Big 3 Personal Records", body: "At the top you'll see your all-time heaviest lift for Bench Press, Squat, and Deadlift. The heaviest overall gets a 'TOP PR' badge. All PRs show a 👑 crown." },
      { heading: "Exercise Progression Charts", body: "Every exercise you've logged gets its own line graph — X axis is days, Y axis is your best weight for that session. Hover over any data point to see the exact weight and date." },
      { heading: "PR Highlight", body: "The session where you hit your all-time PR is marked with an orange dot and a 👑 crown on the chart." },
      { heading: "Gain / Loss Indicator", body: "Below each chart, a ▲ green or ▼ red indicator shows your net weight change from your first to most recent session for that exercise." },
      { heading: "Jump To", body: "Use the 'Jump to…' dropdown at the top right to scroll directly to any exercise chart." },
    ],
  },
  profile: {
    title: "Profile",
    emoji: "👤",
    sections: [
      { heading: "Personal Info", body: "Store your first and last name, email, age, weight, and height. Tap 'Edit' to update any field, then 'Save Profile' to confirm." },
      { heading: "Current Goal", body: "Choose from Build Muscle, Strength, Cardio, Cut / Lean Out, or Maintain. Your selected goal is highlighted and visible on the profile view." },
      { heading: "Dark / Light Mode", body: "Toggle between dark and light themes using the sun/moon button. Your preference is saved and applied across the whole app." },
      { heading: "Lifetime Stats", body: "A summary of your total workouts, unique exercises, total sets logged, and sessions this week — all calculated live from your data." },
      { heading: "Sign Out", body: "Tap 'Sign Out' to return to the login screen. Your data is saved and will be available when you sign back in." },
    ],
  },
  manual: {
    title: "User Manual",
    emoji: "📖",
    sections: [
      { heading: "Getting Started", body: "Create an account on the landing page with a username, email, and a strong password (8+ characters, uppercase, lowercase, and a digit). After signup you'll be directed to set up your Profile." },
      { heading: "Your First Workout", body: "Tap the Log tab or '+ Start Workout' on Home. Add exercises using the search picker, enter your sets with weight and reps, use the rest timer between sets, then tap 'Finish Workout' to save." },
      { heading: "Tracking Progress", body: "The Progress tab automatically builds charts from your logged data. The more sessions you log, the more detailed your progression graphs become." },
      { heading: "Tagging & Templates", body: "Tag sessions in History (e.g. Push, Legs) and they'll appear in the Log tab's dropdown — tap a tag to reload that workout as a template for your next session." },
      { heading: "Data & Privacy", body: "All data is stored locally on your device in your browser's localStorage. No data is sent to any server. Each account is completely isolated — different users on the same device have separate data." },
      { heading: "Exporting Your Data", body: "Go to History and tap 'Export' to download a CSV of all your workout data. This can be opened in Excel, Google Sheets, or any spreadsheet app." },
      { heading: "Multiple Accounts", body: "You can create multiple accounts on the same device. Each account has its own separate workout history, profile, and progress data." },
    ],
  },
};

// ── Help Modal ────────────────────────────────────────────────────────
function HelpModal({ page, onClose }) {
  const t = useT();
  const content = HELP_CONTENT[page];
  if (!content) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onClose}>
      {/* Backdrop */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)" }} />
      {/* Sheet */}
      <div onClick={e => e.stopPropagation()} style={{
        position: "relative", width: "100%", maxWidth: 420,
        background: t.surfaceHigh, borderRadius: "20px 20px 0 0",
        padding: "0 0 32px", maxHeight: "82vh", display: "flex", flexDirection: "column",
        border: `1px solid ${t.border}`, borderBottom: "none",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.4)",
      }}>
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: t.border }} />
        </div>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>{content.emoji}</span>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, letterSpacing: 1, color: t.text }}>
              {content.title} <span style={{ color: accent }}>Help</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: t.textMuted, cursor: "pointer", display: "flex", padding: 4 }}>
            <Icon name="x" size={20} />
          </button>
        </div>
        {/* Scrollable content */}
        <div style={{ overflowY: "auto", padding: "0 20px", flex: 1 }}>
          {content.sections.map((s, i) => (
            <div key={i} style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 3, height: 16, background: accent, borderRadius: 2, flexShrink: 0 }} />
                <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>{s.heading}</div>
              </div>
              <div style={{ fontSize: 13, color: t.textSub, lineHeight: 1.65, paddingLeft: 11 }}>{s.body}</div>
            </div>
          ))}
          <div style={{ textAlign: "center", paddingTop: 8, paddingBottom: 4 }}>
            <div style={{ fontSize: 11, color: t.textMuted }}>
              GymTrack v{APP_VERSION} · Built {BUILD_DATE}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Help Button ───────────────────────────────────────────────────────
function HelpBtn({ page, onOpen }) {
  const t = useT();
  return (
    <button onClick={onOpen} style={{
      background: t.surfaceHigh,
      border: `1px solid ${t.border}`,
      borderRadius: 20,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "5px 12px 5px 10px",
      fontSize: 12,
      fontWeight: 600,
      color: t.textSub,
      flexShrink: 0,
    }}>
      <span style={{
        background: accent, color: "#000",
        borderRadius: "50%", width: 16, height: 16,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 800, lineHeight: 1, flexShrink: 0,
      }}>?</span>
      Help
    </button>
  );
}

// ── Rest Timer ────────────────────────────────────────────────────────
function RestTimer() {
  const t = useT(); const S = useS();
  const PRESETS = [30, 60, 90, 120, 180];
  const [seconds, setSeconds] = useState(90);
  const [remaining, setRemaining] = useState(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [customMin, setCustomMin] = useState("");
  const [customSec, setCustomSec] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const notifTimeout = useRef(null);

  const scheduleNotif = (secs) => {
    if (!("Notification" in window)) return;
    Notification.requestPermission().then(perm => {
      if (perm !== "granted") return;
      if (notifTimeout.current) clearTimeout(notifTimeout.current);
      notifTimeout.current = setTimeout(() => {
        navigator.serviceWorker?.ready.then(reg => {
          reg.showNotification("Rest complete! 💪", {
            body: "Time to hit your next set",
            icon: "/logo192.png",
            tag: "rest-timer",
            renotify: true,
            vibrate: [200, 100, 200],
          });
        });
      }, secs * 1000);
    });
  };
  const cancelNotif = () => {
    if (notifTimeout.current) { clearTimeout(notifTimeout.current); notifTimeout.current = null; }
  };

  useEffect(() => {
    if (!running) return;
    if (remaining <= 0) { setRunning(false); setDone(true); haptic([0, 80, 40, 80]); cancelNotif(); return; }
    const id = setInterval(() => setRemaining(r => r - 1), 1000);
    return () => clearInterval(id);
  }, [running, remaining]); // eslint-disable-line

  useEffect(() => {
    const handler = () => {
      setRemaining(seconds); setRunning(true); setDone(false);
      haptic(10); scheduleNotif(seconds);
    };
    window.addEventListener("gt-start-timer", handler);
    return () => window.removeEventListener("gt-start-timer", handler);
  }, [seconds]); // eslint-disable-line

  const applyCustom = () => {
    const m = parseInt(customMin) || 0;
    const s = parseInt(customSec) || 0;
    const total = m * 60 + s;
    if (total > 0 && total <= 3600) {
      setSeconds(total); setRemaining(null); setRunning(false); setDone(false);
      setShowCustom(false);
    }
  };

  const setPreset = (p) => { setSeconds(p); setRemaining(null); setRunning(false); setDone(false); setShowCustom(false); };
  const start = () => { setRemaining(seconds); setRunning(true); setDone(false); haptic(10); scheduleNotif(seconds); };
  const stop  = () => { setRunning(false); setRemaining(null); setDone(false); cancelNotif(); };
  const fmt   = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const progress = remaining != null ? remaining / seconds : 1;
  const R = 34, circ = 2 * Math.PI * R;

  const isCustomActive = !PRESETS.includes(seconds);

  return (
    <div style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Icon name="timer" size={14} />
        <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 15, letterSpacing: 1, color: t.text }}>REST TIMER</span>
        {done && <span style={{ fontSize: 12, color: "#5bb85b", fontWeight: 700, marginLeft: "auto" }}>✓ Rest complete!</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* Ring */}
        <div style={{ flexShrink: 0 }}>
          <svg width={86} height={86}>
            <circle cx={43} cy={43} r={R} fill="none" stroke={t.border} strokeWidth={5} />
            <circle cx={43} cy={43} r={R} fill="none"
              stroke={done ? "#5bb85b" : running ? accent : t.textMuted}
              strokeWidth={5} strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={circ * (1 - progress)}
              transform="rotate(-90 43 43)"
              style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }} />
            <text x="43" y="49" textAnchor="middle" fontSize="17" fontWeight="700"
              fill={done ? "#5bb85b" : t.text} fontFamily="'Bebas Neue', cursive">
              {remaining != null ? fmt(remaining) : fmt(seconds)}
            </text>
          </svg>
        </div>

        <div style={{ flex: 1 }}>
          {/* Presets + Custom button */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
            {PRESETS.map(p => (
              <button key={p} onClick={() => setPreset(p)} style={{
                background: seconds === p && !running && !isCustomActive ? accent : t.inputBg,
                color: seconds === p && !running && !isCustomActive ? "#000" : t.textSub,
                border: `1px solid ${seconds === p && !running && !isCustomActive ? accent : t.border}`,
                borderRadius: 7, padding: "4px 9px", fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}>{p >= 60 ? `${p/60}m` : `${p}s`}</button>
            ))}
            <button onClick={() => setShowCustom(v => !v)} style={{
              background: isCustomActive ? accent : t.inputBg,
              color: isCustomActive ? "#000" : t.textSub,
              border: `1px solid ${isCustomActive ? accent : t.border}`,
              borderRadius: 7, padding: "4px 9px", fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}>Custom</button>
          </div>

          {/* Custom time input */}
          {showCustom && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, background: t.inputBg, borderRadius: 8, padding: "8px 10px", border: `1px solid ${t.border}` }}>
              <input
                type="number" min="0" max="59" placeholder="0"
                value={customMin}
                onChange={e => setCustomMin(e.target.value)}
                style={{ width: 40, background: "transparent", border: "none", color: t.text, fontSize: 16, fontWeight: 700, textAlign: "center", outline: "none" }}
              />
              <span style={{ color: t.textMuted, fontWeight: 700, fontSize: 16 }}>m</span>
              <span style={{ color: t.border, fontSize: 18 }}>:</span>
              <input
                type="number" min="0" max="59" placeholder="0"
                value={customSec}
                onChange={e => setCustomSec(e.target.value)}
                onKeyDown={e => e.key === "Enter" && applyCustom()}
                style={{ width: 40, background: "transparent", border: "none", color: t.text, fontSize: 16, fontWeight: 700, textAlign: "center", outline: "none" }}
              />
              <span style={{ color: t.textMuted, fontWeight: 700, fontSize: 16 }}>s</span>
              <button onClick={applyCustom} style={{ marginLeft: 4, background: accent, color: "#000", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Set</button>
            </div>
          )}

          {/* Controls */}
          <div style={{ display: "flex", gap: 8 }}>
            {!running
              ? <button onClick={start} style={{ ...S.solidBtn(), flex: 1, padding: "8px 0", fontSize: 13, borderRadius: 8 }}>{remaining != null ? "Resume" : "Start"}</button>
              : <button onClick={() => setRunning(false)} style={{ flex: 1, background: t.inputBg, border: `1px solid ${t.border}`, color: t.text, borderRadius: 8, padding: "8px 0", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Pause</button>
            }
            <button onClick={stop} style={{ background: "transparent", border: `1px solid ${t.border}`, color: t.textMuted, borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer" }}>Reset</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Line Chart ────────────────────────────────────────────────────────
function LineChart({ points, lineColor = accent, allTimeMax }) {
  const t = useT();
  const [hovered, setHovered] = useState(null);
  if (!points.length) return <div style={{ color: t.textMuted, fontSize: 12, padding: "16px 0", textAlign: "center" }}>Log at least one session to see this chart</div>;
  const W = 340, H = 130, padL = 38, padR = 16, padT = 24, padB = 36;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const vals = points.map(p => p.value);
  const minVal = Math.min(...vals), maxVal = Math.max(...vals), valRange = maxVal - minVal || 1;
  const yTicks = 4;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minVal + (valRange / yTicks) * i);
  const toX = (i) => padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const toY = (v) => padT + plotH - ((v - minVal) / valRange) * plotH;
  const polyline = points.map((p, i) => `${toX(i)},${toY(p.value)}`).join(" ");
  const areaPath = points.length > 1
    ? `M${toX(0)},${toY(points[0].value)} ${points.slice(1).map((p, i) => `L${toX(i+1)},${toY(p.value)}`).join(" ")} L${toX(points.length-1)},${padT+plotH} L${toX(0)},${padT+plotH} Z`
    : "";
  const gradId = `grad-${lineColor.replace("#","")}`;
  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTickVals.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={toY(v)} x2={W-padR} y2={toY(v)} stroke={t.border} strokeWidth="1" />
            <text x={padL-5} y={toY(v)+4} textAnchor="end" fontSize="9" fill={t.textMuted}>{Math.round(v)}</text>
          </g>
        ))}
        {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}
        {points.length > 1 && <polyline points={polyline} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
        {points.map((p, i) => {
          const cx = toX(i), cy = toY(p.value);
          const isPR = p.value === allTimeMax, isHov = hovered === i;
          return (
            <g key={i}>
              <rect x={cx-16} y={padT} width={32} height={plotH} fill="transparent" style={{ cursor: "pointer" }} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} />
              <circle cx={cx} cy={cy} r={isPR ? 6 : isHov ? 5 : 3.5} fill={isPR ? "#ff9500" : lineColor} stroke={isHov ? "#fff" : "transparent"} strokeWidth="2" />
              {isPR && <text x={cx} y={cy-10} textAnchor="middle" fontSize="11">👑</text>}
              {isHov && (() => {
                const ttW = 80, ttH = 34, ttX = Math.min(Math.max(cx-ttW/2, padL), W-padR-ttW), ttY = cy-ttH-10;
                return <g><rect x={ttX} y={ttY} width={ttW} height={ttH} rx={6} fill={t.surfaceHigh} /><text x={ttX+ttW/2} y={ttY+13} textAnchor="middle" fontSize="11" fontWeight="700" fill={isPR ? "#ff9500" : t.text}>{p.value} lbs</text><text x={ttX+ttW/2} y={ttY+26} textAnchor="middle" fontSize="9" fill={t.textMuted}>{formatDay(p.date)}</text></g>;
              })()}
              {(points.length <= 6 || i === 0 || i === points.length-1 || i % Math.ceil(points.length/5) === 0) && (
                <text x={cx} y={H-4} textAnchor="middle" fontSize="9" fill={t.textMuted} transform={points.length > 8 ? `rotate(-35,${cx},${H-4})` : ""}>{formatDay(p.date)}</text>
              )}
            </g>
          );
        })}
        <line x1={padL} y1={padT} x2={padL} y2={padT+plotH} stroke={t.border} strokeWidth="1" />
      </svg>
    </div>
  );
}

// ── Big 3 PRs ─────────────────────────────────────────────────────────
function Big3PRs({ workouts }) {
  const t = useT();
  const cfg = {
    "Bench Press": { emoji: "🏋️", color: "#5b9bd5", borderColor: "#1a3a5a", bgColor: "rgba(58,111,168,0.1)" },
    "Squat":       { emoji: "🦵", color: "#5bb85b", borderColor: "#1a3a1a", bgColor: "rgba(74,122,74,0.1)" },
    "Deadlift":    { emoji: "⚡", color: "#d55b5b", borderColor: "#3a1a1a", bgColor: "rgba(138,58,58,0.1)" },
  };
  const getPR = (name) => {
    const ws = workouts.flatMap(w => w.exercises.filter(e => e.name === name).flatMap(e => e.sets)).map(s => parseFloat(s.weight)).filter(v => !isNaN(v) && v > 0);
    return ws.length ? Math.max(...ws) : null;
  };
  const getDate = (name) => { const w = workouts.find(w => w.exercises.some(e => e.name === name)); return w ? formatDate(w.date) : null; };
  const prs = BIG3.map(name => ({ name, pr: getPR(name), date: getDate(name) }));
  const maxPR = Math.max(...prs.map(p => p.pr || 0));
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Icon name="trophy" size={17} />
        <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 20, letterSpacing: 1.5 }}>BIG 3 PERSONAL RECORDS</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {prs.map(({ name, pr, date }) => {
          const c = cfg[name]; const isTop = pr && pr === maxPR;
          return (
            <div key={name} style={{ background: c.bgColor, border: `1px solid ${pr ? c.borderColor : t.border}`, borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, position: "relative", overflow: "hidden" }}>
              {pr && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: c.color, borderRadius: "14px 0 0 14px" }} />}
              <div style={{ width: 46, height: 46, borderRadius: 12, background: `${c.color}22`, border: `1px solid ${c.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{c.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>{name}</div>
                {pr
                  ? <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}><span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 32, letterSpacing: 1, color: c.color, lineHeight: 1 }}>{pr}</span><span style={{ color: t.textMuted, fontSize: 14 }}>lbs</span></div>
                  : <div style={{ color: t.textMuted, fontSize: 14, marginTop: 2 }}>Not logged yet</div>
                }
                {date && <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>Last: {date}</div>}
              </div>
              {pr && (
                <div style={{ textAlign: "center", flexShrink: 0 }}>
                  <div style={{ fontSize: 20, marginBottom: 2 }}>👑</div>
                  <div style={{ background: isTop ? "#ff9500" : "#333", color: isTop ? "#000" : "#aaa", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>{isTop ? "TOP PR" : "PR"}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Set Row ───────────────────────────────────────────────────────────
function SetRow({ set, index, onChange, onRemove }) {
  const t = useT(); const S = useS();
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
      <span style={{ width: 22, color: t.textMuted, fontSize: 13, textAlign: "center" }}>{index + 1}</span>
      <input type="number" inputMode="decimal" placeholder="lbs" value={set.weight} onChange={e => onChange({ ...set, weight: e.target.value })} style={S.inputStyle({ width: 76 })} />
      <span style={{ color: t.textMuted, fontSize: 13 }}>×</span>
      <input type="number" inputMode="numeric" placeholder="reps" value={set.reps} onChange={e => onChange({ ...set, reps: e.target.value })} style={S.inputStyle({ width: 68 })} />
      <button onClick={onRemove} style={S.iconBtn("#ff5b5b")}><Icon name="x" size={14} /></button>
    </div>
  );
}

// ── Exercise Block ────────────────────────────────────────────────────
function ExerciseBlock({ exercise, onChange, onRemove }) {
  const S = useS();
  const addSet = () => {
    const last = exercise.sets[exercise.sets.length - 1];
    if (last && (last.weight || last.reps)) { window.dispatchEvent(new Event("gt-start-timer")); }
    else { haptic(10); }
    onChange({ ...exercise, sets: [...exercise.sets, { weight: "", reps: "" }] });
  };
  const updateSet = (i, s) => { const sets = [...exercise.sets]; sets[i] = s; onChange({ ...exercise, sets }); };
  const removeSet = (i) => onChange({ ...exercise, sets: exercise.sets.filter((_, j) => j !== i) });
  return (
    <div style={S.card()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 20, letterSpacing: 1, color: accent }}>{exercise.name}</span>
        <button onClick={onRemove} style={S.iconBtn("#ff5b5b")}><Icon name="trash" size={15} /></button>
      </div>
      <div style={{ marginBottom: 8 }}>
        {exercise.sets.map((s, i) => <SetRow key={i} set={s} index={i} onChange={s => updateSet(i, s)} onRemove={() => removeSet(i)} />)}
      </div>
      <button onClick={addSet} style={S.ghostBtn()}><Icon name="plus" size={14} /> Add Set</button>
    </div>
  );
}

// ── History Card ──────────────────────────────────────────────────────
function WorkoutHistoryCard({ workout, index, onLabelChange, onDelete }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const swipeTouchX = useRef(null);
  const startOffset = useRef(0);
  const isDragging = useRef(false);
  const DELETE_W = 76;

  const activeLabels = workout.labels ? workout.labels : workout.label ? [workout.label] : [];
  const activeCfgs = activeLabels.map(id => WORKOUT_LABELS.find(l => l.id === id)).filter(Boolean);
  const toggleLabel = (e, id) => {
    e.stopPropagation();
    let next = activeLabels.includes(id) ? activeLabels.filter(l => l !== id) : activeLabels.length >= 3 ? [...activeLabels.slice(1), id] : [...activeLabels, id];
    onLabelChange(index, next);
  };

  const onCardTouchStart = (e) => {
    swipeTouchX.current = e.touches[0].clientX;
    startOffset.current = swipeOffset;
    isDragging.current = false;
  };
  const onCardTouchMove = (e) => {
    if (swipeTouchX.current === null) return;
    const dx = e.touches[0].clientX - swipeTouchX.current;
    if (Math.abs(dx) > 8) {
      isDragging.current = true;
      e.stopPropagation();
      setSwipeOffset(Math.max(Math.min(startOffset.current + dx, 0), -DELETE_W));
    }
  };
  const onCardTouchEnd = (e) => {
    if (isDragging.current) {
      e.stopPropagation();
      if (swipeOffset < -DELETE_W / 2) { setSwipeOffset(-DELETE_W); haptic(10); }
      else setSwipeOffset(0);
    } else if (swipeOffset !== 0) {
      e.stopPropagation();
      setSwipeOffset(0);
    }
    swipeTouchX.current = null;
  };

  return (
    <div style={{ position: "relative", marginBottom: 10, borderRadius: 14, overflow: "hidden" }}>
      {/* Delete button revealed on swipe left */}
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: DELETE_W, background: "#d55b5b", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", borderRadius: "0 14px 14px 0" }}
        onClick={() => { haptic([0, 60, 30, 60]); onDelete(index); }}>
        <Icon name="trash" size={18} />
        <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>Delete</span>
      </div>
      {/* Sliding card */}
      <div style={{ transform: `translateX(${swipeOffset}px)`, transition: isDragging.current ? "none" : "transform 0.25s ease" }}
        onTouchStart={onCardTouchStart} onTouchMove={onCardTouchMove} onTouchEnd={onCardTouchEnd}>
        <div style={{ background: t.surfaceHigh, border: `1px solid ${activeCfgs.length ? activeCfgs[0].border : t.border}`, borderRadius: 14, overflow: "hidden", transition: "border-color 0.2s" }}>
          <div onClick={() => { if (swipeOffset !== 0) { setSwipeOffset(0); return; } setOpen(o => !o); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "13px 16px", cursor: "pointer", background: activeCfgs.length ? activeCfgs[0].bg : "transparent", transition: "background 0.2s" }}>
            {activeCfgs.length ? (
              <div style={{ display: "flex", gap: 5, flexShrink: 0, flexWrap: "wrap", maxWidth: 180 }}>
                {activeCfgs.map(c => (
                  <span key={c.id} style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color, borderRadius: 6, padding: "2px 7px", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}>
                    {c.emoji} {c.label}
                  </span>
                ))}
              </div>
            ) : (
              <span style={{ color: t.textMuted, flexShrink: 0, display: "flex" }}><Icon name="tag" size={14} /></span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: t.text }}>{formatDate(workout.date)}</div>
              <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>
                {workout.exercises.length} exercise{workout.exercises.length !== 1 ? "s" : ""}{workout.duration ? ` · ${workout.duration}min` : ""}
              </div>
            </div>
            <span style={{ color: t.textMuted, flexShrink: 0, display: "flex", transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}><Icon name="chevronDown" size={16} /></span>
          </div>
          {open && (
            <div style={{ padding: "0 16px 14px" }}>
              {/* Tag picker */}
              <div style={{ marginBottom: 12, paddingTop: 12, borderTop: `1px solid ${t.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>Tag this workout</div>
                  <div style={{ fontSize: 10, color: t.textMuted }}>{activeLabels.length}/3 selected</div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {WORKOUT_LABELS.map(l => {
                    const isActive = activeLabels.includes(l.id);
                    return (
                      <button key={l.id} onClick={(e) => toggleLabel(e, l.id)} style={{ background: isActive ? l.bg : "transparent", border: `1px solid ${isActive ? l.border : t.border}`, color: isActive ? l.color : t.textMuted, borderRadius: 8, padding: "5px 11px", fontSize: 12, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 5, transition: "all 0.15s", opacity: (!isActive && activeLabels.length >= 3) ? 0.4 : 1 }}>
                        {l.emoji} {l.label}{isActive && <span style={{ fontSize: 10, marginLeft: 1, opacity: 0.7 }}>✕</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Sets */}
              {workout.exercises.map((ex, j) => (
                <div key={j} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: j < workout.exercises.length - 1 ? `1px solid ${t.border}` : "none" }}>
                  <div style={{ color: accent, fontSize: 13, fontWeight: 700, marginBottom: 5 }}>{ex.name}</div>
                  {ex.sets.map((s, k) => (
                    <div key={k} style={{ display: "flex", gap: 8, fontSize: 13 }}>
                      <span style={{ color: t.textMuted, width: 18 }}>{k + 1}.</span>
                      <span style={{ color: t.textSub }}>{s.weight} lbs</span>
                      <span style={{ color: t.textMuted }}>×</span>
                      <span style={{ color: t.textSub }}>{s.reps} reps</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Security Settings Component ───────────────────────────────────────
function SecuritySettings({ authedUser }) {
  const t = useT();
  const [showSecurity, setShowSecurity] = useState(false);
  const [secTab, setSecTab] = useState("email");
  const [newEmail, setNewEmail] = useState("");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [secMsg, setSecMsg] = useState(null);
  const [secVerify, setSecVerify] = useState(false);

  const pField = { background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 9, color: t.text, padding: "10px 13px", fontSize: 15, outline: "none", width: "100%", boxSizing: "border-box", marginBottom: 0 };
  const lbl = { fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5, display: "block" };

  const pwRules = [
    { label: "8+ characters", ok: newPw.length >= 8 },
    { label: "Uppercase",     ok: /[A-Z]/.test(newPw) },
    { label: "Lowercase",     ok: /[a-z]/.test(newPw) },
    { label: "Number",        ok: /[0-9]/.test(newPw) },
  ];
  const pwValid = pwRules.every(r => r.ok);

  const handleEmailChange = () => {
    const users = getUsers();
    const user = users[authedUser];
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      setSecMsg({ type: "error", text: "Please enter a valid email address." }); return;
    }
    if (newEmail === user.email) {
      setSecMsg({ type: "error", text: "That's already your current email." }); return;
    }
    if (Object.entries(users).some(([u, d]) => u !== authedUser && d.email === newEmail)) {
      setSecMsg({ type: "error", text: "That email is already linked to another account." }); return;
    }
    users[authedUser] = { ...user, email: newEmail, verified: false };
    saveUsers(users);
    setSecVerify(true);
    setSecMsg({ type: "success", text: `Verification sent to ${newEmail}` });
  };

  const handlePasswordChange = () => {
    const users = getUsers();
    const user = users[authedUser];
    if (user.passwordHash !== btoa(currentPw)) {
      setSecMsg({ type: "error", text: "Current password is incorrect." }); return;
    }
    if (!pwValid) {
      setSecMsg({ type: "error", text: "New password doesn't meet all requirements." }); return;
    }
    if (newPw !== confirmPw) {
      setSecMsg({ type: "error", text: "Passwords do not match." }); return;
    }
    users[authedUser] = { ...user, passwordHash: btoa(newPw), verified: false };
    saveUsers(users);
    setSecVerify(true);
    setSecMsg({ type: "success", text: `Confirmation sent to ${user.email}` });
  };

  const confirmVerified = () => {
    const users = getUsers();
    users[authedUser].verified = true;
    saveUsers(users);
    setSecVerify(false); setShowSecurity(false);
    setNewEmail(""); setCurrentPw(""); setNewPw(""); setConfirmPw("");
    setSecMsg({ type: "success", text: secTab === "email" ? "Email updated and verified." : "Password updated and verified." });
  };

  if (secVerify) return (
    <div style={{ marginTop: 20, background: `${accent}10`, border: `1px solid ${accent}44`, borderRadius: 12, padding: "20px 16px", textAlign: "center" }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>📬</div>
      <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 18, color: t.text, marginBottom: 8 }}>Check Your Inbox</div>
      <div style={{ fontSize: 13, color: t.textSub, marginBottom: 16, lineHeight: 1.6 }}>
        {secTab === "email"
          ? `A verification link has been sent to ${newEmail}. Click it to confirm your new email address.`
          : `A confirmation email has been sent to your registered address. Click the link to confirm your new password.`}
      </div>
      <button onClick={confirmVerified} style={{ background: accent, color: "#000", border: "none", borderRadius: 9, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 8, width: "100%" }}>
        I've Verified — Continue
      </button>
      <button onClick={() => { setSecVerify(false); setSecMsg(null); }} style={{ background: "transparent", border: `1px solid ${t.border}`, color: t.textMuted, borderRadius: 9, padding: "8px 24px", fontSize: 13, cursor: "pointer", width: "100%" }}>
        Back
      </button>
    </div>
  );

  return (
    <div style={{ marginTop: 20 }}>
      <button onClick={() => { setShowSecurity(s => !s); setSecMsg(null); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: showSecurity ? "10px 10px 0 0" : 10, padding: "12px 14px", cursor: "pointer", color: t.text, fontWeight: 600, fontSize: 13, boxSizing: "border-box" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="shield" size={14} /> Security Settings
        </span>
        <span style={{ color: t.textMuted, fontSize: 11, transition: "transform 0.2s", display: "inline-block", transform: showSecurity ? "rotate(180deg)" : "none" }}>▼</span>
      </button>

      {showSecurity && (
        <div style={{ border: `1px solid ${t.border}`, borderTop: "none", borderRadius: "0 0 10px 10px", padding: "16px 14px", background: t.surfaceHigh }}>
          {/* Tab toggle */}
          <div style={{ display: "flex", background: t.inputBg, borderRadius: 8, padding: 3, marginBottom: 16, gap: 3 }}>
            {["email", "password"].map(tab => (
              <button key={tab} onClick={() => { setSecTab(tab); setSecMsg(null); }} style={{ flex: 1, background: secTab === tab ? accent : "transparent", color: secTab === tab ? "#000" : t.textMuted, border: "none", borderRadius: 6, padding: "7px 0", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}>
                {tab === "email" ? "Change Email" : "Change Password"}
              </button>
            ))}
          </div>

          {secTab === "email" && (
            <div>
              <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
                Current: <span style={{ color: t.text, fontWeight: 600 }}>{getUsers()[authedUser]?.email || "—"}</span>
              </div>
              <label style={lbl}>New Email Address</label>
              <input type="email" value={newEmail} onChange={e => { setNewEmail(e.target.value); setSecMsg(null); }} placeholder="new@email.com" style={{ ...pField, marginBottom: 12 }} />
              <button onClick={handleEmailChange} style={{ width: "100%", background: accent, color: "#000", border: "none", borderRadius: 9, padding: "11px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Bebas Neue', cursive", letterSpacing: 1 }}>
                Update Email
              </button>
            </div>
          )}

          {secTab === "password" && (
            <div>
              <label style={lbl}>Current Password</label>
              <input type="password" value={currentPw} onChange={e => { setCurrentPw(e.target.value); setSecMsg(null); }} placeholder="Enter current password" style={{ ...pField, marginBottom: 12 }} />
              <label style={lbl}>New Password</label>
              <input type="password" value={newPw} onChange={e => { setNewPw(e.target.value); setSecMsg(null); }} placeholder="Enter new password" style={{ ...pField, marginBottom: 8 }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {pwRules.map(r => (
                  <span key={r.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: r.ok ? "#5bb85b" : t.textMuted }}>
                    <span style={{ width: 14, height: 14, borderRadius: "50%", background: r.ok ? "rgba(91,184,91,0.15)" : t.inputBg, border: `1px solid ${r.ok ? "#5bb85b" : t.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9 }}>{r.ok ? "✓" : ""}</span>
                    {r.label}
                  </span>
                ))}
              </div>
              <label style={lbl}>Confirm New Password</label>
              <input type="password" value={confirmPw} onChange={e => { setConfirmPw(e.target.value); setSecMsg(null); }} placeholder="Confirm new password" style={{ ...pField, marginBottom: 12 }} />
              <button onClick={handlePasswordChange} style={{ width: "100%", background: accent, color: "#000", border: "none", borderRadius: 9, padding: "11px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Bebas Neue', cursive", letterSpacing: 1 }}>
                Update Password
              </button>
            </div>
          )}

          {secMsg && (
            <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: secMsg.type === "error" ? "rgba(213,91,91,0.12)" : "rgba(91,184,91,0.12)", color: secMsg.type === "error" ? "#d55b5b" : "#5bb85b", border: `1px solid ${secMsg.type === "error" ? "rgba(213,91,91,0.3)" : "rgba(91,184,91,0.3)"}` }}>
              {secMsg.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Admin Panel ───────────────────────────────────────────────────────
function AdminPanel({ currentUser }) {
  const t = useT(); const S = useS();
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [users, setUsers] = useState(() => getUsers());

  const refresh = () => setUsers(getUsers());

  const deleteUser = (username) => {
    if (username === ADMIN_USER) return;
    const u = getUsers();
    delete u[username];
    saveUsers(u);
    try { localStorage.removeItem(getUserKey(username)); } catch {}
    setConfirmDelete(null);
    refresh();
  };

  const getUserStats = (username) => {
    try {
      const raw = localStorage.getItem(getUserKey(username));
      const data = raw ? JSON.parse(raw) : { workouts: [] };
      return {
        workouts: data.workouts?.length || 0,
        exercises: [...new Set((data.workouts || []).flatMap(w => w.exercises?.map(e => e.name) || []))].length,
        lastSession: data.workouts?.[0]?.date || null,
      };
    } catch { return { workouts: 0, exercises: 0, lastSession: null }; }
  };

  const allUsers = Object.entries(users).sort(([a], [b]) => a === ADMIN_USER ? -1 : b === ADMIN_USER ? 1 : a.localeCompare(b));
  const totalWorkouts = allUsers.reduce((acc, [u]) => acc + getUserStats(u).workouts, 0);

  return (
    <div style={{ padding: "24px 20px 100px" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 20 }}>⚙️</span>
          <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 32, letterSpacing: 1 }}>
            Admin <span style={{ color: accent }}>Panel</span>
          </div>
        </div>
        <div style={{ color: t.textMuted, fontSize: 12 }}>Device user management — GymTrack v{APP_VERSION}</div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Total Users", value: allUsers.length },
          { label: "Total Workouts", value: totalWorkouts },
          { label: "Active Accounts", value: allUsers.filter(([u]) => getUserStats(u).workouts > 0).length },
        ].map(s => (
          <div key={s.label} style={{ ...S.card(), textAlign: "center", padding: "12px 8px", marginBottom: 0 }}>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 26, color: accent, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* User list */}
      <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
        Registered Users
      </div>

      {allUsers.map(([username, info]) => {
        const stats = getUserStats(username);
        const isAdmin = username === ADMIN_USER;
        return (
          <div key={username} style={{ ...S.card(), marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {/* Avatar */}
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: isAdmin ? `${accent}22` : t.surfaceHigh, border: `2px solid ${isAdmin ? accent : t.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0, fontWeight: 700, color: isAdmin ? accent : t.text }}>
                  {username[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: t.text }}>@{username}</span>
                    {isAdmin && <span style={{ background: accent, color: "#000", fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "1px 6px", letterSpacing: 0.5 }}>⚙ ADMIN</span>}
                    {info.verified && <span style={{ background: "rgba(91,184,91,0.12)", border: "1px solid rgba(91,184,91,0.3)", color: "#5bb85b", fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "1px 6px" }}>✓</span>}
                  </div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{info.email || "—"}</div>
                </div>
              </div>
              {!isAdmin && (
                <button onClick={() => setConfirmDelete(username)} style={{ background: "rgba(213,91,91,0.1)", border: "1px solid rgba(213,91,91,0.3)", color: "#d55b5b", borderRadius: 7, padding: "5px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  Delete
                </button>
              )}
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", gap: 16, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${t.border}` }}>
              {[
                { label: "Workouts", val: stats.workouts },
                { label: "Exercises", val: stats.exercises },
                { label: "Last Session", val: stats.lastSession ? new Date(stats.lastSession).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—" },
              ].map(s => (
                <div key={s.label}>
                  <div style={{ fontSize: 10, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.4 }}>{s.label}</div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: t.text, marginTop: 2 }}>{s.val}</div>
                </div>
              ))}
            </div>

            {/* Delete confirm */}
            {confirmDelete === username && (
              <div style={{ marginTop: 12, background: "rgba(213,91,91,0.08)", border: "1px solid rgba(213,91,91,0.3)", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ color: "#d55b5b", fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
                  Permanently delete @{username} and all their data?
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => deleteUser(username)} style={{ flex: 1, background: "#d55b5b", color: "#fff", border: "none", borderRadius: 7, padding: "8px 0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Yes, Delete</button>
                  <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, background: "transparent", border: `1px solid ${t.border}`, color: t.textSub, borderRadius: 7, padding: "8px 0", fontSize: 12, cursor: "pointer" }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Google Sign In (Coming Soon) ──────────────────────────────────────
function GoogleSignInButton() {
  return (
    <div style={{ marginBottom: 10 }}>
      <button disabled style={{ width: "100%", background: "#1a1a1a", border: "1px solid #2e2e2e", borderRadius: 11, color: "#ccc", padding: "13px 16px", fontSize: 14, fontWeight: 600, cursor: "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, opacity: 0.45, boxSizing: "border-box" }}>
        <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Continue with Google
      </button>
      <div style={{ textAlign: "center", fontSize: 10, color: "#444", marginTop: 4 }}>Coming soon</div>
    </div>
  );
}

// ── Landing Page ──────────────────────────────────────────────────────
function LandingPage({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [animIn, setAnimIn] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const bg = THEMES.dark.bg; const sh = THEMES.dark.surfaceHigh;

  useEffect(() => { setTimeout(() => setAnimIn(true), 60); }, []);

  const switchMode = (m) => { setMode(m); setError(""); setUsername(""); setEmail(""); setPassword(""); };

  const handleSubmit = () => {
    const u = username.trim(), em = email.trim();
    if (mode === "signup") {
      if (!u || !em || !password) { setError("Please fill in all fields."); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setError("Please enter a valid email address."); return; }
      const users = getUsers();
      if (users[u]) { setError("Username already exists."); return; }
      if (Object.values(users).some(usr => usr.email === em)) { setError("An account with this email already exists."); return; }
      if (password.length < 8)       { setError("Password must be at least 8 characters."); return; }
      if (!/[A-Z]/.test(password))   { setError("Password must include at least 1 uppercase letter."); return; }
      if (!/[a-z]/.test(password))   { setError("Password must include at least 1 lowercase letter."); return; }
      if (!/[0-9]/.test(password))   { setError("Password must include at least 1 digit."); return; }
      users[u] = { passwordHash: btoa(password), email: em, verified: false };
      saveUsers(users);
      setVerifiedEmail(em);
      setMode("verify");
    } else {
      if (!u || !password) { setError("Please fill in all fields."); return; }
      const users = getUsers();
      if (!users[u] || users[u].passwordHash !== btoa(password)) { setError("Invalid username or password."); return; }
      onLogin(u, false);
    }
  };

  const fStyle = { background: "#111", border: "1px solid #2d2d2d", borderRadius: 11, color: "#fff", padding: "13px 16px", fontSize: 16, outline: "none", width: "100%", boxSizing: "border-box" };

  return (
    <div style={{ background: bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 28px", fontFamily: "'DM Sans', sans-serif", maxWidth: 420, margin: "0 auto" }}>
      <style>{`
        @keyframes gt-line-grow { from { transform: scaleX(0); opacity: 0; } to { transform: scaleX(1); opacity: 1; } }
        @keyframes gt-gym-in { from { opacity: 0; letter-spacing: 12px; } to { opacity: 1; letter-spacing: 4px; } }
        @keyframes gt-track-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes gt-tag-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes gt-accent-pulse { 0%,100% { text-shadow: 0 0 0px rgba(232,255,71,0); } 50% { text-shadow: 0 0 18px rgba(232,255,71,0.35); } }
      `}</style>
      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, marginBottom: 14, transformOrigin: "center", animation: "gt-line-grow 1.4s cubic-bezier(0.16,1,0.3,1) 0.2s both" }} />
        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 52, lineHeight: 1, display: "flex", alignItems: "baseline", justifyContent: "center" }}>
          <span style={{ color: "#ffffff", letterSpacing: 4, animation: "gt-gym-in 1.2s cubic-bezier(0.16,1,0.3,1) 0.6s both", display: "inline-block" }}>GYM</span>
          <span style={{ color: accent, letterSpacing: 4, animation: "gt-track-in 1.2s cubic-bezier(0.16,1,0.3,1) 1.3s both, gt-accent-pulse 3s ease-in-out 3s infinite", display: "inline-block" }}>TRACK</span>
        </div>
        <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${accent}55, transparent)`, marginTop: 14, transformOrigin: "center", animation: "gt-line-grow 1.4s cubic-bezier(0.16,1,0.3,1) 0.9s both" }} />
        <div style={{ color: "#444", fontSize: 13, marginTop: 12, letterSpacing: 2, textTransform: "uppercase", animation: "gt-tag-in 1s ease 2.2s both" }}>Train · Log · Improve</div>
      </div>
      {/* Card */}
      <div style={{ width: "100%", background: sh, borderRadius: 18, border: "1px solid #2a2a2a", padding: "28px 24px", opacity: animIn ? 1 : 0, transform: animIn ? "translateY(0)" : "translateY(20px)", transition: "all 0.5s ease 0.1s" }}>
        {mode === "verify" ? (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📬</div>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, letterSpacing: 1, color: "#fff", marginBottom: 10 }}>Check Your Inbox</div>
            <div style={{ color: "#666", fontSize: 14, lineHeight: 1.6, marginBottom: 6 }}>A verification email has been sent to</div>
            <div style={{ color: accent, fontSize: 14, fontWeight: 700, marginBottom: 20, wordBreak: "break-all" }}>{verifiedEmail}</div>
            <div style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 10, padding: "14px 16px", fontSize: 13, color: "#555", lineHeight: 1.7, marginBottom: 24, textAlign: "left" }}>
              <div style={{ color: "#888", marginBottom: 4, fontWeight: 600 }}>Next steps:</div>
              <div>1. Open the email from <span style={{ color: "#777" }}>noreply@gymtrack.app</span></div>
              <div>2. Click the <span style={{ color: accent }}>Activate Account</span> link</div>
              <div>3. Return here to sign in</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={() => { const users = getUsers(); const u = Object.keys(users).find(k => users[k].email === verifiedEmail); if (u) { users[u].verified = true; saveUsers(users); onLogin(u, true); } }} style={{ width: "100%", background: accent, color: "#000", border: "none", borderRadius: 11, padding: 14, fontSize: 16, fontWeight: 700, fontFamily: "'Bebas Neue', cursive", letterSpacing: 1, cursor: "pointer" }}>I've Verified — Continue</button>
              <button onClick={() => switchMode("login")} style={{ width: "100%", background: "transparent", color: "#555", border: "1px solid #2a2a2a", borderRadius: 11, padding: 12, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Back to Sign In</button>
            </div>
            <div style={{ marginTop: 16, fontSize: 12, color: "#3a3a3a" }}>Didn't receive it? Check your spam folder</div>
          </div>
        ) : (
          <>
            {/* Tab toggle */}
            <div style={{ display: "flex", background: "#111", borderRadius: 10, padding: 4, marginBottom: 24, gap: 4 }}>
              {["login", "signup"].map(m => (
                <button key={m} onClick={() => switchMode(m)} style={{ flex: 1, background: mode === m ? accent : "transparent", color: mode === m ? "#000" : "#555", border: "none", borderRadius: 7, padding: "9px 0", cursor: "pointer", fontFamily: "'Bebas Neue', cursive", letterSpacing: 1, fontSize: 15, transition: "all 0.2s" }}>
                  {m === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
                </button>
              ))}
            </div>
            {/* Fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 8 }}>
              <div>
                <label style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 0.6, display: "block", marginBottom: 6 }}>Username</label>
                <input value={username} onChange={e => { setUsername(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && handleSubmit()} placeholder="Enter your username" autoComplete="username" style={fStyle} />
              </div>
              {mode === "signup" && (
                <div>
                  <label style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 0.6, display: "block", marginBottom: 6 }}>Email</label>
                  <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && handleSubmit()} placeholder="Enter your email" autoComplete="email" style={fStyle} />
                </div>
              )}
              <div>
                <label style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 0.6, display: "block", marginBottom: 6 }}>Password</label>
                <div style={{ position: "relative" }}>
                  <input type={showPass ? "text" : "password"} value={password} onChange={e => { setPassword(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && handleSubmit()} placeholder="Enter your password" autoComplete={mode === "signup" ? "new-password" : "current-password"} style={{ ...fStyle, paddingRight: 56 }} />
                  <button onClick={() => setShowPass(s => !s)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "#555", cursor: "pointer", fontSize: 11, fontWeight: 700, padding: 4 }}>{showPass ? "HIDE" : "SHOW"}</button>
                </div>
                {mode === "signup" && (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
                    {[
                      { label: "At least 8 characters",   ok: password.length >= 8 },
                      { label: "1 uppercase letter (A–Z)", ok: /[A-Z]/.test(password) },
                      { label: "1 lowercase letter (a–z)", ok: /[a-z]/.test(password) },
                      { label: "1 digit (0–9)",            ok: /[0-9]/.test(password) },
                    ].map(r => (
                      <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
                        <span style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: r.ok ? "rgba(91,184,91,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${r.ok ? "#5bb85b" : "#333"}`, fontSize: 9, transition: "all 0.2s" }}>
                          {r.ok ? <span style={{ color: "#5bb85b" }}>✓</span> : ""}
                        </span>
                        <span style={{ color: r.ok ? "#5bb85b" : "#555", transition: "color 0.2s" }}>{r.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {error && <div style={{ background: "rgba(213,91,91,0.12)", border: "1px solid rgba(213,91,91,0.3)", color: "#d55b5b", borderRadius: 8, padding: "9px 13px", fontSize: 13, marginBottom: 16, marginTop: 8 }}>{error}</div>}
            <button onClick={handleSubmit} style={{ width: "100%", background: accent, color: "#000", border: "none", borderRadius: 11, padding: 15, marginTop: error ? 0 : 16, fontFamily: "'Bebas Neue', cursive", letterSpacing: 1.5, fontSize: 20, cursor: "pointer" }}>
              {mode === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
            </button>
            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0 16px" }}>
              <div style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
              <span style={{ color: "#444", fontSize: 12, letterSpacing: 0.5 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
            </div>
            {/* Google Sign In */}
            <GoogleSignInButton />
            {/* Apple — coming soon */}
            <div style={{ marginBottom: 10 }}>
              <button disabled style={{ width: "100%", background: "#1a1a1a", border: "1px solid #2e2e2e", borderRadius: 11, color: "#ccc", padding: "13px 16px", fontSize: 14, fontWeight: 600, cursor: "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, opacity: 0.45, boxSizing: "border-box" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#ffffff"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                Continue with Apple
              </button>
              <div style={{ textAlign: "center", fontSize: 10, color: "#444", marginTop: 4 }}>Coming soon</div>
            </div>
          </>
        )}
      </div>
      <div style={{ marginTop: 24, color: "#333", fontSize: 12, textAlign: "center", opacity: animIn ? 1 : 0, transition: "opacity 0.5s ease 0.3s" }}>Data stored locally on this device</div>
    </div>
  );
}

// ── Streak Calculator ─────────────────────────────────────────────────
const calcStreak = (workouts) => {
  if (!workouts.length) return 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const uniqueDates = [...new Set(workouts.map(w => w.date))].sort().reverse();
  let streak = 0, expected = new Date(today);
  for (const dateStr of uniqueDates) {
    const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
    const diff = Math.round((expected - d) / 86400000);
    if (diff === 0 || diff === 1) { streak++; expected = new Date(d); }
    else break;
  }
  return streak;
};

// ── Workout Complete Screen ───────────────────────────────────────────
function WorkoutCompleteScreen({ workout, prevWorkouts, onClose }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 30);
    const t2 = setTimeout(onClose, 8000);
    if (prs.length > 0) haptic([0, 80, 40, 80, 40, 200]);
    else haptic([0, 60, 30, 60]);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onClose]); // eslint-disable-line

  const totalSets = workout.exercises.reduce((n, ex) => n + ex.sets.length, 0);
  const totalReps = workout.exercises.reduce((n, ex) => n + ex.sets.reduce((s, set) => s + (parseInt(set.reps) || 0), 0), 0);
  const prs = [];
  workout.exercises.forEach(ex => {
    const best = Math.max(0, ...ex.sets.map(s => parseFloat(s.weight) || 0));
    if (best > 0) {
      const prevBest = Math.max(0, ...prevWorkouts.flatMap(w => w.exercises.filter(e => e.name === ex.name).flatMap(e => e.sets.map(s => parseFloat(s.weight) || 0))));
      if (best > prevBest) prs.push({ name: ex.name, weight: best });
    }
  });
  const COLORS = ["#e8ff47","#ff9500","#5bb85b","#5b9bd5","#d55b5b","#b55bd5","#ffffff"];
  const pieces = Array.from({ length: 50 }, (_, i) => ({
    id: i, color: COLORS[i % COLORS.length],
    left: Math.random() * 100, delay: Math.random() * 2.5,
    dur: 2.5 + Math.random() * 2.5, size: 5 + Math.random() * 9,
    isCircle: i % 3 === 0,
  }));

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "#0a0a0a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", overflow: "hidden", opacity: visible ? 1 : 0, transition: "opacity 0.4s ease" }}>
      <style>{`@keyframes cffall{0%{transform:translateY(-20px) rotate(0deg);opacity:1}100%{transform:translateY(115vh) rotate(720deg);opacity:0}}`}</style>
      {pieces.map(c => (
        <div key={c.id} style={{ position: "absolute", top: -12, left: `${c.left}%`, width: c.size, height: c.size, background: c.color, borderRadius: c.isCircle ? "50%" : 2, animation: `cffall ${c.dur}s ${c.delay}s ease-in forwards`, opacity: 0, pointerEvents: "none" }} />
      ))}
      <div style={{ textAlign: "center", position: "relative", zIndex: 1, width: "100%", maxWidth: 340 }}>
        <div style={{ fontSize: 72, marginBottom: 6, lineHeight: 1 }}>🏆</div>
        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 44, letterSpacing: 2, color: accent, lineHeight: 1 }}>WORKOUT</div>
        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 44, letterSpacing: 2, color: "#fff", lineHeight: 1, marginBottom: 28 }}>COMPLETE!</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: prs.length ? 16 : 28 }}>
          {[
            { label: "Duration", value: `${workout.duration || 0}m`, icon: "⏱" },
            { label: "Exercises", value: workout.exercises.length, icon: "📋" },
            { label: "Sets", value: totalSets, icon: "🔁" },
            { label: "Total Reps", value: totalReps, icon: "💪" },
          ].map(s => (
            <div key={s.label} style={{ background: "#161616", border: "1px solid #252525", borderRadius: 16, padding: "14px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 22, marginBottom: 5 }}>{s.icon}</div>
              <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 28, color: accent, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
        {prs.length > 0 && (
          <div style={{ background: "rgba(255,149,0,0.08)", border: "1px solid rgba(255,149,0,0.3)", borderRadius: 14, padding: "12px 16px", marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#ff9500", marginBottom: 8 }}>👑 New Personal Records!</div>
            {prs.map((pr, i) => (
              <div key={i} style={{ fontSize: 13, color: "#ccc", marginBottom: i < prs.length - 1 ? 4 : 0 }}>
                <span style={{ color: "#ff9500", fontWeight: 700 }}>{pr.name}</span> — {pr.weight} lbs
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} style={{ background: accent, color: "#000", border: "none", borderRadius: 16, padding: "16px 0", fontSize: 18, fontWeight: 700, cursor: "pointer", touchAction: "manipulation", width: "100%", fontFamily: "'Bebas Neue', cursive", letterSpacing: 1 }}>
          LET'S GO 💪
        </button>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────
export default function App() {
  const [authedUser, setAuthedUser] = useState(() => { try { return sessionStorage.getItem("gymtrack-user") || null; } catch { return null; } });
  const [data, save] = useStorage(authedUser);
  const [view, setView] = useState("home");
  const [workout, setWorkout] = useState(null);
  const [exSearch, setExSearch] = useState("");
  const [showExPicker, setShowExPicker] = useState(false);
  const [completedWorkout, setCompletedWorkout] = useState(null);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("gymtrack-theme") || "dark"; } catch { return "dark"; } });
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState({});
  const [helpPage, setHelpPage] = useState(null);

  const t = THEMES[theme]; const S = makeStyles(t);
  const profile = data.profile || {};
  const SWIPE_VIEWS = ["home", "log", "history", "progress", "profile"];
  const touchX = useRef(null); const touchY = useRef(null);
  const onTouchStart = (e) => {
    touchX.current = e.touches[0].clientX; touchY.current = e.touches[0].clientY;
    if (!e.target.closest("input, textarea, select")) document.activeElement?.blur();
  };
  const onTouchEnd = (e) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    const dy = e.changedTouches[0].clientY - touchY.current;
    if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 55) {
      const idx = SWIPE_VIEWS.indexOf(view);
      if (dx < 0 && idx < SWIPE_VIEWS.length - 1) setView(SWIPE_VIEWS[idx + 1]);
      if (dx > 0 && idx > 0) setView(SWIPE_VIEWS[idx - 1]);
    }
    touchX.current = null;
  };
  const saveProfile = (updates) => save({ ...data, profile: { ...profile, ...updates } });
  const toggleTheme = () => { const n = theme === "dark" ? "light" : "dark"; setTheme(n); try { localStorage.setItem("gymtrack-theme", n); } catch {} };

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600&display=swap";
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.textContent = `
      * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
      html, body { overflow-x: hidden; -webkit-font-smoothing: antialiased; }
      ::-webkit-scrollbar { display: none; }
      input, textarea { -webkit-user-select: auto !important; user-select: auto !important; }
      button { -webkit-user-select: none; user-select: none; }
      button:active { transform: scale(0.96); }
    `;
    document.head.appendChild(style);
  }, []);

  const handleLogin = (username, isNew = false) => {
    try { sessionStorage.setItem("gymtrack-user", username); } catch {}
    setAuthedUser(username); setWorkout(null); setView(isNew ? "profile" : "home");
  };
  const handleLogout = () => {
    try { sessionStorage.removeItem("gymtrack-user"); } catch {}
    setAuthedUser(null); setWorkout(null); setView("home");
  };

  if (!authedUser) return <LandingPage onLogin={handleLogin} />;

  const allExercises = [...new Set([...DEFAULT_EXERCISES, ...data.workouts.flatMap(w => w.exercises.map(e => e.name))])].sort();
  const filtered = allExercises.filter(e => e.toLowerCase().includes(exSearch.toLowerCase()));

  const progressData = (exName) =>
    data.workouts.filter(w => w.exercises.some(e => e.name === exName))
      .map(w => { const ex = w.exercises.find(e => e.name === exName); const best = Math.max(...ex.sets.map(s => parseFloat(s.weight) || 0)); return { date: w.date, value: best }; })
      .reverse();

  const startWorkout = () => { if (!workout) setWorkout({ date: todayISO(), startTime: Date.now(), exercises: [] }); setView("log"); };
  const addExercise = (name) => {
    setWorkout(w => {
      const cur = w || { date: todayISO(), startTime: Date.now(), exercises: [] };
      return { ...cur, exercises: [...cur.exercises, { name, sets: [{ weight: "", reps: "" }] }] };
    });
    setShowExPicker(false); setExSearch("");
  };
  const finishWorkout = () => {
    const cleaned = { ...workout, duration: Math.round((Date.now() - workout.startTime) / 60000), exercises: workout.exercises.map(e => ({ ...e, sets: e.sets.filter(s => s.weight !== "" || s.reps !== "") })).filter(e => e.sets.length > 0) };
    const prev = data.workouts;
    save({ ...data, workouts: [cleaned, ...data.workouts] });
    haptic([0, 60, 30, 60, 30, 120]);
    setWorkout(null); setView("home");
    setCompletedWorkout({ workout: cleaned, prevWorkouts: prev });
  };
  const exportCSV = () => {
    const rows = [["Date", "Exercise", "Set", "Weight (lbs)", "Reps", "Tags"]];
    data.workouts.forEach(w => {
      const tags = (w.labels || (w.label ? [w.label] : [])).join("+");
      w.exercises.forEach(ex => ex.sets.forEach((s, i) => rows.push([w.date, ex.name, i + 1, s.weight, s.reps, tags])));
    });
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const dataUri = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    const a = document.createElement("a");
    a.href = dataUri;
    a.download = `gymtrack-${authedUser}-${todayISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const sel = (extra = {}) => ({ ...S.select(), ...extra });

  const navItem = (v, icon, label) => {
    const active = view === v;
    return (
      <button onClick={() => { if (v === "log" && !workout) setWorkout({ date: todayISO(), startTime: Date.now(), exercises: [] }); setView(v); }}
        style={{ flex: 1, background: "transparent", border: "none", borderTop: active ? `2px solid ${accent}` : "2px solid transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: active ? accent : t.textMuted, padding: "11px 0 9px", transition: "color 0.15s", touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}>
        <div style={{ transition: "transform 0.15s", transform: active ? "scale(1.1)" : "scale(1)" }}>
          <Icon name={icon} size={21} />
        </div>
        <span style={{ fontSize: 10, fontWeight: active ? 700 : 600, letterSpacing: 0.3, textTransform: "uppercase" }}>{label}</span>
      </button>
    );
  };

  return (
    <ThemeCtx.Provider value={theme}>
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ background: t.bg, minHeight: "100vh", color: t.text, fontFamily: "'DM Sans', sans-serif", maxWidth: 420, margin: "0 auto", position: "relative", paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))", transition: "background 0.3s, color 0.3s" }}>
      {completedWorkout && <WorkoutCompleteScreen workout={completedWorkout.workout} prevWorkouts={completedWorkout.prevWorkouts} onClose={() => setCompletedWorkout(null)} />}

      {/* ── HOME ─────────────────────────── */}
      {view === "home" && (() => {
        const hour = new Date().getHours();
        const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
        const displayName = profile.firstName || authedUser;
        const streak = calcStreak(data.workouts);
        const statsRow = [
          { label: "Total", value: data.workouts.length, icon: "🏋️" },
          { label: "This week", value: data.workouts.filter(w => (new Date() - new Date(w.date)) / 86400000 <= 7).length, icon: "🗓" },
          { label: "Exercises", value: [...new Set(data.workouts.flatMap(w => w.exercises.map(e => e.name)))].length, icon: "📋" },
        ];
        return (
          <div style={{ padding: "48px 20px 20px" }}>
            {/* Header */}
            <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ color: t.textMuted, fontSize: 13, marginBottom: 3 }}>{greeting},</div>
                <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 34, letterSpacing: 1.5, lineHeight: 1 }}>
                  {displayName} <span style={{ color: accent }}>💪</span>
                </div>
                <div style={{ color: t.textMuted, fontSize: 12, marginTop: 5 }}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
                {streak > 0 && <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,149,0,0.12)", border: "1px solid rgba(255,149,0,0.3)", borderRadius: 20, padding: "4px 12px", fontSize: 12, color: "#ff9500", fontWeight: 700, marginTop: 8 }}>🔥 {streak} day streak</div>}
              </div>
              <HelpBtn page="home" onOpen={() => setHelpPage("home")} />
            </div>
            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
              {statsRow.map(s => (
                <div key={s.label} style={{ background: t.surfaceHigh, borderRadius: 16, padding: "14px 8px 12px", textAlign: "center", border: `1px solid ${t.border}`, borderTop: `2px solid ${accent}44`, boxShadow: "0 2px 12px rgba(0,0,0,0.18)" }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
                  <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 28, color: accent, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: t.textMuted, marginTop: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
                </div>
              ))}
            </div>
            {/* CTA */}
            <button onClick={startWorkout} style={{ ...S.solidBtn(), width: "100%", padding: "17px", fontSize: 20, borderRadius: 16, marginBottom: 24, boxShadow: `0 4px 20px ${accent}44` }}>+ Start Workout</button>
            {/* Recent sessions */}
            {data.workouts.length > 0 && (
              <>
                <div style={{ color: t.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 12, fontWeight: 700 }}>Recent Sessions</div>
                {data.workouts.slice(0, 5).map((w, i) => {
                  const labels = w.labels || (w.label ? [w.label] : []);
                  const labelCfgs = labels.map(id => WORKOUT_LABELS.find(l => l.id === id)).filter(Boolean);
                  return (
                    <div key={i} style={{ ...S.card(), display: "flex", alignItems: "center", gap: 12, padding: "13px 16px" }}>
                      <div style={{ width: 42, height: 42, borderRadius: 12, background: labelCfgs[0] ? labelCfgs[0].bg : `${accent}15`, border: `1px solid ${labelCfgs[0] ? labelCfgs[0].border : accent + "30"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                        {labelCfgs[0] ? labelCfgs[0].emoji : "🏋️"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: t.text }}>{formatDate(w.date)}</div>
                        <div style={{ color: t.textMuted, fontSize: 12, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.exercises.map(e => e.name).join(" · ")}</div>
                      </div>
                      <div style={{ color: t.textMuted, fontSize: 12, flexShrink: 0 }}>{w.duration ? `${w.duration}m` : ""}</div>
                    </div>
                  );
                })}
              </>
            )}
            {data.workouts.length === 0 && (
              <div style={{ textAlign: "center", padding: "48px 0 24px", color: t.textMuted }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🏋️</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: t.textSub, marginBottom: 6 }}>No workouts yet</div>
                <div style={{ fontSize: 13 }}>Tap the button above to log your first session</div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── LOG ──────────────────────────── */}
      {view === "log" && (
        <div style={{ padding: "24px 20px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div>
              <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 28, letterSpacing: 1, lineHeight: 1 }}>Today's <span style={{ color: accent }}>Lift</span></div>
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3 }}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {workout && <div style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 8, padding: "5px 12px", fontSize: 13, color: t.textSub }}>⏱ {Math.round((Date.now() - workout.startTime) / 60000)}min</div>}
              <HelpBtn page="log" onOpen={() => setHelpPage("log")} />
            </div>
          </div>

          <RestTimer />

          {/* Quick-log last session */}
          {data.workouts.length > 0 && workout && workout.exercises.length === 0 && (
            <button onClick={() => {
              const last = data.workouts[0];
              setWorkout(w => ({ ...w, exercises: last.exercises.map(ex => ({ name: ex.name, sets: ex.sets.map(s => ({ weight: s.weight, reps: s.reps })) })) }));
            }} style={{ width: "100%", background: t.surfaceHigh, border: `1px dashed ${accent}55`, borderRadius: 14, color: t.textSub, padding: "13px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14, touchAction: "manipulation" }}>
              <span style={{ fontSize: 16 }}>↩</span> Repeat Last Session
            </button>
          )}

          {/* Load previous */}
          {(() => {
            const tagged = data.workouts.filter(w => (w.labels && w.labels.length) || w.label);
            if (!tagged.length) return null;
            const byLabel = {};
            tagged.forEach(w => { const pl = (w.labels && w.labels[0]) || w.label; if (pl && !byLabel[pl]) byLabel[pl] = { ...w, _pl: pl }; });
            const opts = Object.values(byLabel);
            return (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 7 }}>Load previous workout</div>
                <div style={{ position: "relative" }}>
                  <select value="" onChange={e => {
                    const id = e.target.value; if (!id) return;
                    const src = data.workouts.find(w => (w.labels && w.labels[0]) === id || w.label === id);
                    if (!src) return;
                    setWorkout(prev => ({ ...(prev || { date: todayISO(), startTime: Date.now(), exercises: [] }), exercises: src.exercises.map(ex => ({ name: ex.name, sets: ex.sets.map(s => ({ weight: s.weight, reps: s.reps })) })) }));
                    e.target.value = "";
                  }} style={{ ...sel(), width: "100%", padding: "10px 36px 10px 14px", fontSize: 14, color: t.text, borderRadius: 10, boxSizing: "border-box" }}>
                    <option value="">Select a tagged workout…</option>
                    {opts.map(w => {
                      const cfgs = (w.labels || [w.label]).filter(Boolean).map(id => WORKOUT_LABELS.find(l => l.id === id)).filter(Boolean);
                      return <option key={w._pl} value={w._pl} style={{ background: t.surfaceHigh, color: t.text }}>{cfgs.map(c => `${c.emoji} ${c.label}`).join(" + ") || w._pl} — {w.exercises.map(e => e.name).join(", ")}</option>;
                    })}
                  </select>
                  <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: t.textMuted, display: "flex" }}><Icon name="chevronDown" size={14} /></span>
                </div>
              </div>
            );
          })()}

          {workout && workout.exercises.map((ex, i) => (
            <ExerciseBlock key={i} exercise={ex}
              onChange={updated => { const exercises = [...workout.exercises]; exercises[i] = updated; setWorkout({ ...workout, exercises }); }}
              onRemove={() => setWorkout({ ...workout, exercises: workout.exercises.filter((_, j) => j !== i) })}
            />
          ))}

          {showExPicker ? (
            <div style={S.card()}>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input value={exSearch} onChange={e => setExSearch(e.target.value)} placeholder="Search or add exercise…" autoFocus style={{ ...S.inputStyle(), flex: 1, width: "auto" }} />
                <button onClick={() => setShowExPicker(false)} style={S.iconBtn()}><Icon name="x" size={16} /></button>
              </div>
              <div style={{ maxHeight: 220, overflowY: "auto" }}>
                {filtered.map(name => <button key={name} onClick={() => { if (!workout) setWorkout({ date: todayISO(), startTime: Date.now(), exercises: [] }); addExercise(name); }} style={{ display: "block", width: "100%", background: "transparent", border: "none", color: t.textSub, textAlign: "left", padding: "9px 6px", cursor: "pointer", fontSize: 14, borderBottom: `1px solid ${t.border}` }}>{name}</button>)}
                {exSearch && !filtered.find(e => e.toLowerCase() === exSearch.toLowerCase()) && <button onClick={() => { if (!workout) setWorkout({ date: todayISO(), startTime: Date.now(), exercises: [] }); addExercise(exSearch); }} style={{ display: "block", width: "100%", background: "transparent", border: "none", color: accent, textAlign: "left", padding: "9px 6px", cursor: "pointer", fontSize: 14 }}>+ Add "{exSearch}"</button>}
              </div>
            </div>
          ) : (
            <button onClick={() => { if (!workout) setWorkout({ date: todayISO(), startTime: Date.now(), exercises: [] }); setShowExPicker(true); }} style={{ ...S.ghostBtn(), width: "100%", justifyContent: "center", padding: "13px", marginBottom: 16, borderRadius: 10 }}>
              <Icon name="plus" size={15} /> Add Exercise
            </button>
          )}
          {workout && workout.exercises.length > 0 && <button onClick={finishWorkout} style={{ ...S.solidBtn(), width: "100%", padding: 14, borderRadius: 12, fontSize: 18, marginTop: 4 }}>Finish Workout</button>}
          {(!workout || workout.exercises.length === 0) && !showExPicker && (
            <div style={{ textAlign: "center", color: t.textMuted, padding: "28px 0 0", fontSize: 14 }}>
              <div>Add exercises or load a previous workout</div>
            </div>
          )}
        </div>
      )}

      {/* ── HISTORY ──────────────────────── */}
      {view === "history" && (
        <div style={{ padding: "24px 20px", paddingBottom: data.workouts.length > 0 ? "100px" : "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 32, letterSpacing: 1 }}>Workout <span style={{ color: accent }}>History</span></div>
            <div style={{ display: "flex", gap: 7, alignItems: "center", marginTop: 4 }}>
              {data.workouts.length > 0 && (
                <div style={{ position: "relative" }}>
                  <select defaultValue="" onChange={e => {
                    const days = parseInt(e.target.value); if (!days) return;
                    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
                    const idx = data.workouts.findIndex(w => new Date(w.date) >= cutoff);
                    if (idx !== -1) { const el = document.getElementById(`hcard-${idx}`); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }
                    e.target.value = "";
                  }} style={sel()}>
                    <option value="" disabled>Jump to…</option>
                    <option value="7"  style={{ background: t.surfaceHigh, color: t.text }}>Last 7 days</option>
                    <option value="14" style={{ background: t.surfaceHigh, color: t.text }}>Last 14 days</option>
                    <option value="21" style={{ background: t.surfaceHigh, color: t.text }}>Last 21 days</option>
                  </select>
                  <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: accent, display: "flex" }}><Icon name="chevronDown" size={12} /></span>
                </div>
              )}
              <HelpBtn page="history" onOpen={() => setHelpPage("history")} />
            </div>
          </div>
          <div style={{ color: t.textMuted, fontSize: 12, marginBottom: 18 }}>Tap any session to expand, tag, or delete it</div>
          {data.workouts.length === 0 && <div style={{ textAlign: "center", color: t.textMuted, padding: 40 }}>No history yet</div>}
          {data.workouts.map((w, i) => (
            <div key={i} id={`hcard-${i}`} style={{ scrollMarginTop: 16 }}>
              <WorkoutHistoryCard workout={w} index={i}
                onLabelChange={(idx, arr) => { const wks = [...data.workouts]; wks[idx] = { ...wks[idx], labels: arr, label: arr[0] || null }; save({ ...data, workouts: wks }); }}
                onDelete={(idx) => save({ ...data, workouts: data.workouts.filter((_, j) => j !== idx) })}
              />
            </div>
          ))}

          {/* Export — fixed above nav bar */}
          {data.workouts.length > 0 && (
            <div style={{
              position: "fixed", bottom: "calc(62px + env(safe-area-inset-bottom, 0px))", left: "50%", transform: "translateX(-50%)",
              width: "100%", maxWidth: 420, display: "flex", justifyContent: "center",
              padding: "10px 20px", boxSizing: "border-box",
              background: `linear-gradient(to top, ${t.bg} 60%, transparent)`,
              pointerEvents: "none",
            }}>
              <button
                onClick={exportCSV}
                style={{
                  pointerEvents: "all",
                  background: t.surfaceHigh,
                  border: `1px solid ${t.border}`,
                  color: t.textSub,
                  borderRadius: 10,
                  padding: "11px 28px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                }}
              >
                <Icon name="download" size={15} /> Export Workouts
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── PROGRESS ─────────────────────── */}
      {view === "progress" && (
        <div style={{ padding: "24px 20px" }}>
          <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 32, letterSpacing: 1, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Your <span style={{ color: accent }}>Progress</span></span>
            <HelpBtn page="progress" onOpen={() => setHelpPage("progress")} />
          </div>
          <Big3PRs workouts={data.workouts} />
          <div style={{ borderTop: `1px solid ${t.border}`, margin: "22px 0 18px" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 20, letterSpacing: 1, color: t.textSub }}>EXERCISE PROGRESSION</div>
            {data.workouts.length > 0 && (() => {
              const names = [...new Set(data.workouts.flatMap(w => w.exercises.map(e => e.name)))].sort();
              return names.length ? (
                <div style={{ position: "relative" }}>
                  <select defaultValue="" onChange={e => { const el = document.getElementById(`exc-${e.target.value.replace(/\s+/g, "-")}`); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); e.target.value = ""; }} style={sel()}>
                    <option value="" disabled>Jump to…</option>
                    {names.map(n => <option key={n} value={n} style={{ background: t.surfaceHigh, color: t.text }}>{n}</option>)}
                  </select>
                  <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: accent, display: "flex" }}><Icon name="chevronDown" size={13} /></span>
                </div>
              ) : null;
            })()}
          </div>
          {data.workouts.length === 0
            ? <div style={{ color: t.textMuted, fontSize: 14, textAlign: "center", padding: "32px 0" }}><Icon name="chart" size={32} /><div style={{ marginTop: 12 }}>Log workouts to see progression charts</div></div>
            : (() => {
                const names = [...new Set(data.workouts.flatMap(w => w.exercises.map(e => e.name)))].sort();
                const palette = ["#e8ff47", "#5b9bd5", "#5bb85b", "#d55b5b", "#b55bd5", "#d5a55b", "#5bd5d5", "#d55ba0"];
                return names.map((name, idx) => {
                  const pts = progressData(name); if (!pts.length) return null;
                  const allTimeMax = Math.max(...pts.map(p => p.value));
                  const gain = pts[pts.length - 1].value - pts[0].value;
                  const lc = palette[idx % palette.length];
                  return (
                    <div key={name} id={`exc-${name.replace(/\s+/g, "-")}`} style={{ scrollMarginTop: 16, ...S.card(), border: `1px solid ${BIG3.includes(name) ? lc + "44" : t.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <div><div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 18, letterSpacing: 1, color: lc, lineHeight: 1 }}>{name}</div><div style={{ fontSize: 11, color: t.textMuted, marginTop: 3 }}>{pts.length} session{pts.length !== 1 ? "s" : ""}</div></div>
                        <div style={{ textAlign: "right" }}><div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, color: "#ff9500", lineHeight: 1 }}>{allTimeMax} <span style={{ fontSize: 13, color: t.textMuted }}>lbs</span></div><div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>PR 👑</div></div>
                      </div>
                      <LineChart points={pts} lineColor={lc} allTimeMax={allTimeMax} />
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: t.textMuted }}>
                        <span>← Days →</span>
                        <span style={{ color: gain > 0 ? "#5bb85b" : gain < 0 ? "#d55b5b" : t.textMuted, fontWeight: 600 }}>{gain > 0 ? "▲" : gain < 0 ? "▼" : "—"} {Math.abs(gain)} lbs total</span>
                      </div>
                    </div>
                  );
                });
              })()
          }
        </div>
      )}

      {/* ── PROFILE ──────────────────────── */}
      {view === "profile" && (() => {
        const p = profile;
        const isEditing = editingProfile;
        const draft = profileDraft;
        const startEdit = () => { setProfileDraft({ ...p }); setEditingProfile(true); };
        const setDraft = (k, v) => setProfileDraft(d => ({ ...d, [k]: v }));
        const pField = { background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 9, color: t.text, padding: "10px 13px", fontSize: 15, outline: "none", width: "100%", boxSizing: "border-box" };
        const lbl = { fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5, display: "block" };
        const dv = (v, u = "") => v ? `${v}${u}` : <span style={{ color: t.textMuted }}>—</span>;
        return (
          <div style={{ padding: "28px 20px 110px" }}>
            {!p.firstName && !isEditing && (
              <div style={{ background: `${accent}12`, border: `1px solid ${accent}44`, borderRadius: 12, padding: "14px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 22 }}>👋</span>
                <div style={{ flex: 1 }}><div style={{ color: accent, fontWeight: 700, fontSize: 14 }}>Welcome, @{authedUser}!</div><div style={{ color: t.textSub, fontSize: 12, marginTop: 2 }}>Complete your profile to get started</div></div>
                <button onClick={startEdit} style={{ background: accent, color: "#000", border: "none", borderRadius: 8, padding: "7px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Set Up →</button>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 32, letterSpacing: 1, lineHeight: 1 }}>My <span style={{ color: accent }}>Profile</span></div>
                {p.firstName && <div style={{ color: t.textSub, fontSize: 14, marginTop: 5 }}>Hey, <span style={{ color: t.text, fontWeight: 600 }}>{p.firstName}</span> 👋</div>}
                {isAdminUser(authedUser) && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: accent, color: "#000", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700, marginTop: 6, letterSpacing: 0.5 }}>
                    ⚙ ADMIN
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button onClick={toggleTheme} style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, color: t.textSub, borderRadius: 9, padding: "8px 11px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontWeight: 600 }}>
                  <Icon name={theme === "dark" ? "sun" : "moon"} size={14} />{theme === "dark" ? "Light" : "Dark"}
                </button>
                {!isEditing && <button onClick={startEdit} style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 9, color: t.textSub, padding: "8px 12px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontWeight: 600 }}><Icon name="edit2" size={13} /> Edit</button>}
                <HelpBtn page="profile" onOpen={() => setHelpPage("profile")} />
              </div>
            </div>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ width: 80, height: 80, borderRadius: "50%", background: `linear-gradient(135deg, ${t.surfaceHigh}, ${t.surface})`, border: `2px solid ${p.goal ? (GOALS.find(g => g.id === p.goal)?.color || t.border) : t.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto", boxShadow: "0 0 24px rgba(0,0,0,0.2)" }}>
                {p.firstName ? p.firstName[0].toUpperCase() : <Icon name="user" size={32} />}
              </div>
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 8 }}>Signed in as <span style={{ fontWeight: 700, color: t.textSub }}>@{authedUser}</span></div>
            </div>
            {isEditing ? (
              <div>
                <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 16, letterSpacing: 1, color: t.textMuted, marginBottom: 12 }}>PERSONAL INFO</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div><label style={lbl}>First Name</label><input value={draft.firstName || ""} onChange={e => setDraft("firstName", e.target.value)} placeholder="First" style={pField} /></div>
                  <div><label style={lbl}>Last Name</label><input value={draft.lastName || ""} onChange={e => setDraft("lastName", e.target.value)} placeholder="Last" style={pField} /></div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>Email</label>
                  <div style={{ position: "relative" }}>
                    <input type="email" value={draft.email || getUsers()[authedUser]?.email || ""} onChange={e => setDraft("email", e.target.value)} placeholder="your@email.com" style={pField} />
                    {getUsers()[authedUser]?.verified && <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#5bb85b", fontWeight: 700 }}>✓</span>}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div><label style={lbl}>Age</label><input type="number" value={draft.age || ""} onChange={e => setDraft("age", e.target.value)} placeholder="yrs" style={pField} /></div>
                  <div><label style={lbl}>Weight</label><input type="number" value={draft.weight || ""} onChange={e => setDraft("weight", e.target.value)} placeholder="lbs" style={pField} /></div>
                  <div>
                    <label style={lbl}>Height (ft)</label>
                    <div style={{ position: "relative" }}>
                      <input type="number" min="0" max="9" value={draft.heightFt || ""} onChange={e => setDraft("heightFt", e.target.value)} placeholder="5" style={{ ...pField, paddingRight: "28px" }} />
                      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: t.textMuted, pointerEvents: "none" }}>'</span>
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Height (in)</label>
                    <div style={{ position: "relative" }}>
                      <input type="number" min="0" max="11.5" step="0.5" value={draft.heightIn || ""} onChange={e => setDraft("heightIn", e.target.value)} placeholder="11" style={{ ...pField, paddingRight: "28px" }} />
                      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: t.textMuted, pointerEvents: "none" }}>"</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                  <div><label style={lbl}>Country</label><input value={draft.country || ""} onChange={e => setDraft("country", e.target.value)} placeholder="e.g. Canada" style={pField} /></div>
                  <div><label style={lbl}>City</label><input value={draft.city || ""} onChange={e => setDraft("city", e.target.value)} placeholder="e.g. Toronto" style={pField} /></div>
                </div>
                <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 16, letterSpacing: 1, color: t.textMuted, marginBottom: 12 }}>CURRENT GOAL</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                  {GOALS.map(g => {
                    const sel2 = draft.goal === g.id;
                    return <button key={g.id} onClick={() => setDraft("goal", sel2 ? null : g.id)} style={{ display: "flex", alignItems: "center", gap: 13, background: sel2 ? `${g.color}18` : t.inputBg, border: `1px solid ${sel2 ? g.color + "88" : t.border}`, borderRadius: 11, padding: "12px 14px", cursor: "pointer", textAlign: "left" }}>
                      <span style={{ fontSize: 22 }}>{g.emoji}</span>
                      <div style={{ flex: 1 }}><div style={{ color: sel2 ? g.color : t.text, fontWeight: 700, fontSize: 14 }}>{g.label}</div><div style={{ color: t.textMuted, fontSize: 12, marginTop: 1 }}>{g.desc}</div></div>
                      {sel2 && <span style={{ color: g.color }}><Icon name="check" size={18} /></span>}
                    </button>;
                  })}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setEditingProfile(false)} style={{ flex: 1, background: "transparent", border: `1px solid ${t.border}`, color: t.textMuted, borderRadius: 10, padding: 13, fontSize: 15, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
                  <button onClick={() => { saveProfile(draft); setEditingProfile(false); }} style={{ flex: 2, background: accent, color: "#000", border: "none", borderRadius: 10, padding: 13, fontSize: 16, cursor: "pointer", fontFamily: "'Bebas Neue', cursive", letterSpacing: 1 }}>Save Profile</button>
                </div>

                {/* ── Security Settings ── */}
                <SecuritySettings authedUser={authedUser} />

              </div>
            ) : (
              <div>
                <div style={S.card()}>
                  <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 15, letterSpacing: 1, color: t.textMuted, marginBottom: 14 }}>PERSONAL INFO</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    {[{ label: "First Name", val: dv(p.firstName) }, { label: "Last Name", val: dv(p.lastName) }, { label: "Age", val: dv(p.age, " yrs") }, { label: "Weight", val: dv(p.weight, " lbs") }, { label: "Height", val: (p.heightFt || p.heightIn) ? `${p.heightFt || 0}' ${p.heightIn || 0}"` : <span style={{ color: t.textMuted }}>—</span> }, { label: "Country", val: dv(p.country) }, { label: "City", val: dv(p.city) }].map(f => (
                      <div key={f.label}><div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>{f.label}</div><div style={{ fontSize: 16, fontWeight: 600, color: t.text }}>{f.val}</div></div>
                    ))}
                  </div>
                  {(() => {
                    const em = p.email || getUsers()[authedUser]?.email;
                    const ver = getUsers()[authedUser]?.verified;
                    return em ? (
                      <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${t.border}` }}>
                        <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Email</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14, color: t.text, fontWeight: 600 }}>{em}</span>
                          {ver ? <span style={{ fontSize: 11, color: "#5bb85b", fontWeight: 700, background: "rgba(91,184,91,0.12)", border: "1px solid rgba(91,184,91,0.3)", borderRadius: 5, padding: "2px 7px" }}>✓ Verified</span>
                               : <span style={{ fontSize: 11, color: "#ff9500", fontWeight: 700, background: "rgba(255,149,0,0.12)", border: "1px solid rgba(255,149,0,0.3)", borderRadius: 5, padding: "2px 7px" }}>⚠ Pending</span>}
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
                <div style={S.card()}>
                  <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 15, letterSpacing: 1, color: t.textMuted, marginBottom: 14 }}>CURRENT GOAL</div>
                  {p.goal ? (() => { const g = GOALS.find(g => g.id === p.goal); return <div style={{ display: "flex", alignItems: "center", gap: 14, background: `${g.color}14`, border: `1px solid ${g.color}55`, borderRadius: 11, padding: "14px 16px" }}><span style={{ fontSize: 28 }}>{g.emoji}</span><div><div style={{ color: g.color, fontWeight: 700, fontSize: 17 }}>{g.label}</div><div style={{ color: t.textMuted, fontSize: 13, marginTop: 2 }}>{g.desc}</div></div></div>; })()
                    : <div style={{ color: t.textMuted, fontSize: 14, textAlign: "center", padding: "12px 0" }}>No goal set — tap Edit to add one</div>}
                </div>
                <div style={S.card()}>
                  <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 15, letterSpacing: 1, color: t.textMuted, marginBottom: 14 }}>LIFETIME STATS</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    {[
                      { label: "Total Workouts",   val: data.workouts.length },
                      { label: "Exercises Logged", val: [...new Set(data.workouts.flatMap(w => w.exercises.map(e => e.name)))].length },
                      { label: "Total Sets",       val: data.workouts.reduce((a, w) => a + w.exercises.reduce((b, e) => b + e.sets.length, 0), 0) },
                      { label: "This Week",        val: data.workouts.filter(w => (new Date() - new Date(w.date)) / 86400000 <= 7).length },
                    ].map(s => <div key={s.label}><div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>{s.label}</div><div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 26, color: accent, lineHeight: 1 }}>{s.val}</div></div>)}
                  </div>
                </div>
                {/* Version + Manual PDF Download */}
                <div style={{ ...S.card(), textAlign: "center" }}>
                  <a
                    href="/gymtrack-user-manual.pdf"
                    download={`gymtrack-user-manual-v${APP_VERSION}-build-${BUILD_DATE}.pdf`}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 8,
                      background: accent, color: "#000", border: "none",
                      borderRadius: 10, padding: "11px 20px",
                      fontFamily: "'Bebas Neue', cursive", letterSpacing: 1,
                      fontSize: 16, fontWeight: 700, cursor: "pointer",
                      textDecoration: "none", margin: "0 auto 16px",
                    }}
                  >
                    <Icon name="download" size={16} /> Download User Manual PDF
                  </a>
                  <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.9 }}>
                    <div>Version <span style={{ color: accent, fontWeight: 700 }}>{APP_VERSION}</span></div>
                    <div>Build Date: {BUILD_DATE}</div>
                    <div style={{ marginTop: 4, opacity: 0.4 }}>GymTrack © 2026</div>
                  </div>
                </div>
              </div>
            )}
          </div>

        );
      })()}

      {/* ── ADMIN PANEL ──────────────────── */}
      {view === "admin" && isAdminUser(authedUser) && <AdminPanel currentUser={authedUser} />}

      {/* ── HELP MODAL ───────────────────── */}
      {helpPage && <HelpModal page={helpPage} onClose={() => setHelpPage(null)} />}

      {/* ── SIGN OUT — fixed above nav on profile tab ── */}
      {view === "profile" && (
        <div style={{
          position: "fixed", bottom: "calc(62px + env(safe-area-inset-bottom, 0px))", left: "50%", transform: "translateX(-50%)",
          width: "100%", maxWidth: 420, display: "flex", justifyContent: "center",
          padding: "12px 20px", boxSizing: "border-box",
          background: `linear-gradient(to top, ${t.bg} 55%, transparent)`,
          pointerEvents: "none",
        }}>
          <button onClick={handleLogout} style={{
            pointerEvents: "all",
            background: "rgba(213,91,91,0.1)",
            border: "1px solid rgba(213,91,91,0.35)",
            color: "#d55b5b",
            borderRadius: 12,
            padding: "13px 48px",
            fontSize: 14, fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 2px 16px rgba(0,0,0,0.25)",
            letterSpacing: 0.3,
          }}>Sign Out</button>
        </div>
      )}

      {/* ── NAV ──────────────────────────── */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 420, background: theme === "dark" ? "rgba(17,17,17,0.92)" : "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderTop: `1px solid ${t.navBorder}`, display: "flex", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {navItem("home", "home", "Home")}
        {navItem("log", "plus", "Log")}
        {navItem("history", "history", "History")}
        {navItem("progress", "chart", "Progress")}
        {navItem("profile", "user", "Profile")}
        {isAdminUser(authedUser) && navItem("admin", "shield", "Admin")}
      </div>
    </div>
    </ThemeCtx.Provider>
  );
}
