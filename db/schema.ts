import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  code: text("code").primaryKey(),
  hostToken: text("host_token").notNull(),
  guestToken: text("guest_token"),
  hostSeen: integer("host_seen").notNull(),
  guestSeen: integer("guest_seen").notNull().default(0),
  state: text("state").notNull().default("{}"),
  input: text("input").notNull().default("{}"),
  revision: integer("revision").notNull().default(0),
});
