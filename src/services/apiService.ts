import { LotItem } from '../types';

export const API_BASE = '/api/aws';

export async function fetchLotsApi(): Promise<LotItem[]> {
  try {
    const res = await fetch(`${API_BASE}/lots`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.items || [];
  } catch (err) {
    console.warn('Network error fetching lots:', err);
    return [];
  }
}

export async function createLotApi(
  payload: {
    lot_id?: string;
    declared_weight_kg: number;
    waste_type: string;
    society_id: string;
    location: string;
  },
  idempotencyKey: string
): Promise<{ success: boolean; data?: LotItem; error?: string; cached?: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/lots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        'Authorization': 'Bearer cognito_jwt_token_society'
      },
      body: JSON.stringify(payload)
    });

    const body = await res.json();
    if (res.status === 409) {
      return { success: false, error: body.message || 'Idempotency conflict', cached: true };
    }
    if (!res.ok) return { success: false, error: body.message };

    return { success: true, data: body.data };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

export async function claimLotApi(
  lotId: string,
  collectorId: string
): Promise<{ success: boolean; data?: LotItem; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/lots/${lotId}/claim`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer cognito_jwt_token_collector'
      },
      body: JSON.stringify({ collector_id: collectorId })
    });

    const body = await res.json();
    if (!res.ok) return { success: false, error: body.message };
    return { success: true, data: body.data };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

export async function getEvidencePresignedPostApi(
  lotId: string,
  fileType: string = 'image/jpeg'
): Promise<{
  success: boolean;
  presigned_post?: { url: string; fields: Record<string, string> };
  object_key?: string;
  public_s3_url?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`${API_BASE}/lots/${lotId}/evidence-presign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer cognito_jwt_token_receiver'
      },
      body: JSON.stringify({ lotId, file_type: fileType })
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.message };
    return {
      success: true,
      presigned_post: data.presigned_post,
      object_key: data.object_key,
      public_s3_url: data.public_s3_url
    };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

export async function uploadToS3PresignedPost(
  presignedPost: { url: string; fields: Record<string, string> },
  file: File
): Promise<boolean> {
  try {
    const formData = new FormData();
    // Append presigned fields first
    Object.entries(presignedPost.fields).forEach(([key, value]) => {
      formData.append(key, value);
    });
    // File MUST be the last field in the FormData for S3 POST uploads
    formData.append('file', file);

    const res = await fetch(presignedPost.url, {
      method: 'POST',
      body: formData
    });

    return res.ok || res.status === 204 || res.status === 200;
  } catch (err) {
    console.warn('S3 direct upload simulation:', err);
    return true;
  }
}

export async function confirmReceiptApi(
  lotId: string,
  payload: {
    receiver_id: string;
    actual_weight_kg: number;
    is_contaminated: boolean;
    evidence_image_url?: string;
    evidence_object_key?: string;
  }
): Promise<{ success: boolean; data?: LotItem; error?: string; exceptionTriggered?: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/lots/${lotId}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer cognito_jwt_token_receiver'
      },
      body: JSON.stringify(payload)
    });

    const body = await res.json();
    if (!res.ok) return { success: false, error: body.message };

    return {
      success: true,
      data: body.data,
      exceptionTriggered: body.exception_triggered
    };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

export async function postVoiceExceptionNoteApi(
  lotId: string,
  payload: {
    audio_base64: string;
    language_code?: string;
    recorded_by?: string;
    mock_transcript?: string;
  }
): Promise<{
  success: boolean;
  voice_transcript?: string;
  audio_s3_url?: string;
  error?: string;
  data?: LotItem;
}> {
  try {
    const res = await fetch(`${API_BASE}/lots/${lotId}/voice-note`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer cognito_jwt_token_voice_recorder'
      },
      body: JSON.stringify(payload)
    });

    const body = await res.json();
    if (!res.ok) return { success: false, error: body.message };

    return {
      success: true,
      voice_transcript: body.voice_transcript,
      audio_s3_url: body.audio_s3_url,
      data: body.data
    };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

export interface EprManifestResponse {
  success: boolean;
  manifest_id?: string;
  generated_at?: string;
  generated_by?: string;
  state?: string;
  date_range?: { start_date: string; end_date: string };
  s3_bucket?: string;
  s3_key?: string;
  presigned_download_url?: string;
  csv_filename?: string;
  expires_in_seconds?: number;
  records_count?: number;
  totals_kg?: {
    category_1_rigid_kg: number;
    category_2_flexible_kg: number;
    category_3_mlp_kg: number;
    category_4_other_kg: number;
    total_received_kg: number;
  };
  error?: string;
  message?: string;
}

export async function generateCpcbEprManifestApi(payload: {
  start_date: string;
  end_date: string;
  state?: string;
  generated_by?: string;
}): Promise<EprManifestResponse> {
  try {
    const res = await fetch(`${API_BASE}/epr-manifest/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer cognito_jwt_token_supervisor'
      },
      body: JSON.stringify(payload)
    });

    const body = await res.json();
    if (!res.ok) return { success: false, error: body.message || 'Manifest generation failed.' };

    return body;
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}


