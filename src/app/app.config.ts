import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { EVENT_SOURCE_FACTORY } from './shared/event-source.factory';
import { mockApiInterceptor } from './shared/mock/mock-api.interceptor';
import { mockEventSourceFactory } from './shared/mock/mock-event-source';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(
      withFetch(),
      withInterceptors(environment.useMockData ? [mockApiInterceptor] : []),
    ),
    ...(environment.useMockData
      ? [{ provide: EVENT_SOURCE_FACTORY, useValue: mockEventSourceFactory }]
      : []),
  ],
};
