// Standalone dev/test harness (`bun run dev`, `bun run build:app`).
// It mounts KITTY through the same public API that library users get.
import './style.css';
import { mountKitty } from './mount';

mountKitty('#app', { docsUrl: 'https://infrashift.github.io/kitty-event-bus-client/' });
