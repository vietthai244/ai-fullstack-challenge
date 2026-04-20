// backend/src/index.ts
//
// Phase 1 entry point — proves the @campaign/shared workspace import resolves
// and the pino logger module loads. This file is intentionally non-executable
// (no HTTP server binding, no explicit process termination) so it can be
// `import`-ed by the typecheck pass without spinning up a network listener.
// Phase 3 (Authentication) will replace this with the real Express bootstrap
// that starts the server on the configured PORT.

import { RegisterSchema, CampaignStatusEnum, type CampaignStatus } from '@campaign/shared';
import { logger } from './util/logger.js';

// Compile-time proof: the shared schemas + types resolve via the workspace:* protocol
// and CampaignStatusEnum has the exact 4-state machine locked by DATA-01 / CLAUDE.md.
const _phase1ImportProof = {
  registerSchemaShape: RegisterSchema.shape,
  statuses: CampaignStatusEnum.options satisfies readonly CampaignStatus[],
};

// Runtime proof (executed only if this module is loaded — typecheck does not run it):
export function describePhase1(): { service: string; statuses: readonly CampaignStatus[] } {
  logger.debug({ proof: _phase1ImportProof }, 'Phase 1 scaffold loaded');
  return {
    service: '@campaign/backend',
    statuses: CampaignStatusEnum.options,
  };
}
