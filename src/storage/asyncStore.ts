import path from "path";
import { JsonKVStore } from "./jsonStore";
const FILE = path.resolve(process.cwd(), "data", "async_storage.json");
export const AsyncStore = new JsonKVStore(FILE);
