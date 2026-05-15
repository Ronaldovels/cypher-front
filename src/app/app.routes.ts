import { Routes } from '@angular/router';
import { OnboardingComponent } from './onboarding/onboarding.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { HeatmapComponent } from './heatmap/heatmap.component';

export const routes: Routes = [
  { path: '', component: OnboardingComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'heatmap', component: HeatmapComponent },
];
