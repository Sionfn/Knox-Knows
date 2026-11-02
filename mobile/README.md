# Knox Knows mobile app 1.3.2 — local review candidate

November 2, 2026. Built on Claude's latest local `home-screen-app` commit **a19aace**, including the previous mobile polish and main Flashcard fixes through **4fadbb2**. Original Claude checkout and hosted sites are untouched. This is a local candidate, not a published App Store app or an installable IPA.

## Build and review

Use Node 24, Xcode with Swift 6.1 or newer, and iOS/iPadOS **17.4+**. From this repository:

```sh
cd mobile
npm ci
npm run sync
npm run ios
```

Select the existing Knox App target and signing team. `sync` packages the current source into `www` and `ios/App/App/public`, updates native plugins and records 80 SHA-256 bundle hashes. Generated native plugin paths are portable `../../../node_modules/...`; they must not point into an old Codex output directory. No remote `server.url`: interface, Firebase SDK, fonts and document readers ship inside the app. Authenticated AI/sync still use **https://www.knoxknowsapp.com** with the existing production Firebase identifiers.

Local QA (fake Firebase, fake API and native plugins; no production changes):

```sh
npm test
npm run qa
```

The server binds only to 127.0.0.1 and prints its URL. Optional `?qa-controls=1` exposes clearly labelled local controls for simulated keyboard, offline and lifecycle events. Never ship these QA files. Shared backend tests run from the repository root with `node --experimental-vm-modules --test tests/*.mjs`.

## What changed in this candidate

Claude's full-screen design, floating History/New controls, welcome cards, camera, Auto look, local progress and five tabs are preserved. This review fixes:

- Reselecting Ask/Learn scrolls to the latest reply; it does not unexpectedly start a new session. New remains an explicit action.
- Explain simpler / Similar problem prepare a grounded prompt containing the selected question and answer. They never send or spend a credit automatically. Existing text can be kept or appended to.
- Make flashcards protects the current Make request/attachments, honors a cancelled editor and rechecks account ownership. Accepted replacement removes prior notes so they cannot contaminate the new deck. Scanned-PDF photo conversion rejects stale results.
- Photo selections claim their generation before awaiting crop. Crop work is tied to the original account and view; newer selections win. The crop dialog adds labelled range controls, focus handling and bounded output. A failed crop offers retry/Whole photo instead of silently sending the original.
- Web-only dictation stops on manual edits, account changes or mode changes. Late results are ignored. This is not native voice tutoring.
- Progress records successful non-casual study replies and saved card-review transitions, not taps, failed requests or restored history. Lesson completion is recorded once per stable session. Daily goals use the local calendar date. Counters are bounded, account-scoped and explicitly local activity, not mastery. Unverified old counters are not promoted into these new totals; real server streaks and saved history/decks are unchanged.
- Short-screen Learn welcome content scrolls rather than clipping the review control. Daily-goal ring CSS no longer changes the inline target icon. Reduced-motion preference is honored by tab scrolling.
- App plan information discloses existing backend generation limits: Plus 40 AI decks/day, 15 cards each; Mega 100/day, 40 cards each. Existing prices, limits and backend policies are unchanged. Ordinary browser marketing is outside this local app patch.
- Decorative answer reveal observes new replies correctly and leaves restored history immediate. It is cosmetic; API responses still arrive as complete JSON.

Version/build is **1.3.2 / 6**. Previous draft recovery, native Share, keyboard/offline handling, calculator return, signout isolation and fixed-size review safeguards remain. No native StoreKit flow, new voice service, lecture transcription or exam engine was added.

Shared app-shell files also serve Claude's home-screen web version if later merged; regular browser changes are guarded. Do not deploy this source ZIP as a website.

## Verification

- **233 shared website/backend tests + 31 mobile tests pass (264 total).** New tests cover successful-event ownership/deduplication, daily/lesson counts, failed storage, crop selection/account races, bounded grounded prompts, cancelled Make replacement and server plan-limit parity.
- 287 source/inline-script parsing units checked; plist/project syntax checked; 80 bundled/native hashes match; Capacitor sync registers 11 plugins. Native production dependency audit: **0 advisories**.
- Local real browser UI with fake Firebase/API/native plugins checked successful and failed Ask accounting, casual replies, saved Learn completion/history, card flip/Good/Home due count, non-destructive tab reselection, existing follow-up and Make drafts, short-screen review access, light/dark/fall/Auto appearance and simulated web dictation/manual-edit/mode-switch isolation. No live AI quality, real sync, microphone, camera or purchases are certified by these mocks.
- Browser file upload was blocked by Chrome's local file-access setting. Crop math and stale-result behavior are covered by tests, but the complete crop picker flow needs device testing. No security setting was changed to bypass that block.
- The prior Xcode attempt was blocked by SwiftPM diagnostic-cache permissions and unavailable CoreSimulator. This review syncs/validates source; it does not claim a compiled/signed app, simulator run, TestFlight or physical-device certification.

## Remaining release work

1. Compile/sign/install on real iPhone/iPad; verify fresh/returning Apple and Google auth, actual camera/library permissions including denied/cancelled cases, document readers, real Share/Files, background recovery, offline cold launch, safe-area/keyboard behavior and VoiceOver/larger system text.
2. Confirm the matching production APIs and account-deletion handler. Deletion initiation is authenticated and idempotent, but fulfillment remains manual. Test a disposable account's full deletion process and Apple-token revocation where needed; accepting a request is not deleting an account.
3. Existing web plan entitlements are retained. Native StoreKit purchases/restore purchases are **not implemented**; choose and validate the intended storefront subscription approach before promising in-app upgrades. Native plan comparison remains informational.
4. Validate App Store privacy/support metadata, screenshots, provisioning and reviewer access. The privacy manifest alone is not Apple approval.

See the Codex workspace output `CLAUDE-MOBILE-NOV2-HANDOFF.md` for branch/patch instructions and competitive gaps. Handoff notes intentionally stay outside the website repository. Nothing was pushed, deployed or submitted by this work.
