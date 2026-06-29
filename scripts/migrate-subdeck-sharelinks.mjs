import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  await conn.execute("ALTER TABLE `share_links` ADD COLUMN IF NOT EXISTS `subDeckId` int;");
  console.log("Migration applied: share_links.subDeckId added");
} catch (err) {
  if (err.code === "ER_DUP_FIELDNAME") {
    console.log("Column already exists, skipping.");
  } else {
    throw err;
  }
} finally {
  await conn.end();
}
