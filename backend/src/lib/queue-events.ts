import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { createClient } from "redis";
import { config } from "../config";

export const queueEvents = new EventEmitter();
const channel = "mediaccess:queue.changed";
const instanceId = randomUUID();
const publisher = createClient({ url: config.redisUrl });
const subscriber = publisher.duplicate();

publisher.on("error", (error) => console.error("Redis queue publisher error", error));
subscriber.on("error", (error) => console.error("Redis queue subscriber error", error));

export async function connectQueueEventBus() {
  await Promise.all([publisher.connect(), subscriber.connect()]);
  await subscriber.subscribe(channel, (message) => {
    try {
      const event = JSON.parse(message) as { tenantId?: unknown; instanceId?: unknown };
      if (event.instanceId !== instanceId && typeof event.tenantId === "string") {
        queueEvents.emit("queue.changed", event.tenantId);
      }
    } catch (error) {
      console.error("Invalid Redis queue event", error);
    }
  });
}

export function notifyQueueChanged(tenantId: string) {
  queueEvents.emit("queue.changed", tenantId);
  void publisher.publish(channel, JSON.stringify({ tenantId, instanceId }))
    .catch((error: unknown) => console.error("Redis queue event publish failed", error));
}