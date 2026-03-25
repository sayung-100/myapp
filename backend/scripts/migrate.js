const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({ connectionString });
  await client.connect();

  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d+.*\.sql$/i.test(f))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await client.query(sql);
    console.log(`applied migration: ${file}`);
  }

  await client.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
