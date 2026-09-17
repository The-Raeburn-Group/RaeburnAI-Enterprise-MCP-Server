import { z } from 'zod';
import type { AppConfig, ConnectorName } from '../config.js';
import type { ConnectorContext, DataSensitivity, EnterpriseTool } from '../connectors/types.js';

const connectorNameSchema = z.enum([
  'gmail',
  'calendar',
  'github',
  'slack',
  'sharepoint',
  'salesforce',
  'hubspot',
  'notion',
  'google-drive',
  'supabase'
]);
const dataSensitivitySchema = z.enum(['public', 'internal', 'confidential', 'restricted']);
const boundarySchema = z.enum(['local', 'private', 'external']);

const connectorClassificationSchema = z
  .object({
    boundary: boundarySchema,
    region: z.string().trim().min(1).max(100)
  })
  .strict();

const connectorClassificationsSchema = z.record(connectorNameSchema, connectorClassificationSchema);

const toolEgressPolicySchema = z
  .object({
    mode: z.enum(['local_only', 'allow_list', 'allow_configured']),
    connectors: z.array(connectorNameSchema).max(50).optional().default([]),
    regions: z.array(z.string().trim().min(1).max(100)).max(50).optional().default([]),
    max_private_sensitivity: dataSensitivitySchema.optional(),
    max_external_sensitivity: dataSensitivitySchema.optional()
  })
  .strict()
  .superRefine((policy, context) => {
    if (policy.mode === 'local_only') {
      if (
        policy.connectors.length > 0 ||
        policy.regions.length > 0 ||
        policy.max_private_sensitivity ||
        policy.max_external_sensitivity
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'local_only must not configure external connector, region or sensitivity allowances'
        });
      }
      return;
    }

    if (policy.mode === 'allow_list') {
      if (policy.connectors.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['connectors'],
          message: 'allow_list requires at least one connector'
        });
      }
      if (policy.regions.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['regions'],
          message: 'allow_list requires at least one region'
        });
      }
      return;
    }

    if (policy.connectors.length > 0 || policy.regions.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'allow_configured must not define connector or region allow-lists'
      });
    }
  });

export type ToolEgressBoundary = z.infer<typeof boundarySchema>;
export type ConnectorEgressClassification = z.infer<typeof connectorClassificationSchema>;
export type ToolEgressPolicy = z.infer<typeof toolEgressPolicySchema>;

const SENSITIVITY_RANK: Readonly<Record<DataSensitivity, number>> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3
};

export interface ToolEgressDecision {
  enforced: boolean;
  connector: ConnectorName;
  boundary?: ToolEgressBoundary;
  region?: string;
  dataSensitivity?: DataSensitivity;
  mode?: ToolEgressPolicy['mode'];
}

export class ToolEgressPolicyError extends Error {
  constructor(
    public readonly status: 400 | 403 | 503,
    public readonly code: string,
    message = code
  ) {
    super(message);
    this.name = 'ToolEgressPolicyError';
  }
}

function parseJson(raw: string, code: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ToolEgressPolicyError(503, code);
  }
}

function readPolicy(config: AppConfig): ToolEgressPolicy | undefined {
  const raw = config.TOOL_EGRESS_POLICY;
  if (!raw) {
    if (config.NODE_ENV === 'production') {
      throw new ToolEgressPolicyError(503, 'tool_egress_policy_unconfigured');
    }
    return undefined;
  }
  const parsed = toolEgressPolicySchema.safeParse(parseJson(raw, 'tool_egress_policy_invalid'));
  if (!parsed.success) {
    throw new ToolEgressPolicyError(503, 'tool_egress_policy_invalid');
  }
  return parsed.data;
}

function readClassifications(config: AppConfig): Partial<Record<ConnectorName, ConnectorEgressClassification>> {
  const raw = config.CONNECTOR_EGRESS_CLASSIFICATIONS;
  if (!raw) return {};
  const parsed = connectorClassificationsSchema.safeParse(parseJson(raw, 'connector_egress_classification_invalid'));
  if (!parsed.success) {
    throw new ToolEgressPolicyError(503, 'connector_egress_classification_invalid');
  }
  return parsed.data;
}

function assertSensitivityAllowed(
  boundary: ToolEgressBoundary,
  sensitivity: DataSensitivity,
  policy: ToolEgressPolicy
): void {
  if (boundary === 'local') return;
  const ceiling = boundary === 'private' ? policy.max_private_sensitivity : policy.max_external_sensitivity;
  if (!ceiling) {
    throw new ToolEgressPolicyError(
      403,
      boundary === 'private' ? 'tool_egress_private_sensitivity_denied' : 'tool_egress_external_sensitivity_denied'
    );
  }
  if (SENSITIVITY_RANK[sensitivity] > SENSITIVITY_RANK[ceiling]) {
    throw new ToolEgressPolicyError(
      403,
      boundary === 'private' ? 'tool_egress_private_sensitivity_denied' : 'tool_egress_external_sensitivity_denied'
    );
  }
}

export function enforceToolEgress(
  tool: Pick<EnterpriseTool, 'connector'>,
  context: ConnectorContext
): ToolEgressDecision {
  const policy = readPolicy(context.config);
  if (!policy) {
    return { enforced: false, connector: tool.connector };
  }

  const sensitivity = context.identity.dataSensitivity;
  if (!sensitivity) {
    throw new ToolEgressPolicyError(400, 'trusted_data_sensitivity_required');
  }

  const classifications = readClassifications(context.config);
  const classification = classifications[tool.connector];
  if (!classification) {
    throw new ToolEgressPolicyError(503, 'connector_egress_unclassified');
  }

  if (classification.boundary !== 'local') {
    if (policy.mode === 'local_only') {
      throw new ToolEgressPolicyError(403, 'tool_egress_boundary_denied');
    }
    if (
      policy.mode === 'allow_list' &&
      (!policy.connectors.includes(tool.connector) || !policy.regions.includes(classification.region))
    ) {
      throw new ToolEgressPolicyError(403, 'tool_egress_destination_denied');
    }
  }

  assertSensitivityAllowed(classification.boundary, sensitivity, policy);

  return {
    enforced: true,
    connector: tool.connector,
    boundary: classification.boundary,
    region: classification.region,
    dataSensitivity: sensitivity,
    mode: policy.mode
  };
}
