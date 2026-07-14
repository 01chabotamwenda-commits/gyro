import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  level: text("level").notNull().default("info"),
  message: text("message").notNull(),
});

export const insertAlertSchema = createInsertSchema(alertsTable).omit({
  id: true,
});
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;
