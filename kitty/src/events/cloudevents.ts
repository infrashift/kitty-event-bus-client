export type EventSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface CloudEventData {
  message: string;
  severity: EventSeverity;
  service?: string;
  cluster?: string;
  metrics?: Record<string, number | string>;
}

/**
 * CNCF CloudEvents v1.0 Specification Envelope
 * https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md
 */
export interface CNCFCloudEvent<T = CloudEventData> {
  specversion: '1.0';
  id: string;
  source: string;
  type: string;
  subject?: string;
  time: string;
  datacontenttype: 'application/json';
  data: T;
}

/**
 * The extracted payload forwarded by the NATS Consumer to the <KittySpeaker /> UI component.
 */
export interface KittyEventPayload {
  id: string;
  natsSubject: string;
  type: string;
  source: string;
  severity: EventSeverity;
  message: string;
  time: string;
}

export interface CloudEventPreset {
  label: string;
  natsSubject: string;
  type: string;
  source: string;
  severity: EventSeverity;
  message: string;
  service: string;
}

export const CLOUDEVENT_PRESETS: CloudEventPreset[] = [
  {
    label: 'K8s Pod Ready',
    natsSubject: 'cncf.k8s.pods.ready',
    type: 'io.cncf.k8s.pod.ready',
    source: 'urn:k8s:cluster:prod-us-east-1/namespace/feline-ops',
    severity: 'info',
    service: 'catnip-scheduler',
    message:
      'Pod catnip-scheduler-7f9b is ready and purring at ninety-nine point nine percent availability across all worker nodes.',
  },
  {
    label: 'Critical GPU Thermal Alert',
    natsSubject: 'cncf.alerts.gpu.thermal',
    type: 'io.infrashift.gpu.thermal.critical',
    source: 'urn:infrashift:rack:h100-cluster-04',
    severity: 'critical',
    service: 'ocular-plasma-cooler',
    message:
      'Critical thermal runaway detected on GPU node four! Firing ocular plasma lasers to incinerate rogue workloads immediately!',
  },
  {
    label: 'NATS JetStream Consumer Ack',
    natsSubject: 'cncf.nats.jetstream.ack',
    type: 'io.cncf.nats.stream.consumer.ack',
    source: 'urn:nats:jetstream:us-west-2/stream/CLOUDEVENTS',
    severity: 'info',
    service: 'nats-kitty-bridge',
    message:
      'NATS JetStream consumer acknowledged batch four thousand and forty-two with zero redeliveries and sub-millisecond latency.',
  },
  {
    label: 'FluxCD Canary Promotion',
    natsSubject: 'cncf.fluxcd.helm.reconciled',
    type: 'io.cncf.fluxcd.helmrelease.reconciled',
    source: 'urn:fluxcd:gitops:production/helmrelease/whisker-mesh',
    severity: 'info',
    service: 'whisker-service-mesh',
    message:
      'Helm release whisker-mesh version two point four has reconciled cleanly. All canary traffic is now routed to the new pods.',
  },
  {
    label: 'Envoy Rate Limit Warning',
    natsSubject: 'cncf.envoy.ratelimit.warn',
    type: 'io.cncf.envoy.ratelimit.throttled',
    source: 'urn:envoy:ingress:edge-gateway-01',
    severity: 'warning',
    service: 'edge-gateway',
    message:
      'Warning from edge gateway one: upstream laser-pointer telemetry requests exceeded the token bucket quota; throttling noisy clients.',
  },
  {
    label: 'Etcd QuorumDegraded Error',
    natsSubject: 'cncf.alerts.etcd.quorum',
    type: 'io.cncf.etcd.cluster.leader.lost',
    source: 'urn:etcd:control-plane:etcd-member-02',
    severity: 'error',
    service: 'etcd-control-plane',
    message:
      'Error in control plane etcd cluster! Leader election triggered after heartbeat timeout on member two; engaging feline incident response!',
  },
];

let eventCounter = 100;

export function buildCloudEventFromPreset(
  preset: CloudEventPreset,
  overrides?: Partial<CloudEventPreset>
): { natsSubject: string; cloudEvent: CNCFCloudEvent } {
  eventCounter += 1;
  const merged = { ...preset, ...overrides };
  const id = `ce-${Date.now().toString(36)}-${eventCounter}`;
  return {
    natsSubject: merged.natsSubject,
    cloudEvent: {
      specversion: '1.0',
      id,
      source: merged.source,
      type: merged.type,
      subject: merged.service,
      time: new Date().toISOString(),
      datacontenttype: 'application/json',
      data: {
        message: merged.message,
        severity: merged.severity,
        service: merged.service,
        cluster: 'prod-us-east-1',
        metrics: {
          sequence: eventCounter,
          consumerLagMs: Math.floor(Math.random() * 14) + 1,
        },
      },
    },
  };
}
