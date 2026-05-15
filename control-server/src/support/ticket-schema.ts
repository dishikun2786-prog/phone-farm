/**
 * Support ticket schema — tickets and replies.
 */
import { pgTable, uuid, varchar, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';

export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  ticketNumber: varchar('ticket_number', { length: 32 }).unique().notNull(),
  subject: varchar('subject', { length: 256 }).notNull(),
  category: varchar('category', { length: 32 }).default('technical').notNull(), // technical, billing, account, activation, other
  priority: varchar('priority', { length: 16 }).default('normal').notNull(), // low, normal, high, urgent
  status: varchar('status', { length: 16 }).default('open').notNull(), // open, in_progress, waiting, closed
  assignedTo: uuid('assigned_to'), // staff user ID
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_tickets_user').on(table.userId),
  index('idx_tickets_status').on(table.status),
  index('idx_tickets_updated').on(table.updatedAt),
]);

export const supportTicketReplies = pgTable('support_ticket_replies', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').references(() => supportTickets.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').notNull(),
  message: text('message').notNull(),
  isStaff: boolean('is_staff').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_ticket_replies_ticket').on(table.ticketId),
]);
