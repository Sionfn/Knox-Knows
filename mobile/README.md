# Knox Knows mobile app 1.3.0 — local release candidate

**1.3.0 (Nov 1, Claude):** rebuilt on the live Nov 1 website (all launch fixes) and redesigned to look like Knox Knows: logo header with streak flame and profile, the website's hero and "Ask Knox anything…" bar with camera, the website's sticker icon tiles, chunky ledge cards in each section's color, Mega gold plan cards, and a tab bar whose active icon sits on its color tile. Checked in Fall, Light and Dark at 390px and 320px with Codex's mocked QA server.

Based on Claude/GitHub `nov-1-update` commit `a53e97faac5f8dd7373b531a076c239d54338a1a`, verified October 31, 2026. This source project is not an installable IPA and has not been submitted or published.

## Build

Use a current Node release and Xcode with Swift 6.1 or newer. This candidate targets iOS/iPadOS **17.4 and newer**, matching the modern browser APIs used by the bundled PDF reader (notably Promise.withResolvers). Older devices are not certified by this build.

```sh
cd mobile
npm ci
npm run sync
npm run ios
```

Select the App target and the existing Knox signing team. The project includes the Sign in with Apple entitlement, but Apple Developer provisioning and Firebase provider configuration must be verified on the owner's account. Archive/TestFlight from Xcode after the release gates below pass. Do not upload the source ZIP to App Store Connect.

`npm run build` packages a fixed local interface; `npm run sync` regenerates the iOS resources and native plugin package. Keep `www`, `ios/App/App/public`, the native config, dependencies and `bundle-hashes.json` in sync. These generated resources never contain server code, environment variables, private keys or test doubles. Firebase browser and iOS app identifiers remain those of the existing production project.

## Implemented

- Local, versioned Ask/Learn/Flashcards/Calculator interface; no remote `server.url` or broad `allowNavigation` list.
- Bundled Firebase browser SDK 10.7.0, Nunito fonts, PDF/Word/PowerPoint/Excel reader dependencies and Knox assets.
- Removes the persistent website top bar. Five tabs: Home, Ask, Learn, Cards and You. Calculator lives on Home and beside the composer.
- Home shows actual recent lessons/chats, local/synced deck counts and due cards. It opens saved lessons and card reviews directly; counts update after grading. Empty states never invent progress. A small tier-aware plan card sits below study activity; Mega users get no upgrade advert.
- You holds profile/account settings, plan comparisons, credits/limits, streak/calendar, appearance, support and sign-out. Plan comparison is informational; no new checkout or StoreKit purchasing was added. The original header remains hidden in the DOM because shared account logic uses its counters, but it occupies no space or accessibility navigation.
- Separate in-memory Ask/Learn drafts, attachment/lesson state and message nodes. Home/You preserve the current lesson and deck editor. Explicitly starting another card review still asks before discarding unsaved edits. Busy chat/file steps cannot switch to a conflicting lesson.
- Native camera/photo library choices alongside the system file input. Existing upload validation and image sizing are reused.
- Temporary-cache exports through Filesystem/Share; cancellation does not claim a file was saved. Temporary export data is removed after the sheet closes.
- Keyboard-aware tabs, safe-area spacing, tablet account controls, theme-aware tab colors and small selection haptics.
- Offline status and an actual local error page; restored Firebase identity is required to open account-specific local decks. Account plan/history loading is skipped when the browser reports offline; plan/deck sync refreshes when online again. Remote pictures and AI still require internet. This does not promise offline AI or downloaded image caching.
- Branded launch storyboard using the original Knox logo; Filesystem required-reason privacy manifest.
- Authenticated, confirmed account-deletion initiation via `api/_support.js`, with an idempotent server-only `accountDeletionRequests/{uid}` index and a visible human Support Desk ticket. No AI approval or email from the student is required. **Deletion remains manual, not automatic or completed when the request is accepted.**
- Mobile tour and FAQ instructions use Home/You navigation; web-only pricing/gift entry buttons and Chrome extension advertising are hidden.

## Release gates — still required

1. **Matching backend:** this build calls `https://www.knoxknowsapp.com`, not the private preview. The Nov 1 server features must be live before shipping this app. The new account-deletion handler must also be deployed through the normal approved GitHub release. Nothing was deployed by this work.
2. **Deletion operations:** the owner must monitor Account deletion request tickets, delete associated user data, address subscriptions/required retention, revoke Apple tokens where applicable, and confirm completion. A queued request is not fulfillment. Verify the complete process with a disposable test account before submission.
3. **Native build and devices:** Capacitor packaging passed; Xcode compilation was blocked by this session's sandbox (`sandbox_apply: Operation not permitted`) and simulator services. Compilation, signing, TestFlight installation, fresh/returning Apple and Google sign-in, camera/photo permissions, actual Files sharing, background/foreground recovery, offline launch and large-text/VoiceOver checks remain unverified on real iPhones/iPads.
4. **Subscriptions:** existing account entitlements are retained. New in-app purchases/StoreKit/restore purchases have not been implemented. Decide and validate the App Store purchase/distribution approach for intended storefronts; review reachable support/external links too. Do not advertise an iOS purchase flow that does not exist.
5. **Store submission:** verify App Store privacy disclosures, support/privacy URLs, screenshots, review credentials and provisioning. The required-reason manifest is not a certification of all privacy labels or Apple approval.

## Verification performed

- 218 shared website/backend tests pass, including confirmed/idempotent deletion initiation, ownership isolation, inbox visibility and durable failed-email delivery.
- Nine mobile tests pass (five Home data/plan/account isolation/escaping tests and four native-transport tests). Transport checks cover: fixed backend routing, JSON/auth preservation, HTTP failures/no replay, abort handling, browser passthrough and request objects. The iOS generation timeout is 70 seconds at the native layer; caller signals can end UI waiting sooner. An already-received server action cannot be undone by aborting.
- 265 source/inline parsing units, plist/project syntax and dependency audit were checked; native production npm dependencies have zero reported advisories.
- Real UI operated locally at 320×568, 390×844, 430×932 and 1024×768: no document horizontal overflow, header height 0, page boundaries meet bottom navigation and checked composer stays above it. Verified saved-lesson reopening, preserving a typed lesson answer through Home/You, due-card review and count decrement, Calculator access, cancelling a dirty-deck navigation and restoring the editor, creating/saving a deck, account settings/credits/support, three appearance choices, Free→Plus and Plus→Mega promotion placement, no Mega upsell, sign-out activity isolation, restored fake email sign-in, and calendar launch with the built-in Flame Fest demo (no real rewards claimed). Prior 1.1 native integration checks are retained; physical device testing remains pending. No console errors in tested tabs.
- Browser checks use **fake identities, Firebase, API replies and native plugins**. They verify interface/integration logic, not real AI, payments, production sync or hardware behavior.

## Local QA

```sh
npm test
npm run qa
```

The QA server binds only to 127.0.0.1 and prints its URL. It substitutes test services and native plugins. It is excluded from the installed bundle. Stop it after testing. Shared backend tests run from the repository root with `node --experimental-vm-modules --test tests/*.mjs`.

Screenshots of the local test build use disposable QA data, not the owner's production activity:
- `outputs/mobile-home-oct31.jpg`
- `outputs/mobile-you-oct31.jpg`
- `outputs/mobile-home-review-plans-oct31.jpg`

The previous 1.1.0 ZIP is unchanged. The original Claude checkout, GitHub, hosted website/preview, Firebase settings/rules and environment variables were not modified.
