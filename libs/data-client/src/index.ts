export { GatewayService, type GatewayConfig, type GatewayTransport } from './gateway.service';
export { MockGateway, type MockEntityTable, type MockGatewayOptions } from './mock-gateway';
export {
  buildFixtureTables,
  loadFixtureTables,
  FIXTURE_MANIFEST,
  type FixtureDescriptor,
  type FixtureFile,
  type PhysicalResolver,
} from './fixture-loader';
