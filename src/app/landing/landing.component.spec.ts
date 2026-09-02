import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { routes } from '../app.routes';

describe('LandingComponent — rota raiz (tela de duas acoes, design doc de multi-tenant §5)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(routes),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('/ renderiza a landing com as duas acoes apontando para /onboarding e /login', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');

    const anchors: HTMLAnchorElement[] = Array.from(
      harness.routeNativeElement!.querySelectorAll('a[routerLink], a.btn'),
    );
    const hrefs = anchors.map(a => a.getAttribute('href'));

    expect(hrefs).toContain('/onboarding');
    expect(hrefs).toContain('/login');
    http.verify();
  });
});
