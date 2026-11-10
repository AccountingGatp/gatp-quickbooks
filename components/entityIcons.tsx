import { Landmark, CreditCard, Receipt, FileCheck, BadgeDollarSign, PiggyBank, ArrowLeftRight, Wallet, FileText, HandCoins, FileMinus, ShoppingCart, FileSpreadsheet, ClipboardList, ReceiptText, FileX, RotateCcw, Banknote, BookOpen, Scale, Clock, Users, Truck, UserRound, Package, ListTree, Tag, MapPin } from "lucide-react";
import type { ChipTone } from "./ui";

export const ENTITY_ICON: Record<string, any> = {
  "bank-statement": Landmark, "card-statement": CreditCard, expenses: Receipt, checks: FileCheck, "card-credits": BadgeDollarSign,
  deposits: PiggyBank, transfers: ArrowLeftRight, "card-payments": Wallet,
  bills: FileText, "bill-payments": HandCoins, "vendor-credits": FileMinus, "purchase-orders": ShoppingCart,
  invoices: FileSpreadsheet, estimates: ClipboardList, "sales-receipts": ReceiptText, "credit-memos": FileX, "refund-receipts": RotateCcw, "receive-payments": Banknote,
  "journal-entries": BookOpen, "trial-balance": Scale, "time-activities": Clock,
  customers: Users, vendors: Truck, employees: UserRound, items: Package, accounts: ListTree, classes: Tag, locations: MapPin,
};
export const GROUP_TONE: Record<string, ChipTone> = { Banking: "green", Purchases: "amber", Sales: "blue", Accounting: "violet", Lists: "teal" };
