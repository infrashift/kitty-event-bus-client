/**
 * Publishes sample CloudEvents to a NATS server so you can watch KITTY speak them.
 *
 *   bun site/scripts/nats-publish.ts [ws://localhost:8080] [subject-prefix]
 *   make nats-publish
 *
 * It sends the same event twice, once per CloudEvents NATS binding mode:
 *   1. structured: the payload is a JSON CloudEvent
 *   2. binary:     attributes in `ce-*` headers, the payload is just the `data`
 * Uses @nats-io/nats-core over WebSocket, the same client and transport a browser uses.
 */
import { wsconnect, headers } from '@nats-io/nats-core';

const server = process.argv[2] ?? 'ws://localhost:8080';
const prefix = process.argv[3] ?? 'cncf';

const nc = await wsconnect({ servers: server, name: 'kitty-sample-publisher' });
console.log(`connected to ${server}`);

// 1. Structured mode
const structured = {
  specversion: '1.0',
  id: crypto.randomUUID(),
  source: 'urn:k8s:cluster:dev/namespace/feline-ops',
  type: 'io.cncf.k8s.pod.crashloop',
  subject: 'litter-box-controller',
  time: new Date().toISOString(),
  datacontenttype: 'application/json',
  data: {
    message: 'Pod litter-box-controller is in CrashLoopBackOff for the ninth time. Somebody scoop it.',
    severity: 'error',
    cluster: 'dev',
  },
};
nc.publish(`${prefix}.k8s.pods.crashloop`, JSON.stringify(structured));
console.log(`structured → ${prefix}.k8s.pods.crashloop`);

await new Promise((r) => setTimeout(r, 6000));

// 2. Binary mode
const h = headers();
h.set('ce-specversion', '1.0');
h.set('ce-id', crypto.randomUUID());
h.set('ce-source', 'urn:prometheus:alertmanager:dev');
h.set('ce-type', 'io.prometheus.alert.firing');
h.set('ce-time', new Date().toISOString());
h.set('content-type', 'application/json');
nc.publish(
  `${prefix}.alerts.gpu.thermal`,
  JSON.stringify({ message: 'GPU node seven is at ninety-six degrees. Deploying ocular plasma.', severity: 'critical' }),
  { headers: h },
);
console.log(`binary     → ${prefix}.alerts.gpu.thermal`);

await nc.drain();
