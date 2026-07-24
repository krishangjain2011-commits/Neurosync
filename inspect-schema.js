import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
const cwd = process.cwd();
const db = new Database(path.join(cwd, "neurosync.db"));
console.log(JSON.stringify(db.prepare("PRAGMA table_info(users)").all(), null, 2));
