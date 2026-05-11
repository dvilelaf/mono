/**
 * Custom Hono HTTP routes for the Jinn protocol indexer.
 *
 * Ponder auto-generates a GraphQL endpoint at /graphql. This file adds a
 * minimal health-check route at /health so monitoring and the daemon's
 * withFallback chain can probe liveness without issuing a GraphQL query.
 *
 * Future routes (280n.4): versioned REST endpoints that wrap the GraphQL
 * queries in the discovery adapter, so callers can use the DiscoveryAPI
 * wire format without speaking GraphQL directly.
 */
import { Hono } from 'hono';

const app = new Hono();

app.get('/health', (c) => {
  return c.json({ ok: true, service: '@jinn-network/indexer', version: '0.1.0' });
});

export default app;
