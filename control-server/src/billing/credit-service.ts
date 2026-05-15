/**
 * CreditService — user credit balance management and transaction recording.
 *
 * Operations: balance query, credit consumption, credit earning, refund,
 * admin grant. All mutation operations are atomic (SELECT ... FOR UPDATE)
 * to prevent race conditions on concurrent credit operations.
 */
import { db, pool } from '../db.js';
import { eq, sql, desc } from 'drizzle-orm';

// Drizzle schema types — dynamic import to avoid circular deps
let userCreditsTable: any;

async function getTables() {
  if (!userCreditsTable) {
    const schema = await import('../schema.js');
    userCreditsTable = schema.userCredits || schema.creditTransactions;
  }
}

// Inline table refs (built at call time via pool for now)
const USER_CREDITS = 'user_credits';
const CREDIT_TRANSACTIONS = 'credit_transactions';
const TOKEN_PRICING = 'token_pricing';
const ASSISTANT_SESSIONS = 'assistant_sessions';

export interface TokenUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface CreditBalance {
  userId: string;
  balance: number;
  totalEarned: number;
  totalSpent: number;
}

export interface PricingConfig {
  modelName: string;
  modelType: string;
  inputTokensPerCredit: number;
  outputTokensPerCredit: number;
}

export class CreditService {

  /** Get user credit balance. Creates account if not exists. */
  async getBalance(userId: string): Promise<CreditBalance> {
    await this.ensureAccount(userId);
    const result = await pool.query(
      `SELECT balance, total_earned, total_spent FROM ${USER_CREDITS} WHERE user_id = $1`,
      [userId]
    );
    const row = result.rows[0];
    return {
      userId,
      balance: row?.balance ?? 0,
      totalEarned: row?.total_earned ?? 0,
      totalSpent: row?.total_spent ?? 0,
    };
  }

  /** Check if user has enough credits for a minimum required amount. */
  async hasEnoughCredits(userId: string, minRequired: number): Promise<boolean> {
    const balance = await this.getBalance(userId);
    return balance.balance >= minRequired;
  }

  /**
   * Consume credits for a completed assistant session.
   * Calculates credit cost from token usage and active pricing.
   *
   * @returns breakdown of credits consumed per model + updated balance
   */
  async consumeCredits(
    userId: string,
    sessionId: string,
    tokenUsage: Record<string, TokenUsage>,
    taskSummary?: string,
  ): Promise<{
    creditsConsumed: number;
    balanceBefore: number;
    balanceAfter: number;
    breakdown: Array<{ model: string; inputTokens: number; outputTokens: number; credits: number }>;
  }> {
    await this.ensureAccount(userId);

    const pricing = await this.getActivePricing();
    const pricingMap = new Map(pricing.map(p => [p.modelName, p]));

    let totalCredits = 0;
    const breakdown: Array<{ model: string; inputTokens: number; outputTokens: number; credits: number }> = [];

    for (const [model, usage] of Object.entries(tokenUsage)) {
      const price = pricingMap.get(model);
      if (!price) {
        // Unknown model — charge at default rate (5000 input, 2000 output per credit)
        const credits = Math.ceil(usage.inputTokens / 5000) + Math.ceil(usage.outputTokens / 2000);
        totalCredits += credits;
        breakdown.push({ model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, credits });
        continue;
      }
      const inputCredits = Math.ceil(usage.inputTokens / price.inputTokensPerCredit);
      const outputCredits = Math.ceil(usage.outputTokens / price.outputTokensPerCredit);
      const modelCredits = inputCredits + outputCredits;
      totalCredits += modelCredits;
      breakdown.push({ model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, credits: modelCredits });
    }

    // Atomic debit
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const lockResult = await client.query(
        `SELECT balance FROM ${USER_CREDITS} WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );
      const balanceBefore = lockResult.rows[0]?.balance ?? 0;

      if (balanceBefore < totalCredits) {
        await client.query('ROLLBACK');
        return {
          creditsConsumed: 0,
          balanceBefore,
          balanceAfter: balanceBefore,
          breakdown: [],
        };
      }

      const balanceAfter = balanceBefore - totalCredits;
      await client.query(
        `UPDATE ${USER_CREDITS} SET balance = $1, total_spent = total_spent + $2, updated_at = NOW() WHERE user_id = $3`,
        [balanceAfter, totalCredits, userId]
      );

      // Record transaction
      await client.query(
        `INSERT INTO ${CREDIT_TRANSACTIONS} (user_id, type, amount, balance_after, scene, reference_id, metadata)
         VALUES ($1, 'spend', $2, $3, 'assistant_chat', $4, $5)`,
        [
          userId,
          totalCredits,
          balanceAfter,
          sessionId,
          JSON.stringify({ breakdown, taskSummary, tokenUsage }),
        ]
      );

      // Update session credits
      await client.query(
        `UPDATE ${ASSISTANT_SESSIONS} SET credits_spent = credits_spent + $1 WHERE id = $2`,
        [totalCredits, sessionId]
      );

      await client.query('COMMIT');

      return { creditsConsumed: totalCredits, balanceBefore, balanceAfter, breakdown };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Grant credits to a user (admin action). */
  async grantCredits(
    userId: string,
    amount: number,
    adminUserId: string,
    note?: string,
  ): Promise<CreditBalance> {
    await this.ensureAccount(userId);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE ${USER_CREDITS} SET balance = balance + $1, total_earned = total_earned + $1, updated_at = NOW() WHERE user_id = $2`,
        [amount, userId]
      );

      const result = await client.query(
        `SELECT balance, total_earned, total_spent FROM ${USER_CREDITS} WHERE user_id = $1`,
        [userId]
      );

      // Record transaction
      await client.query(
        `INSERT INTO ${CREDIT_TRANSACTIONS} (user_id, type, amount, balance_after, scene, metadata)
         VALUES ($1, 'admin_grant', $2, $3, 'admin_grant', $4)`,
        [userId, amount, result.rows[0].balance, JSON.stringify({ adminUserId, note })]
      );

      await client.query('COMMIT');

      const row = result.rows[0];
      return { userId, balance: row.balance, totalEarned: row.total_earned, totalSpent: row.total_spent };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Refund credits for a failed/cancelled session. */
  async refundCredits(userId: string, amount: number, sessionId: string): Promise<void> {
    await this.ensureAccount(userId);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `UPDATE ${USER_CREDITS} SET balance = balance + $1, total_spent = total_spent - $1, updated_at = NOW() WHERE user_id = $2 RETURNING balance`,
        [amount, userId]
      );

      await client.query(
        `INSERT INTO ${CREDIT_TRANSACTIONS} (user_id, type, amount, balance_after, scene, reference_id)
         VALUES ($1, 'refund', $2, $3, 'assistant_chat', $4)`,
        [userId, amount, result.rows[0]?.balance ?? 0, sessionId]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Get transaction history for a user. */
  async getTransactions(userId: string, limit = 50, offset = 0): Promise<any[]> {
    const result = await pool.query(
      `SELECT * FROM ${CREDIT_TRANSACTIONS} WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  /** Get all transactions (admin). */
  async getAllTransactions(limit = 100, offset = 0): Promise<any[]> {
    const result = await pool.query(
      `SELECT ct.*, u.username FROM ${CREDIT_TRANSACTIONS} ct
       JOIN users u ON ct.user_id = u.id
       ORDER BY ct.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }

  /** Get active token pricing configuration. */
  async getActivePricing(): Promise<PricingConfig[]> {
    const result = await pool.query(
      `SELECT * FROM ${TOKEN_PRICING} WHERE is_active = true ORDER BY model_type, model_name`
    );
    return result.rows.map((r: any) => ({
      modelName: r.model_name,
      modelType: r.model_type,
      inputTokensPerCredit: r.input_tokens_per_credit,
      outputTokensPerCredit: r.output_tokens_per_credit,
    }));
  }

  /** Update token pricing. */
  async updatePricing(
    modelName: string,
    inputTokensPerCredit: number,
    outputTokensPerCredit: number,
  ): Promise<void> {
    await pool.query(
      `UPDATE ${TOKEN_PRICING} SET input_tokens_per_credit = $1, output_tokens_per_credit = $2, updated_at = NOW() WHERE model_name = $3`,
      [inputTokensPerCredit, outputTokensPerCredit, modelName]
    );
  }

  /** Get admin overview stats. */
  async getOverview(): Promise<{
    totalUsers: number;
    totalCreditsIssued: number;
    totalCreditsSpent: number;
    activeSessionsToday: number;
  }> {
    const [usersResult, creditsResult, sessionsResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM users WHERE status = 'active'`),
      pool.query(`SELECT COALESCE(SUM(total_earned),0) as earned, COALESCE(SUM(total_spent),0) as spent FROM ${USER_CREDITS}`),
      pool.query(`SELECT COUNT(*) FROM ${ASSISTANT_SESSIONS} WHERE status = 'active' AND started_at >= CURRENT_DATE`),
    ]);
    return {
      totalUsers: parseInt(usersResult.rows[0]?.count ?? '0'),
      totalCreditsIssued: parseInt(creditsResult.rows[0]?.earned ?? '0'),
      totalCreditsSpent: parseInt(creditsResult.rows[0]?.spent ?? '0'),
      activeSessionsToday: parseInt(sessionsResult.rows[0]?.count ?? '0'),
    };
  }

  // ── session management ──

  async createSession(userId: string, deviceId: string, title?: string): Promise<string> {
    const result = await pool.query(
      `INSERT INTO ${ASSISTANT_SESSIONS} (user_id, device_id, title) VALUES ($1, $2, $3) RETURNING id`,
      [userId, deviceId, title || null]
    );
    return result.rows[0].id;
  }

  async updateSessionTokens(sessionId: string, tokens: number, steps: number): Promise<void> {
    await pool.query(
      `UPDATE ${ASSISTANT_SESSIONS} SET total_tokens = total_tokens + $1, total_steps = total_steps + $2 WHERE id = $3`,
      [tokens, steps, sessionId]
    );
  }

  async completeSession(sessionId: string, status: string = 'completed'): Promise<void> {
    await pool.query(
      `UPDATE ${ASSISTANT_SESSIONS} SET status = $1, ended_at = NOW() WHERE id = $2`,
      [status, sessionId]
    );
  }

  // ── internal ──

  private async ensureAccount(userId: string): Promise<void> {
    await pool.query(
      `INSERT INTO ${USER_CREDITS} (user_id, balance, total_earned, total_spent)
       VALUES ($1, 0, 0, 0) ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
  }
}

export const creditService = new CreditService();
