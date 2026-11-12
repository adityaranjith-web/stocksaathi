// The one plain line under each screen title: what the screen is for and what to do next.
// Short words, short sentences (CLAUDE.md rule 5). A test keeps them short.
export const SCREEN_HELP = {
  home: "Today's summary. Tap a number to see the list.",
  sell: "Tap what the customer bought. This is how the app learns what sells.",
  reorder: "What to order today and how much. Change any number, then tap Share.",
  deliveries: "Stock arrived? Confirm the quantities here.",
  more: "Set-up and reports.",
} as const;

/** One short line under every item on the More screen, by the screen it opens. */
export const MORE_HELP = {
  "/scorecard": "How this week went.",
  "/stock": "Stock and days left. Upload past sales.",
  "/setup/items": "Add or change items and prices.",
  "/setup/distributors": "Add or change distributors and numbers.",
  "/setup/helpers": "Let someone record sales.",
  "/setup/calendar": "Mark festival days that change sales.",
  "/setup/account": "Sign out, or delete your shop data.",
  "/ai": "A second opinion on forecasts.",
  "/ai#off": "A second opinion on forecasts. Off for now.",
} as const;

/** The "How StockSaathi works" card on Home: four steps, in the order the owner uses them. */
export const HOW_IT_WORKS = {
  title: "How StockSaathi works",
  steps: [
    { icon: "sell", title: "Sell", text: "Tap each item as it sells." },
    { icon: "reorder", title: "Reorder", text: "See what to order today." },
    { icon: "share", title: "Share on WhatsApp", text: "Send each order to your distributor." },
    { icon: "deliver", title: "Record delivery", text: "Confirm what arrived. Stock goes up." },
  ],
} as const;

/** Set to "1" in a cookie on this phone when the owner closes the card. The server reads it, so a closed card never flashes back. */
export const HOW_IT_WORKS_COOKIE = "ss_howto_closed";
