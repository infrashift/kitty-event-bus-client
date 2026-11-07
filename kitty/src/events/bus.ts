import type { CNCFCloudEvent } from './cloudevents';
import type { NatsEnvelope } from './mockNatsBus';

/**
 * What `<KittyApp>` needs from an event bus. Two implementations ship with the package:
 *
 * - `MockNatsBus` — an in-browser fake NATS server (the default; used by the demo).
 * - `natsConnectionBus(nc)` — an adapter over a real NATS WebSocket connection
 *   (`wsconnect()` from `@nats-io/nats-core`).
 *
 * Anything else (a Kafka bridge, an SSE stream, a WebSocket you own) works too: implement these two methods.
 */
export interface CloudEventBus {
  /** Subscribe to a NATS subject pattern (`*` and `>` wildcards). Returns an unsubscribe function. */
  subscribe(subjectPattern: string, callback: (envelope: NatsEnvelope) => void): () => void;
  /** Publish a CloudEvent (used by the Send CloudEvent / Critical Alert / AUTO buttons and the inspector). */
  publish(subject: string, cloudEvent: CNCFCloudEvent): unknown;
}
