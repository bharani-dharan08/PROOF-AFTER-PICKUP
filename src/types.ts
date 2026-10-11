export type AppRole = 'Society' | 'Collector' | 'Receiver' | 'Supervisor' | 'AWS_Studio';

export interface AuditLogEntry {
  action: string;
  actor: string;
  role: string;
  timestamp: number;
  idempotency_key?: string;
  note: string;
}

export interface LotItem {
  PK: string;
  SK: string;
  lot_id: string;
  society_id: string;
  waste_type: string;
  declared_weight_kg: number;
  location: string;
  status: 'CREATED' | 'CLAIMED' | 'IN_TRANSIT' | 'CONFIRMED_RECEIVED' | 'PROCESSOR_ACCEPTED' | 'EXCEPTION_FLAGGED' | 'EXCEPTION_PENDING';
  collector_id?: string;
  receiver_id?: string;
  received_weight_kg?: number;
  actual_weight_kg?: number;
  weight_mismatch_pct?: number;
  weight_variance_pct?: number;
  is_contaminated?: boolean;
  contamination_flag?: boolean;
  evidence_image_url?: string;
  voice_transcript?: string;
  audio_s3_url?: string;
  voice_language?: string;
  weight_kg?: number;
  cpcb_category?: string;
  created_at: number;
  updated_at: number;
  idempotency_key: string;
  audit_trail: AuditLogEntry[];
}

export interface OfflineQueuedAction {
  id: string;
  type: 'CREATE_LOT' | 'CLAIM_LOT' | 'CONFIRM_RECEIPT';
  idempotencyKey: string;
  payload: any;
  timestamp: number;
}
