import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../shared/auth/auth.service';
import { mensagemDeErro } from '../shared/incident.models';
import { GESTOR_DEMO } from '../shared/mock/fixtures';
import { USE_MOCK_DATA } from '../shared/mock/use-mock-data.token';

interface LoginDraft { username: string; password: string; }

const DRAFT_VAZIO: LoginDraft = { username: '', password: '' };

/** Login do gestor (usuário/senha) — design doc de E4 §4.2. Rota pública, sem topbar/dock. */
@Component({
  selector: 'app-login',
  imports: [RouterLink],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly exemplo = inject(USE_MOCK_DATA);
  readonly credencialDemo = GESTOR_DEMO;

  readonly draft = signal<LoginDraft>({ ...DRAFT_VAZIO });
  readonly enviando = signal(false);
  readonly erro = signal<string | null>(null);

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
      next: () => {
        this.enviando.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: e => {
        this.enviando.set(false);
        this.erro.set(mensagemDeErro(e));
      },
    });
  }
}
