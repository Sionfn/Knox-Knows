# Knox Knows mobile app 1.3.1 — local review candidate

November 1, 2026. Built on Claude's latest local `home-screen-app` commit **3c21893** (which includes `mobile-knox-look` 93087d7), plus the two new main Flashcard commits through **4fadbb2**. Original Claude checkout and hosted sites are untouched. This is a local candidate, not a published App Store app or an installable IPA.

## Build and review

Use Node 24, Xcode with Swift 6.1 or newer, and iOS/iPadOS **17.4+**. From this repository:

```sh
cd mobile
npm ci
npm run sync
npm run ios
```

Select the existing Knox App target and signing team. `sync` packages the current source into `www` and `ios/App/App/public`, updates native plugins and records 78 SHA-256 bundle hashes. Generated native plugin paths are portable `../../../node_modules/...`; they must not point into an old Codex output directory. No remote `server.url`: interface, Firebase SDK, fonts and document readers ship inside the app. Authenticated AI/sync still use **https://www.knoxknowsapp.com** with the existing production Firebase identifiers.

Local QA (fake Firebase, fake API and native plugins; no production changes):

```sh
npm test
npm run qa
```

The server binds only to 127.0.0.1 and prints its URL. Optional `?qa-controls=1` exposes clearly labelled local controls for simulated keyboard, offline and lifecycle events. Never ship these QA files. Shared backend tests run from the repository root with `node --experimental-vm-modules --test tests/*.mjs`.

## What changed in this candidate

- Preserves Claude's Knox design, Home/Ask/Learn/Cards/You tabs, direct camera button, paperclip picker, themed app header, seasonal artwork and informational native plan comparison.
- Ask/Learn header now has useful History and New controls. Search filters the loaded history; a no-results message makes its loaded-history scope explicit. Duplicate profile/promotional blocks are removed from the history drawer.
- Corrects first-switch draft leakage between Ask and Learn. Messages, attachments and active lesson state remain separate in memory. Opening a saved conversation preserves the outgoing draft and clears the input for a different conversation; failed opens restore the prior view.
- Adds account-scoped recovery for unsent text only, with explicit Home resume buttons, a 16,000-character bound and 7-day expiry. Recovery never sends a message automatically. Sign-out clears the outgoing account's drafts; You offers manual clearing and describes retention. Photos/files are not in recovered drafts. Typing state is saved on background/page hide; successful sends clear their text draft and failures retain it.
- New chat/lesson asks before discarding unsent text or attachments; saved conversations remain in history. Cancelled replacement card review keeps the editor intact.
- Fixes the hidden native keyboard's leftover tab-bar space and gives offline notices their own measured space. Reconnection/foreground refreshes plan and deck summaries without replaying AI requests. The calculator and previously saved decks remain local; remote pictures and AI require internet.
- Brings in Claude's fixed-size/scrollable cards, then removes the stale measured native minimum that hid grading controls after tablet rotation. All grading controls fit the tested 320px phone with larger reading text.
- Adds a persistent Standard/Larger reading choice for answers/card text, larger feedback targets, properly named dialogs and independently accessible Home camera/Ask controls.
- Adds native answer sharing using the same cleaned answer as Copy; cancellation stays quiet. Existing native deck Files/share export remains. Calculator Back returns to its actual originating screen; Send/Explain appends to the target draft instead of replacing it or sending it.
- Sign-out returns to Home. Native transport rechecks cancellation after reading a Request body, before dispatch.
- Updates local version/build to 1.3.1 / 5, refreshes all bundled/native resources and fixes portable Swift package paths.

These are local source changes. Shared app-shell files also serve Claude's home-screen web version if later merged; the regular browser layout is guarded and unchanged. The draft-retention paragraph in `privacy.html` is for review alongside that future merge. Do not deploy the entire mobile project as a website.

## Verification

- **233 shared website/backend tests + 18 mobile tests pass (251 total).** Mobile coverage includes owner isolation/expiry/bounded recovery, native transport and cancellation, cleaned-answer sharing, cancelled card review and rotation-height regression.
- JavaScript/JSON/inline scripts parsed; plist/project syntax checked; 78 bundled/native hashes match. Capacitor sync registers all 11 plugins. Native production dependency audit reports **0 advisories**.
- Local real UI exercised at 320×568, 390×844, 430×932, 768×1024 and 1024×768. Verified independent Ask/Learn drafts, relaunch recovery, New cancellation, search/opening a saved lesson, camera cancellation, mocked Ask result/history, three themes, larger reading, card flip/Good/completion/Home count update, dirty editor cancellation/return/save, calculator, simulated keyboard/background/offline/reconnect and sign-out isolation. Test data/services are fake. These checks do not certify hardware, live AI, production sync or payment behavior.
- Xcode build was attempted but package resolution could not write its manifest diagnostic cache and CoreSimulator services were unavailable in this sandbox. No signed build, simulator run, TestFlight installation or physical-device certification is claimed.

## Remaining release work

1. Compile/sign/install on real iPhone/iPad; verify fresh/returning Apple and Google auth, actual camera/library permissions including denied/cancelled cases, document readers, real Share/Files, background recovery, offline cold launch, safe-area/keyboard behavior and VoiceOver/larger system text.
2. Confirm the matching production APIs and account-deletion handler. Deletion initiation is authenticated and idempotent, but fulfillment remains manual. Test a disposable account's full deletion process and Apple-token revocation where needed; accepting a request is not deleting an account.
3. Existing web plan entitlements are retained. Native StoreKit purchases/restore purchases are **not implemented**; choose and validate the intended storefront subscription approach before promising in-app upgrades. Native plan comparison remains informational.
4. Validate App Store privacy/support metadata, screenshots, provisioning and reviewer access. The privacy manifest alone is not Apple approval.

See `MOBILE-REVIEW-HANDOFF.md` at the repository root for exact branch, changes and merge instructions. Nothing was pushed, deployed or submitted by this work.
