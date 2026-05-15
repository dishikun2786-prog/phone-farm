/**
 * Tenant CRUD service.
 */
import { eq, like, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { tenants } from './schema.js';
import { randomUUID } from 'crypto';

export interface CreateTenantInput {
  name: string;
  slug: string;
  domain?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  maxDevices?: number;
  maxUsers?: number;
  features?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateTenantInput {
  name?: string;
  domain?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  status?: string;
  maxDevices?: number;
  maxUsers?: number;
  features?: string[];
  metadata?: Record<string, unknown>;
}

export class TenantService {
  async create(input: CreateTenantInput) {
    const id = randomUUID();
    const now = new Date();
    await db.insert(tenants).values({
      id,
      name: input.name,
      slug: input.slug,
      domain: input.domain || null,
      contactName: input.contactName || null,
      contactEmail: input.contactEmail || null,
      contactPhone: input.contactPhone || null,
      maxDevices: input.maxDevices ?? 100,
      maxUsers: input.maxUsers ?? 10,
      features: input.features || [],
      metadata: input.metadata || {},
      createdAt: now,
      updatedAt: now,
    });
    return this.getById(id);
  }

  async getById(id: string) {
    const [t] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    return t || null;
  }

  async getBySlug(slug: string) {
    const [t] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
    return t || null;
  }

  async list(search?: string, limit = 50, offset = 0) {
    const where = search
      ? like(tenants.name, `%${search}%`)
      : undefined;
    const rows = await db.select().from(tenants).where(where).limit(limit).offset(offset);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(tenants).where(where);
    return { tenants: rows, total: count };
  }

  async update(id: string, input: UpdateTenantInput) {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) set.name = input.name;
    if (input.domain !== undefined) set.domain = input.domain;
    if (input.contactName !== undefined) set.contactName = input.contactName;
    if (input.contactEmail !== undefined) set.contactEmail = input.contactEmail;
    if (input.contactPhone !== undefined) set.contactPhone = input.contactPhone;
    if (input.status !== undefined) set.status = input.status;
    if (input.maxDevices !== undefined) set.maxDevices = input.maxDevices;
    if (input.maxUsers !== undefined) set.maxUsers = input.maxUsers;
    if (input.features !== undefined) set.features = input.features;
    if (input.metadata !== undefined) set.metadata = input.metadata;
    await db.update(tenants).set(set).where(eq(tenants.id, id));
    return this.getById(id);
  }

  async delete(id: string) {
    await db.update(tenants).set({ status: 'deleted', updatedAt: new Date() }).where(eq(tenants.id, id));
    return { deleted: true };
  }
}

export const tenantService = new TenantService();
