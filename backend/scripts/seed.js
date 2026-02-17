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

  const seedsDir = path.join(__dirname, '..', 'db', 'seeds');
  const files = fs.readdirSync(seedsDir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(seedsDir, file), 'utf8');
    await client.query(sql);
    console.log(`applied seed: ${file}`);
  }

  await client.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
