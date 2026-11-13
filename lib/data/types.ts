import type { CalendarDay } from "@/lib/forecast/desk";

export type Role = "owner" | "helper";

/** The signed-in person. isTeam = a member of the product team (may edit the festival calendar, FR8). */
export interface Me { name: string; role: Role; isTeam: boolean }

export interface Shop { id: string; name: string; locality: string }
export interface Distributor { id: string; name: string; supplies: string; salesman: string; whatsapp: string; visitDay: string }
export interface DistributorInput { name: string; supplies: string; salesman: string; whatsapp: string; visitDay: string }
export interface Item {
  id: string; name: string; category: string; pack: string; price: number; distributorId: string;
  leadTimeDays: number; minSafetyStock: number; orderCoverDays: number; currentStock: number;
  /** The owner's own guess of units sold per day ("Start your shop"). Used only until the item has 14 days of sales. null = none. */
  estimatedPerDay?: number | null;
}
/** What the owner types on the item set-up screen. openingStock is used only when adding a new item. */
export interface ItemInput {
  name: string; category: string; pack: string; price: number; distributorId: string;
  leadTimeDays: number; minSafetyStock: number; orderCoverDays: number; openingStock: number;
}
export interface Sale { date: string; itemId: string; qty: number }
export interface DeliveryRecord { date: string; itemId: string; qty: number }
export interface ImportRow { date: string; itemName: string; qty: number; line: number }
export interface ImportResult { saved: number; errors: { line: number; issue: string }[] }

/** An order that was sent and has not been delivered yet. */
export interface OpenOrder {
  orderId: string; distributorId: string; orderedOn: string;
  lines: { itemId: string; qty: number }[];
}
/** A sent order, with the time it took to prepare (KPI 2). */
export interface OrderRecord { orderId: string; date: string; distributorId: string; prepSeconds: number | null }

export interface Helper { id: string; name: string; email: string; status: "Active" | "Invited" }

/**
 * What the nightly job saved for one item on one night: the blended forecast that orders were based on, and the plain
 * 28-day average (model M2) made on the same night. Both are units per day over the next horizonDays.
 */
export interface SavedForecast {
  runDate: string; itemId: string; horizonDays: number;
  blendUnitsPerDay: number; simpleUnitsPerDay: number | null;
}

/** One AI forecast kept for later checking (see docs/ai-integration.md). */
export interface AiForecastRow {
  runDate: string; itemId: string; provider: string;
  aiUnitsPerDay: number; blendUnitsPerDay: number; horizonDays: number;
  low: number | null; high: number | null;
}

/**
 * The shop's own "today" (see lib/business-day.ts). It follows the real date unless days were closed ahead of it.
 * date: the business date. realDate: today in India. simulated: date is ahead of realDate.
 * sampleShop: only the demo shop may get sample sales. salesToday: how many sales were recorded on the business date.
 */
export interface BusinessDay { date: string; realDate: string; simulated: boolean; sampleShop: boolean; salesToday: number }

/** What closing the day did. */
export interface CloseDayResult { closed: string; businessDate: string; sampleRows: number }

export interface Store {
  mode: "demo" | "live";
  getMe(): Promise<Me>;
  /** The shop's business date (the same for everybody in the shop). */
  getBusinessDay(): Promise<BusinessDay>;
  /**
   * Owner on the product team only. Today's sales and deliveries become history and the business date moves forward by one.
   * `day` must be the date the person was looking at. `sample` (demo shop only, fewer than 5 sales that day) are added first.
   */
  closeDay(day: string, sample: { itemId: string; qty: number }[]): Promise<CloseDayResult>;
  /** Owner on the product team only. Back to the real date; removes sample sales and forecasts dated today or later. */
  resetBusinessDate(): Promise<{ removedSampleSales: number }>;
  /** First sign-in, no shop and no helper invite: make the signed-in person the owner of a new shop (live mode only). */
  createShop(name: string, locality: string, consent: boolean): Promise<{ shopId: string }>;
  /** Owner only: delete the shop, everything in it, the helpers and the owner's own sign-in record (live mode only). */
  deleteMyAccount(confirmName: string): Promise<void>;
  getShop(): Promise<Shop>;
  listItems(): Promise<Item[]>;
  listDistributors(): Promise<Distributor[]>;
  listSales(sinceDate: string): Promise<Sale[]>;
  listDeliveries(sinceDate: string): Promise<DeliveryRecord[]>;
  listCalendar(): Promise<CalendarDay[]>;
  openOrderQty(): Promise<Record<string, number>>;
  openOrders(): Promise<OpenOrder[]>;
  listOrders(sinceDate: string): Promise<OrderRecord[]>;
  addSale(itemId: string, qty: number, method: "Quick tap" | "CSV upload"): Promise<void>;
  addDelivery(itemId: string, qty: number): Promise<void>;
  importSales(rows: ImportRow[]): Promise<ImportResult>;
  createOrder(distributorId: string, lines: { itemId: string; qty: number }[], prepSeconds?: number | null): Promise<{ orderId: string }>;

  // Start your shop (owner only; docs/live-setup.md, section 12)
  /** Step 1: add the ticked items (stock 0). Items whose name already exists are skipped. A first distributor is made if there is none. */
  addStarterItems(items: { name: string; pack: string }[]): Promise<{ added: number; skipped: string[] }>;
  /** Step 2: each item's "sells per day" estimate, stock now and (optional) price; one distributor name and lead time for them all. */
  saveStartNumbers(args: { distributorName: string; leadTimeDays: number; rows: { itemId: string; perDay: number; stock: number; price: number | null }[] }): Promise<{ saved: number }>;
  /** Step 3: past sales typed in a table. Stock stays as the owner entered it for today (these sales already happened). */
  saveStartHistory(rows: { itemId: string; date: string; qty: number }[]): Promise<{ saved: number }>;

  // Set-up (owner only)
  saveItem(id: string | null, input: ItemInput): Promise<{ id: string }>;
  archiveItem(id: string): Promise<void>;
  saveDistributor(id: string | null, input: DistributorInput): Promise<{ id: string }>;
  listHelpers(): Promise<Helper[]>;
  addHelper(email: string, name: string): Promise<void>;
  removeHelper(id: string): Promise<void>;

  // Festival calendar (product team only)
  saveCalendarDay(day: CalendarDay): Promise<void>;
  deleteCalendarDay(date: string): Promise<void>;

  // Forecasts saved by the nightly job (live mode only; the demo has none)
  listSavedForecasts(sinceDate: string): Promise<SavedForecast[]>;

  // AI forecasts kept for checking
  listAiForecasts(sinceDate: string): Promise<AiForecastRow[]>;
  saveAiForecasts(rows: AiForecastRow[]): Promise<void>;
}
