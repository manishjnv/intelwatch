import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MaintenanceStore } from '../src/services/maintenance-store.js';
import type { FastifyInstance } from 'fastify';

const validWindow = {
  name: 'Deploy Window',
  startAt: new Date(Date.now() - 60_000).toISOString(),
  endAt: new Date(Date.now() + 3600_000).toISOString(),
  reason: 'Scheduled deployment',
};

describe('Maintenance routes', () => {
  let app: FastifyInstance;
  let store: MaintenanceStore;

  beforeAll(async () => {
    const config = loadConfig({});
    store = new MaintenanceStore();
    app = await buildApp({ config, maintenanceDeps: { maintenanceStore: store } });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    store.clear();
  });

  it('POST creates a maintenance window — 201', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/alerts/maintenance-windows', payload: validWindow });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.name).toBe('Deploy Window');
    expect(res.json().data.suppressAllRules).toBe(true);
  });

  it('POST rejects missing name — 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/alerts/maintenance-windows',
      payload: { startAt: validWindow.startAt, endAt: validWindow.endAt },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET lists maintenance windows', async () => {
    store.create(validWindow);
    const res = await app.inject({ method: 'GET', url: '/api/v1/alerts/maintenance-windows' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(1);
  });

  it('GET filters active windows', async () => {
    store.create(validWindow);
    store.create({
      ...validWindow, name: 'Past',
      startAt: new Date(Date.now() - 7200_000).toISOString(),
      endAt: new Date(Date.now() - 3600_000).toISOString(),
    });

    const res = await app.inject({ method: 'GET', url: '/api/v1/alerts/maintenance-windows?active=true' });
    expect(res.json().data.length).toBe(1);
    expect(res.json().data[0].name).toBe('Deploy Window');
  });

  it('PUT updates a window', async () => {
    const w = store.create(validWindow);
    const res = await app.inject({
      method: 'PUT', url: `/api/v1/alerts/maintenance-windows/${w.id}`,
      payload: { name: 'Renamed' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.name).toBe('Renamed');
  });

  it('PUT returns 404 for non-existent', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/v1/alerts/maintenance-windows/nope',
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE removes a window — 204', async () => {
    const w = store.create(validWindow);
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/alerts/maintenance-windows/${w.id}` });
    expect(res.statusCode).toBe(204);
  });

  it('DELETE returns 404 for non-existent', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/alerts/maintenance-windows/nope' });
    expect(res.statusCode).toBe(404);
  });
});
