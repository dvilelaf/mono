import { app } from "./app.js";
import { config } from "./config.js";
import { startScheduler, registerConnector } from "./connectors/scheduler.js";
import { auraConnector } from "./connectors/aura.connector.js";
import { cryptoConnector } from "./connectors/crypto.connector.js";
import { gmailConnector } from "./connectors/gmail.connector.js";
import { myfitnesspalConnector } from "./connectors/myfitnesspal.connector.js";
import { revolutConnector } from "./connectors/revolut.connector.js";
import { coinbaseConnector } from "./connectors/coinbase.connector.js";
import { subscriptionsConnector } from "./connectors/subscriptions.connector.js";
import { goalsConnector } from "./connectors/goals.connector.js";
import { interventionsConnector } from "./connectors/interventions.connector.js";

registerConnector(auraConnector);
registerConnector(cryptoConnector);
registerConnector(gmailConnector);
registerConnector(myfitnesspalConnector);
registerConnector(revolutConnector);
registerConnector(coinbaseConnector);
registerConnector(subscriptionsConnector);
registerConnector(goalsConnector);
registerConnector(interventionsConnector);

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`Personal Data Store running at http://0.0.0.0:${config.port}`);
  startScheduler();
});

export { server };
