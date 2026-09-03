/** `WebhookSubscription`/`WebhookDelivery` — design doc de cadastro de webhook, §2. */

export interface Webhook {
  id: number;
  url: string;
  secret: string;
  minSeverity: number;
  ativo: boolean;
}

export interface WebhookPayload {
  url: string;
  secret: string;
  minSeverity: number;
  ativo?: boolean;
}

export type DeliveryStatus = 'PENDENTE' | 'ENTREGUE' | 'FALHA';

export interface WebhookDelivery {
  id: number;
  incidentKey: string;
  status: DeliveryStatus;
  tentativas: number;
  ultimoErro: string | null;
  proximaTentativa: string | null;
}
