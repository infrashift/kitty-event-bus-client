import {
  CLOUDEVENT_PRESETS,
  buildCloudEventFromPreset,
  type CNCFCloudEvent,
  type CloudEventPreset,
  type KittyEventPayload,
} from './cloudevents';

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
export class MockNatsBus {
  private subscriptions: SubscriptionEntry[] = [];
  private nextSubId = 1;
  private seq = 0;
  private presetCursor = 0;
  private autoStreamTimer: ReturnType<typeof setInterval> | null = null;

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

  /**
   * Publishes the next simulated CloudEvent preset from the rotating pool.
   */
  publishNextPreset(customOverrides?: Partial<CloudEventPreset>): NatsEnvelope {
    const preset = CLOUDEVENT_PRESETS[this.presetCursor % CLOUDEVENT_PRESETS.length];
    this.presetCursor += 1;
    const { natsSubject, cloudEvent } = buildCloudEventFromPreset(preset, customOverrides);
    return this.publish(natsSubject, cloudEvent);
  }

  /**
   * Publishes a specific preset by index.
   */
  publishPresetByIndex(index: number): NatsEnvelope {
    const safeIdx = Math.abs(index) % CLOUDEVENT_PRESETS.length;
    const preset = CLOUDEVENT_PRESETS[safeIdx];
    const { natsSubject, cloudEvent } = buildCloudEventFromPreset(preset);
    return this.publish(natsSubject, cloudEvent);
  }

  /**
   * Starts auto-streaming simulated CNCF CloudEvents on an interval.
   */
  startAutoStream(intervalMs = 12000): void {
    this.stopAutoStream();
    this.autoStreamTimer = setInterval(() => {
      this.publishNextPreset();
    }, intervalMs);
  }

  /**
   * Stops the auto-stream interval timer.
   */
  stopAutoStream(): void {
    if (this.autoStreamTimer !== null) {
      clearInterval(this.autoStreamTimer);
      this.autoStreamTimer = null;
    }
  }
}

/**
 * NATS Event Bus Consumer that subscribes to `cncf.>`, records the full CloudEvent
 * envelope for telemetry inspection, and extracts only the event message payload
 * required by the `<KittySpeaker />` UI component.
 */
export function createKittyNatsConsumer(
  bus: MockNatsBus,
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
