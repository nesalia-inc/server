import type { PendingEvent } from "../types.js";
import type { EventEmitter } from "./emitter.js";

export interface PendingEventQueue {
  enqueue(event: PendingEvent): { eventName: string; data: unknown; processed: boolean; timestamp: string; namespace: string };
  flush(emitter: EventEmitter | undefined): Promise<void>;
  clear(): void;
  isEmpty(): boolean;
  events(): PendingEvent[];
  size(): number;
}

export const createPendingEventQueue = (): PendingEventQueue => {
  let _events: PendingEvent[] = [];

  return {
    enqueue: (event: PendingEvent) => {
      _events.push(event);
      return {
        eventName: event.name,
        data: event.data,
        processed: true,
        timestamp: event.timestamp,
        namespace: event.namespace,
      };
    },

    flush: async (emitter: EventEmitter | undefined): Promise<void> => {
      if (!emitter || _events.length === 0) {
        _events = [];
        return;
      }
      for (const event of _events) {
        await emitter.emit(event.name, event.data, event.namespace);
      }
      _events = [];
    },

    clear: (): void => {
      _events = [];
    },

    isEmpty: (): boolean => {
      return _events.length === 0;
    },

    events: (): PendingEvent[] => {
      return [..._events];
    },

    size: (): number => {
      return _events.length;
    },
  };
};