// Small helpers shared by tests.
import { todayIST } from "@/lib/dates";
import type { BusinessDay } from "@/lib/data/types";

/** A shop that follows the real date (the usual case): the business date is today. */
export const realBusinessDay = async (): Promise<BusinessDay> => {
  const d = todayIST();
  return { date: d, realDate: d, simulated: false, sampleShop: false, salesToday: 0 };
};
