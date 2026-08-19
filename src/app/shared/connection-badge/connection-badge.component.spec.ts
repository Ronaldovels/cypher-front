import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { EVENT_SOURCE_FACTORY, EventSourceLike } from '../event-source.factory';
import { USE_MOCK_DATA } from '../mock/use-mock-data.token';
import { ConnectionBadgeComponent } from './connection-badge.component';

const SSE_INERTE: EventSourceLike = {
  addEventListener: () => { }, close: () => { }, onopen: null, onerror: null,
};

function configurar(exemplo: boolean) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(withFetch()),
      provideHttpClientTesting(),
      { provide: EVENT_SOURCE_FACTORY, useValue: () => SSE_INERTE },
      { provide: USE_MOCK_DATA, useValue: exemplo },
    ],
  });
  const fixture = TestBed.createComponent(ConnectionBadgeComponent);
  fixture.detectChanges();
  return fixture;
}

describe('ConnectionBadgeComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('em modo real, mostra o estado da conexão', () => {
    const fixture = configurar(false);

    expect(fixture.nativeElement.textContent).toContain('offline');
    expect(fixture.nativeElement.textContent).not.toContain('dados de exemplo');
  });

  it('em modo de exemplo, avisa em tela em vez de fingir estar ao vivo', () => {
    const fixture = configurar(true);

    expect(fixture.nativeElement.textContent).toContain('dados de exemplo');
    expect(fixture.nativeElement.textContent).not.toContain('ao vivo');
  });
});
