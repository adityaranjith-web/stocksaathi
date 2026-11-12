<!-- made by scripts/acceptance-live.mjs against http://localhost:3400 on 2026-11-12 -->

| ID | Live-mode check | Result | Evidence |
|---|---|---|---|
| L1 | The set-up self-check says the database is complete and the public settings are present | **PASS** | ok. Nightly-job settings present: service key false, cron secret false. |
| L2 | Signed out: every screen and every write sends the visitor to the sign-in page | **PASS** | 12 screens and 8 write routes all refuse a visitor who is not signed in. |
| L3 | The sign-in page works and offers Google | **PASS** | The sign-in page opens with a Sign in with Google button. |
| L4 | The nightly route is shut without the secret | **PASS** | No header and a wrong secret are both refused (401, or 503 if CRON_SECRET is not set). |
| L5 | Nothing public leaks a key | **PASS** | The health check and the sign-in page contain no secret key names or tokens. |
| O1 | Signed-in owner: the screens open and show the shop's items | **SKIPPED** | not run: set ACCEPT_OWNER_COOKIE |
| X1 | A second Google account does not see the first shop's items, sales or orders | **SKIPPED** | not run: set ACCEPT_OWNER_COOKIE |
| X2 | The second account cannot read, record sales on, or change the first shop's items | **SKIPPED** | not run: set ACCEPT_OWNER_COOKIE |
| H1 | A helper sees only the Sell screen and no prices | **SKIPPED** | not run: set ACCEPT_HELPER_COOKIE |

5 passed, 0 failed, 4 skipped (need a signed-in cookie).
