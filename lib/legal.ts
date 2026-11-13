// The words of the public Privacy Policy and Terms of Service, kept in one place so a test can check them.
// Short sentences, plain words (CLAUDE.md rule 5).

export const CONTACT_EMAIL = "cakeisgud4u@gmail.com";
export const LEGAL_UPDATED = "13 November 2026";
export const GOOGLE_USER_DATA_POLICY_URL = "https://developers.google.com/terms/api-services-user-data-policy";

export const PRIVACY_TITLE = "StockSaathi Privacy Policy";
export const TERMS_TITLE = "StockSaathi Terms of Service";

export const PRIVACY_INTRO = "This page says what StockSaathi collects, why, where it is kept, and what you can do about it.";

export const PRIVACY_SECTIONS: { heading: string; paragraphs: string[] }[] = [
  {
    heading: "Who we are",
    paragraphs: [
      "StockSaathi is a student capstone project by Group 3, Section 1, PGDM, Great Lakes Institute of Management, Chennai.",
      "It gives a kirana (corner shop) owner a daily list of what to reorder.",
      `Contact: ${CONTACT_EMAIL}`,
    ],
  },
  {
    heading: "What we collect from Google sign-in",
    paragraphs: [
      "When you sign in with Google, we get your name and your email address. That is all.",
      "We do not access your Gmail, Google Drive, contacts or any other Google data.",
    ],
  },
  {
    heading: "What shop owners enter",
    paragraphs: [
      "Shop owners enter their shop details (name and place), items, sales, orders and deliveries.",
      "They also enter the names and emails of their helpers, and the names and WhatsApp numbers of the distributors they order from.",
    ],
  },
  {
    heading: "What we do not collect",
    paragraphs: [
      "We do not collect your customers' names or phone numbers.",
      "We do not collect your location, photos or payment details.",
    ],
  },
  {
    heading: "Why we use it",
    paragraphs: [
      "We use your name and email to sign you in.",
      "We use the shop data to work out what to reorder.",
    ],
  },
  {
    heading: "Where it is stored",
    paragraphs: [
      "Your data is kept in Supabase, in a database in the Seoul region. The app runs on Vercel.",
      "For an optional AI second opinion, forecast data may be sent to Google Gemini. That data is item names, daily sales counts and stock levels. It has no names or emails of people, and no shop name.",
    ],
  },
  {
    heading: "Who can see it",
    paragraphs: [
      "Only the shop owner and their helpers can see a shop's data. A helper sees only the Sell screen.",
      "We do not sell or share your data.",
      "The project team can reach the database to run and fix the app. It does not use the data for anything else.",
    ],
  },
  {
    heading: "Your rights",
    paragraphs: [
      "You can delete your account and all your shop data at any time. Go to More, then Your account, then Delete my account. This removes the shop and everything in it.",
      "Helpers can ask their shop owner, or write to us, to remove their details.",
      "We follow India's Digital Personal Data Protection Act, 2023.",
    ],
  },
  {
    heading: "Google API data",
    paragraphs: [
      "StockSaathi's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.",
    ],
  },
];

export const TERMS_INTRO = "By using StockSaathi you agree to these short terms.";

export const TERMS_SECTIONS: { heading: string; paragraphs: string[] }[] = [
  {
    heading: "What StockSaathi is",
    paragraphs: [
      "StockSaathi is a free student prototype, made for learning.",
      "It is not a finished commercial product.",
    ],
  },
  {
    heading: "Forecasts are suggestions",
    paragraphs: [
      "The reorder list and the forecasts are suggestions only.",
      "The shop owner decides what to order and how much.",
    ],
  },
  {
    heading: "No promises",
    paragraphs: [
      "We do not promise that the app will always be available.",
      "We do not promise that the forecasts are right.",
      "We are not responsible for any loss that comes from using the app.",
    ],
  },
  {
    heading: "Use it fairly",
    paragraphs: [
      "Do not misuse the app. Do not try to get into another shop's data.",
      "Do not break the app or try to stop others using it.",
    ],
  },
  {
    heading: "Changes",
    paragraphs: [
      "We may change or stop the app at any time.",
      "We may update these terms. The date at the top shows the latest version.",
    ],
  },
  {
    heading: "Contact",
    paragraphs: [
      `Write to us at ${CONTACT_EMAIL}`,
      "How we handle your data is in our Privacy Policy.",
    ],
  },
];
