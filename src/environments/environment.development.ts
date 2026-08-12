export const environment = {
  production: false,
  apiUrl: 'http://localhost:8080/api/v1',
  /**
   * Nasce ligado porque hoje não há backend rodando — é o motivo de a flag
   * existir. Vira false quando o plano E1-A estiver de pé; a Task 12 faz
   * essa virada como parte da verificação.
   */
  useMockData: true,
};
