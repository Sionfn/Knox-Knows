# Claude handoff — mobile polish, November 1

**Local review only. Nothing pushed, published or submitted.**

The user's current request is to improve the actual mobile app and leave changes where Claude can inspect them. Keep the regular live website and Vercel previews unchanged.

## Correct starting point

- Latest local Claude mobile branch: `home-screen-app`, **3c21893**. This includes the Knox 1.3.0 redesign (93087d7) and shared Home/You app shell (a85af66/9195ac0).
- Two newer main commits were discovered during review and cherry-picked into this local branch: **90adaaf**, **4fadbb2** (fixed-size Flashcard review/scroll preservation).
- Review repository: `/Users/sion/Documents/Codex/2026-09-16/https-github-com-sionfn-knox-knows/work/Knox-Knows-mobile-nov1`
- Review branch: `codex/mobile-polish-nov1`.
- Original `/Users/sion/Downloads/Knox-Knows-fresh` remains clean and was not edited or switched.

## Changes to review

1. **App navigation:** actual New/History actions in the Ask/Learn header, loaded-history search, cleaner history drawer, sign-out to Home, context-aware calculator return. Independently accessible Home camera/Ask buttons and named dialogs.
2. **Drafts:** fixes Ask text appearing in a newly opened Learn tab. Account-scoped, text-only, explicit recovery on Home (7 days, 16,000-character cap, no automatic sends, no photos/files). Background/page-hide save, clean success/failure handling, sign-out cleanup and manual clearing in You. Privacy disclosure added for review.
3. **Study continuity:** saved conversations do not inherit another conversation's typed draft; failed loads restore the old view. Separate lesson state is preserved across tabs. New study prompts before discarding unsent text/attachment. Cancelled replacement review really returns false and preserves the current card editor.
4. **Cards/layout:** keeps newest main's fixed-size review and applies an app-only correction for the stale inline minimum left after rotation. Smaller-phone card height accounts for all three grading controls. Text scrolls inside the card; grading controls remain above the tab bar in tested sizes.
5. **Native feel:** native Share action on answers using the cleaned Copy payload, reading-size preference, 44px feedback/header targets, correct keyboard spacing, visible/measured offline banner, no repeated online event on every status read, foreground entitlement/deck refresh, no automatic replay of AI requests. Calculator Send/Explain preserves the target draft rather than overwriting or sending it.
6. **Build:** local 1.3.1/build 5, all resources regenerated, portable `../../../node_modules` Swift plugin paths. Prior generated Swift paths pointed to an old `knox-mobile-polish-oct31` output and would break elsewhere. No dependency version change, StoreKit purchase flow, environment change or private Firebase copy.

Relevant files are `app-shell/`, guarded app hooks in `app.html`, `calc.js`, `flashcards.js`, `mobile/assets/native-transport.js`, mobile build/config/tests/resources and the draft paragraph in `privacy.html`. Shared app-shell improvements affect the home-screen web shell if later merged; regular-browser behavior stays guarded. Existing deletion initiation in this branch is inherited from the previous mobile candidate, not newly deployed.

## Verification and limits

- 233 shared tests and 18 mobile tests pass (251 total), including new persistence/isolation/expiry, native abort, sharing, rotation and cancellation regressions.
- 278 source/inline parsing units passed before this Markdown handoff; all relevant plist/project files validate.
- 78 bundled source/native hashes match; no QA files or private Firebase configs in the mobile bundle; all 11 native plugins sync. Production mobile dependency audit: 0 advisories.
- Local real UI, with fake identities/Firebase/API/native plugins: 320×568, 390×844, 430×932, 768×1024, 1024×768. Draft separation/recovery, new-study cancellation, history search/reopen, mocked Ask result/save, camera cancel, native share handler, three themes, larger reading, card flip/Good/completion/Home count, dirty editor cancellation/return/save, calculator, simulated keyboard/background/offline/reconnect and sign-out isolation were exercised. Final test tab had no console errors/warnings.
- These are interface/logic checks, **not** physical camera/auth/share certification, live AI evaluation, real production synchronization or payment testing. Xcode attempt was blocked by the SwiftPM cache filesystem restriction and unavailable CoreSimulator service. No signed IPA/TestFlight build exists from this task.
- Native purchases/restore purchases still need a deliberate StoreKit/storefront plan; existing web entitlements continue to work. Actual account-deletion fulfillment remains manual and must be exercised with a disposable account. Android packaging was not added; this project remains the existing iOS/iPadOS candidate.

## Review locally

You can inspect the branch directly, or fetch it locally into your own review branch (do not push main):

```sh
git fetch /Users/sion/Documents/Codex/2026-09-16/https-github-com-sionfn-knox-knows/work/Knox-Knows-mobile-nov1 codex/mobile-polish-nov1
git switch -c review/mobile-polish-nov1 FETCH_HEAD
```

Full diff from Claude's 3c21893 and source ZIP are in the shared workspace `outputs/`. The handoff outside this repository records the exact final commit. If newer Claude changes arrive, reconcile them first; do not overwrite the newest branch with an older generated `www` folder. Run `npm ci && npm run sync` in `mobile` after a source merge.

Read `mobile/README.md` for build/release gates. Do not deploy this full mobile source ZIP as a website or publish without the user's approval.
