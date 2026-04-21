"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const service_1 = require("./service");
(0, service_1.startService)().catch((err) => {
    console.error("Service crash:", err);
    process.exit(1);
});
