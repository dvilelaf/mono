import { app } from "./app.js";
import { config } from "./config.js";
import { startScheduler, registerConnector } from "./connectors/scheduler.js";
import { auraConnector } from "./connectors/aura.connector.js";
import { cryptoConnector } from "./connectors/crypto.connector.js";
import { gmailConnector } from "./connectors/gmail.connector.js";
import { myfitnesspalConnector } from "./connectors/myfitnesspal.connector.js";
import { revolutConnector } from "./connectors/revolut.connector.js";

registerConnector(auraConnector);
registerConnector(cryptoConnector);
registerConnector(gmailConnector);
registerConnector(myfitnesspalConnector);
registerConnector(revolutConnector);

const server = app.listen(config.port, "127.0.0.1", () => {
  console.log(`Personal Data Store running at http://127.0.0.1:${config.port}`);
  startScheduler();
});

export { server };
