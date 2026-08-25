import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../shared/auth/auth.service';
import { mensagemDeErro } from '../shared/incident.models';
import { TOKENS_ESTACAO } from '../shared/mock/fixtures';
import { USE_MOCK_DATA } from '../shared/mock/use-mock-data.token';
import { ThemeService } from '../shared/theme.service';

/** Login do kiosk (token de estação) — design doc de E4 §4.2. Rota pública, sem topbar/dock, sem campo de senha. */
@Component({
  selector: 'app-login-estacao',
  imports: [RouterLink],
  templateUrl: './login-estacao.component.html',
})
export class LoginEstacaoComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private theme = inject(ThemeService);

  readonly exemplo = inject(USE_MOCK_DATA);
  readonly tokenDemo = TOKENS_ESTACAO['EST-01'];

  readonly token = signal('');
  readonly enviando = signal(false);
  readonly erro = signal<string | null>(null);

  readonly temaEscuro = () => this.theme.theme() === 'dark';
  alternarTema(): void {
    this.theme.toggle();
  }

  patch(valor: string): void {
    this.token.set(valor);
    this.erro.set(null);
  }

  entrar(): void {
    const token = this.token().trim();
    if (!token) {
      this.erro.set('Cole o token da estação.');
      return;
    }
    this.enviando.set(true);
    this.erro.set(null);
    this.auth.loginEstacao(token).subscribe({
      next: resp => {
        this.enviando.set(false);
        this.router.navigate(['/estacao', resp.estacaoId]);
      },
      error: e => {
        this.enviando.set(false);
        this.erro.set(mensagemDeErro(e));
      },
    });
  }
}
