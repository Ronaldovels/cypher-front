import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { routes } from '../../app.routes';
import { StationsPageComponent } from './stations-page.component';

describe('StationsPageComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('renderiza o cadastro dentro da moldura do produto', () => {
    const fixture = TestBed.createComponent(StationsPageComponent);
    fixture.detectChanges();
    http.match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-stations-config')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-chrome-topbar')).not.toBeNull();
  });

  it('a rota /config/estacoes existe', () => {
    expect(routes.some(r => r.path === 'config/estacoes')).toBe(true);
  });
});
