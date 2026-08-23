import { Routes } from '@angular/router';
import { OnboardingComponent } from './onboarding/onboarding.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { HeatmapComponent } from './heatmap/heatmap.component';
import { IncidentTimelineComponent } from './incidents/incident-timeline.component';
import { IncidentDetailComponent } from './incidents/incident-detail.component';
import { CasTabComponent } from './config/settings/cas-tab.component';
import { EpisTabComponent } from './config/settings/epis-tab.component';
import { IdentityTabComponent } from './config/settings/identity-tab.component';
import { SettingsPageComponent } from './config/settings/settings-page.component';
import { StationsTabComponent } from './config/stations/stations-tab.component';

export const routes: Routes = [
  { path: '', component: OnboardingComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'heatmap', component: HeatmapComponent },
  { path: 'incidentes', component: IncidentTimelineComponent },
  { path: 'incidentes/:id', component: IncidentDetailComponent },
  {
    path: 'config',
    component: SettingsPageComponent,
    children: [
      { path: '', redirectTo: 'estacoes', pathMatch: 'full' },
      { path: 'estacoes', component: StationsTabComponent },
      { path: 'identidade', component: IdentityTabComponent },
      { path: 'epis', component: EpisTabComponent },
      { path: 'cas', component: CasTabComponent },
    ],
  },
];
