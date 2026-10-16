import type { Agent, ClientRequest, IncomingMessage, RequestOptions } from 'node:http';
import type { PublicAddressAgent } from '../../security/public-address-agent.js';

// RF-403, RF-1104: placeholder of the test commit; the next commit builds the transport.

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type Send = (
  url: URL,
  options: RequestOptions,
  answer: (incoming: IncomingMessage) => void,
) => ClientRequest;

export interface AgentFetchParts {
  readonly protocol: 'http:' | 'https:';
  readonly send: Send;
  readonly agent: Agent;
  readonly maxBytes: number;
}

export function agentFetch(parts: AgentFetchParts): FetchLike {
  return () => Promise.reject(new Error(`not built yet: ${parts.protocol}`));
}

export function publicAddressFetch(agent: PublicAddressAgent, maxBytes?: number): FetchLike {
  return agentFetch({
    protocol: 'https:',
    send: () => {
      throw new Error('not built yet');
    },
    agent,
    maxBytes: maxBytes ?? 0,
  });
}
