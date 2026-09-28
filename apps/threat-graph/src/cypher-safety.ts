import { AppError } from '@etip/shared-utils';
import { NODE_TYPES, RELATIONSHIP_TYPES, type NodeType, type RelationshipType } from './schemas/graph.js';

const NODE_TYPE_SET = new Set<string>(NODE_TYPES);
const REL_TYPE_SET = new Set<string>(RELATIONSHIP_TYPES);

/**
 * Guards every Cypher label interpolation site (P3a — see repository.ts /
 * repository-extended.ts / services/node-merge.ts). Neo4j has no
 * parameterized-label syntax, so labels/rel types must be validated against
 * a closed allowlist before string interpolation, or a crafted value like
 * `IOC) DETACH DELETE n //` becomes a Cypher injection.
 */
export function assertNodeLabel(label: string): NodeType {
  if (!NODE_TYPE_SET.has(label)) {
    throw new AppError(400, 'Invalid graph node label', 'INVALID_GRAPH_LABEL');
  }
  return label as NodeType;
}

export function assertRelType(type: string): RelationshipType {
  if (!REL_TYPE_SET.has(type)) {
    throw new AppError(400, 'Invalid graph relationship type', 'INVALID_GRAPH_REL_TYPE');
  }
  return type as RelationshipType;
}
