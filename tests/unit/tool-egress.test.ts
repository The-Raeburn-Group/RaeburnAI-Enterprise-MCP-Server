import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import type { ConnectorContext, DataSensitivity, EnterpriseTool } from '../../src/connectors/types.js';
import { createLogger } from '../../src/logger.js';
import { enforceToolEgress, ToolEgressPolicyError } from '../../src/security/tool-egress.js';

const token = '0123456789abcdefghijklmnop';

function testTool(connector: EnterpriseTool['connector'] = 'github'): EnterpriseTool {
  return {
    name: `${connector}.test`,
    description: 'Test connector tool',
    connector,
    risk: 'read',
    inputSchema: z.object({}),
    async run() {
      return { ok: true };
    }
  };
}

function context(
  overrides: NodeJS.ProcessEnv = {},
  dataSensitivity?: DataSensitivity
): ConnectorContext {
  const config = loadConfig({
    MCP_TRANSPORT: 'http',
    MCP_TENANT_ID: 'tenant-a',
    RAEBURN_CHAIN_SERVICE_TOKEN: token,
    LOG_LEVEL: 'silent',
    ...overrides
  });
  return {
    config,
    logger: createLogger(config),
    identity: {
      tenantId: 'tenant-a',
      actorId: 'actor-a',
      requestId: 'request-a',
      ...(dataSensitivity ? { dataSensitivity } : {}),
      source: 'chain-http'
    }
  };
}

function policy(value: object): string {
  return JSON.stringify(value);
}

function classifications(value: object): string {
  return JSON.stringify(value);
}

function expectPolicyError(fn: () => unknown, code: string, status: number): void {
  try {
    fn();
    throw new Error('expected policy error');
  } catch (error) {
    expect(error).toBeInstanceOf(ToolEgressPolicyError);
    expect(error).toMatchObject({ code, status });
  }
}

describe('tool egress policy', () => {
  it('keeps development backward-compatible when no egress policy is configured', () => {
    const decision = enforceToolEgress(testTool(), context({}, 'restricted'));
    expect(decision).toEqual({ enforced: false, connector: 'github' });
  });

  it('fails closed in production when the tool egress policy is missing', () => {
    expectPolicyError(
      () => enforceToolEgress(testTool(), context({ NODE_ENV: 'production' }, 'internal')),
      'tool_egress_policy_unconfigured',
      503
    );
  });

  it('requires trusted sensitivity whenever an egress policy is active', () => {
    expectPolicyError(
      () =>
        enforceToolEgress(
          testTool(),
          context({ TOOL_EGRESS_POLICY: policy({ mode: 'local_only' }) })
        ),
      'trusted_data_sensitivity_required',
      400
    );
  });

  it('fails closed when a connector destination is not classified', () => {
    expectPolicyError(
      () =>
        enforceToolEgress(
          testTool(),
          context(
            {
              TOOL_EGRESS_POLICY: policy({
                mode: 'allow_configured',
                max_external_sensitivity: 'internal'
              })
            },
            'internal'
          )
        ),
      'connector_egress_unclassified',
      503
    );
  });

  it('blocks external connectors under local-only policy', () => {
    expectPolicyError(
      () =>
        enforceToolEgress(
          testTool(),
          context(
            {
              TOOL_EGRESS_POLICY: policy({ mode: 'local_only' }),
              CONNECTOR_EGRESS_CLASSIFICATIONS: classifications({
                github: { boundary: 'external', region: 'provider-managed' }
              })
            },
            'public'
          )
        ),
      'tool_egress_boundary_denied',
      403
    );
  });

  it('enforces connector and region allow-lists before external dispatch', () => {
    const base = {
      TOOL_EGRESS_POLICY: policy({
        mode: 'allow_list',
        connectors: ['github'],
        regions: ['eu'],
        max_external_sensitivity: 'internal'
      }),
      CONNECTOR_EGRESS_CLASSIFICATIONS: classifications({
        github: { boundary: 'external', region: 'us' }
      })
    };

    expectPolicyError(
      () => enforceToolEgress(testTool(), context(base, 'internal')),
      'tool_egress_destination_denied',
      403
    );
  });

  it('blocks data above the configured external sensitivity ceiling', () => {
    const env = {
      TOOL_EGRESS_POLICY: policy({
        mode: 'allow_configured',
        max_external_sensitivity: 'internal'
      }),
      CONNECTOR_EGRESS_CLASSIFICATIONS: classifications({
        github: { boundary: 'external', region: 'eu' }
      })
    };

    expectPolicyError(
      () => enforceToolEgress(testTool(), context(env, 'confidential')),
      'tool_egress_external_sensitivity_denied',
      403
    );
  });

  it('allows an explicitly classified external destination within its sensitivity ceiling', () => {
    const decision = enforceToolEgress(
      testTool(),
      context(
        {
          TOOL_EGRESS_POLICY: policy({
            mode: 'allow_list',
            connectors: ['github'],
            regions: ['eu'],
            max_external_sensitivity: 'internal'
          }),
          CONNECTOR_EGRESS_CLASSIFICATIONS: classifications({
            github: { boundary: 'external', region: 'eu' }
          })
        },
        'internal'
      )
    );

    expect(decision).toMatchObject({
      enforced: true,
      connector: 'github',
      boundary: 'external',
      region: 'eu',
      dataSensitivity: 'internal',
      mode: 'allow_list'
    });
  });

  it('uses a separate ceiling for private destinations and permits restricted local tools', () => {
    const privateDecision = enforceToolEgress(
      testTool('supabase'),
      context(
        {
          TOOL_EGRESS_POLICY: policy({
            mode: 'allow_configured',
            max_private_sensitivity: 'confidential',
            max_external_sensitivity: 'internal'
          }),
          CONNECTOR_EGRESS_CLASSIFICATIONS: classifications({
            supabase: { boundary: 'private', region: 'uk' }
          })
        },
        'confidential'
      )
    );
    expect(privateDecision.boundary).toBe('private');

    const localDecision = enforceToolEgress(
      testTool('supabase'),
      context(
        {
          TOOL_EGRESS_POLICY: policy({ mode: 'local_only' }),
          CONNECTOR_EGRESS_CLASSIFICATIONS: classifications({
            supabase: { boundary: 'local', region: 'local' }
          })
        },
        'restricted'
      )
    );
    expect(localDecision).toMatchObject({ boundary: 'local', dataSensitivity: 'restricted' });
  });
});
