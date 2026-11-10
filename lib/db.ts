// MongoDB connection (one cached client per server instance, safe for Vercel serverless).
import { MongoClient, type Db, type Collection, type Document } from "mongodb";
import type { CompanyDoc, JobDoc, RowDoc, MappingDoc, RuleDoc, AuditDoc, ListCacheDoc } from "./types";

const g = globalThis as unknown as { _mongo?: Promise<MongoClient>; _indexes?: Promise<void> };

function client(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set. Add your MongoDB Atlas connection string in Vercel → Settings → Environment Variables.");
  if (!g._mongo) {
    g._mongo = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 8000 }).connect().catch((e) => {
      g._mongo = undefined;
      throw new Error("Could not connect to MongoDB: " + (e instanceof Error ? e.message : String(e)));
    });
  }
  return g._mongo;
}

export async function db(): Promise<Db> {
  const d = (await client()).db(process.env.MONGODB_DB || "gatp_ledger");
  if (!g._indexes) g._indexes = ensureIndexes(d).catch((e) => { g._indexes = undefined; console.error("index setup", e); });
  await g._indexes;
  return d;
}

async function ensureIndexes(d: Db) {
  await Promise.all([
    d.collection("jobs").createIndex({ realmId: 1, createdAt: -1 }),
    d.collection("jobs").createIndex({ createdAt: -1 }),
    d.collection("job_rows").createIndex({ jobId: 1, idx: 1 }, { unique: true }),
    d.collection("job_rows").createIndex({ jobId: 1, status: 1 }),
    d.collection("mappings").createIndex({ entity: 1, signature: 1 }),
    d.collection("rules").createIndex({ realmId: 1, order: 1 }),
    d.collection("audit").createIndex({ ts: -1 }),
    d.collection("audit").createIndex({ realmId: 1, ts: -1 }),
    d.collection("list_cache").createIndex({ realmId: 1, kind: 1 }, { unique: true }),
  ]);
}

const col = <T extends Document>(name: string) => async (): Promise<Collection<T>> => (await db()).collection<T>(name);
export const companies = col<CompanyDoc>("companies");
export const jobs = col<JobDoc>("jobs");
export const jobRows = col<RowDoc>("job_rows");
export const mappings = col<MappingDoc>("mappings");
export const rules = col<RuleDoc>("rules");
export const audit = col<AuditDoc>("audit");
export const listCache = col<ListCacheDoc>("list_cache");
