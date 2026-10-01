import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateChapterBody,
  CreateResourceBody,
  CreateTradeBody,
  CreateUserBody,
  LoginBody,
  SearchLibraryQueryParams,
  UpdateChapterBody,
  UpdateResourceBody,
  UpdateSettingsBody,
  UpdateTradeBody,
  UpdateUserBody,
} from "@workspace/api-zod";
import {
  chaptersTable,
  db,
  resourcesTable,
  sessionsTable,
  settingsTable,
  tradesTable,
  usersTable,
} from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "kraken_session";
const SESSION_DAYS = 30;

type CurrentUser = typeof usersTable.$inferSelect;
export type AuthedRequest = Request & { currentUser?: CurrentUser };

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
};

function pathParam(req: Request, name: string) {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

function id() {
  return randomUUID();
}

function publicUser(user: CurrentUser) {
  const status =
    user.status === "disabled"
      ? "disabled"
      : user.expiresAt && user.expiresAt.getTime() <= Date.now()
        ? "expired"
        : "active";
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    status,
    expiresAt: user.expiresAt,
    createdAt: user.createdAt,
    lastActiveAt: user.lastActiveAt,
  };
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export async function getCurrentUser(req: AuthedRequest) {
  if (req.currentUser) return req.currentUser;
  const token = (req.signedCookies?.[SESSION_COOKIE] || req.cookies?.[SESSION_COOKIE]) as string | undefined;
  if (!token) return undefined;
  const rows = await db
    .select({ user: usersTable, session: sessionsTable })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(eq(sessionsTable.token, token))
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  if (row.session.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
    return undefined;
  }
  if (
    row.user.status === "disabled" ||
    (row.user.expiresAt && row.user.expiresAt.getTime() <= Date.now())
  ) {
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
    if (row.user.status !== "disabled") {
      await db
        .update(usersTable)
        .set({ status: "expired" })
        .where(eq(usersTable.id, row.user.id));
    }
    return undefined;
  }
  req.currentUser = row.user;
  return row.user;
}

async function requireUser(req: AuthedRequest, res: Response) {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "You need to sign in first." });
    return undefined;
  }
  return user;
}

async function requireAdmin(req: AuthedRequest, res: Response) {
  const user = await requireUser(req, res);
  if (!user) return undefined;
  if (user.role !== "admin") {
    res.status(403).json({ error: "Administrator access required." });
    return undefined;
  }
  return user;
}

async function tradePayload(tradeId: string) {
  const rows = await db
    .select({
      trade: tradesTable,
      chapterCount: count(chaptersTable.id),
      resourceCount: count(resourcesTable.id),
    })
    .from(tradesTable)
    .leftJoin(chaptersTable, eq(chaptersTable.tradeId, tradesTable.id))
    .leftJoin(resourcesTable, eq(resourcesTable.chapterId, chaptersTable.id))
    .where(eq(tradesTable.id, tradeId))
    .groupBy(tradesTable.id)
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  return {
    id: row.trade.id,
    name: row.trade.name,
    slug: row.trade.slug,
    description: row.trade.description,
    imageUrl: row.trade.imageUrl,
    order: row.trade.sortOrder,
    chapterCount: Number(row.chapterCount),
    resourceCount: Number(row.resourceCount),
  };
}

async function listTradePayloads() {
  const rows = await db
    .select({
      trade: tradesTable,
      chapterCount: count(chaptersTable.id),
      resourceCount: count(resourcesTable.id),
    })
    .from(tradesTable)
    .leftJoin(chaptersTable, eq(chaptersTable.tradeId, tradesTable.id))
    .leftJoin(resourcesTable, eq(resourcesTable.chapterId, chaptersTable.id))
    .groupBy(tradesTable.id)
    .orderBy(asc(tradesTable.sortOrder), asc(tradesTable.name));
  return rows.map((row) => ({
    id: row.trade.id,
    name: row.trade.name,
    slug: row.trade.slug,
    description: row.trade.description,
    imageUrl: row.trade.imageUrl,
    order: row.trade.sortOrder,
    chapterCount: Number(row.chapterCount),
    resourceCount: Number(row.resourceCount),
  }));
}

async function chapterPayload(chapterId: string) {
  const rows = await db
    .select({ chapter: chaptersTable, tradeName: tradesTable.name })
    .from(chaptersTable)
    .innerJoin(tradesTable, eq(chaptersTable.tradeId, tradesTable.id))
    .where(eq(chaptersTable.id, chapterId))
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  const resources = await db
    .select()
    .from(resourcesTable)
    .where(eq(resourcesTable.chapterId, chapterId))
    .orderBy(asc(resourcesTable.sortOrder), desc(resourcesTable.createdAt));
  return {
    id: row.chapter.id,
    tradeId: row.chapter.tradeId,
    name: row.chapter.name,
    description: row.chapter.description,
    imageUrl: row.chapter.imageUrl,
    order: row.chapter.sortOrder,
    resourceCount: resources.length,
    tradeName: row.tradeName,
    resources,
  };
}

async function seedDefaults() {
  const existingSettings = await db.select().from(settingsTable).limit(1);
  if (existingSettings.length === 0) {
    await db.insert(settingsTable).values({ id: 1 });
  } else if (existingSettings[0]?.siteName === "Kraken Study") {
    await db
      .update(settingsTable)
      .set({ siteName: "Kracken Study" })
      .where(eq(settingsTable.id, existingSettings[0].id));
  }
  const tradeRows = await db.select({ id: tradesTable.id }).from(tradesTable).limit(1);
  if (tradeRows.length === 0) {
    const mab = id();
    const iot = id();
    await db.insert(tradesTable).values([
      {
        id: mab,
        name: "M.A.B.R",
        slug: "mabr",
        description: "Core machine and workshop learning resources.",
        sortOrder: 0,
      },
      {
        id: iot,
        name: "IoT",
        slug: "iot",
        description: "Sensors, connectivity, and practical automation.",
        sortOrder: 1,
      },
    ]);
    const lesson = id();
    await db.insert(chaptersTable).values({
      id: lesson,
      tradeId: mab,
      name: "Lesson 1",
      description: "Foundational notes and diagrams to start the track.",
      sortOrder: 0,
    });
    // Resources are uploaded by an administrator after the storage provider is configured.
  }
  const adminUsername = process.env.ADMIN_USERNAME?.trim();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminUsername && adminPassword) {
    const existingAdmin = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(sql`lower(${usersTable.username}) = lower(${adminUsername})`)
      .limit(1);
    if (existingAdmin.length === 0) {
      await db.insert(usersTable).values({
        id: id(),
        username: adminUsername,
        passwordHash: await hashPassword(adminPassword),
        role: "admin",
        status: "active",
      });
    }
  }
}

void seedDefaults().catch((error) => {
  // Startup must stay observable without taking down the HTTP process.
  logger.error({ err: error }, "Kracken Study seed failed");
});

router.get("/auth/session", async (req: AuthedRequest, res) => {
  const user = await getCurrentUser(req);
  res.json({ authenticated: Boolean(user), user: user ? publicUser(user) : null });
});

router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a username and password." });
    return;
  }
  const identifier = parsed.data.identifier.trim().toLowerCase();
  const rows = await db
    .select()
    .from(usersTable)
    .where(sql`lower(${usersTable.username}) = ${identifier}`)
    .limit(1);
  const user = rows[0];
  if (
    !user ||
    !(await verifyPassword(parsed.data.password, user.passwordHash)) ||
    user.status === "disabled"
  ) {
    res.status(401).json({ error: "Those credentials did not match." });
    return;
  }
  if (user.expiresAt && user.expiresAt.getTime() <= Date.now()) {
    await db.update(usersTable).set({ status: "expired" }).where(eq(usersTable.id, user.id));
    res.status(401).json({ error: "This account has expired. Ask the administrator to extend it." });
    return;
  }
  const token = randomBytes(48).toString("hex");
  await db.insert(sessionsTable).values({
    token,
    userId: user.id,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
  });
  await db
    .update(usersTable)
    .set({ lastActiveAt: new Date(), status: "active" })
    .where(eq(usersTable.id, user.id));
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, signed: true });
  res.json({ authenticated: true, user: publicUser(user) });
});

router.post("/auth/logout", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (token) await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.status(204).end();
});

router.get("/dashboard/summary", async (req: AuthedRequest, res) => {
  if (!(await requireUser(req, res))) return;
  const [userCount, activeCount, expiredCount, trades, chapters, resources, featured, recent] =
    await Promise.all([
      db.select({ value: count() }).from(usersTable),
      db.select({ value: count() }).from(usersTable).where(eq(usersTable.status, "active")),
      db.select({ value: count() }).from(usersTable).where(eq(usersTable.status, "expired")),
      db.select({ value: count() }).from(tradesTable),
      db.select({ value: count() }).from(chaptersTable),
      db.select({ value: count() }).from(resourcesTable),
      listTradePayloads(),
      db.select().from(resourcesTable).orderBy(desc(resourcesTable.createdAt)).limit(5),
    ]);
  res.json({
    stats: {
      totalUsers: Number(userCount[0]?.value ?? 0),
      activeUsers: Number(activeCount[0]?.value ?? 0),
      expiredUsers: Number(expiredCount[0]?.value ?? 0),
      totalTrades: Number(trades[0]?.value ?? 0),
      totalChapters: Number(chapters[0]?.value ?? 0),
      totalResources: Number(resources[0]?.value ?? 0),
    },
    featuredTrades: featured.slice(0, 4),
    recentResources: recent,
  });
});

router.get("/trades", async (req: AuthedRequest, res) => {
  if (!(await requireUser(req, res))) return;
  res.json(await listTradePayloads());
});

router.post("/trades", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = CreateTradeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Trade name and description are required." });
    return;
  }
  const data = parsed.data;
  const trade = {
    id: id(),
    name: data.name,
    slug: `${data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
    description: data.description,
    imageUrl: data.imageUrl ?? null,
    sortOrder: data.order ?? 0,
  };
  await db.insert(tradesTable).values(trade);
  res.status(201).json(await tradePayload(trade.id));
});

router.get("/trades/:tradeId", async (req: AuthedRequest, res) => {
  if (!(await requireUser(req, res))) return;
  const tradeId = pathParam(req, "tradeId");
  const trade = await tradePayload(tradeId);
  if (!trade) {
    res.status(404).json({ error: "Trade not found." });
    return;
  }
  const chapters = await db
    .select()
    .from(chaptersTable)
    .where(eq(chaptersTable.tradeId, tradeId))
    .orderBy(asc(chaptersTable.sortOrder), asc(chaptersTable.name));
  res.json({ ...trade, chapters: chapters.map((chapter) => ({ ...chapter, order: chapter.sortOrder, resourceCount: 0 })) });
});

router.patch("/trades/:tradeId", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = UpdateTradeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid trade update." });
    return;
  }
  const data = parsed.data;
  await db.update(tradesTable).set({
    ...(data.name === undefined ? {} : { name: data.name }),
    ...(data.description === undefined ? {} : { description: data.description }),
    ...(data.imageUrl === undefined ? {} : { imageUrl: data.imageUrl }),
    ...(data.order === undefined ? {} : { sortOrder: data.order }),
  }).where(eq(tradesTable.id, pathParam(req, "tradeId")));
  const trade = await tradePayload(pathParam(req, "tradeId"));
  if (!trade) {
    res.status(404).json({ error: "Trade not found." });
    return;
  }
  res.json(trade);
});

router.delete("/trades/:tradeId", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  const children = await db.select({ id: chaptersTable.id }).from(chaptersTable).where(eq(chaptersTable.tradeId, pathParam(req, "tradeId"))).limit(1);
  if (children.length > 0) {
    res.status(409).json({ error: "This trade contains chapters. Remove its child content first." });
    return;
  }
  await db.delete(tradesTable).where(eq(tradesTable.id, pathParam(req, "tradeId")));
  res.status(204).end();
});

router.get("/trades/:tradeId/chapters", async (req: AuthedRequest, res) => {
  if (!(await requireUser(req, res))) return;
  const chapters = await db.select().from(chaptersTable).where(eq(chaptersTable.tradeId, pathParam(req, "tradeId"))).orderBy(asc(chaptersTable.sortOrder), asc(chaptersTable.name));
  const payload = await Promise.all(chapters.map(async (chapter) => {
    const resourceCount = await db.select({ value: count() }).from(resourcesTable).where(eq(resourcesTable.chapterId, chapter.id));
    return { ...chapter, order: chapter.sortOrder, resourceCount: Number(resourceCount[0]?.value ?? 0) };
  }));
  res.json(payload);
});

router.post("/trades/:tradeId/chapters", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = CreateChapterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Chapter name and description are required." });
    return;
  }
  const data = parsed.data;
  const chapter = { id: id(), tradeId: pathParam(req, "tradeId"), name: data.name, description: data.description, imageUrl: data.imageUrl ?? null, sortOrder: data.order ?? 0 };
  await db.insert(chaptersTable).values(chapter);
  res.status(201).json({ ...chapter, order: chapter.sortOrder, resourceCount: 0 });
});

router.get("/chapters/:chapterId", async (req: AuthedRequest, res) => {
  if (!(await requireUser(req, res))) return;
  const chapter = await chapterPayload(pathParam(req, "chapterId"));
  if (!chapter) {
    res.status(404).json({ error: "Chapter not found." });
    return;
  }
  res.json(chapter);
});

router.patch("/chapters/:chapterId", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = UpdateChapterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid chapter update." });
    return;
  }
  const data = parsed.data;
  await db.update(chaptersTable).set({
    ...(data.name === undefined ? {} : { name: data.name }),
    ...(data.description === undefined ? {} : { description: data.description }),
    ...(data.imageUrl === undefined ? {} : { imageUrl: data.imageUrl }),
    ...(data.order === undefined ? {} : { sortOrder: data.order }),
  }).where(eq(chaptersTable.id, pathParam(req, "chapterId")));
  const chapter = await chapterPayload(pathParam(req, "chapterId"));
  if (!chapter) {
    res.status(404).json({ error: "Chapter not found." });
    return;
  }
  res.json(chapter);
});

router.delete("/chapters/:chapterId", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  const children = await db.select({ id: resourcesTable.id }).from(resourcesTable).where(eq(resourcesTable.chapterId, pathParam(req, "chapterId"))).limit(1);
  if (children.length > 0) {
    res.status(409).json({ error: "This chapter contains resources. Remove them first." });
    return;
  }
  await db.delete(chaptersTable).where(eq(chaptersTable.id, pathParam(req, "chapterId")));
  res.status(204).end();
});

router.get("/chapters/:chapterId/resources", async (req: AuthedRequest, res) => {
  if (!(await requireUser(req, res))) return;
  res.json(await db.select().from(resourcesTable).where(eq(resourcesTable.chapterId, pathParam(req, "chapterId"))).orderBy(asc(resourcesTable.sortOrder), desc(resourcesTable.createdAt)));
});

router.post("/chapters/:chapterId/resources", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = CreateResourceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Title and uploaded file metadata are required." });
    return;
  }
  const data = parsed.data;
  const resource = {
    id: id(),
    chapterId: pathParam(req, "chapterId"),
    title: data.title,
    description: data.description ?? "",
    fileUrl: data.fileUrl,
    fileName: data.fileName,
    fileSize: data.fileSize,
    mimeType: data.mimeType,
    thumbnailUrl: data.thumbnailUrl ?? null,
    sortOrder: data.order ?? 0,
  };
  await db.insert(resourcesTable).values(resource);
  res.status(201).json(resource);
});

router.patch("/resources/:resourceId", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = UpdateResourceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid resource update." });
    return;
  }
  const data = parsed.data;
  await db.update(resourcesTable).set({
    ...(data.title === undefined ? {} : { title: data.title }),
    ...(data.description === undefined ? {} : { description: data.description }),
    ...(data.fileUrl === undefined ? {} : { fileUrl: data.fileUrl }),
    ...(data.fileName === undefined ? {} : { fileName: data.fileName }),
    ...(data.fileSize === undefined ? {} : { fileSize: data.fileSize }),
    ...(data.mimeType === undefined ? {} : { mimeType: data.mimeType }),
    ...(data.thumbnailUrl === undefined ? {} : { thumbnailUrl: data.thumbnailUrl }),
    ...(data.order === undefined ? {} : { sortOrder: data.order }),
  }).where(eq(resourcesTable.id, pathParam(req, "resourceId")));
  const resource = await db.select().from(resourcesTable).where(eq(resourcesTable.id, pathParam(req, "resourceId"))).limit(1);
  if (!resource[0]) {
    res.status(404).json({ error: "Resource not found." });
    return;
  }
  res.json(resource[0]);
});

router.delete("/resources/:resourceId", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  await db.delete(resourcesTable).where(eq(resourcesTable.id, pathParam(req, "resourceId")));
  res.status(204).end();
});

router.get("/search", async (req: AuthedRequest, res) => {
  if (!(await requireUser(req, res))) return;
  const parsed = SearchLibraryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a search term." });
    return;
  }
  const term = `%${parsed.data.query}%`;
  const [trades, chapters, resources] = await Promise.all([
    db.select().from(tradesTable).where(or(ilike(tradesTable.name, term), ilike(tradesTable.description, term))).limit(20),
    db.select({ chapter: chaptersTable, tradeName: tradesTable.name }).from(chaptersTable).innerJoin(tradesTable, eq(chaptersTable.tradeId, tradesTable.id)).where(or(ilike(chaptersTable.name, term), ilike(chaptersTable.description, term))).limit(20),
    db.select({ resource: resourcesTable, chapterName: chaptersTable.name }).from(resourcesTable).innerJoin(chaptersTable, eq(resourcesTable.chapterId, chaptersTable.id)).where(or(ilike(resourcesTable.title, term), ilike(resourcesTable.description, term))).limit(20),
  ]);
  res.json([
    ...trades.map((trade) => ({ id: trade.id, type: "trade", title: trade.name, subtitle: trade.description, href: `/trades/${trade.id}` })),
    ...chapters.map((row) => ({ id: row.chapter.id, type: "chapter", title: row.chapter.name, subtitle: row.tradeName, href: `/chapters/${row.chapter.id}` })),
    ...resources.map((row) => ({ id: row.resource.id, type: "resource", title: row.resource.title, subtitle: row.chapterName, href: `/resources/${row.resource.id}/view` })),
  ]);
});

router.get("/users", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  const users = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt));
  res.json(users.map(publicUser));
});

function expiresAtFor(duration: string, custom: string | Date | null | undefined) {
  if (duration === "custom") return custom ? new Date(custom) : null;
  const ms = duration === "hour" ? 60 * 60 * 1000 : duration === "day" ? 24 * 60 * 60 * 1000 : duration === "week" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms);
}

router.post("/users", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Use a username, password, and account duration." });
    return;
  }
  const data = parsed.data;
  const user = {
    id: id(),
    username: data.username.trim().toLowerCase(),
    passwordHash: await hashPassword(data.password),
    role: "student",
    status: "active",
    expiresAt: expiresAtFor(data.duration, data.customExpiresAt),
  };
  await db.insert(usersTable).values(user);
  res.status(201).json(publicUser(user as CurrentUser));
});

router.patch("/users/:userId", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid account update." });
    return;
  }
  const data = parsed.data;
  const update: Partial<typeof usersTable.$inferInsert> = {};
  if (data.username !== undefined) update.username = data.username.trim().toLowerCase();
  if (data.password) update.passwordHash = await hashPassword(data.password);
  if (data.status !== undefined) update.status = data.status;
  if (data.duration !== undefined) update.expiresAt = expiresAtFor(data.duration, data.customExpiresAt);
  await db.update(usersTable).set(update).where(eq(usersTable.id, pathParam(req, "userId")));
  const user = await db.select().from(usersTable).where(eq(usersTable.id, pathParam(req, "userId"))).limit(1);
  if (!user[0]) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  res.json(publicUser(user[0]));
});

router.delete("/users/:userId", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  await db.delete(sessionsTable).where(eq(sessionsTable.userId, pathParam(req, "userId")));
  await db.delete(usersTable).where(eq(usersTable.id, pathParam(req, "userId")));
  res.status(204).end();
});

router.get("/settings", async (req, res) => {
  const rows = await db.select().from(settingsTable).limit(1);
  res.json(rows[0] ?? { id: 1, siteName: "Kracken Study", brandingText: "Made by Kracken", aboutText: "", instagramUsername: "", instagramUrl: null, footerText: "", logoUrl: null, faviconUrl: null, backgroundImageUrl: null, brandingImageUrl: null });
});

router.patch("/settings", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid website settings." });
    return;
  }
  const data = parsed.data;
  await db.update(settingsTable).set(data).where(eq(settingsTable.id, 1));
  const rows = await db.select().from(settingsTable).limit(1);
  res.json(rows[0]);
});

export default router;