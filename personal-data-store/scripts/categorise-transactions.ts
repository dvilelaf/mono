import { db } from "../src/db/index.js";
import { transactions } from "../src/domains/finance/finance.schema.js";
import { eq, and, isNull, sql } from "drizzle-orm";

// Rule-based categorisation for uncategorised transactions.
// Each rule: a regex tested against `description` and an assigned category.
// First matching rule wins. Order matters — list specific rules before generic.

interface Rule {
  pattern: RegExp;
  category: string;
}

const RULES: Rule[] = [
  // Self-transfers (Wise / Revolut conventions)
  { pattern: /^to gbp savings$/i, category: "self_transfer" },
  { pattern: /\bsavings\b/i, category: "self_transfer" },
  { pattern: /^converted .+ to .+/i, category: "self_transfer" },
  { pattern: /^exchanged to /i, category: "self_transfer" },
  { pattern: /^to (own|my) /i, category: "self_transfer" },
  { pattern: /^topped? up balance/i, category: "self_transfer" },

  // Property / family transfers (kept as their own buckets, excluded from spend)
  { pattern: /\b(rent|landlord)\b/i, category: "rent" },
  { pattern: /thames water|british gas|edf energy|octopus energy|eon next|sse|bulb|thames/i, category: "utilities" },
  { pattern: /virgin media|bt internet|sky broadband|hyperoptic/i, category: "utilities" },
  { pattern: /council tax/i, category: "tax" },
  { pattern: /hmrc|self assessment/i, category: "tax" },

  // Insurance
  { pattern: /axa ppp|bupa|vitality|aviva|admiral|hastings direct|direct line|allianz/i, category: "insurance" },

  // Childcare / education
  { pattern: /nursery|childcare|nanny/i, category: "childcare" },
  { pattern: /school|tuition/i, category: "education" },

  // Health & fitness
  { pattern: /pharmacy|boots|superdrug|lloyds pharmacy|gp |dentist|optician|vision express/i, category: "health" },
  { pattern: /the fertility|clinic/i, category: "health" },
  { pattern: /gym|fitness|peloton|barry'?s|equinox|third space/i, category: "fitness" },

  // Groceries
  { pattern: /tesco|sainsbury|waitrose|m&s food|marks ?& ?spencer|ocado|aldi|lidl|morrisons|whole foods|planet organic/i, category: "groceries" },

  // Food delivery / dining
  { pattern: /deliveroo|uber ?eats|just ?eat|ubereats/i, category: "food" },
  { pattern: /pret a manger|prêt|starbucks|costa coffee|caffè nero|gail's|joe & the juice|leon|wasabi|itsu/i, category: "dining" },
  { pattern: /restaurant|kitchen|bistro|brasserie|trattoria|osteria|pizzeria|sushi|ramen|izakaya|cafe|café|bar |pub /i, category: "dining" },

  // Transport
  { pattern: /\btfl\b|transport for london|oyster|santander cycles|underground/i, category: "transport" },
  { pattern: /\buber\b|bolt\.eu|free now|gett|addison lee/i, category: "transport" },
  { pattern: /national rail|trainline|lner|gwr|avanti|southeastern|thameslink/i, category: "transport" },
  { pattern: /shell|bp |esso|tesco petrol|sainsbury'?s petrol/i, category: "vehicle" },
  { pattern: /parking|ringgo|paybyphone|ncp/i, category: "transport" },

  // Travel
  { pattern: /booking\.com|airbnb|hotels?\.com|expedia|trivago|lastminute|kayak/i, category: "travel" },
  { pattern: /british airways|easyjet|ryanair|virgin atlantic|lufthansa|klm|air france|emirates|qatar/i, category: "travel" },
  { pattern: /eurostar/i, category: "travel" },

  // Shopping & clothes
  { pattern: /amazon\b|amzn/i, category: "shopping" },
  { pattern: /lululemon|uniqlo|zara|h&m|cos\b|& other stories|arket|john lewis|selfridges|harrods|liberty/i, category: "clothes" },
  { pattern: /asos|net-a-porter|matches ?fashion|farfetch|mr ?porter|the outnet/i, category: "clothes" },

  // Tech
  { pattern: /apple\.com|app store|itunes|icloud/i, category: "tech" },
  { pattern: /github|openai|anthropic|cursor|replicate|vercel|cloudflare/i, category: "tech" },
  { pattern: /google.*storage|google one|youtube premium/i, category: "subscriptions" },

  // Subscriptions / entertainment
  { pattern: /netflix|spotify|disney\+|hbo max|apple tv|prime video|youtube|paramount\+|hulu/i, category: "subscriptions" },
  { pattern: /substack|medium|patreon|ft\.com|the economist|new york times|nytimes|the times/i, category: "subscriptions" },
  { pattern: /cinema|odeon|vue|picturehouse|everyman/i, category: "entertainment" },

  // Charity
  { pattern: /donation|charity|gofundme|justgiving/i, category: "charity" },

  // Cash withdrawals — ambiguous, mark as spending
  { pattern: /cash withdrawal|atm /i, category: "spending" },

  // Wise / Revolut sent-money to a person (best-effort guess: family if frequent)
  { pattern: /^sent money to /i, category: "transfer_out" },
  { pattern: /^paid to /i, category: "spending" },
  { pattern: /^international transfer/i, category: "transfer_out" },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limit = process.argv.includes("--all") ? null : 5000;

  // Pull uncategorised transactions
  const rows = await db
    .select({ id: transactions.id, description: transactions.description })
    .from(transactions)
    .where(isNull(transactions.category))
    .limit(limit ?? 1_000_000);

  console.log(`Found ${rows.length} uncategorised transactions${limit ? ` (limit ${limit})` : ""}.`);

  const byCategory = new Map<string, number>();
  const updates: Array<{ id: string; category: string }> = [];

  for (const row of rows) {
    for (const rule of RULES) {
      if (rule.pattern.test(row.description)) {
        updates.push({ id: row.id, category: rule.category });
        byCategory.set(rule.category, (byCategory.get(rule.category) ?? 0) + 1);
        break;
      }
    }
  }

  console.log(`Matched ${updates.length} of ${rows.length} (${((updates.length / Math.max(1, rows.length)) * 100).toFixed(1)}%).`);
  for (const [cat, count] of [...byCategory.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(18)} ${count}`);
  }

  if (dryRun) {
    console.log("Dry run — no changes written.");
    process.exit(0);
  }

  let applied = 0;
  for (const u of updates) {
    await db
      .update(transactions)
      .set({ category: u.category })
      .where(and(eq(transactions.id, u.id), isNull(transactions.category)));
    applied += 1;
  }
  // Drop unused import warning
  void sql;
  console.log(`Applied ${applied} category updates.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
