import { describe, it, expect } from "vitest";
import { defineContext, defineEvents, ok, err } from "../src/index";
import { z } from "zod";

describe("defineContext", () => {
  it("should create t query builder", () => {
    const { t } = defineContext({
      context: { name: "test" },
    });

    expect(t).toBeDefined();
    expect(typeof t.query).toBe("function");
    expect(typeof t.mutation).toBe("function");
    expect(typeof t.router).toBe("function");
  });

  it("should create createAPI function", () => {
    const { t, createAPI } = defineContext({
      context: { name: "test" },
    });

    expect(typeof createAPI).toBe("function");
  });

  it("should support chained hooks", () => {
    const { t } = defineContext({
      context: { name: "test" },
    });

    const myQuery = t
      .query({
        args: z.object({ id: z.number() }),
        handler: async (ctx, args) => {
          return ok({ id: args.id, name: ctx.name });
        },
      })
      .beforeInvoke((ctx, args) => {
        // before hook
      })
      .onSuccess((ctx, args, data) => {
        // success hook
      });

    expect(myQuery.type).toBe("query");
    expect(typeof myQuery.beforeInvoke).toBe("function");
    expect(typeof myQuery.onSuccess).toBe("function");
  });

  it("should create API with router", async () => {
    const { t, createAPI } = defineContext({
      context: { db: { find: () => ({ id: 1, name: "test" }) } },
    });

    const getUser = t.query({
      args: z.object({ id: z.number() }),
      handler: async (ctx, args) => {
        const user = ctx.db.find();
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

    expect(api).toBeDefined();
    expect(api.router).toBeDefined();
    expect(api.execute).toBeDefined();
  });
});

describe("createAPI", () => {
  it("should execute a query using execute method", async () => {
    const { t, createAPI } = defineContext({
      context: { db: { find: () => ({ id: 1, name: "test" }) } },
    });

    const getUser = t.query({
      args: z.object({ id: z.number() }),
      handler: async (ctx, args) => {
        return ok({ id: args.id, name: "test" });
      },
    });

    const api = createAPI({
      router: t.router({
        users: {
          get: getUser,
        },
      }),
    });

    // Old syntax still works
    const result = await api.execute("users.get", { id: 1 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ id: 1, name: "test" });
    }
  });

  it("should execute a query using direct proxy access", async () => {
    const { t, createAPI } = defineContext({
      context: { db: { find: () => ({ id: 1, name: "test" }) } },
    });

    const getUser = t.query({
      args: z.object({ id: z.number() }),
      handler: async (ctx, args) => {
        return ok({ id: args.id, name: "test" });
      },
    });

    const api = createAPI({
      router: t.router({
        users: {
          get: getUser,
        },
      }),
    });

    // New direct syntax: api.users.get({})
    const result = await api.users.get({ id: 1 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ id: 1, name: "test" });
    }
  });

  it("should return error for unknown route", async () => {
    const { t, createAPI } = defineContext({
      context: { name: "test" },
    });

    const api = createAPI({
      router: t.router({}),
    });

    const result = await api.execute("unknown.route", {});

    expect(result.ok).toBe(false);
  });

  it("should return error for unknown route via direct access", async () => {
    const { t, createAPI } = defineContext({
      context: { name: "test" },
    });

    const api = createAPI({
      router: t.router({}),
    });

    // Accessing a non-existent route should return undefined function
    const unknownRoute = (api as any).unknown?.route;
    expect(unknownRoute).toBeUndefined();
  });
});

describe("ctx.send", () => {
  it("should emit events after successful handler execution", async () => {
    const { t, createAPI } = defineContext({
      context: { db: { create: (data: any) => ({ id: 1, ...data }) } },
      events: {
        "user.created": { data: {} as { id: number; name: string } },
      } as any,
    });

    const createUser = t.mutation({
      args: z.object({ name: z.string() }),
      handler: async (ctx, args) => {
        const user = ctx.db.create(args);
        ctx.send("user.created", { id: user.id, name: user.name });
        return ok(user);
      },
    });

    const api = createAPI({
      router: t.router({
        users: { create: createUser },
      }),
    });

    const executor = api;
    const result = await executor.execute("users.create", { name: "John" });

    expect(result.ok).toBe(true);
    const events = executor.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("user.created");
    expect(events[0].data).toEqual({ id: 1, name: "John" });
    expect(events[0].namespace).toBe("default");
    expect(events[0].timestamp).toBeDefined();
  });

  it("should discard events when handler fails", async () => {
    const { t, createAPI } = defineContext({
      context: { db: { create: (data: any) => ({ id: 1, ...data }) } },
      events: {
        "user.created": { data: {} as { id: number; name: string } },
      } as any,
    });

    const createUser = t.mutation({
      args: z.object({ name: z.string() }),
      handler: async (ctx, args) => {
        ctx.send("user.created", { id: 1, name: args.name });
        return err("USER_CREATION_FAILED" as any, "Failed to create user");
      },
    });

    const api = createAPI({
      router: t.router({
        users: { create: createUser },
      }),
    });

    const executor = api;
    const result = await executor.execute("users.create", { name: "John" });

    expect(result.ok).toBe(false);
    const events = executor.getEvents();
    expect(events).toHaveLength(0);
  });

  it("should discard events when handler throws", async () => {
    const { t, createAPI } = defineContext({
      context: { db: { create: (data: any) => ({ id: 1, ...data }) } },
      events: {
        "user.created": { data: {} as { id: number; name: string } },
      } as any,
    });

    const createUser = t.mutation({
      args: z.object({ name: z.string() }),
      handler: async (ctx, args) => {
        ctx.send("user.created", { id: 1, name: args.name });
        throw new Error("Database error");
      },
    });

    const api = createAPI({
      router: t.router({
        users: { create: createUser },
      }),
    });

    const executor = api;
    const result = await executor.execute("users.create", { name: "John" });

    expect(result.ok).toBe(false);
    const events = executor.getEvents();
    expect(events).toHaveLength(0);
  });

  it("should emit multiple events", async () => {
    const { t, createAPI } = defineContext({
      context: { db: { create: (data: any) => ({ id: 1, ...data }) } },
      events: {
        "user.created": { data: {} as { id: number } },
        "email.sent": { data: {} as { to: string } },
      } as any,
    });

    const createUser = t.mutation({
      args: z.object({ name: z.string(), email: z.string() }),
      handler: async (ctx, args) => {
        const user = ctx.db.create(args);
        ctx.send("user.created", { id: user.id });
        ctx.send("email.sent", { to: args.email });
        return ok(user);
      },
    });

    const api = createAPI({
      router: t.router({
        users: { create: createUser },
      }),
    });

    const executor = api;
    await executor.execute("users.create", { name: "John", email: "john@example.com" });

    const events = executor.getEvents();
    expect(events).toHaveLength(2);
    expect(events[0].name).toBe("user.created");
    expect(events[1].name).toBe("email.sent");
  });

  it("should support namespace option", async () => {
    const { t, createAPI } = defineContext({
      context: { db: { create: (data: any) => ({ id: 1, ...data }) } },
      events: {
        "order.created": { data: {} as { id: number } },
      } as any,
    });

    const createOrder = t.mutation({
      args: z.object({ item: z.string() }),
      handler: async (ctx, args) => {
        const order = ctx.db.create(args);
        ctx.send("order.created", { id: order.id }, { namespace: "ecommerce" });
        return ok(order);
      },
    });

    const api = createAPI({
      router: t.router({
        orders: { create: createOrder },
      }),
    });

    const executor = api;
    await executor.execute("orders.create", { item: "Widget" });

    const events = executor.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0].namespace).toBe("ecommerce");
  });
});

describe("t.on", () => {
  it("should register global event listener", async () => {
    const { t, createAPI } = defineContext({
      context: { db: { create: (data: any) => ({ id: 1, ...data }) } },
      events: {
        "user.created": { data: {} as { id: number } },
      } as any,
    });

    const receivedEvents: any[] = [];
    const unsubscribe = t.on("user.created" as any, (_ctx, event) => {
      receivedEvents.push(event);
    });

    const createUser = t.mutation({
      args: z.object({ name: z.string() }),
      handler: async (ctx, args) => {
        const user = ctx.db.create(args);
        ctx.send("user.created", { id: user.id });
        return ok(user);
      },
    });

    const api = createAPI({
      router: t.router({
        users: { create: createUser },
      }),
    });

    await api.execute("users.create", { name: "John" });

    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0].name).toBe("user.created");
    expect(receivedEvents[0].data).toEqual({ id: 1 });

    unsubscribe();
  });

  it("should return unsubscribe function", async () => {
    const { t, createAPI } = defineContext({
      context: { db: { create: (data: any) => ({ id: 1, ...data }) } },
      events: {
        "user.created": { data: {} as { id: number } },
      } as any,
    });

    const receivedEvents: any[] = [];
    const unsubscribe = t.on("user.created" as any, (_ctx, event) => {
      receivedEvents.push(event);
    });

    const createUser = t.mutation({
      args: z.object({ name: z.string() }),
      handler: async (ctx, args) => {
        const user = ctx.db.create(args);
        ctx.send("user.created", { id: user.id });
        return ok(user);
      },
    });

    const api = createAPI({
      router: t.router({
        users: { create: createUser },
      }),
    });

    await api.execute("users.create", { name: "John" });
    expect(receivedEvents).toHaveLength(1);

    // Unsubscribe
    unsubscribe();

    await api.execute("users.create", { name: "Jane" });
    expect(receivedEvents).toHaveLength(1); // Still 1, not 2
  });

  it("should support wildcard pattern user.*", async () => {
    const { t, createAPI } = defineContext({
      context: { db: { create: (data: any) => ({ id: 1, ...data }) } },
      events: {
        "user.created": { data: {} as { id: number } },
        "user.updated": { data: {} as { id: number } },
        "user.deleted": { data: {} as { id: number } },
        "post.created": { data: {} as { id: number } },
      } as any,
    });

    const receivedEvents: any[] = [];
    t.on("user.*" as any, (_ctx, event) => {
      receivedEvents.push(event);
    });

    const createUser = t.mutation({
      args: z.object({ name: z.string() }),
      handler: async (ctx, args) => {
        const user = ctx.db.create(args);
        ctx.send("user.created", { id: user.id });
        return ok(user);
      },
    });

    const updateUser = t.mutation({
      args: z.object({ id: z.number(), name: z.string() }),
      handler: async (ctx, args) => {
        ctx.send("user.updated", { id: args.id });
        return ok({ id: args.id, name: args.name });
      },
    });

    const createPost = t.mutation({
      args: z.object({ title: z.string() }),
      handler: async (ctx, args) => {
        const post = ctx.db.create(args);
        ctx.send("post.created", { id: post.id });
        return ok(post);
      },
    });

    const api = createAPI({
      router: t.router({
        users: { create: createUser, update: updateUser },
        posts: { create: createPost },
      }),
    });

    await api.execute("users.create", { name: "John" });
    await api.execute("users.update", { id: 1, name: "Jane" });
    await api.execute("posts.create", { title: "Hello" });

    // Should only receive user.* events, not post.*
    expect(receivedEvents).toHaveLength(2);
    expect(receivedEvents[0].name).toBe("user.created");
    expect(receivedEvents[1].name).toBe("user.updated");
  });

  it("should support wildcard pattern *", async () => {
    const { t, createAPI } = defineContext({
      context: { db: { create: (data: any) => ({ id: 1, ...data }) } },
      events: {
        "user.created": { data: {} as { id: number } },
        "post.created": { data: {} as { id: number } },
      } as any,
    });

    const receivedEvents: any[] = [];
    t.on("*" as any, (_ctx, event) => {
      receivedEvents.push(event);
    });

    const createUser = t.mutation({
      args: z.object({ name: z.string() }),
      handler: async (ctx, args) => {
        const user = ctx.db.create(args);
        ctx.send("user.created", { id: user.id });
        return ok(user);
      },
    });

    const createPost = t.mutation({
      args: z.object({ title: z.string() }),
      handler: async (ctx, args) => {
        const post = ctx.db.create(args);
        ctx.send("post.created", { id: post.id });
        return ok(post);
      },
    });

    const api = createAPI({
      router: t.router({
        users: { create: createUser },
        posts: { create: createPost },
      }),
    });

    await api.execute("users.create", { name: "John" });
    await api.execute("posts.create", { title: "Hello" });

    expect(receivedEvents).toHaveLength(2);
  });
});