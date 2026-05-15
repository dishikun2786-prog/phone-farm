import type { FastifyInstance } from 'fastify';
import type { AuthUser } from '../auth/auth-middleware.js';
import { agentService } from './agent-service.js';
import { batchService } from './batch-service.js';
import { requirePermission } from '../auth/rbac.js';
import { z } from 'zod';

const createAgentSchema = z.object({
  userId: z.string(),
  name: z.string().min(1).max(128),
  contactPhone: z.string().optional(),
  contactEmail: z.string().optional(),
  commissionRate: z.number().min(0).max(1).optional(),
});

const updateAgentSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().optional(),
  commissionRate: z.number().min(0).max(1).optional(),
  active: z.boolean().optional(),
});

const generateBatchSchema = z.object({
  name: z.string().min(1).max(128),
  agentId: z.string().optional(),
  planId: z.string().optional(),
  count: z.number().int().min(1).max(10000),
  days: z.number().int().min(1).max(3650).default(365),
  maxDevices: z.number().int().min(1).max(100).default(1),
  wholesalePriceCents: z.number().int().min(0).default(0),
  retailPriceCents: z.number().int().min(0).default(0),
  note: z.string().optional(),
});

export async function agentRoutes(app: FastifyInstance) {
  // ── Agent CRUD ──

  app.post('/api/v2/agents', { preHandler: requirePermission('system', 'manage') }, async (req, reply) => {
    const parsed = createAgentSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });

    const tenantId = req.tenantId || 'default';
    const agent = await agentService.create({ tenantId, ...parsed.data });
    return reply.status(201).send(agent);
  });

  app.get('/api/v2/agents', async (req, reply) => {
    const query = req.query as Record<string, string>;
    const tenantId = req.tenantId;
    const result = await agentService.list({
      tenantId: tenantId || undefined,
      active: query.active ? query.active === 'true' : undefined,
      limit: query.limit ? Number(query.limit) : 50,
      offset: query.offset ? Number(query.offset) : 0,
    });
    return reply.send(result);
  });

  app.get('/api/v2/agents/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const agent = await agentService.getById(id);
    if (!agent) return reply.status(404).send({ error: 'Agent not found' });
    return reply.send(agent);
  });

  app.patch('/api/v2/agents/:id', { preHandler: requirePermission('system', 'manage') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateAgentSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });

    const agent = await agentService.update(id, parsed.data);
    if (!agent) return reply.status(404).send({ error: 'Agent not found' });
    return reply.send(agent);
  });

  // ── Agent Dashboard ──

  app.get('/api/v2/agent/dashboard', async (req, reply) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const agent = await agentService.getByUserId(user.userId);
    if (!agent) return reply.send({ totalSold: 0, totalCommission: 0, activeCustomers: 0 });

    const dashboard = await agentService.getDashboard(agent.id);
    return reply.send(dashboard);
  });

  // ── Agent Commissions ──

  app.get('/api/v2/agent/commissions', async (req, reply) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const agent = await agentService.getByUserId(user.userId);
    if (!agent) return reply.send({ commissions: [], total: 0 });

    const query = req.query as Record<string, string>;
    const result = await agentService.getCommissions({
      agentId: agent.id,
      period: query.period,
      status: query.status,
      limit: query.limit ? Number(query.limit) : 50,
      offset: query.offset ? Number(query.offset) : 0,
    });
    return reply.send(result);
  });

  // ── Admin: Settle Commissions ──

  app.get('/api/v2/agents/commissions/settle-summary', async (req, reply) => {
    const query = req.query as Record<string, string>;
    const period = query.period || new Date().toISOString().slice(0, 7);
    const { commissionCalculator } = await import('./commission-calculator.js');
    const agents = await commissionCalculator.getAgentPeriodSummary(period);
    return reply.send({ agents });
  });

  app.post('/api/v2/agents/commissions/settle', { preHandler: requirePermission('system', 'manage') }, async (req, reply) => {
    const { period } = req.body as { period: string };
    if (!period) return reply.status(400).send({ error: 'period is required (YYYY-MM)' });
    const result = await agentService.settleCommissions(period);
    return reply.send(result);
  });

  // ── Card Batches ──

  app.post('/api/v2/card-batches', { preHandler: requirePermission('activation', 'write') }, async (req, reply) => {
    const parsed = generateBatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });

    const user = (req as any).user as AuthUser | undefined;
    const tenantId = req.tenantId || 'default';
    const batch = await batchService.generateBatch({
      ...parsed.data,
      tenantId,
      createdBy: user?.userId || 'system',
    });
    return reply.status(201).send(batch);
  });

  app.get('/api/v2/card-batches', async (req, reply) => {
    const query = req.query as Record<string, string>;
    const tenantId = req.tenantId;
    const result = await batchService.listBatches({
      tenantId: tenantId || undefined,
      agentId: query.agentId,
      limit: query.limit ? Number(query.limit) : 50,
      offset: query.offset ? Number(query.offset) : 0,
    });
    return reply.send(result);
  });

  app.get('/api/v2/card-batches/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const batch = await batchService.getBatch(id);
    if (!batch) return reply.status(404).send({ error: 'Batch not found' });
    return reply.send(batch);
  });
}
