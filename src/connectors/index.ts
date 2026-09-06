import type { ConnectorContext, EnterpriseConnector, EnterpriseTool } from './types.js';
import { calendarConnector, gmailConnector, googleDriveConnector } from './google.js';
import { githubConnector } from './github.js';
import {
  hubSpotConnector,
  notionConnector,
  salesforceConnector,
  sharePointConnector,
  slackConnector,
  supabaseConnector
} from './saas.js';
import { isConnectorEnabled } from '../config.js';

export const connectors: EnterpriseConnector[] = [
  gmailConnector,
  calendarConnector,
  githubConnector,
  slackConnector,
  sharePointConnector,
  salesforceConnector,
  hubSpotConnector,
  notionConnector,
  googleDriveConnector,
  supabaseConnector
];

export function enabledConnectors(context: ConnectorContext): EnterpriseConnector[] {
  return connectors.filter((connector) => isConnectorEnabled(context.config, connector.name));
}

export function configuredConnectors(context: ConnectorContext): EnterpriseConnector[] {
  return enabledConnectors(context).filter((connector) => connector.configured(context.config));
}

export function allTools(context: ConnectorContext): EnterpriseTool[] {
  return configuredConnectors(context).flatMap((connector) => connector.tools(context));
}
