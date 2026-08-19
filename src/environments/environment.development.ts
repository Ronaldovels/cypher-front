export const environment = {
  production: false,
  apiUrl: 'http://localhost:8080/api/v1',
  /**
   * Desligado desde que a API do E1-A subiu e a verificação de ponta a ponta
   * passou (ver `docs/e1c-verificacao.md`). Ligue localmente para desenvolver
   * sem backend: o interceptor e o EventSource de exemplo entram no lugar da
   * rede, e o badge de conexão passa a se anunciar como dado de exemplo.
   */
  useMockData: false,
};
