import { db } from '../db.js';
import { supportTickets, supportTicketReplies } from './ticket-schema.js';
import { eq, desc, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export interface CreateTicketParams {
  userId: string;
  subject: string;
  category: 'technical' | 'billing' | 'account' | 'activation' | 'other';
  message: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export class TicketService {
  async createTicket(params: CreateTicketParams) {
    const id = randomUUID();
    const now = new Date();
    const ticketNumber = `TK-${Date.now().toString(36).toUpperCase()}`;

    await db.insert(supportTickets).values({
      id,
      userId: params.userId,
      ticketNumber,
      subject: params.subject,
      category: params.category,
      priority: params.priority || 'normal',
      status: 'open',
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(supportTicketReplies).values({
      id: randomUUID(),
      ticketId: id,
      userId: params.userId,
      message: params.message,
      isStaff: false,
      createdAt: now,
    });

    return { id, ticketNumber };
  }

  async getUserTickets(userId: string) {
    const rows = await db.select().from(supportTickets)
      .where(eq(supportTickets.userId, userId))
      .orderBy(desc(supportTickets.updatedAt));
    return { tickets: rows, total: rows.length };
  }

  async getTicketDetail(id: string) {
    const [ticket] = await db.select().from(supportTickets)
      .where(eq(supportTickets.id, id))
      .limit(1);
    if (!ticket) return null;

    const replies = await db.select().from(supportTicketReplies)
      .where(eq(supportTicketReplies.ticketId, id))
      .orderBy(supportTicketReplies.createdAt);

    return { ticket, replies };
  }

  async addReply(ticketId: string, userId: string, message: string, isStaff = false) {
    const [ticket] = await db.select().from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .limit(1);
    if (!ticket) return { error: 'Ticket not found' };
    if (ticket.status === 'closed') return { error: 'Ticket is closed' };

    const id = randomUUID();
    await db.insert(supportTicketReplies).values({
      id,
      ticketId,
      userId,
      message,
      isStaff,
      createdAt: new Date(),
    });

    await db.update(supportTickets).set({ updatedAt: new Date() })
      .where(eq(supportTickets.id, ticketId));

    return { id };
  }

  async closeTicket(id: string, userId: string) {
    const [ticket] = await db.select().from(supportTickets)
      .where(and(eq(supportTickets.id, id), eq(supportTickets.userId, userId)))
      .limit(1);
    if (!ticket) return { error: 'Ticket not found' };

    await db.update(supportTickets).set({ status: 'closed', updatedAt: new Date() })
      .where(eq(supportTickets.id, id));
    return { closed: true };
  }
}

export const ticketService = new TicketService();
