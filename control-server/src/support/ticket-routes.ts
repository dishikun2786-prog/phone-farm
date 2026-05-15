/**
 * Support ticket routes — customer support ticket CRUD.
 */
import type { FastifyInstance } from 'fastify';
import type { AuthUser } from '../auth/auth-middleware.js';
import { db } from '../db.js';
import { supportTickets, supportTicketReplies } from './ticket-schema.js';
import { eq, desc, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { z } from 'zod';

const createTicketSchema = z.object({
  subject: z.string().min(1).max(256),
  category: z.enum(['technical', 'billing', 'account', 'activation', 'other']),
  message: z.string().min(1).max(5000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
});

const createReplySchema = z.object({
  message: z.string().min(1).max(5000),
});

export async function ticketRoutes(app: FastifyInstance) {
  // Create ticket
  app.post('/api/v2/support/tickets', async (req, reply) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const parsed = createTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const id = randomUUID();
    const now = new Date();
    const ticketNumber = `TK-${Date.now().toString(36).toUpperCase()}`;

    await db.insert(supportTickets).values({
      id,
      userId: user.userId,
      ticketNumber,
      subject: parsed.data.subject,
      category: parsed.data.category,
      priority: parsed.data.priority,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    });

    // Add first message as reply
    await db.insert(supportTicketReplies).values({
      id: randomUUID(),
      ticketId: id,
      userId: user.userId,
      message: parsed.data.message,
      isStaff: false,
      createdAt: now,
    });

    return reply.status(201).send({ id, ticketNumber });
  });

  // List user tickets
  app.get('/api/v2/support/tickets', async (req, reply) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const rows = await db.select().from(supportTickets)
      .where(eq(supportTickets.userId, user.userId))
      .orderBy(desc(supportTickets.updatedAt));

    return reply.send({ tickets: rows, total: rows.length });
  });

  // Get ticket detail with replies
  app.get('/api/v2/support/tickets/:id', async (req, reply) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = req.params as { id: string };
    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });
    if (ticket.userId !== user.userId) return reply.status(403).send({ error: 'Access denied' });

    const replies = await db.select().from(supportTicketReplies)
      .where(eq(supportTicketReplies.ticketId, id))
      .orderBy(supportTicketReplies.createdAt);

    return reply.send({ ticket, replies });
  });

  // Add reply
  app.post('/api/v2/support/tickets/:id/replies', async (req, reply) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = req.params as { id: string };
    const parsed = createReplySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });
    if (ticket.status === 'closed') return reply.status(400).send({ error: 'Ticket is closed' });

    const replyId = randomUUID();
    await db.insert(supportTicketReplies).values({
      id: replyId,
      ticketId: id,
      userId: user.userId,
      message: parsed.data.message,
      isStaff: false,
      createdAt: new Date(),
    });

    await db.update(supportTickets).set({ updatedAt: new Date() }).where(eq(supportTickets.id, id));

    return reply.status(201).send({ id: replyId });
  });

  // Close ticket
  app.post('/api/v2/support/tickets/:id/close', async (req, reply) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = req.params as { id: string };
    const [ticket] = await db.select().from(supportTickets)
      .where(and(eq(supportTickets.id, id), eq(supportTickets.userId, user.userId)))
      .limit(1);
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });

    await db.update(supportTickets).set({ status: 'closed', updatedAt: new Date() }).where(eq(supportTickets.id, id));
    return reply.send({ closed: true });
  });
}
