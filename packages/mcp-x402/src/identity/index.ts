// ============================================================
// MCP IDENTITY MODULE EXPORTS
// ============================================================

export {
  MCPIdentityFactory,
  getMCPIdentityFactory,
  resetMCPIdentityFactory,
  type MCPIdentity,
  type MCPIdentityWithWallet,
  type LocalWallet,
  type IdentityFactoryConfig,
} from './mcp-identity.js';

export {
  IdentityPersistence,
  getIdentityPersistence,
  resetIdentityPersistence,
  type PersistedIdentity,
  type IdentityPersistenceData,
  type IdentityPersistenceConfig,
} from './identity-persistence.js';
