# StockSaathi: test script for 5 real users

For the Testing milestone (BRD section 8). Test with **5 real users**: 2 or 3 kirana owners near campus, plus their helpers if they have them. Each user does three tasks **without help**. You watch and write down what happens. Do not explain the screen. If they get stuck for more than 30 seconds, note it, then give one small hint and mark "help needed".

**The BRD says we are ready to go live when 5 users finish all three tasks unaided.**

## Before you start (5 minutes)

- Use a phone, not a laptop. For one of the 5 tests use a low-cost Android phone on a slow connection (mobile data, one bar).
- Open the app link. In demo mode you will see "Demo data" at the top. Leave it as it is.
- For the **helper** tasks, tap **Helper** under "Try as". For the **owner** tasks, tap **Owner**. (In live mode the helper signs in with their own Google account and the owner with theirs.)
- Have a stopwatch ready. The reorder screen also has its own timer (top of the list).
- Tell the user only this: *"This app helps a shop decide what to reorder. I will ask you to do three things. I cannot help while you do them. There are no wrong answers. We are testing the app, not you."*

## The three tasks

| # | Say this to the user | Who | What "done" looks like |
|---|---|---|---|
| 1 | "A customer buys these things. Please record each sale: **milk, bread, milk, noodles, biscuits, water, bread, milk, curd, noodles**." (10 sales) | Helper | 10 taps saved. Each sale shows "Saved". |
| 2 | "It is evening. Please look at what you should reorder today. Tell me out loud how many items you need to order, and which one you would order the most of." | Owner | They find the Reorder screen and read the list. |
| 3 | "Please send one order to the distributor. Change one quantity first if you want to." | Owner | They tap **Share order on WhatsApp**. WhatsApp opens with the order. The screen says "Order prepared in …". |

Then one extra question (task 4, BRD FR9): tap **Why?** on one item and ask: *"Can you tell me in your own words why the app suggests this number?"* A pass is when the user explains it without help, even roughly.

## What to write down (one row per user)

Copy this table. Fill it in while they work.

| User | Phone | Role | Task 1: time for 10 sales | Task 1: help needed? | Task 2: found list / read it right? | Task 3: shared order? | Order prep time (screen timer) | Task 4: explained "why"? | Problems and quotes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | |
| 2 | | | | | | | | | |
| 3 | | | | | | | | | |
| 4 | | | | | | | | | |
| 5 | | | | | | | | | |

**Pass marks** (from the BRD)

- A sale is saved in **under 10 seconds** (FR1). Task 1 in under about 2 minutes for 10 sales is fine.
- The order is prepared in **under 5 minutes** (the app's own timer, KPI 2). Today's owners take about 25 minutes.
- All 5 users finish tasks 1 to 3 **without help**.
- On the slow phone, every screen opens and every sale saves (or says "Saved on phone" and sends later).

## Questions to ask at the end (2 minutes)

1. "Was anything confusing? Which word or button?" (Write the exact words.)
2. "Would you use this every evening?" Yes / No / Maybe, and why.
3. **Owners only:** "This app costs ₹99 a month after a free month. Is that fair, too much, or too little?" (BRD assumption 4. We need answers from at least 5 owners.)
4. **Owners only:** "Would your distributor's salesman accept an order on WhatsApp?" (BRD assumption 3. Ask 2 salesmen too, if you can.)
5. **Owners only:** "Do the 'Reorder today' items look right for your shop? Which ones are wrong?"

## Two checks to do at the shop (only with an owner)

- **Stock matches a hand count (FR3).** Pick 3 items. Count them on the shelf. Compare with the **Stock** number in the app. Write down both. They should be the same, or within 1 or 2 units.
- **Delivery works (FR3).** If a delivery arrives during the visit, record it on the **Deliveries** screen. Check the stock goes up by the quantity received.

## After all 5 users

1. Add the table and your notes to the team's Testing folder.
2. Count: how many finished all three tasks unaided? Fix anything that more than one user struggled with.
3. Record what you changed in `docs/prompt-history.md`.
4. Tell the lead: ready to go live (5 of 5), or not yet (which task failed, and why).

## If something breaks during a test

- A screen shows an error or will not load: take a photo of the phone, note the time, reload once, and carry on.
- The sale list looks wrong (very old numbers): the demo data changes as people add sales. That is normal. It does not stop the test.
- Never ask a user for a password or an OTP. Owners and helpers sign in with Google on their own phone.
