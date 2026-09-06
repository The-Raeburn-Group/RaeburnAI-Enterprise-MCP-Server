import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ZodError } from 'zod';
import type { AuditLog } from '../audit/audit-log.js';
import type { ConnectorContext, EnterpriseTool } from '../connectors/types.js';
import { allTools, connectors, configuredConnectors, enabledConnectors } from '../connectors/index.js';
import { evaluateToolPolicy, limitToolResult } from '../security/policy.js';

export interface ToolExecutionResult {
  ok: boolean;
  text: string;
  output?: unknown;
  reason?: string;
}

export function createEnterpriseMcpServer(context: ConnectorContext, auditLog: AuditLog): McpServer {
  const server = new McpServer({ name: 'raeburnai-enterprise-mcp-server', version: '0.1.0' });
  server.resource('connectors', 'raeburnai://connectors', async () => ({
    contents: [
      {
        uri: 'raeburnai://connectors',
        mimeType: 'application/json',
        text: JSON.stringify(connectorStatus(context), null, 2)
      }
    ]
  }));
  server.tool('enterprise.health', 'Return server health and available tools.', {}, async () => ({
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            status: 'ok',
            tenantId: context.identity.tenantId,
            ...connectorStatus(context),
            tools: allTools(context).map((item) => item.name)
          },
          null,
          2
        )
      }
    ]
  }));
  for (const item of allTools(context)) registerTool(server, item, context, auditLog);
  return server;
}

export function connectorStatus(context: ConnectorContext) {
  return {
    tenantId: context.identity.tenantId,
    connectors: connectors.map((connector) => ({
      name: connector.name,
      displayName: connector.displayName,
      enabled: enabledConnectors(context).some((item) => item.name === connector.name),
      configured: connector.configured(context.config)
    })),
    configuredConnectors: configuredConnectors(context).map((item) => item.name)
  };
}

export async function executeEnterpriseTool(
  enterpriseTool: EnterpriseTool,
  input: unknown,
  context: ConnectorContext,
  auditLog: AuditLog
): Promise<ToolExecutionResult> {
  const startedAt = Date.now();
  const policy = evaluateToolPolicy(context.config, enterpriseTool.name, enterpriseTool.risk);
  const identity = context.identity;

  if (!policy.allowed) {
    const reason = policy.reason ?? 'Tool is blocked by policy.';
    auditLog.record({
      ...identity,
      tool: enterpriseTool.name,
      connector: enterpriseTool.connector,
      risk: enterpriseTool.risk,
      input,
      status: 'blocked',
      reason,
      durationMs: Date.now() - startedAt
    });
    return { ok: false, text: reason, reason };
  }

  if (policy.approvalRequired && !identity.approvalId) {
    const reason = 'An authenticated Chain approval is required for this write or admin tool.';
    auditLog.record({
      ...identity,
      tool: enterpriseTool.name,
      connector: enterpriseTool.connector,
      risk: enterpriseTool.risk,
      input,
      status: 'approval_required',
      reason,
      durationMs: Date.now() - startedAt
    });
    return { ok: false, text: reason, reason };
  }

  try {
    const parsed = enterpriseTool.inputSchema.parse(input);
    const output = await enterpriseTool.run(parsed, context);
    const text = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
    auditLog.record({
      ...identity,
      tool: enterpriseTool.name,
      connector: enterpriseTool.connector,
      risk: enterpriseTool.risk,
      input: parsed,
      output,
      status: 'success',
      durationMs: Date.now() - startedAt
    });
    return {
      ok: true,
      text: limitToolResult(text, context.config.MAX_TOOL_RESULT_BYTES),
      output
    };
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues.map((issue) => issue.message).join('; ')
        : error instanceof Error
          ? error.message
          : 'Unknown tool error';
    context.logger.warn(
      {
        tenantId: identity.tenantId,
        actorId: identity.actorId,
        requestId: identity.requestId,
        tool: enterpriseTool.name,
        error: message
      },
      'mcp_tool_error'
    );
    auditLog.record({
      ...identity,
      tool: enterpriseTool.name,
      connector: enterpriseTool.connector,
      risk: enterpriseTool.risk,
      input,
      status: 'error',
      reason: message,
      durationMs: Date.now() - startedAt
    });
    return { ok: false, text: message, reason: message };
  }
}

function registerTool(
  server: McpServer,
  enterpriseTool: EnterpriseTool,
  context: ConnectorContext,
  auditLog: AuditLog
) {
  server.tool(
    enterpriseTool.name,
    enterpriseTool.description,
    enterpriseTool.inputSchema.shape,
    async (input: unknown) => {
      const result = await executeEnterpriseTool(enterpriseTool, input, context, auditLog);
      return {
        content: [{ type: 'text', text: result.text }],
        ...(result.ok ? {} : { isError: true })
      };
    }
  );
}

export async function startStdioServer(server: McpServer) {
  await server.connect(new StdioServerTransport());
}
