// Dev-mode in-memory + file-backed store (no PostgreSQL needed)
// Used when DATABASE_URL starts with "file:" or when PG is unavailable

import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), '.dev-data.json');

interface Store {
  devices: any[];
  accounts: any[];
  taskTemplates: any[];
  tasks: any[];
  executions: any[];
  users: any[];
}

let data: Store = {
  devices: [],
  accounts: [],
  taskTemplates: [],
  tasks: [],
  executions: [],
  users: [],
};

// Load existing data
try {
  if (fs.existsSync(DATA_FILE)) {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  }
} catch {}

function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch {}
}

function now() {
  return new Date().toISOString();
}

// Simple query builder
class QueryBuilder<T> {
  private collection: T[];
  private filters: ((item: T) => boolean)[] = [];
  private sortFn?: (a: T, b: T) => number;
  private limitVal?: number;
  private offsetVal?: number;

  constructor(collection: T[]) {
    this.collection = collection;
  }

  where(fn: (item: T) => boolean) {
    this.filters.push(fn);
    return this;
  }

  orderBy(fn: (a: T, b: T) => number) {
    this.sortFn = fn;
    return this;
  }

  limit(n: number) {
    this.limitVal = n;
    return this;
  }

  offset(n: number) {
    this.offsetVal = n;
    return this;
  }

  all(): T[] {
    let results = this.collection;
    for (const f of this.filters) {
      results = results.filter(f);
    }
    if (this.sortFn) results.sort(this.sortFn);
    if (this.offsetVal) results = results.slice(this.offsetVal);
    if (this.limitVal) results = results.slice(0, this.limitVal);
    return results;
  }

  first(): T | undefined {
    return this.all()[0];
  }
}

export const devDb = {
  _query<T>(collection: T[]) {
    return new QueryBuilder(collection);
  },

  _insert<T extends { id?: string }>(collection: T[], item: T): T {
    const record = { ...item, id: item.id || randomUUID() };
    collection.push(record);
    save();
    return record;
  },

  _update<T extends { id: string }>(collection: T[], id: string, updates: Partial<T>): T | null {
    const idx = collection.findIndex((i: any) => i.id === id);
    if (idx === -1) return null;
    collection[idx] = { ...collection[idx], ...updates };
    save();
    return collection[idx];
  },

  _delete(collection: any[], id: string) {
    const idx = collection.findIndex((i: any) => i.id === id);
    if (idx !== -1) {
      collection.splice(idx, 1);
      save();
    }
  },

  getStore() {
    return data;
  },
};

// Seed data
if (data.users.length === 0) {
  data.users.push({
    id: randomUUID(),
    username: 'admin',
    passwordHash: 'admin123', // plaintext for dev
    role: 'admin',
    createdAt: now(),
  });
  save();
}

export function desc(field?: string) {
  return (a: any, b: any) => {
    if (field) {
      const av = a[field] || '';
      const bv = b[field] || '';
      return bv > av ? 1 : bv < av ? -1 : 0;
    }
    return 0;
  };
}
