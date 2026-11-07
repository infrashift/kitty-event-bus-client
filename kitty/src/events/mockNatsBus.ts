import type { CNCFCloudEvent, KittyEventPayload } from './cloudevents';
import type { CloudEventBus } from './bus';

export interface NatsEnvelope {
  seq: number;
  subject: string;
  receivedAt: string;
  cloudEvent: CNCFCloudEvent;
}

export type NatsSubscriptionCallback = (envelope: NatsEnvelope) => void;

interface SubscriptionEntry {
  id: number;
  subjectPattern: string;
  callback: NatsSubscriptionCallback;
}

/**
 * Matches NATS subject tokens supporting `*` (single token) and `>` (tail wildcard).
 */
export function matchNatsSubject(pattern: string, subject: string): boolean {
  if (pattern === '>' || pattern === subject) return true;
  const pTokens = pattern.split('.');
  const sTokens = subject.split('.');

  for (let i = 0; i < pTokens.length; i++) {
    const pt = pTokens[i];
    if (pt === '>') return true;
    if (i >= sTokens.length) return false;
    if (pt !== '*' && pt !== sTokens[i]) return false;
  }
  return pTokens.length === sTokens.length;
}

/**
 * In-Browser Mock NATS Server & JetStream Event Bus
 */
export class MockNatsBus implements CloudEventBus {
  private subscriptions: SubscriptionEntry[] = [];
  private nextSubId = 1;
  private seq = 0;

  /**
   * Subscribe to a NATS subject pattern (e.g., `cncf.>`).
   */
  subscribe(subjectPattern: string, callback: NatsSubscriptionCallback): () => void {
    const id = this.nextSubId++;
    this.subscriptions.push({ id, subjectPattern, callback });
    return () => {
      this.subscriptions = this.subscriptions.filter((s) => s.id !== id);
    };
  }

  /**
   * Publish a CNCF CloudEvent v1.0 packet to a NATS subject.
   */
  publish(subject: string, cloudEvent: CNCFCloudEvent): NatsEnvelope {
    this.seq += 1;
    const envelope: NatsEnvelope = {
      seq: this.seq,
      subject,
      receivedAt: new Date().toISOString(),
      cloudEvent,
    };

    for (const sub of this.subscriptions) {
      if (matchNatsSubject(sub.subjectPattern, subject)) {
        sub.callback(envelope);
      }
    }
    return envelope;
  }
}

/**
 * Returns a subject to publish to that the subscription `subscriptionPattern` will receive.
 * If `preferred` already matches, it's used as-is. Otherwise wildcards in the pattern are
 * filled in from `preferred` (minus its first token, e.g. `cncf`), so a demo preset like
 * `cncf.alerts.gpu.thermal` published under `prod.alerts.>` becomes `prod.alerts.alerts.gpu.thermal`.
 */
export function subjectWithinSubscription(subscriptionPattern: string, preferred: string): string {
  if (matchNatsSubject(subscriptionPattern, preferred)) return preferred;
  const tail = preferred.split('.').slice(1);
  const out: string[] = [];
  for (const token of subscriptionPattern.split('.')) {
    if (token === '>') {
      out.push(...(tail.length ? tail : ['kitty']));
      break;
    }
    out.push(token === '*' ? tail.shift() ?? 'kitty' : token);
  }
  return out.join('.');
}

/**
 * NATS Event Bus Consumer that subscribes to `cncf.>`, records the full CloudEvent
 * envelope for telemetry inspection, and extracts only the event message payload
 * required by the `<KittySpeaker />` UI component.
 */
export function createKittyNatsConsumer(
  bus: CloudEventBus,
  subjectFilter: string,
  handlers: {
    onKittyMessage: (payload: KittyEventPayload, rawEnvelope: NatsEnvelope) => void;
  }
): () => void {
  return bus.subscribe(subjectFilter, (envelope) => {
    const { cloudEvent, subject } = envelope;
    const messageText =
      typeof cloudEvent.data?.message === 'string' && cloudEvent.data.message.trim().length > 0
        ? cloudEvent.data.message.trim()
        : `Received CloudEvent ${cloudEvent.type} from ${cloudEvent.source}`;

    const kittyPayload: KittyEventPayload = {
      id: cloudEvent.id,
      natsSubject: subject,
      type: cloudEvent.type,
      source: cloudEvent.source,
      severity: cloudEvent.data?.severity || 'info',
      message: messageText,
      time: cloudEvent.time,
    };

    handlers.onKittyMessage(kittyPayload, envelope);
  });
}
