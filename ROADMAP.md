# Pixelz Roadmap

## 1. Real-time Gaming (Foundation)
**Goal:** Transition from HTTP request/response polling or manual refreshes to real-time WebSockets for multiplayer synchronization.
- **Lobby real-time sync:** Implement Supabase Realtime for the Game Lobby (waiting for opponents, ready states, match start countdowns).
- **In-game real-time sync:** Implement real-time in-game progress synchronization (e.g., showing opponent's progress or moves live).
- **Architecture:** Keep the Vercel/Hono API for truth and validation, and use Supabase Broadcast/Presence strictly for ephemeral, fast state syncing.
- **Resilience:** Ensure graceful fallback or proper UX if the WebSocket connection drops during a live match.

## 2. Multiplayer Gaming: 1 vs Many
**Goal:** Extend the 1 vs 1 real-time architecture to support larger "rooms".
- **Backend Updates:** Update session logic to support arbitrary or higher `max_players`.
- **Lobby UI:** Design and implement a UI for a 1 vs Many lobby (listing multiple players, their ready states, and host controls).
- **In-game UI:** Design and implement UI for in-game progress of multiple opponents without cluttering the screen (e.g., mini progress bars or rank lists).
- **Ranking:** Handle tie-breakers and calculate leaderboard/match rankings for 2nd, 3rd, 4th place, etc.

## 3. Additional Features & Polish
**Goal:** Flesh out the game built on top of the real-time architecture to make it more engaging.
- **Spectator Mode:** Allow users to join live rooms just to watch the match progress.
- **Daily Seeded Challenges:** Global daily puzzle seed with a 24-hour resetting leaderboard (similar to Wordle strategy).
- **Live Emotes / Quick Chat:** In-game ephemeral social interactions (e.g., floating emojis) to make multiplayer feel alive without text chat toxicity.
- **Replays:** Ability to playback the winner's move sequence after the match.
- **Cosmetics / Shops:** Unlockable themes using the CSS variables design system, purchasable with in-game earned coins.

## 4. Mobile Apps Comparison
**Goal:** Build native mobile clients as a case study for different technologies.
- The web app and backend API serve as the finalized "spec".
- **Offline Solo Play:** Must be strictly offline-first. Use local database (SQLite/IndexedDB) for generating/playing boards and queueing match results for HTTP `/sync` when online.
- **Online Multiplayer:** Must connect to the real-time Supabase channels for live rooms.
- **Target Platforms for Comparison:**
  - React Native (Expo)
  - Flutter
  - Native Swift (iOS)
  - Native Kotlin (Android)
  - Kotlin/Compose Multiplatform
