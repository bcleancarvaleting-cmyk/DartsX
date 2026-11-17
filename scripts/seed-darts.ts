/** Load the PDC Order of Merit darters (and their cards):  npx tsx scripts/seed-darts.ts */
import "dotenv/config";
import { seedDarters } from "../src/server/darts-events";

seedDarters()
  .then((r) => console.log(`Darters: ${r.darters} in the rankings, ${r.added} added.`))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => (await import("../src/server/db")).db.$disconnect());
