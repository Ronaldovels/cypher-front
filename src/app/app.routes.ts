import { Routes } from '@angular/router';
import { OnboardingComponent } from './onboarding/onboarding.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { HeatmapComponent } from './heatmap/heatmap.component';
import { StationsPageComponent } from './config/stations/stations-page.component';

export const routes: Routes = [
  { path: '', component: OnboardingComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'heatmap', component: HeatmapComponent },
  { path: 'config/estacoes', component: StationsPageComponent },
];
