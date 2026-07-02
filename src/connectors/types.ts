import { z } from 'zod';
import type { AppConfig, ConnectorName } from '../config.js';
import type { Logger } from '../logger.js';
import type { ToolRisk } from '../security/policy.js';

export interface ConnectorContext {
  config: AppConfig;
  logger: Logger;
}

export interface EnterpriseTool<TInput extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  connector: ConnectorName;
  risk: ToolRisk;
  inputSchema: TInput;
  run(input: z.infer<TInput>, context: ConnectorContext): Promise<unknown>;
}

export interface EnterpriseConnector {
  name: ConnectorName;
  displayName: string;
  description: string;
  configured(config: AppConfig): boolean;
  tools(context: ConnectorContext): EnterpriseTool[];
}

export function tool<TInput extends z.ZodTypeAny>(definition: EnterpriseTool<TInput>): EnterpriseTool<TInput> {
  return definition;
}
