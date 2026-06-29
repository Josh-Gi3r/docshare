import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL set");
  process.exit(1);
}

const conn = await mysql.createConnection(url);

const statements = [
  `CREATE TABLE IF NOT EXISTS \`folders\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`ownerId\` int NOT NULL,
    \`name\` varchar(256) NOT NULL,
    \`description\` text,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`folders_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`folder_documents\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`folderId\` int NOT NULL,
    \`documentId\` int NOT NULL,
    \`addedAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`folder_documents_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`folder_members\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`folderId\` int NOT NULL,
    \`email\` varchar(320) NOT NULL,
    \`name\` varchar(256),
    \`token\` varchar(64) NOT NULL,
    \`role\` enum('viewer','editor') NOT NULL DEFAULT 'editor',
    \`acceptedAt\` timestamp,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`folder_members_id\` PRIMARY KEY(\`id\`),
    CONSTRAINT \`folder_members_token_unique\` UNIQUE(\`token\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`narration_assets\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`folderId\` int NOT NULL,
    \`documentId\` int,
    \`pageNumber\` int,
    \`label\` varchar(256),
    \`videoUrl\` text NOT NULL,
    \`videoKey\` varchar(512) NOT NULL,
    \`durationSeconds\` float,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`narration_assets_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`composed_decks\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`folderId\` int NOT NULL,
    \`createdByUserId\` int,
    \`createdByMemberId\` int,
    \`name\` varchar(256) NOT NULL,
    \`description\` text,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`composed_decks_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`composed_deck_slots\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`deckId\` int NOT NULL,
    \`position\` int NOT NULL,
    \`documentPageId\` int NOT NULL,
    \`narrationAssetId\` int,
    \`customNarrationUrl\` text,
    \`customNarrationKey\` varchar(512),
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`composed_deck_slots_id\` PRIMARY KEY(\`id\`)
  )`,
  // Alter existing tables to make documentId nullable and add composedDeckId
  `ALTER TABLE \`analytics_events\` MODIFY COLUMN \`documentId\` int`,
  `ALTER TABLE \`share_links\` MODIFY COLUMN \`documentId\` int`,
  // Add composedDeckId columns (ignore if already exists)
];

const addColumns = [
  `ALTER TABLE \`analytics_events\` ADD COLUMN \`composedDeckId\` int`,
  `ALTER TABLE \`share_links\` ADD COLUMN \`composedDeckId\` int`,
];

for (const sql of statements) {
  try {
    await conn.execute(sql);
    console.log("OK:", sql.slice(0, 60).replace(/\s+/g, " ").trim());
  } catch (err) {
    console.error("FAIL:", sql.slice(0, 60).replace(/\s+/g, " ").trim(), "\n  ", err.message);
  }
}

for (const sql of addColumns) {
  try {
    await conn.execute(sql);
    console.log("OK:", sql.slice(0, 80).replace(/\s+/g, " ").trim());
  } catch (err) {
    if (err.code === "ER_DUP_FIELDNAME") {
      console.log("SKIP (already exists):", sql.slice(0, 80).replace(/\s+/g, " ").trim());
    } else {
      console.error("FAIL:", sql.slice(0, 80).replace(/\s+/g, " ").trim(), "\n  ", err.message);
    }
  }
}

await conn.end();
console.log("Migration complete.");
