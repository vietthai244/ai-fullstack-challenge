// frontend/src/index.ts
//
// Phase 1 entry point — proves the @campaign/shared workspace import resolves
// from the frontend workspace via the workspace:* protocol. This file does not
// mount React, render anything, or fetch anything — it's a pure type+module
// resolution proof. Phase 8 (Frontend Foundation) will replace this with the
// Vite + React 18 mount point.

import { RegisterSchema, CampaignStatusEnum, type CampaignStatus } from '@campaign/shared';

// Compile-time proof: shared schemas + types resolve from frontend workspace.
const _phase1ImportProof = {
  registerSchemaShape: RegisterSchema.shape,
  statuses: CampaignStatusEnum.options satisfies readonly CampaignStatus[],
};

// Runtime proof — this function is exported so it has a use site, but is never
// called in Phase 1 (no entry script, no DOM mount).
export function describePhase1Frontend(): {
  workspace: string;
  statuses: readonly CampaignStatus[];
} {
  return {
    workspace: '@campaign/frontend',
    statuses: CampaignStatusEnum.options,
  };
}

// Suppress the unused-variable warning by exporting the proof object as well.
// Phase 8 will delete this entire file when it writes the React mount point.
export const __phase1ImportProof = _phase1ImportProof;
