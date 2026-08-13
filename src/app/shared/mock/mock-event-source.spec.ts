import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MockEventSource } from './mock-event-source';

describe('MockEventSource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('close() chamado antes do primeiro tick não dispara onopen depois', () => {
    const sse = new MockEventSource();
    let abriu = false;
    sse.onopen = () => { abriu = true; };

    sse.close();
    vi.runAllTimers();

    expect(abriu).toBe(false);
  });

  it('sem close(), onopen dispara no primeiro tick', () => {
    const sse = new MockEventSource();
    let abriu = false;
    sse.onopen = () => { abriu = true; };

    vi.runOnlyPendingTimers();

    expect(abriu).toBe(true);
    sse.close();
  });
});
