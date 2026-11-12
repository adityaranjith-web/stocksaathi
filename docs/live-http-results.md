<!-- made by scripts/acceptance-live.mjs against http://localhost:3100 on 2026-11-12 -->

| ID | Live-mode check | Result | Evidence |
|---|---|---|---|
| L1 | The set-up self-check says the database is complete and the public settings are present | **PASS** | ok. Nightly-job settings present: service key false, cron secret false. |
| L2 | Signed out: every screen and every write sends the visitor to the sign-in page | **PASS** | 12 screens and 8 write routes all refuse a visitor who is not signed in. |
| L3 | The sign-in page works and offers Google | **PASS** | The sign-in page opens with a Sign in with Google button. |
| L4 | The nightly route is shut without the secret | **PASS** | No header and a wrong secret are both refused (401, or 503 if CRON_SECRET is not set). |
| L5 | Nothing public leaks a key | **PASS** | The health check and the sign-in page contain no secret key names or tokens. |
| O1 | Signed-in owner: the screens open and show the shop's items | **PASS** | 9 screens open; the owner has 30 items. |
| X1 | A second Google account does not see the first shop's items, sales or orders | **PASS** | Checked 8 screens of the second account against 25 item names of the first shop: none appear. (Second account is in its own shop.) |
| X2 | The second account cannot read, record sales on, or change the first shop's items | **PASS** | Item page 404, sale 400, edit 400: all refused. The first shop's stock stayed at 48. |
| H1 | A helper sees only the Sell screen and no prices | **PASS** | 8 owner screens redirect to Sell, 5 owner actions answer 403, and the Sell screen shows no prices. |

9 passed, 0 failed, 0 skipped (need a signed-in cookie).
