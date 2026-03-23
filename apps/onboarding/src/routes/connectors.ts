import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ZodType } from 'zod';
import { AppError } from '@etip/shared-utils';
import { DataSourceSchema } from '../schemas/onboarding.js';
import type { ConnectorValidator } from '../services/connector-validator.js';
import type { IntegrationTester } from '../services/integration-tester.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validate<S extends ZodType<any, any, any>>(schema: S, data: unknown): ReturnType<S['parse']> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new AppError(400, 'Request validation failed', 'VALIDATION_ERROR', details);
  }
  return result.data;
}

export interface ConnectorRouteDeps {
  connectorValidator: ConnectorValidator;
  integrationTester: IntegrationTester;
}

export function connectorRoutes(deps: ConnectorRouteDeps) {
  const { connectorValidator, integrationTester } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET /connectors/types — List supported data source types. */
    app.get('/types', async (_req: FastifyRequest, reply: FastifyReply) => {
      const types = connectorValidator.getSupportedTypes();
      return reply.send({ data: types, total: types.length });
    });

    /** GET /connectors — List data sources for tenant. */
    app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const sources = connectorValidator.listSources(tenantId);
      return reply.send({ data: sources, total: sources.length });
    });

    /** POST /connectors — Add a data source. */
    app.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const input = validate(DataSourceSchema, req.body);
      const source = connectorValidator.addSource(tenantId, input);
      return reply.status(201).send({ data: source });
    });

    /** POST /connectors/validate — Validate a data source config without saving. */
    app.post('/validate', async (req: FastifyRequest, reply: FastifyReply) => {
      const input = validate(DataSourceSchema, req.body);
      const result = connectorValidator.validate(input);
      return reply.send({ data: result });
    });

    /** POST /connectors/:sourceId/test — Test a data source connection. */
    app.post('/:sourceId/test', async (req: FastifyRequest<{ Params: { sourceId: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const { sourceId } = req.params;
      const result = await connectorValidator.testConnection(tenantId, sourceId);
      return reply.send({ data: result });
    });

    /** POST /connectors/:sourceId/integration-test — Full integration test. */
    app.post('/:sourceId/integration-test', async (req: FastifyRequest<{ Params: { sourceId: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const { sourceId } = req.params;
      const result = await integrationTester.testSource(tenantId, sourceId);
      return reply.send({ data: result });
    });

    /** GET /connectors/:sourceId/test-result — Get last test result. */
    app.get('/:sourceId/test-result', async (req: FastifyRequest<{ Params: { sourceId: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const { sourceId } = req.params;
      const result = integrationTester.getLastResult(tenantId, sourceId);
      return reply.send({ data: result });
    });

    /** POST /connectors/test-all — Test all data sources. */
    app.post('/test-all', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const results = await integrationTester.testAll(tenantId);
      return reply.send({ data: results, total: results.length });
    });
  };
}
