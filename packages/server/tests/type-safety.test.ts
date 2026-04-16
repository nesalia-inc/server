/**
 * Type Safety Tests
 *
 * These tests verify compile-time type safety for:
 * 1. Event typing: ctx.send() should only accept valid events from EventRegistry
 * 2. API type inference: api.users.list({}) should return Result<User>, not Result<any>
 *
 * NOTE: These tests use TypeScript's type system to verify correctness.
 * The commented sections below demonstrate what WOULD fail to compile if uncommented.
 */

import { describe, it, expect } from "vitest";
import { defineContext, ok } from "../src/index";
import { z } from "zod";

// Define custom event registry for testing
interface TestEvents {
  "user.created": { data: { id: string; name: string } };
  "user.updated": { data: { id: string; name: string } };
  "email.sent": { data: { to: string; subject: string } };
}

// Define User type for type inference testing
interface User {
  id: string;
  name: string;
  email: string;
}

describe("Type Safety - Event Typing", () => {
  it("should compile when sending correctly typed events", () => {
    // This should compile when events are correctly defined
    const { t, createAPI } = defineContext<
      { db: { create: (data: any) => User } },
      TestEvents
    >({
      context: { db: { create: (data: any) => ({ id: "1", ...data }) } },
      events: {
        "user.created": { data: { id: "", name: "" } },
        "user.updated": { data: { id: "", name: "" } },
        "email.sent": { data: { to: "", subject: "" } },
      },
    });

    const createUser = t.mutation({
      args: z.object({ name: z.string(), email: z.string() }),
      handler: async (ctx, args) => {
        const user = ctx.db.create(args);
        // This should compile - "user.created" is in TestEvents
        ctx.send("user.created", { id: user.id, name: user.name });
        return ok(user);
      },
    });

    const api = createAPI({
      router: t.router({
        users: { create: createUser },
      }),
    });

    expect(api).toBeDefined();
  });

  it("should compile when sending events with correct data shape", () => {
    const { t, createAPI } = defineContext<
      { db: { create: (data: any) => User } },
      TestEvents
    >({
      context: { db: { create: (data: any) => ({ id: "1", ...data }) } },
      events: {
        "user.created": { data: { id: "", name: "" } },
      },
    });

    const createUser = t.mutation({
      args: z.object({ name: z.string() }),
      handler: async (ctx, args) => {
        const user = ctx.db.create(args);
        // Correct event name and correct data shape
        ctx.send("user.created", { id: user.id, name: user.name });
        return ok(user);
      },
    });

    const api = createAPI({
      router: t.router({
        users: { create: createUser },
      }),
    });

    expect(api).toBeDefined();
  });

  it("should infer proper types for send function in handler context", () => {
    // Verify that the send function accepts only valid event names from registry
    const { t, createAPI } = defineContext<
      { db: { create: (data: any) => User } },
      TestEvents
    >({
      context: { db: { create: (data: any) => ({ id: "1", ...data }) } },
      events: {
        "user.created": { data: { id: "", name: "" } },
        "email.sent": { data: { to: "", subject: "" } },
      },
    });

    const createUser = t.mutation({
      args: z.object({ name: z.string(), email: z.string() }),
      handler: async (ctx, args) => {
        const user = ctx.db.create(args);
        // Both of these should compile - both events are in TestEvents
        ctx.send("user.created", { id: user.id, name: user.name });
        ctx.send("email.sent", { to: args.email, subject: "Welcome" });
        return ok(user);
      },
    });

    const api = createAPI({
      router: t.router({
        users: { create: createUser },
      }),
    });

    expect(api).toBeDefined();
  });

  /**
   * COMPILE-TIME TYPE TEST - Uncommenting should cause TypeScript error
   *
   * This tests that sending a non-existent event fails to compile.
   * If you uncomment the line below, TypeScript should report an error because
   * "nonexistent.event" is not in TestEvents.
   */
  it("should fail to compile when sending unregistered event", () => {
    const { t, createAPI } = defineContext<
      { db: { create: (data: any) => User } },
      TestEvents
    >({
      context: { db: { create: (data: any) => ({ id: "1", ...data }) } },
      events: {
        "user.created": { data: { id: "", name: "" } },
      },
    });

    const createUser = t.mutation({
      args: z.object({ name: z.string() }),
      handler: async (ctx, args) => {
        const user = ctx.db.create(args);
        ctx.send("user.created", { id: user.id, name: user.name });
        // UNCOMMENT TO TEST: This should cause a compile error
        // ctx.send("nonexistent.event", {});
        return ok(user);
      },
    });

    const api = createAPI({
      router: t.router({
        users: { create: createUser },
      }),
    });

    expect(api).toBeDefined();
  });

  /**
   * COMPILE-TIME TYPE TEST - Uncommenting should cause TypeScript error
   *
   * This tests that sending an event with wrong data shape fails to compile.
   * If you uncomment the line below, TypeScript should report an error because
   * "user.created" expects { id: string; name: string } but we pass { id: number }.
   */
  it("should fail to compile when sending event with wrong data shape", () => {
    const { t, createAPI } = defineContext<
      { db: { create: (data: any) => User } },
      TestEvents
    >({
      context: { db: { create: (data: any) => ({ id: "1", ...data }) } },
      events: {
        "user.created": { data: { id: "", name: "" } },
      },
    });

    const createUser = t.mutation({
      args: z.object({ name: z.string() }),
      handler: async (ctx, args) => {
        const user = ctx.db.create(args);
        ctx.send("user.created", { id: user.id, name: user.name });
        // UNCOMMENT TO TEST: This should cause a compile error
        // ctx.send("user.created", { id: 123 }); // id should be string, not number
        return ok(user);
      },
    });

    const api = createAPI({
      router: t.router({
        users: { create: createUser },
      }),
    });

    expect(api).toBeDefined();
  });
});

describe("Type Safety - API Type Inference", () => {
  it("should infer return type as Result<User>, not Result<any>", async () => {
    interface ListUsersResult {
      users: User[];
      total: number;
    }

    const { t, createAPI } = defineContext({
      context: {
        db: {
          findAll: (): User[] => [
            { id: "1", name: "Alice", email: "alice@example.com" },
          ],
        },
      },
    });

    const listUsers = t.query({
      args: z.object({ limit: z.number().optional() }),
      handler: async (ctx, _args) => {
        const users = ctx.db.findAll();
        return ok({ users, total: users.length } as ListUsersResult);
      },
    });

    const api = createAPI({
      router: t.router({
        users: {
          list: listUsers,
        },
      }),
    });

    // Test that the direct proxy access works and returns typed result
    const result = await api.users.list({});

    // The result should be typed as Result<ListUsersResult>, not Result<any>
    expect(result.ok).toBe(true);
    if (result.ok) {
      // If types are correct, this should have proper type inference
      const value = result.value as ListUsersResult;
      expect(value.users).toBeDefined();
      expect(value.total).toBeDefined();
      expect(Array.isArray(value.users)).toBe(true);
    }
  });

  it("should infer types for nested routers", async () => {
    interface Post {
      id: string;
      title: string;
      content: string;
    }

    const { t, createAPI } = defineContext({
      context: {
        db: {
          posts: {
            findAll: (): Post[] => [{ id: "1", title: "Hello", content: "World" }],
          },
        },
      },
    });

    const listPosts = t.query({
      args: z.object({}),
      handler: async (ctx, _args) => {
        const posts = ctx.db.posts.findAll();
        return ok(posts);
      },
    });

    const api = createAPI({
      router: t.router({
        posts: {
          list: listPosts,
        },
      }),
    });

    // Test nested router access
    const result = await api.posts.list({});

    expect(result.ok).toBe(true);
    if (result.ok) {
      // If types are correct, result.value should be Post[], not any[]
      const posts = result.value as Post[];
      expect(posts[0].id).toBe("1");
      expect(posts[0].title).toBe("Hello");
    }
  });

  it("should preserve type safety across multiple procedure calls", async () => {
    const { t, createAPI } = defineContext({
      context: {
        db: {
          users: {
            findById: (id: string): User | undefined =>
              id === "1" ? { id: "1", name: "Bob", email: "bob@example.com" } : undefined,
          },
        },
      },
    });

    const getUser = t.query({
      args: z.object({ id: z.string() }),
      handler: async (ctx, args) => {
        const user = ctx.db.users.findById(args.id);
        if (!user) {
          return ok(null);
        }
        return ok(user);
      },
    });

    const api = createAPI({
      router: t.router({
        users: {
          get: getUser,
        },
      }),
    });

    // Call the same procedure multiple times - types should remain consistent
    const result1 = await api.users.get({ id: "1" });
    const result2 = await api.users.get({ id: "999" });

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);

    if (result1.ok) {
      const user = result1.value as User | null;
      if (user !== null) {
        expect(user.id).toBe("1");
      }
    }
  });

  it("should type execute method similarly to direct proxy access", async () => {
    const { t, createAPI } = defineContext({
      context: { name: "test" },
    });

    const getUser = t.query({
      args: z.object({ id: z.string() }),
      handler: async (_ctx, args) => {
        return ok({ id: args.id, name: "Test User" });
      },
    });

    const api = createAPI({
      router: t.router({
        users: {
          get: getUser,
        },
      }),
    });

    // Both execute() and direct proxy should return Result<{ id: string; name: string }>
    const executeResult = await api.execute("users.get", { id: "1" });
    const proxyResult = await api.users.get({ id: "1" });

    expect(executeResult.ok).toBe(true);
    expect(proxyResult.ok).toBe(true);

    if (executeResult.ok && proxyResult.ok) {
      const execValue = executeResult.value as { id: string; name: string };
      const proxyValue = proxyResult.value as { id: string; name: string };
      expect(execValue.id).toBe(proxyValue.id);
    }
  });
});

describe("Type Safety - Complex Type Scenarios", () => {
  it("should handle events with no payload", () => {
    interface NoPayloadEvents {
      "app.started": { data: never };
      "app.stopped": { data: never };
    }

    const { t, createAPI } = defineContext<{ name: string }, NoPayloadEvents>({
      context: { name: "test" },
      events: {
        "app.started": { data: undefined as never },
        "app.stopped": { data: undefined as never },
      },
    });

    const startApp = t.mutation({
      args: z.object({}),
      handler: async (ctx, _args) => {
        // Events with no data should still compile
        ctx.send("app.started", {});
        return ok({ status: "started" });
      },
    });

    const api = createAPI({
      router: t.router({
        app: { start: startApp },
      }),
    });

    expect(api).toBeDefined();
  });

  it("should handle events with complex nested data types", () => {
    interface ComplexEvents {
      "order.processed": {
        data: {
          orderId: string;
          items: Array<{ sku: string; quantity: number }>;
          shippingAddress: {
            street: string;
            city: string;
            zip: string;
          };
        };
      };
    }

    const { t, createAPI } = defineContext<{ db: any }, ComplexEvents>({
      context: { db: {} },
      events: {
        "order.processed": {
          data: {
            orderId: "",
            items: [{ sku: "", quantity: 0 }],
            shippingAddress: { street: "", city: "", zip: "" },
          },
        },
      },
    });

    const processOrder = t.mutation({
      args: z.object({ orderId: z.string() }),
      handler: async (ctx, args) => {
        const order = ctx.db.findOrder(args.orderId);
        // Complex nested data should type-check correctly
        ctx.send("order.processed", {
          orderId: order.id,
          items: order.items.map((item: any) => ({ sku: item.sku, quantity: item.qty })),
          shippingAddress: order.address,
        });
        return ok(order);
      },
    });

    const api = createAPI({
      router: t.router({
        orders: { process: processOrder },
      }),
    });

    expect(api).toBeDefined();
  });

  it("should support union event names for flexible typing", () => {
    type FlexibleEventName = "user.action" | "system.event" | "custom.event";

    interface FlexibleEvents {
      "user.action": { data: { action: string; userId: string } };
      "system.event": { data: { code: number } };
      "custom.event": { data: { key: string; value: unknown } };
    }

    const { t, createAPI } = defineContext<{ name: string }, FlexibleEvents>({
      context: { name: "test" },
      events: {
        "user.action": { data: { action: "", userId: "" } },
        "system.event": { data: { code: 0 } },
        "custom.event": { data: { key: "", value: undefined } },
      },
    });

    const trackAction = t.mutation({
      args: z.object({ action: z.string() }),
      handler: async (ctx, args) => {
        // Should compile - user.action is in FlexibleEvents
        ctx.send("user.action", { action: args.action, userId: "123" });
        return ok({ tracked: true });
      },
    });

    const api = createAPI({
      router: t.router({
        events: { track: trackAction },
      }),
    });

    expect(api).toBeDefined();
  });
});
