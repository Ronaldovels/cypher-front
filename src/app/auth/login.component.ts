import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../shared/auth/auth.service';
import { mensagemDeErro } from '../shared/incident.models';
import { GESTOR_DEMO } from '../shared/mock/fixtures';
import { USE_MOCK_DATA } from '../shared/mock/use-mock-data.token';
import { ThemeService } from '../shared/theme.service';

interface LoginDraft { username: string; password: string; }

const DRAFT_VAZIO: LoginDraft = { username: '', password: '' };

/**
 * Login por usuário/senha — GESTOR ou OPERADOR (revisão pós-E4: OPERADOR
 * ganhou essa segunda forma de entrar, além do token de estação em
 * `/login-estacao`). Rota pública, sem topbar/dock.
 */
@Component({
  selector: 'app-login',
  imports: [RouterLink],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private theme = inject(ThemeService);

  readonly exemplo = inject(USE_MOCK_DATA);
  readonly credencialDemo = GESTOR_DEMO;

  readonly draft = signal<LoginDraft>({ ...DRAFT_VAZIO });
  readonly enviando = signal(false);
  readonly erro = signal<string | null>(null);

  readonly temaEscuro = () => this.theme.theme() === 'dark';
  alternarTema(): void {
    this.theme.toggle();
  }

  patch(p: Partial<LoginDraft>): void {
    this.draft.update(d => ({ ...d, ...p }));
    this.erro.set(null);
  }

  entrar(): void {
    const { username, password } = this.draft();
    if (!username || !password) {
      this.erro.set('Informe usuário e senha.');
      return;
    }
    this.enviando.set(true);
    this.erro.set(null);
    this.auth.login(username, password).subscribe({
      next: resp => {
        this.enviando.set(false);
        if (resp.papel === 'OPERADOR' && resp.estacaoId) {
          this.router.navigate(['/estacao', resp.estacaoId]);
        } else {
          this.router.navigate(['/dashboard']);
        }
      },
      error: e => {
        this.enviando.set(false);
        this.erro.set(mensagemDeErro(e));
      },
    });
  }
}
