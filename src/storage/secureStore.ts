import path from "path";
import { JsonKVStore } from "./jsonStore";

const FILE = path.resolve(process.cwd(), "data", "secure_store.json");
export const SecureStore = new JsonKVStore(FILE);
