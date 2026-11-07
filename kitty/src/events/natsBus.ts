import type { CNCFCloudEvent, CloudEventData, EventSeverity } from './cloudevents';
import type { NatsEnvelope } from './mockNatsBus';
import type { CloudEventBus } from './bus';

/*
 * Adapter between a real NATS connection and KITTY.
 *
 * Typed structurally so this package has NO dependency on a NATS client: pass the connection
 * returned by `wsconnect()` from `@nats-io/nats-core` (nats.js v3), or anything shaped like it.
 */

/** The subset of a nats.js `MsgHdrs` this adapter reads. */
export interface NatsHeadersLike {
  keys(): string[];
  get(key: string): string;
}

/** The subset of a nats.js `Msg` this adapter reads. */
export interface NatsMsgLike {
  subject: string;
  data: Uint8Array;
  headers?: NatsHeadersLike;
}

/** The subset of a nats.js `NatsConnection` this adapter uses. */
export interface NatsConnectionLike {
  subscribe(
    subject: string,
    opts: { callback: (err: Error | null, msg: NatsMsgLike) => void }
  ): { unsubscribe(): void };
  publish(subject: string, payload?: string | Uint8Array): void;
}

export interface NatsConnectionBusOptions {
  /** Called when a subscription errors or a message can't be decoded. Default: `console.warn`. */
  onError?: (error: unknown) => void;
}

const SEVERITIES: EventSeverity[] = ['info', 'warning', 'error', 'critical'];
const textDecoder = new TextDecoder();

function toSeverity(value: unknown): EventSeverity | undefined {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if ((SEVERITIES as string[]).includes(v)) return v as EventSeverity;
  // Common aliases from other alerting systems.
  if (v === 'warn') return 'warning';
  if (v === 'err' || v === 'fatal') return 'error';
  if (v === 'crit' || v === 'emergency' || v === 'alert') return 'critical';
  return undefined;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Normalizes any CloudEvent `data` into the `{ message, severity, … }` shape KITTY speaks. */
function toKittyData(data: unknown, fallbackSeverity: EventSeverity | undefined, fallbackMessage: string): CloudEventData {
  if (isObject(data)) {
    const message =
      typeof data.message === 'string' && data.message.trim()
        ? data.message
        : typeof data.text === 'string' && data.text.trim()
          ? data.text
          : typeof data.summary === 'string' && data.summary.trim()
            ? data.summary
            : fallbackMessage;
    return {
      ...(data as Partial<CloudEventData>),
      message,
      severity: toSeverity(data.severity) ?? toSeverity(data.level) ?? fallbackSeverity ?? 'info',
    };
  }
  const message = typeof data === 'string' && data.trim() ? data : fallbackMessage;
  return { message, severity: fallbackSeverity ?? 'info' };
}

/**
 * Turns one NATS message into a CloudEvents v1.0 envelope, following the
 * [CloudEvents NATS protocol binding](https://github.com/cloudevents/spec/blob/main/cloudevents/bindings/nats-protocol-binding.md):
 *
 * - **Structured mode**: the payload is a JSON CloudEvent (`{"specversion":"1.0", …, "data": {…}}`).
 * - **Binary mode**: attributes travel as `ce-*` headers (`ce-specversion`, `ce-type`, `ce-source`, `ce-id`, …)
 *   and the payload is the event `data`.
 * - **Anything else** (plain JSON or text) is wrapped in a synthetic CloudEvent so KITTY still speaks it.
 *
 * Severity comes from `data.severity` (or `data.level`), else a `severity` extension attribute
 * (`ce-severity` header / top-level `severity`), else `info`.
 */
export function decodeNatsCloudEvent(msg: NatsMsgLike): CNCFCloudEvent {
  const text = textDecoder.decode(msg.data);
  const now = new Date().toISOString();
  const fallbackId = `nats-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // Binary mode: ce-* headers (case-insensitive).
  const ceHeaders: Record<string, string> = {};
  for (const key of msg.headers?.keys() ?? []) {
    const lower = key.toLowerCase();
    if (lower.startsWith('ce-')) ceHeaders[lower.slice(3)] = msg.headers!.get(key);
  }
  if (ceHeaders.specversion) {
    const type = ceHeaders.type || 'io.nats.message';
    const source = ceHeaders.source || `nats:${msg.subject}`;
    const json = parseJson(text);
    return {
      specversion: '1.0',
      id: ceHeaders.id || fallbackId,
      source,
      type,
      subject: ceHeaders.subject,
      time: ceHeaders.time || now,
      datacontenttype: 'application/json',
      data: toKittyData(isObject(json) ? json : text, toSeverity(ceHeaders.severity), `Received CloudEvent ${type} from ${source}`),
    };
  }

  const json = parseJson(text);

  // Structured mode.
  if (isObject(json) && typeof json.specversion === 'string') {
    const type = typeof json.type === 'string' ? json.type : 'io.nats.message';
    const source = typeof json.source === 'string' ? json.source : `nats:${msg.subject}`;
    let data: unknown = json.data;
    if (data === undefined && typeof json.data_base64 === 'string') {
      try {
        // atob() yields one char per byte; decode those bytes as UTF-8.
        data = textDecoder.decode(Uint8Array.from(atob(json.data_base64), (c) => c.charCodeAt(0)));
      } catch {}
    }
    if (typeof data === 'string') {
      const parsed = parseJson(data);
      if (isObject(parsed)) data = parsed;
    } else if (data !== undefined && data !== null && !isObject(data)) {
      data = typeof data === 'number' || typeof data === 'boolean' ? String(data) : JSON.stringify(data);
    }
    return {
      specversion: '1.0',
      id: typeof json.id === 'string' ? json.id : fallbackId,
      source,
      type,
      subject: typeof json.subject === 'string' ? json.subject : undefined,
      time: typeof json.time === 'string' ? json.time : now,
      datacontenttype: 'application/json',
      data: toKittyData(data, toSeverity(json.severity), `Received CloudEvent ${type} from ${source}`),
    };
  }

  // Not a CloudEvent: wrap it.
  return {
    specversion: '1.0',
    id: fallbackId,
    source: `nats:${msg.subject}`,
    type: 'io.nats.message',
    time: now,
    datacontenttype: 'application/json',
    // Only objects are treated as structured data; anything else (numbers, arrays, null, text) is spoken as sent.
    data: toKittyData(isObject(json) ? json : text, undefined, `Message on ${msg.subject}`),
  };
}

/**
 * Wraps a live NATS connection as a `CloudEventBus` for `<KittyApp :bus="…">`.
 *
 *   import { wsconnect } from '@nats-io/nats-core';
 *   import { natsConnectionBus } from 'kitty-event-bus-client';
 *   const nc = await wsconnect({ servers: 'wss://nats.example.com:443' });
 *   mountKitty('#cat', { bus: natsConnectionBus(nc), subject: 'cncf.>' });
 *
 * Publishing (the app's Send / Critical Alert / AUTO buttons and the inspector's publisher)
 * sends structured-mode JSON CloudEvents to the same server.
 */
export function natsConnectionBus(nc: NatsConnectionLike, options: NatsConnectionBusOptions = {}): CloudEventBus {
  const onError = options.onError ?? ((e: unknown) => console.warn('[kitty] NATS:', e));
  let seq = 0;

  return {
    subscribe(subjectPattern, callback) {
      const sub = nc.subscribe(subjectPattern, {
        callback: (err, msg) => {
          if (err) {
            onError(err);
            return;
          }
          try {
            const envelope: NatsEnvelope = {
              seq: ++seq,
              subject: msg.subject,
              receivedAt: new Date().toISOString(),
              cloudEvent: decodeNatsCloudEvent(msg),
            };
            callback(envelope);
          } catch (e) {
            onError(e);
          }
        },
      });
      return () => sub.unsubscribe();
    },
    publish(subject, cloudEvent) {
      try {
        nc.publish(subject, JSON.stringify(cloudEvent));
      } catch (e) {
        onError(e);
      }
    },
  };
}
