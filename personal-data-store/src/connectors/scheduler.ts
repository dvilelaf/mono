import cron from "node-cron";
import { config } from "../config.js";
import { runConnector } from "./connector.runner.js";
import type { Connector } from "./connector.interface.js";

const registeredConnectors: Map<string, Connector> = new Map();

export function registerConnector(connector: Connector) {
  registeredConnectors.set(connector.name, connector);
}

export function getConnector(name: string): Connector | undefined {
  return registeredConnectors.get(name);
}

export function startScheduler() {
  for (const [name, connector] of registeredConnectors) {
    const connectorConfig = config.connectors[name as keyof typeof config.connectors];
    if (!connectorConfig?.enabled || !connectorConfig.schedule) continue;
    cron.schedule(connectorConfig.schedule, async () => {
      console.log(`[scheduler] Running connector: ${name}`);
      const result = await runConnector(connector);
      console.log(`[scheduler] ${name} finished: ${result.recordsSynced} records synced`);
      if (result.errors?.length) console.error(`[scheduler] ${name} errors:`, result.errors);
    });
    console.log(`[scheduler] Scheduled ${name} with cron: ${connectorConfig.schedule}`);
  }
}
