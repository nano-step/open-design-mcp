import type { ProjectMetadata } from '../../vendor/od-contracts/src/api/projects.js';

/**
 * Local extension of upstream ProjectMetadata that adds a customInstructions
 * stash field. Workaround for the upstream OD daemon's GET /api/projects/:id
 * response shape, which omits the top-level customInstructions field even
 * after a successful PATCH that sets it. See issue #43 for full evidence.
 * The metadata.* path IS round-tripped reliably — so we stash there.
 *
 * Read precedence: metadata.customInstructions → top-level customInstructions → undefined.
 * Write strategy: write to BOTH on every create/update for forward-compat.
 */
export type ProjectMetadataWithStash = ProjectMetadata & {
  customInstructions?: string;
};
