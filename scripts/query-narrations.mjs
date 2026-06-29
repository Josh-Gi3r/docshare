import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

console.log("=== SLIDE_NARRATIONS ===");
const [narrations] = await conn.query(
  "SELECT id, document_id, page_number, video_url, video_key FROM slide_narrations ORDER BY document_id, page_number"
);
console.log(JSON.stringify(narrations, null, 2));

console.log("\n=== DOCUMENTS ===");
const [docs] = await conn.query(
  "SELECT id, title FROM documents ORDER BY created_at DESC LIMIT 10"
);
console.log(JSON.stringify(docs, null, 2));

console.log("\n=== FOLDERS ===");
const [folders] = await conn.query(
  "SELECT id, name FROM folders ORDER BY created_at DESC LIMIT 10"
);
console.log(JSON.stringify(folders, null, 2));

console.log("\n=== FOLDER_DOCUMENTS ===");
const [folderDocs] = await conn.query(
  "SELECT fd.id, fd.folder_id, fd.document_id, f.name as folder_name, d.title as doc_title FROM folder_documents fd JOIN folders f ON f.id = fd.folder_id JOIN documents d ON d.id = fd.document_id"
);
console.log(JSON.stringify(folderDocs, null, 2));

await conn.end();
