import { describe, it, expect } from "vitest";
import { defineContext, createPublicAPI, ok } from "@deessejs/server";
import { createNextHandler } from "../src/index";
import { z } from "zod";

describe("createNextHandler", () => {
  it("should create a Next.js handler object", () => {
    const { t, createAPI } = defineContext({
      context: { name: "test" },
    });

    const getUser = t.query({
      args: z.object({ id: z.number() }),
      handler: async (ctx, args) => {
        return ok({ id: args.id, name: ctx.name });
      },
    });

    const api = createAPI({
      router: t.router({
        users: {
          get: getUser,
        },
      }),
    });

    const client = createPublicAPI(api);
    const handler = createNextHandler(client);

    expect(handler).toBeDefined();
    expect(typeof handler.GET).toBe("function");
    expect(typeof handler.POST).toBe("function");
    expect(typeof handler.PUT).toBe("function");
    expect(typeof handler.PATCH).toBe("function");
    expect(typeof handler.DELETE).toBe("function");
    expect(typeof handler.OPTIONS).toBe("function");
  });
});
