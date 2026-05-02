// Fix #29: Centralized help copy — single source of truth for contextual
// help sheets today, Help Center pages tomorrow, marketing pages later.
// Keeping as a plain JS export (not JSON) so we can interpolate the
// current APP_VERSION/BUILD_DATE at render time if we ever want to.

export const HELP_CONTENT = {
  home: {
    title: "Home",
    emoji: "🏠",
    sections: [
      { heading: "Quick Stats", body: "Total workouts, this-week count, and unique exercises at a glance." },
      { heading: "Start a Session", body: "Tap '+ Start Workout' to jump into the Log tab. Your workout timer starts right away." },
      { heading: "Notifications 🔔", body: "The bell in the top-right shows PR unlocks, streak milestones (3/7/14/30/60/100 days), and a nudge if you've been away for more than 3 days." },
      { heading: "Help & Settings", body: "The ? icon opens contextual help on any screen. Settings lives under the gear ⚙ on your Profile tab (top-right)." },
    ],
  },
  log: {
    title: "Log",
    emoji: "📝",
    sections: [
      { heading: "Quick Start", body: "When a workout is empty, shortcuts appear: Repeat Last Session, Browse Starter Programs (PPL, 5/3/1, StrongLifts…), recent template rows, or a 'Recent' row of your most-used exercises." },
      { heading: "Tag the Workout", body: "Once you add an exercise, the Tags bar at the top auto-suggests (Push / Pull / Legs / Upper / Core / Cardio). Tap the + to open the picker — up to 5 tags per workout. Manage your own custom tags via Settings → Manage Tags." },
      { heading: "Add an Exercise", body: "Tap 'Add Exercise' to open the picker with search, muscle-group and equipment filters. Filter pills reorder based on what you use most. You can also type a brand-new name to add a custom exercise." },
      { heading: "Log Your Sets", body: "Enter weight and reps, tap '+ Add Set' for more. Swipe left on a set row or tap the ✕ to delete it. Tap the RPE chip to rate effort (6–10) and set Reps in Reserve." },
      { heading: "AI Coach", body: "Each exercise shows a Coach card with a target based on your history. Tap 'Apply' to pre-fill the suggestion, or dismiss it." },
      { heading: "Tools ⋯", body: "The ⋯ icon in the top-right opens Tools: 1RM Calculator and Plate Calculator." },
      { heading: "Rest Timer", body: "Pick a preset (30s–3m) or custom time. Manual by default — tap Start when ready, Pause/Reset on the timer, or just ignore it. The ring turns green when rest is done." },
      { heading: "Smart Rest Timer", body: "Optional master switch in Settings → Workout Preferences. When ON, one rule covers every workflow: the FIRST signal after the timer goes idle starts it; later signals don't reset it. Signals are tap-an-input, tap-✓, or Add-Set-after-complete. The only force-reset is your manual Reset button or the 'Yes, reset' button on the Add Set prompt (which only appears when you Add Set with the timer already running, since that's the one ambiguous case — finished a set vs preloading next row). Off keeps the timer fully manual for users who don't want it in their flow." },
    ],
  },
  history: {
    title: "History",
    emoji: "🕒",
    sections: [
      { heading: "Grouped by Period", body: "Workouts are bucketed into This Week / Last Week / specific months. Section headers stick to the top as you scroll." },
      { heading: "Search & Filter", body: "Use the search box to find workouts containing a specific exercise. The Jump-to picker scrolls to any section or lets you filter by Last 7/14/21/30/90 days or a custom date range." },
      { heading: "Edit Tags", body: "Tap a workout card to expand. The Tags line shows what's applied — tap 'Edit' to change. Most users tag from the Log screen while logging, but History edits work as a fallback." },
      { heading: "Swipe to Delete", body: "Swipe a workout card left to reveal a red Delete action. Tap to remove." },
      { heading: "Export ⋯", body: "Tap the ⋯ icon in the top-right to export your workouts as a CSV (Date · Workout Name · Tags · Exercise · Set # · Weight · Reps · RPE · Notes · Duration). If you have filters active, you can export just the filtered set or everything." },
    ],
  },
  progress: {
    title: "Progress",
    emoji: "📈",
    sections: [
      { heading: "Your Top Lifts", body: "Bench, Squat, and Deadlift records sit up top. The heaviest gets a 'TOP PR' badge. You can customize which lifts appear." },
      { heading: "Scrub the Chart", body: "Touch and drag across any graph to scrub through sessions and see exact weight, reps, and date." },
      { heading: "The Crown 👑", body: "The orange crown marks your current PR — weight AND reps combined at that weight." },
      { heading: "Jump To", body: "Use the dropdown at the top to jump to any exercise chart." },
    ],
  },
  profile: {
    title: "Profile",
    emoji: "👤",
    sections: [
      { heading: "Edit Profile", body: "Tap the gear ⚙ and pick 'Edit Profile' to update your name, age, weight, height, and goal. Save when you're done." },
      { heading: "Goals", body: "Pick a training goal (Muscle, Strength, Cardio, Cut, Maintain) — it shapes how future features tailor suggestions." },
      { heading: "Settings ⚙", body: "The gear opens Settings with sections for Profile, Tags, Appearance, Account Security, and Data & Privacy." },
      { heading: "Manage Tags", body: "Create your own workout tags (name + emoji + color) via Settings → Manage Tags. Custom tags appear alongside the built-ins everywhere you can tag a workout." },
      { heading: "Export Data", body: "Settings → Data & Privacy → Export Workouts (CSV) downloads your full history. You can also export from History's ⋯ menu." },
      { heading: "Lifetime Stats", body: "Total workouts, sets, exercises, and weekly activity, calculated live from your logged data." },
    ],
  },
  manual: {
    title: "User Manual",
    emoji: "📖",
    sections: [
      { heading: "Getting Started", body: "Create an account on the landing page with a username, email, and a strong password (8+ characters, uppercase, lowercase, digit). After signup we'll email a verification link — confirm it to unlock the app, then set up your Profile." },
      { heading: "Your First Workout", body: "Tap the Log tab or '+ Start Workout' on Home. Add exercises using the search picker, enter your sets with weight and reps, use the rest timer between sets, then tap 'Finish Workout' to save." },
      { heading: "Browse Starter Programs", body: "On the Log tab when no workout is in progress, tap 'Browse Starter Programs' to fork from PPL, Upper/Lower, Full Body, Bro Split, 5/3/1 BBB, Starting Strength, StrongLifts 5×5, PHUL, PHAT, or Arnold Split. 'Start Now' loads it as a live workout; 'Save to Templates' keeps it in your library." },
      { heading: "Tracking Progress", body: "The Progress tab builds charts from your logged data. The more sessions you log, the more detailed your progression graphs become. PR unlocks and streak milestones also show in your Notifications (🔔 on Home)." },
      { heading: "Tags vs Templates", body: "Tags (Push, Legs, custom…) label the *kind* of workout and are applied during logging. Templates are reusable workout *structures* saved from a finished session — load one to pre-fill a workout's exercises. Different tools, different jobs." },
      { heading: "Data & Privacy", body: "Your data syncs to your account via Firebase. Email verification is required before you can log in. You can export a full CSV any time (Profile → Settings → Data & Privacy, or History ⋯ menu)." },
      { heading: "Exporting Your Data", body: "Either History (⋯ icon top-right → Export Workouts) or Profile → Settings → Data & Privacy. The CSV has full columns (Date · Workout Name · Tags · Exercise · Set # · Weight · Reps · RPE · Notes · Duration) and opens cleanly in Excel, Google Sheets, or Numbers. If you have a History filter active, you can choose to export just the filtered set." },
    ],
  },
};
