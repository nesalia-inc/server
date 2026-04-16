import  { type PendingEvent } from "../types.js";
import  { type EventEmitter } from "./emitter.js";
import { ok, err, unit, error, type Result, type Unit } from "@deessejs/fp";

export interface PendingEventQueue {
  enqueue(event: PendingEvent): Result<{ eventName: string; data: unknown; processed: boolean; timestamp: string; namespace: string }>;
  flush(emitter: EventEmitter | undefined): Promise<Result<Unit>>;
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
      return ok({
        eventName: event.name,
        data: event.data,
        processed: true,
        timestamp: event.timestamp,
        namespace: event.namespace,
      });
    },

    flush: async (emitter: EventEmitter | undefined): Promise<Result<Unit>> => {
      if (!emitter || _events.length === 0) {
        _events = [];
        return ok(unit);
      }
      let processedCount = 0;
      try {
        for (const event of _events) {
          const result = await emitter.emit(event.name, event.data, event.namespace);
          if (!result.ok) {
            _events = _events.slice(processedCount);
            return result;
          }
          processedCount++;
        }
        _events = [];
        return ok(unit);
      } catch (error_) {
        _events = _events.slice(processedCount);
        const errMsg = error_ instanceof Error ? error_.message : String(error_);
        const fpErr = error({ name: "INTERNAL_ERROR", message: (_: unknown) => errMsg })({ message: errMsg });
        return err(fpErr);
      }
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