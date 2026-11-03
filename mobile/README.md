# Knox Knows mobile 1.3.3 / build 7 — local photo and layout review

November 3, 2026. Based on Claude's newest local **app-redesign da662ea**, including main **85dd114**. The original Claude checkout is unchanged. This is a local source candidate, not a published app, signed IPA or TestFlight build.

## Build

Use Node 24, Xcode with Swift 6.1+ and iOS/iPadOS 17.4+:

```sh
cd mobile
npm ci
npm run sync
npm run ios
```

The interface, Firebase SDK, document readers and fonts ship locally. There is no remote server.url; authenticated AI/sync use the existing production Knox API/Firebase identifiers. Do not substitute private-preview Firebase settings. The synced Swift plugin paths are portable node_modules paths. Do not deploy the mobile source ZIP as a website.

## Changes

- Photo review starts with the whole photo. Crop is optional; an explicit live-camera frame is carried through exactly. Removed heuristic auto-picking and the claim that Knox had found the question. Smaller selections are no longer expanded to 12 percent.
- Added Rotate, Whole photo reset, precise fitted-image coordinates, larger corner hit areas, keyboard-adjustable selection and screen-frame-coalesced drag updates. Output is bounded and correctly rotated; Cancel keeps an existing attachment. No automatic send.
- Real modal photo/Add/camera screens contain focus and close safely. Camera streams stop on cancellation, capture, backgrounding, account change, navigation or a late permission result. Repeated shutter taps cannot create parallel captures. Gallery/file tickets reject old account/view selections.
- Photo/camera/Add screens track the visible viewport during keyboard dismissal. The untouched viewfinder frame recenters after a size change. Device-camera fallback remains available.
- Ask and Learn keep full two-column topic cards with vertical scrolling. Review from your lessons stays available. Removed horizontal keyboard chips, guessed fit locking and focus-only keyboard collapse; real viewport changes control the web keyboard layout. Closing it restores navigation, and pinch zoom is not mistaken for a keyboard.
- Removed doubled website padding from the app composer and reserved space for the raised Snap button. Return adds a new line in the app; Send is explicit. Ordinary website Enter-to-send behavior is unchanged.
- Calculator Back records the originating screen before switching. New chat/lesson no longer leaves a stale Jump to latest button on the welcome. Home study ideas retain real button semantics for accessibility.
- Preserves Claude's redesign, native integrations, owner-scoped draft recovery, history, plans, Learn, cards, themes and existing prices/entitlements. No backend API, Firebase rules, environment or account changes were made.

## Checks

- **235 shared tests + 47 mobile tests pass (282 total).** Coverage includes crop fit/rotation/frame mapping, small selections, delayed camera cancellation, Enter/IME, calculator origin, keyboard open/close/zoom, and prior draft/ownership/transport regressions.
- Local real UI with synthetic worksheet/video and fake auth/API/Firestore/plugins: crop drag/resize/export, rotation, cancellation, camera frame movement and mode choice, delayed/unavailable camera, keyboard-to-camera transition, no accidental Return send, saved photo history, saved Learn completion, history search, Calculator 7×8/return/append, native plan comparison, themes/larger reading, cards/Good/due counts and New cancellation.
- Phone/tablet layout checks: 320×568,375×667,390×844,430×932,768×1024,1024×768; portrait/landscape photo review and simulated keyboard visible areas also checked. No horizontal document overflow in those checks.
- 80 bundled www/native public hashes match; 11 plugins sync; plist/project validation and scoped native production dependency audit pass (0 advisories).
- The final fresh native and web-shell QA tabs produced no warning/error console messages. Synthetic streams avoid actual hardware/permission access. QA files are source-only and are not copied into the installed bundle.

Run shared tests from the repository root with `node --experimental-vm-modules --test tests/*.mjs`; mobile tests with `npm --prefix mobile test`. `npm --prefix mobile run qa` starts a 127.0.0.1-only server. Optional `qa-controls`, `qa-web` and `qa-photo` query flags expose synthetic local fixtures only. These controls must never be served as the production app.

## Still required before a release

A physical iPhone/iPad build must verify camera permission denial, actual lens/focus quality, touch/pinch and keyboard/safe-area transitions, real native auth/files/share, VoiceOver and system text sizes, offline/background relaunch and long sessions. This review did not run a signed app or real AI quality/purchase test. Prior Xcode attempts were blocked by sandbox/CoreSimulator availability; source sync is not a compiled app.

Native StoreKit purchase/restore is still not implemented. Existing subscriptions follow the account; native comparison is informational. Account deletion still needs its complete manual fulfillment test, including any applicable Apple-token revocation. Android packaging was not added.

The Claude handoff and patch are in the Codex workspace outputs, outside this repository. Nothing was pushed or published.
