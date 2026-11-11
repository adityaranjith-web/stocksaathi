import type { CalendarDay } from "@/lib/forecast/desk";

export interface Shop { id: string; name: string; locality: string }
export interface Distributor { id: string; name: string; supplies: string; salesman: string; whatsapp: string; visitDay: string }
export interface Item {
  id: string; name: string; category: string; pack: string; price: number; distributorId: string;
  leadTimeDays: number; minSafetyStock: number; orderCoverDays: number; currentStock: number;
}
export interface Sale { date: string; itemId: string; qty: number }
export interface ImportRow { date: string; itemName: string; qty: number; line: number }
export interface ImportResult { saved: number; errors: { line: number; issue: string }[] }

export interface Store {
  mode: "demo" | "live";
  getShop(): Promise<Shop>;
  listItems(): Promise<Item[]>;
  listDistributors(): Promise<Distributor[]>;
  listSales(sinceDate: string): Promise<Sale[]>;
  listCalendar(): Promise<CalendarDay[]>;
  openOrderQty(): Promise<Record<string, number>>;
  addSale(itemId: string, qty: number, method: "Quick tap" | "CSV upload"): Promise<void>;
  addDelivery(itemId: string, qty: number): Promise<void>;
  importSales(rows: ImportRow[]): Promise<ImportResult>;
  createOrder(distributorId: string, lines: { itemId: string; qty: number }[]): Promise<{ orderId: string }>;
}
