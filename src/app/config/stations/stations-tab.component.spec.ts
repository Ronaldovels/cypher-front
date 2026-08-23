import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { StationsTabComponent } from './stations-tab.component';

describe('StationsTabComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('renderiza o cadastro, sem topbar/dock proprios (a casca vem de SettingsPageComponent)', () => {
    const fixture = TestBed.createComponent(StationsTabComponent);
    fixture.detectChanges();
    http.match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-stations-config')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-chrome-topbar')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-dock')).toBeNull();
  });
});
