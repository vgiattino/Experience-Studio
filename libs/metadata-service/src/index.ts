/**
 * @opus/metadata-service — the client's access to everything the server owns.
 *
 * Four clients, one per backend service, because the seams are where the architecture puts them:
 *
 *   ExperienceRepository   the Definition Service — list, read, save, delete
 *   CatalogClient          the Catalog Service — the entitlement-scoped projection
 *   IdentityClient         who the caller is, resolved server-side
 *   HttpGatewayTransport   the Data Gateway — one batch per render
 *
 * The property worth naming: **the client asks, the server decides.** The catalog arrives already
 * projected (no `physical`, no unentitled members), identity arrives resolved, and query results
 * arrive statused per query with a TTL and an entitlement scope hash the client uses for cache keys
 * but never invents. Nothing here can widen what the caller may see, which is what makes the
 * browser's role small enough to trust.
 */

export { API_BASE, ApiError, apiRequest } from './api';
export {
  ExperienceRepository,
  type StandardListing,
  type StandardUpdateNotice,
} from './experience-repository';
export { CatalogClient } from './catalog-client';
export { IdentityClient, type PersonaSummary } from './identity-client';
export { HttpGatewayTransport, createHttpGatewayTransport } from './gateway-transport';
export { HealthClient, type ServerHealth } from './health-client';
