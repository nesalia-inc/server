/**
 * Events System Tests
 *
 * This test file demonstrates and verifies all event system features:
 * - Event Registry Definition (defineEvents)
 * - ctx.send() - Emitting events from mutations
 * - t.on() - Global event listeners
 * - Transaction Integrity - Events only emitted on success
 * - Wildcard Patterns - Using "user.*" to listen to multiple events
 * - Unsubscribe - Cleaning up event listeners
 */

import { describe, it, expect, beforeEach } from "vitest";
import { defineContext, defineEvents, ok, err } from "@deessejs/server";
import { z } from "zod";

// ============================================================================
// Test Setup
// ============================================================================

// Define events for testing using defineEvents (type-safe approach)
const events = defineEvents({
  user: {
    created: {
      data: { id: 0, email: "", name: "" },
    },
    updated: {
      data: { id: 0, changes: {} },
    },
    deleted: {
      data: { id: 0 },
    },
  },
  email: {
    sent: {
      data: { to: "", template: "", subject: "" },
    },
  },
  order: {
    created: {
      data: { id: 0, userId: 0, total: 0 },
    },
  },
});

// String-based event names for use in ctx.send()
const eventNames = {
  user: {
    created: "user.created",
    updated: "user.updated",
    deleted: "user.deleted",
  },
  email: {
    sent: "email.sent",
  },
  order: {
    created: "order.created",
  },
};

// Database context type for tests
interface TestDb {
  users: { id: number; name: string; email: string }[];
  nextId: number;
  auditLogs: { action: string; entityId: number }[];
  emails: { to: string; template: string }[];
}

// Helper to create a fresh API instance for each test
function createTestAPI() {
  const db: TestDb = {
    users: [],
    nextId: 1,
    auditLogs: [],
    emails: [],
  };

  const { t, createAPI } = defineContext({
    context: { db } as { db: TestDb },
    events,
  });

  const createUser = t.mutation({
    args: z.object({
      name: z.string(),
      email: z.string().email(),
    }),
    handler: async (ctx, args) => {
      const user = {
        id: ctx.db.nextId++,
        name: args.name,
        email: args.email,
      };
      ctx.db.users.push(user);
      ctx.send(eventNames.user.created, { id: user.id, email: user.email, name: user.name });
      ctx.send(eventNames.email.sent, {
        to: user.email,
        template: "welcome",
        subject: "Welcome!",
      });
      return ok(user);
    },
  });

  const updateUser = t.mutation({
    args: z.object({
      id: z.number(),
      name: z.string().optional(),
      email: z.string().email().optional(),
    }),
    handler: async (ctx, args) => {
      const user = ctx.db.users.find((u) => u.id === args.id);
      if (!user) {
        return err({ name: "NOT_FOUND", message: () => "User not found" } as any);
      }
      const changes: Record<string, unknown> = {};
      if (args.name !== undefined) {
        changes.name = { from: user.name, to: args.name };
        user.name = args.name;
      }
      if (args.email !== undefined) {
        changes.email = { from: user.email, to: args.email };
        user.email = args.email;
      }
      if (Object.keys(changes).length > 0) {
        ctx.send(eventNames.user.updated, { id: user.id, changes });
      }
      return ok(user);
    },
  });

  const deleteUser = t.mutation({
    args: z.object({ id: z.number() }),
    handler: async (ctx, args) => {
      const index = ctx.db.users.findIndex((u) => u.id === args.id);
      if (index === -1) {
        return err({ name: "NOT_FOUND", message: () => "User not found" } as any);
      }
      ctx.db.users.splice(index, 1);
      ctx.send(eventNames.user.deleted, { id: args.id });
      return ok({ deleted: true });
    },
  });

  const failMutation = t.mutation({
    args: z.object({ shouldFail: z.boolean() }),
    handler: async (ctx, args) => {
      if (args.shouldFail) {
        ctx.send(eventNames.user.created, { id: 999, email: "test@test.com", name: "Test" });
        return err({ name: "FAIL", message: () => "Intentional failure" } as any);
      }
      return ok({ success: true });
    },
  });

  const router = t.router({
    users: t.router({
      create: createUser,
      update: updateUser,
      delete: deleteUser,
    }),
    fail: failMutation,
  });

  const api = createAPI({ router });
  return { api, db };
}

// ============================================================================
// Tests
// ============================================================================

describe("defineEvents", () => {
  it("should create a typed event registry", () => {
    expect(events).toBeDefined();
    expect(events["user.created"]).toBeDefined();
    expect(events["user.updated"]).toBeDefined();
    expect(events["user.deleted"]).toBeDefined();
    expect(events["email.sent"]).toBeDefined();
  });

  it("should preserve event data types", () => {
    // Verify event structure exists
    expect(events["user.created"].data).toBeDefined();
    expect(events["user.updated"].data).toBeDefined();
  });
});

describe("ctx.send() - Event Emission", () => {
  it("should emit events after successful mutation", async () => {
    const { api } = createTestAPI();

    await api.execute("users.create", {
      name: "John Doe",
      email: "john@example.com",
    });

    const emittedEvents = api.getEvents();
    expect(emittedEvents).toHaveLength(2);
    expect(emittedEvents[0].name).toBe("user.created");
    expect(emittedEvents[0].data).toMatchObject({ id: 1, email: "john@example.com" });
    expect(emittedEvents[1].name).toBe("email.sent");
    expect(emittedEvents[1].data).toMatchObject({ to: "john@example.com", template: "welcome" });
  });

  it("should emit multiple events from a single mutation", async () => {
    const { api } = createTestAPI();

    await api.execute("users.create", {
      name: "Jane Doe",
      email: "jane@example.com",
    });

    const emittedEvents = api.getEvents();
    // Should have both user.created and email.sent
    expect(emittedEvents.some((e: any) => e.name === "user.created")).toBe(true);
    expect(emittedEvents.some((e: any) => e.name === "email.sent")).toBe(true);
  });

  it("should not emit events when mutation fails", async () => {
    const { api } = createTestAPI();

    const result = await api.execute("fail", { shouldFail: true });

    expect(result.ok).toBe(false);
    const emittedEvents = api.getEvents();
    expect(emittedEvents).toHaveLength(0); // No events because mutation failed
  });

  it("should not emit events when mutation throws", async () => {
    // Create a throwing mutation using a separate API
    const db: TestDb = {
      users: [],
      nextId: 1,
      auditLogs: [],
      emails: [],
    };

    const { t, createAPI: createAPI2 } = defineContext({
      context: { db } as { db: TestDb },
      events,
    });

    const throwingMutation = t.mutation({
      args: z.object({}),
      handler: async (ctx, _args) => {
        ctx.send(eventNames.user.created, { id: 1, email: "test@test.com", name: "Test" });
        throw new Error("Database error");
      },
    });

    const testApi = createAPI2({
      router: t.router({ test: throwingMutation }),
    });

    const result = await testApi.execute("test", {});

    expect(result.ok).toBe(false);
    const emittedEvents = testApi.getEvents();
    expect(emittedEvents).toHaveLength(0);
  });

  it("should include timestamp in event payload", async () => {
    const { api } = createTestAPI();

    await api.execute("users.create", {
      name: "Time Test",
      email: "time@example.com",
    });

    const emittedEvents = api.getEvents();
    expect(emittedEvents[0].timestamp).toBeDefined();
    expect(new Date(emittedEvents[0].timestamp).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("should include namespace in event payload", async () => {
    const { api } = createTestAPI();

    await api.execute("users.create", {
      name: "Namespace Test",
      email: "ns@example.com",
    });

    const emittedEvents = api.getEvents();
    expect(emittedEvents[0].namespace).toBe("default");
  });
});

describe("t.on() - Global Event Listeners", () => {
  it("should register and receive events", async () => {
    const receivedEvents: any[] = [];
    const { t, createAPI } = defineContext({
      context: { db: { create: () => ({ id: 1 }) } } as any,
      events,
    });

    // Register global listener before creating API
    t.on(eventNames.user.created, (_ctx, payload) => {
      receivedEvents.push(payload);
    });

    const createUser = t.mutation({
      args: z.object({ name: z.string() }),
      handler: async (ctx, _args) => {
        const user = ctx.db.create({});
        ctx.send(eventNames.user.created, { id: user.id, email: "test@test.com", name: "Test" });
        return ok(user);
      },
    });

    const api = createAPI({
      router: t.router({ users: { create: createUser } }),
    });

    await api.users.create({ name: "Test" });

    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0].name).toBe("user.created");
    expect(receivedEvents[0].data.id).toBe(1);
  });

  it("should return unsubscribe function", async () => {
    const callCount = { current: 0 };
    const { t, createAPI } = defineContext({
      context: { db: { create: () => ({ id: 1 }) } } as any,
      events,
    });

    const unsubscribe = t.on(eventNames.user.created, (_ctx, _payload) => {
      callCount.current++;
    });

    const createUser = t.mutation({
      args: z.object({ name: z.string() }),
      handler: async (ctx, _args) => {
        const user = ctx.db.create({});
        ctx.send(eventNames.user.created, { id: user.id, email: "test@test.com", name: "Test" });
        return ok(user);
      },
    });

    const api = createAPI({
      router: t.router({ users: { create: createUser } }),
    });

    await api.users.create({ name: "Test1" });
    expect(callCount.current).toBe(1);

    unsubscribe();

    await api.users.create({ name: "Test2" });
    expect(callCount.current).toBe(1); // Still 1, not 2
  });

  it("should handle async event handlers", async () => {
    const asyncDone = { value: false };
    const { t, createAPI } = defineContext({
      context: { db: { create: () => ({ id: 1 }) } } as any,
      events,
    });

    t.on(eventNames.user.created, async (_ctx, _payload) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      asyncDone.value = true;
    });

    const createUser = t.mutation({
      args: z.object({ name: z.string() }),
      handler: async (ctx, _args) => {
        const user = ctx.db.create({});
        ctx.send(eventNames.user.created, { id: user.id, email: "test@test.com", name: "Test" });
        return ok(user);
      },
    });

    const api = createAPI({
      router: t.router({ users: { create: createUser } }),
    });

    await api.users.create({ name: "Test" });
    expect(asyncDone.value).toBe(true);
  });
});

describe("Wildcard Patterns", () => {
  it("should match user.* pattern for user.created", async () => {
    const receivedEvents: any[] = [];
    const { t, createAPI } = defineContext({
      context: { db: { create: () => ({ id: 1 }) } } as any,
      events,
    });

    t.on("user.*", (_ctx, payload) => {
      receivedEvents.push(payload);
    });

    const createUser = t.mutation({
      args: z.object({ name: z.string() }),
      handler: async (ctx, _args) => {
        const user = ctx.db.create({});
        ctx.send(eventNames.user.created, { id: user.id, email: "test@test.com", name: "Test" });
        return ok(user);
      },
    });

    const api = createAPI({
      router: t.router({ users: { create: createUser } }),
    });

    await api.users.create({ name: "Test" });

    expect(receivedEvents.some((e) => e.name === "user.created")).toBe(true);
  });

  it("should match user.* pattern for user.updated", async () => {
    const receivedEvents: any[] = [];
    const { t, createAPI } = defineContext({
      context: {
        db: {
          users: [{ id: 1, name: "Test", email: "test@test.com" }],
          create: () => ({ id: 2 }),
        },
      } as any,
      events,
    });

    t.on("user.*", (_ctx, payload) => {
      receivedEvents.push(payload);
    });

    const updateUser = t.mutation({
      args: z.object({ id: z.number(), name: z.string() }),
      handler: async (ctx, args) => {
        const user = ctx.db.users.find((u: any) => u.id === args.id);
        if (!user) return err({ name: "NOT_FOUND", message: () => "Not found" } as any);
        ctx.send(eventNames.user.updated, { id: user.id, changes: { name: args.name } });
        return ok(user);
      },
    });

    const api = createAPI({
      router: t.router({ users: { update: updateUser } }),
    });

    await api.users.update({ id: 1, name: "Updated" });

    expect(receivedEvents.some((e) => e.name === "user.updated")).toBe(true);
  });

  it("should match * pattern for all events", async () => {
    const receivedEvents: any[] = [];
    const { t, createAPI } = defineContext({
      context: { db: { create: () => ({ id: 1 }) } } as any,
      events,
    });

    // Global wildcard listener
    t.on("*", (_ctx, payload) => {
      receivedEvents.push(payload);
    });

    const createUser = t.mutation({
      args: z.object({ name: z.string() }),
      handler: async (ctx, _args) => {
        const user = ctx.db.create({});
        ctx.send(eventNames.user.created, { id: user.id, email: "test@test.com", name: "Test" });
        ctx.send(eventNames.email.sent, { to: "test@test.com", template: "welcome", subject: "Hi" });
        return ok(user);
      },
    });

    const api = createAPI({
      router: t.router({ users: { create: createUser } }),
    });

    await api.users.create({ name: "Test" });

    expect(receivedEvents).toHaveLength(2);
  });

  it("should not match post.* for user.created", async () => {
    const receivedEvents: any[] = [];
    const { t, createAPI } = defineContext({
      context: { db: { create: () => ({ id: 1 }) } } as any,
      events,
    });

    // Only listen to post.* - should NOT receive user.created
    t.on("post.*", (_ctx, payload) => {
      receivedEvents.push(payload);
    });

    const createUser = t.mutation({
      args: z.object({ name: z.string() }),
      handler: async (ctx, _args) => {
        const user = ctx.db.create({});
        ctx.send(eventNames.user.created, { id: user.id, email: "test@test.com", name: "Test" });
        return ok(user);
      },
    });

    const api = createAPI({
      router: t.router({ users: { create: createUser } }),
    });

    await api.users.create({ name: "Test" });

    expect(receivedEvents).toHaveLength(0);
  });
});

describe("Transaction Integrity", () => {
  it("should not emit events when mutation returns error", async () => {
    const { api } = createTestAPI();

    // Create a user first so we can try to update it
    await api.execute("users.create", {
      name: "Test User",
      email: "test@example.com",
    });

    // Clear emitted events
    api.getEvents();

    // Try to update non-existent user
    const result = await api.execute("users.update", {
      id: 999,
      name: "Nobody",
    });

    expect(result.ok).toBe(false);

    // No events should have been emitted for the failed update
    const emittedEvents = api.getEvents();
    const updateEvents = emittedEvents.filter((e: any) => e.name === "user.updated");
    expect(updateEvents).toHaveLength(0);
  });

  it("should not emit events when mutation throws", async () => {
    // Create a throwing mutation using a separate API
    const { t, createAPI } = defineContext({
      context: { db: {} } as any,
      events,
    });

    const throwingMutation = t.mutation({
      args: z.object({}),
      handler: async (ctx, _args) => {
        ctx.send(eventNames.user.created, { id: 1, email: "test@test.com", name: "Test" });
        throw new Error("Database error");
      },
    });

    const testApi = createAPI({
      router: t.router({ test: throwingMutation }),
    });

    const result = await testApi.execute("test", {});

    expect(result.ok).toBe(false);
    const emittedEvents = testApi.getEvents();
    expect(emittedEvents).toHaveLength(0);
  });

  it("should not clear pending events after successful emission (cumulative log)", async () => {
    const { api } = createTestAPI();

    await api.execute("users.create", {
      name: "Test",
      email: "test@example.com",
    });

    const events1 = api.getEvents();
    expect(events1.length).toBeGreaterThan(0);

    // Next mutation should have MORE events (cumulative)
    await api.execute("users.create", {
      name: "Test2",
      email: "test2@example.com",
    });

    const events2 = api.getEvents();
    // Should have 4 events (2 from first create + 2 from second create)
    expect(events2.length).toBe(4);
  });
});

describe("Event Payload Structure", () => {
  it("should have correct payload structure", async () => {
    const { api } = createTestAPI();

    await api.execute("users.create", {
      name: "Structure Test",
      email: "structure@example.com",
    });

    const emittedEvents = api.getEvents();
    const event = emittedEvents[0];

    expect(event).toHaveProperty("name");
    expect(event).toHaveProperty("data");
    expect(event).toHaveProperty("timestamp");
    expect(event).toHaveProperty("namespace");
    expect(typeof event.name).toBe("string");
    expect(typeof event.timestamp).toBe("string");
    expect(typeof event.namespace).toBe("string");
  });
});

describe("Edge Cases", () => {
  it("should handle events with no registered listeners", async () => {
    const { api } = createTestAPI();

    // This will emit email.sent but we don't have a listener for it in this test
    await api.execute("users.create", {
      name: "No Listener",
      email: "nolistener@example.com",
    });

    const emittedEvents = api.getEvents();
    // Should still capture events even without listeners
    expect(emittedEvents.some((e: any) => e.name === "user.created")).toBe(true);
  });

  it("should handle empty update (no changes)", async () => {
    const { api } = createTestAPI();

    // Create user
    await api.execute("users.create", {
      name: "Original",
      email: "original@example.com",
    });

    // Clear emitted events
    api.getEvents();

    // Update with no args - should not emit event since nothing provided
    const result = await api.execute("users.update", {
      id: 1,
    });

    if (result.ok) {
      const emittedEvents = api.getEvents();
      // No user.updated should be emitted since no fields were provided
      const updateEvents = emittedEvents.filter((e: any) => e.name === "user.updated");
      expect(updateEvents).toHaveLength(0);
    }
  });

  it("should handle multiple rapid mutations", async () => {
    const { api } = createTestAPI();

    await api.execute("users.create", { name: "User1", email: "u1@example.com" });
    await api.execute("users.create", { name: "User2", email: "u2@example.com" });
    await api.execute("users.create", { name: "User3", email: "u3@example.com" });

    const emittedEvents = api.getEvents();
    expect(emittedEvents.filter((e: any) => e.name === "user.created")).toHaveLength(3);
  });
});
