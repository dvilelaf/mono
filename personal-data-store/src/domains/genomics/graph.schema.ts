import { pgTable, uuid, text, timestamp, jsonb, numeric, index, unique } from "drizzle-orm/pg-core";

// Typed knowledge graph: variant → constraint → intervention → metric → goal.
// Slugs are unique per node_type so that curators can reference nodes
// stably (and align with existing intervention/goal slugs where useful).
export const graphNodes = pgTable(
  "graph_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nodeType: text("node_type").notNull(),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("graph_nodes_type_slug_uniq").on(table.nodeType, table.slug),
    index("graph_nodes_type_idx").on(table.nodeType),
    index("graph_nodes_slug_idx").on(table.slug),
  ],
);

export const graphEdges = pgTable(
  "graph_edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromNodeId: uuid("from_node_id").notNull().references(() => graphNodes.id, { onDelete: "cascade" }),
    toNodeId: uuid("to_node_id").notNull().references(() => graphNodes.id, { onDelete: "cascade" }),
    relation: text("relation").notNull(),
    evidence: text("evidence"),
    confidence: numeric("confidence"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("graph_edges_from_to_relation_uniq").on(table.fromNodeId, table.toNodeId, table.relation),
    index("graph_edges_from_idx").on(table.fromNodeId),
    index("graph_edges_to_idx").on(table.toNodeId),
    index("graph_edges_relation_idx").on(table.relation),
  ],
);
