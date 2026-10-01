# Knox Knows — private fixes package

Prepared September 30, 2026 from `Knox-Knows-latest-website (5).zip`.
Website only. No extension files, secrets, account credentials or deployment metadata are included. Nothing has been published or imported into the active private checkout.

## What changed

- Serialized checkout creation with a server-side lease, Stripe idempotency keys, immediate customer linking, open-session reuse and checks for existing subscriptions. Changing billing expires the earlier open session. A missed cancellation can be reconciled before a replacement purchase.
- Webhook subscription conflicts produce a server-only `billingReview` record and `BILLING_REVIEW_REQUIRED` log instead of disappearing silently. Trial status is retained.
- Payment-return UI checks authenticated server plan state and does not equate a URL parameter with a collected payment. Delayed activation shows an honest pending/unconfirmed message.
- Pending purchases retain monthly/yearly selection through login, with duplicate-click protection and guarded redirects.
- Auth changes clear displayed chat, drafts, photos, feedback data and private settings; abort the in-flight browser request; preserve permanent login/settings modals. Admin responses are ignored after an account change.
- Admin authorization now requires the configured Firebase UID and a verified email, not an email address alone.
- Billing management remains available for accounts with a Stripe customer even when entitlement is Free.
- History saves preserve the entire supported question/answer, use atomic writes and stable retry IDs, show a retry option on failure, and stop writing into deleted conversations. Conversation deletion marks the parent before draining messages; matching rules block new child writes during deletion.
- Calculator percentages preserve grouping (`2 / 50% = 4`), syntax errors reset parentheses, and zero can be inserted into chat.
- Exact greetings/thanks are answered locally, with no paid model call or large-history forwarding. Real text/photo/Learn questions still use the existing GPT-6 Luna configuration.
- Expired Learn sessions explicitly request a new session rather than silently charging every later follow-up. Copy now accurately describes 20 total messages / 19 included follow-ups within two hours.
- Extension login requires a positive acknowledgement and has network/hand-off timeouts. The published extension still needs end-to-end testing.
- Source checks work outside Git, dynamic viewport fallback order is corrected, a legacy renderer loop is bounded, and landing history entry points lead to the app.
- Unsupported numerical model-performance claims were removed. Production dependencies and selected transitive dependencies were updated; dependency lockfile retained.

## Required configuration before deployment

1. **Set `ADMIN_UID`** in the intended Vercel environment to the owner's UID from Firebase Console → Authentication → Users. Do not use an email address here. The owner must have a verified email. Without this value, the admin endpoint intentionally stays unavailable. `ADMIN_EMAIL` alone is no longer sufficient.
2. **Deploy the included `firestore.rules` separately**, after testing in a non-production Firebase environment. Vercel does not deploy Firestore rules. The new history format permits questions up to 8,000 characters and answers up to 100,000, and depends on the parent-deletion guard. Old rules can reject saves; the UI will report that rather than truncate data. No rules were changed on your account by this task.
3. Retain your existing server-only Firebase/Stripe/OpenAI/email environment variables. Do not place secrets in the ZIP or browser files. Check `APP_URL`, Stripe prices and webhook configuration against the target environment.
4. Monitor `billingReview` documents and `BILLING_REVIEW_REQUIRED` logs. Existing duplicate subscriptions require human reconciliation; this package does not automatically cancel or refund them. Resolve a genuinely abandoned `checkoutLocks/{uid}` attempt only after checking Stripe. Lease expiry alone is handled automatically.
5. Keep development private. Do not push these changes to the public GitHub repository, main branch, or production deployment without approval. Verify Vercel protection before creating a hosted preview. Preview billing remains disabled.

## Verification completed

- 39 automated tests pass, including new checkout concurrency/retry, reconciliation, calculator, history, admin-identity and Learn expiry regressions. These are isolated/mocked tests, not production integration tests.
- 39 source/inline-script units parse successfully.
- Frozen-lockfile installation with lifecycle scripts disabled succeeds under Node 24 / pnpm 11.25.0. Firebase Admin and Stripe runtime imports succeed. This is not a Vercel deployment build.
- Local mocked UI: question response, sign-out clearing chat, login modal after sign-out, calculator percentage result, and unconfirmed payment message verified. No live provider requests or real payments were used for these checks.
- Production-only dependency scan: **0 known advisories** at packaging time.
- Full dependency scan: **15 remaining development-only advisories** in Vercel's transitive `undici` 5.x tree (4 low, 8 moderate, 3 high; 0 critical). Vercel was updated to the current registry release observed during this task. These are not demonstrated production exploits. A forced cross-major HTTP-client override was not applied without verifying Vercel compatibility. Do not expose the development server publicly or process untrusted projects through it.

## Still required before calling this launch-ready

- Real Firebase rules-emulator and deployed-rules checks, cross-account/cross-tab auth tests, and a real installed-extension login test.
- Stripe test-mode purchase, cancellation, recovery, duplicate-click, replayed/delayed webhook and refund tests. Do not substitute real charges.
- Real text/photo/Learn accuracy, latency, failure/refund and load tests; the model is not guaranteed correct.
- Email delivery, monitoring/budget alerts, account deletion/export, backups and rollback checks.
- Full mobile Safari/Chrome, keyboard/accessibility and visual review in both themes. The bounded local smoke tests are not an accessibility certification.
- Resolve the remaining development-tool advisories when a compatible patched dependency is available; keep the CLI local in the meantime.
- Review age/parental-consent requirements, privacy/terms/refund wording, marketing promises and support operations with appropriate professional advice. No legal compliance certification is implied.

This package fixes the identified code paths but is **not a claim that every possible issue is eliminated**. Larger refactors (shared app/landing modules, strict CSP and comprehensive accessibility work) remain separate improvements.

## Local commands

Use Node 24 and pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
pnpm test
pnpm audit --prod
```

Bind local previews to `127.0.0.1`. Keep provider credentials out of client code and test artifacts.
