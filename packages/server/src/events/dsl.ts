/**
 * Event DSL (Domain-Specific Language)
 *
 * This module provides a fluent API for defining events with better type safety
 * and namespace support.
 */

import { z } from "zod";

/**
 * Event definition interface
 */
export interface EventDefinition {
  data?: unknown;
}

/**
 * Wraps event args in the standard event structure.
 *
 * @example
 * const eventDef = event({ args: z.object({ id: z.number(), name: z.string() }) });
 * // Returns: { data: z.object({ id: z.number(), name: z.string() }) }
 */
export function event({ args }: { args: z.ZodType }): EventDefinition {
  return { data: args };
}

/**
 * Event namespace helper type - represents an event with data
 */
export interface EventWithData<T = unknown> {
  data: T;
}

/**
 * Groups events under a namespace without prefixing the keys.
 * The outer key in defineEvents provides the namespace context.
 *
 * @example
 * defineEvents({
 *   user: eventNamespace({ name: "user", events: {
 *     created: event({ args: { id: number } }),
 *     updated: event({ args: { id: number, changes: Record<string, unknown> } }),
 *   }),
 *   email: eventNamespace({ name: "email", events: {
 *     sent: event({ args: { to: string, template: string, subject: string } }),
 *   }),
 * });
 *
 * This produces an event registry with nested access: events.user.created
 */
export function eventNamespace<
  N extends string,
  Events extends Record<string, EventDefinition>
>(
  config: { name: N; events: Events }
): Events {
  // Simply return the events object - the outer key provides namespace context
  return config.events;
}

/**
 * @deprecated Use eventNamespace instead
 */
export const eventsNamespace = eventNamespace;
