import { startWorker } from "./worker";

startWorker().catch((err) => {
  console.error("Worker crash:", err);
  process.exit(1);
});
