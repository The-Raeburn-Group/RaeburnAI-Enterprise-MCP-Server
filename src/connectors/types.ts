import { z } from 'zod';
import type { AppConfig, ConnectorName } from '../config.js';
import type { Logger } from '../logger.js';
import type { ToolRisk } from '../security/policy.js';

export type ToolInputSchema = z.ZodObject<z.ZodRawShape>;

export interface ConnectorContext {
  config: AppConfig;
  logger: Logger;
}

export interface EnterpriseTool<TInput extends ToolInputSchema = ToolInputSchema> {
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

export function tool<TInput extends ToolInputSchema>(definition: EnterpriseTool<TInput>): EnterpriseTool<TInput> {
  return definition;
}
