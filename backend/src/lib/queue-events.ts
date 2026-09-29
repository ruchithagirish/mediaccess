import { EventEmitter } from "events";

export const queueEvents = new EventEmitter();

export function notifyQueueChanged(tenantId: string) {
  queueEvents.emit("queue.changed", tenantId);
}