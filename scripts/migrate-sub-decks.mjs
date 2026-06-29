import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const sql = `
CREATE TABLE IF NOT EXISTS \`sub_deck_slides\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`subDeckId\` int NOT NULL,
  \`documentPageId\` int NOT NULL,
  \`position\` int NOT NULL,
  \`isVisible\` boolean NOT NULL DEFAULT true,
  \`narrationOverrideUrl\` text,
  \`narrationOverrideKey\` varchar(512),
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT \`sub_deck_slides_id\` PRIMARY KEY(\`id\`)
);
`;

const sql2 = `
CREATE TABLE IF NOT EXISTS \`sub_decks\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`documentId\` int NOT NULL,
  \`name\` varchar(256) NOT NULL,
  \`description\` text,
  \`createdByUserId\` int NOT NULL,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`sub_decks_id\` PRIMARY KEY(\`id\`)
);
`;

await conn.query(sql);
console.log("Created sub_deck_slides table");

await conn.query(sql2);
console.log("Created sub_decks table");

const [tables] = await conn.query("SHOW TABLES LIKE 'sub_%'");
console.log("Sub-deck tables:", tables);

await conn.end();
console.log("Migration complete.");
