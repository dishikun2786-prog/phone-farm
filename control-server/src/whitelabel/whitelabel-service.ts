import { db } from '../db.js';
import { whitelabelConfigs } from './whitelabel-schema.js';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export interface WhitelabelConfig {
  id: string;
  tenantId: string;
  brandName?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily?: string;
  customCss?: string;
  customDomain?: string;
  loginBackgroundUrl?: string;
  footerText?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class WhitelabelService {
  async getConfig(tenantId: string): Promise<WhitelabelConfig | null> {
    const [row] = await db.select().from(whitelabelConfigs)
      .where(eq(whitelabelConfigs.tenantId, tenantId))
      .limit(1);
    return (row as WhitelabelConfig) || null;
  }

  async getConfigByDomain(domain: string): Promise<WhitelabelConfig | null> {
    const [row] = await db.select().from(whitelabelConfigs)
      .where(eq(whitelabelConfigs.customDomain, domain))
      .limit(1);
    return (row as WhitelabelConfig) || null;
  }

  async upsertConfig(tenantId: string, data: Partial<Omit<WhitelabelConfig, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>): Promise<WhitelabelConfig> {
    const existing = await this.getConfig(tenantId);

    if (existing) {
      const [row] = await db.update(whitelabelConfigs).set({
        ...data,
        updatedAt: new Date(),
      }).where(eq(whitelabelConfigs.tenantId, tenantId)).returning();
      return row as WhitelabelConfig;
    }

    const [row] = await db.insert(whitelabelConfigs).values({
      id: randomUUID(),
      tenantId,
      ...data,
      primaryColor: data.primaryColor || '#3B82F6',
      secondaryColor: data.secondaryColor || '#8B5CF6',
    }).returning();
    return row as WhitelabelConfig;
  }

  async deleteConfig(tenantId: string): Promise<boolean> {
    const result = await db.delete(whitelabelConfigs)
      .where(eq(whitelabelConfigs.tenantId, tenantId));
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Generate CSS variables from a whitelabel config.
   */
  toCssVariables(config: WhitelabelConfig): string {
    const vars: string[] = [
      `--pf-primary: ${config.primaryColor};`,
      `--pf-secondary: ${config.secondaryColor};`,
    ];
    if (config.fontFamily) {
      vars.push(`--pf-font-family: ${config.fontFamily};`);
    }
    if (config.logoUrl) {
      vars.push(`--pf-logo-url: url(${config.logoUrl});`);
    }
    return `:root { ${vars.join(' ')} }`;
  }
}

export const whitelabelService = new WhitelabelService();
