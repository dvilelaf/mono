import { app } from "./app.js";
import { config } from "./config.js";
import { startScheduler, registerConnector } from "./connectors/scheduler.js";
import { auraConnector } from "./connectors/aura.connector.js";

registerConnector(auraConnector);

const server = app.listen(config.port, "127.0.0.1", () => {
  console.log(`Personal Data Store running at http://127.0.0.1:${config.port}`);
  startScheduler();
});

export { server };
