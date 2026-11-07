/**
 * Standalone drop-in build (IIFE, Vue bundled in). Exposes `window.KittyEventBus`:
 *
 *   <link rel="stylesheet" href="…/style.css" />
 *   <div id="cat"></div>
 *   <script src="…/kitty-event-bus-client.iife.js"></script>
 *   <script>KittyEventBus.mount('#cat', { ttsBaseUrl: '…/tts/' });</script>
 */
import './style.css';
import { mountKitty } from './mount';
import { CLOUDEVENT_PRESETS } from './events/cloudevents';
import { natsConnectionBus, decodeNatsCloudEvent } from './events/natsBus';

export { mountKitty as mount, natsConnectionBus, decodeNatsCloudEvent, CLOUDEVENT_PRESETS };
