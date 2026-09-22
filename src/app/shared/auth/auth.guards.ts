import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { map } from 'rxjs';

import { AuthService } from './auth.service';

/**
 * `/login`, levando a URL pedida em `returnUrl` só quando não há sessão: quem
 * abre um deep link (ex.: `/incidentes/123` de uma notificação) volta para ele
 * depois de entrar. Com sessão de outro papel não leva — o login mandaria a
 * pessoa de volta para a mesma rota barrada.
 */
function paraLogin(router: Router, papel: string | null, state?: RouterStateSnapshot): UrlTree {
  if (papel !== null || !state?.url || state.url === '/') {
    return router.parseUrl('/login');
  }
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
}

/** Redireciona para /login se `auth.role() !== 'GESTOR'` (design doc de E4, §4.3). */
export const canActivateGestor: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.checkSession().pipe(
    map(() => (auth.role() === 'GESTOR' ? true : paraLogin(router, auth.role(), state))),
  );
};

/** Redireciona para /login-estacao se `auth.role() !== 'OPERADOR'`, e valida `:id` contra `auth.estacaoId()`. */
export const canActivateOperador: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.checkSession().pipe(
    map(() => {
      if (auth.role() !== 'OPERADOR') {
        return router.parseUrl('/login-estacao');
      }
      const id = route.paramMap.get('id');
      return id === auth.estacaoId() ? true : router.parseUrl('/login-estacao');
    }),
  );
};

/** Qualquer papel autenticado (design doc §4.3) — `/incidentes`, `/incidentes/:id` e `/estacoes`. */
export const canActivateAutenticado: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.checkSession().pipe(
    map(() => (auth.role() !== null ? true : paraLogin(router, null, state))),
  );
};

/**
 * `/estacao/:id`: um OPERADOR só entra na própria estação; um GESTOR entra em
 * qualquer uma, mantendo o dock (restrição de E3, nota de 2026-08-23 na spec
 * de E1 §15). Não existe combinador "ou" nativo para `CanActivateFn` — a
 * regra fica numa função própria em vez de duas guardas encadeadas.
 */
export const canActivateOperadorOuGestor: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.checkSession().pipe(
    map(() => {
      const papel = auth.role();
      if (papel === 'GESTOR') {
        return true;
      }
      if (papel === 'OPERADOR') {
        const id = route.paramMap.get('id');
        return id === auth.estacaoId() ? true : router.parseUrl('/login-estacao');
      }
      return router.parseUrl('/login-estacao');
    }),
  );
};
