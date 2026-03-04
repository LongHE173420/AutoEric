import { startService } from "./service";

startService().catch((err) => {
  console.error("Service crash:", err);
  process.exit(1);
});
