import type { EventRegistry, EventPayload } from "../types.js";

// ============================================
// Event System
// ============================================

export class EventEmitter<Events extends EventRegistry = EventRegistry> {
  private listeners: Map<string, Set<(payload: EventPayload) => void | Promise<void>>> = new Map();

  constructor(events?: Events) {
    // Events parameter is optional - can be used for type checking later
  }

  on<EventName extends keyof Events>(
    event: EventName,
    handler: (payload: EventPayload) => void | Promise<void>
  ): void {
    if (!this.listeners.has(event as string)) {
      this.listeners.set(event as string, new Set());
    }
    this.listeners.get(event as string)!.add(handler as any);
  }

  off<EventName extends keyof Events>(
    event: EventName,
    handler: (payload: EventPayload) => void | Promise<void>
  ): void {
    const handlers = this.listeners.get(event as string);
    if (handlers) {
      handlers.delete(handler as any);
    }
  }

  async emit<EventName extends keyof Events>(
    event: EventName,
    data: Events[EventName]["data"]
  ): Promise<void> {
    const handlers = this.listeners.get(event as string);
    if (!handlers) return;

    const payload: EventPayload = { name: event as string, data };
    const promises: Promise<void>[] = [];

    for (const handler of handlers) {
      const result = handler(payload);
      if (result instanceof Promise) {
        promises.push(result);
      }
    }

    await Promise.all(promises);
  }
}

// ============================================
// defineEvents Helper
// ============================================

export function defineEvents<Events extends EventRegistry>(
  events: Events
): Events {
  return events;
}

// ============================================
// Event Handler Types
// ============================================

export type EventHandler<Events extends EventRegistry, EventName extends keyof Events> = (
  event: { name: EventName; data: Events[EventName]["data"] }
) => void | Promise<void>;