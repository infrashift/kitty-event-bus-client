/**
 * kitty-event-bus-client — public library entry (ES module, `vue` is a peer dependency).
 *
 *   import { KittyApp } from 'kitty-event-bus-client';
 *   import 'kitty-event-bus-client/style.css';
 */
import './style.css';

export { default as KittyApp } from './App.vue';
export { default as KittySpeaker } from './components/KittySpeaker.vue';
export { default as CloudEventInspector } from './components/CloudEventInspector.vue';
export { mountKitty, type KittyMountHandle } from './mount';
export type { KittyAppProps } from './types';

export {
  CLOUDEVENT_PRESETS,
  buildCloudEventFromPreset,
  type EventSeverity,
  type CloudEventData,
  type CNCFCloudEvent,
  type CloudEventPreset,
  type KittyEventPayload,
} from './events/cloudevents';
export {
  MockNatsBus,
  createKittyNatsConsumer,
  matchNatsSubject,
  type NatsEnvelope,
  type NatsSubscriptionCallback,
} from './events/mockNatsBus';
export type { CloudEventBus } from './events/bus';
export {
  natsConnectionBus,
  decodeNatsCloudEvent,
  type NatsConnectionLike,
  type NatsMsgLike,
  type NatsHeadersLike,
  type NatsConnectionBusOptions,
} from './events/natsBus';
export {
  DEFAULT_TTS_BASE_URL,
  DEFAULT_TTS_PROXY_URL,
  type TtsEndpoints,
  type VoiceMode,
  type VoicePersona,
} from './audio/felineSpeechEngine';
