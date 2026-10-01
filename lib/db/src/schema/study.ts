import {
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const usersTable = pgTable("study_users", {
  id: varchar("id", { length: 64 }).primaryKey(),
  username: varchar("username", { length: 120 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 20 }).notNull().default("student"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
});

export const sessionsTable = pgTable("study_sessions", {
  token: varchar("token", { length: 128 }).primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tradesTable = pgTable("study_trades", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 180 }).notNull().unique(),
  description: text("description").notNull().default(""),
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chaptersTable = pgTable("study_chapters", {
  id: varchar("id", { length: 64 }).primaryKey(),
  tradeId: varchar("trade_id", { length: 64 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description").notNull().default(""),
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const resourcesTable = pgTable("study_resources", {
  id: varchar("id", { length: 64 }).primaryKey(),
  chapterId: varchar("chapter_id", { length: 64 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  description: text("description").notNull().default(""),
  fileUrl: text("file_url").notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: varchar("mime_type", { length: 120 }).notNull(),
  thumbnailUrl: text("thumbnail_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settingsTable = pgTable("study_settings", {
  id: integer("id").primaryKey().default(1),
  siteName: varchar("site_name", { length: 160 }).notNull().default("Kraken Study"),
  logoUrl: text("logo_url"),
  faviconUrl: text("favicon_url"),
  backgroundImageUrl: text("background_image_url"),
  brandingImageUrl: text("branding_image_url"),
  brandingText: text("branding_text").notNull().default("Made by Kracken"),
  aboutText: text("about_text").notNull().default("A private library for practical learning."),
  instagramUsername: varchar("instagram_username", { length: 120 }).notNull().default(""),
  instagramUrl: text("instagram_url"),
  footerText: text("footer_text").notNull().default(""),
});

export const insertUserSchema = createInsertSchema(usersTable);
export const insertSessionSchema = createInsertSchema(sessionsTable);
export const insertTradeSchema = createInsertSchema(tradesTable);
export const insertChapterSchema = createInsertSchema(chaptersTable);
export const insertResourceSchema = createInsertSchema(resourcesTable);
export const insertSettingsSchema = createInsertSchema(settingsTable);

export type User = typeof usersTable.$inferSelect;
export type Session = typeof sessionsTable.$inferSelect;
export type Trade = typeof tradesTable.$inferSelect;
export type Chapter = typeof chaptersTable.$inferSelect;
export type Resource = typeof resourcesTable.$inferSelect;
export type Settings = typeof settingsTable.$inferSelect;