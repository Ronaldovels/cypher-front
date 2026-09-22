import { Routes } from '@angular/router';
import { LandingComponent } from './landing/landing.component';
import { OnboardingComponent } from './onboarding/onboarding.component';
import { LoginComponent } from './auth/login.component';
import { LoginEstacaoComponent } from './auth/login-estacao.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { HeatmapComponent } from './heatmap/heatmap.component';
import { PlacarComponent } from './placar/placar.component';
import { IncidentTimelineComponent } from './incidents/incident-timeline.component';
import { IncidentDetailComponent } from './incidents/incident-detail.component';
import { StationsGridComponent } from './stations/stations-grid.component';
import { StationKioskComponent } from './stations/station-kiosk.component';
import { CasTabComponent } from './config/settings/cas-tab.component';
import { EpisTabComponent } from './config/settings/epis-tab.component';
import { IdentityTabComponent } from './config/settings/identity-tab.component';
import { SettingsPageComponent } from './config/settings/settings-page.component';
import { StationsTabComponent } from './config/stations/stations-tab.component';
import { EquipeUsuariosTabComponent } from './config/equipe/equipe-usuarios-tab.component';
import { WebhooksTabComponent } from './config/webhooks/webhooks-tab.component';
import { McpTabComponent } from './config/mcp/mcp-tab.component';
import {
  canActivateAutenticado, canActivateGestor, canActivateOperadorOuGestor,
} from './shared/auth/auth.guards';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'onboarding', component: OnboardingComponent },
  { path: 'login', component: LoginComponent },
  { path: 'login-estacao', component: LoginEstacaoComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [canActivateGestor] },
  { path: 'heatmap', component: HeatmapComponent, canActivate: [canActivateGestor] },
  { path: 'placar', component: PlacarComponent, canActivate: [canActivateGestor] },
  // Qualquer papel autenticado: o backend serve incidentes/câmeras a GESTOR e
  // OPERADOR. Sem guard, quem não estava logado via a tela vazia com erros de
  // 401 em vez de ir para o login.
  { path: 'incidentes', component: IncidentTimelineComponent, canActivate: [canActivateAutenticado] },
  { path: 'incidentes/:id', component: IncidentDetailComponent, canActivate: [canActivateAutenticado] },
  { path: 'estacoes', component: StationsGridComponent, canActivate: [canActivateAutenticado] },
  { path: 'estacao/:id', component: StationKioskComponent, canActivate: [canActivateOperadorOuGestor] },
  {
    path: 'config',
    component: SettingsPageComponent,
    canActivate: [canActivateGestor],
    children: [
      { path: '', redirectTo: 'estacoes', pathMatch: 'full' },
      { path: 'estacoes', component: StationsTabComponent },
      { path: 'identidade', component: IdentityTabComponent },
      { path: 'epis', component: EpisTabComponent },
      { path: 'cas', component: CasTabComponent },
      { path: 'equipe', component: EquipeUsuariosTabComponent },
      { path: 'webhooks', component: WebhooksTabComponent },
      { path: 'mcp', component: McpTabComponent },
    ],
  },
];
