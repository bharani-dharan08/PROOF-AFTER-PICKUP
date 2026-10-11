import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));

interface LotItem {
  PK: string;
  SK: string;
  lot_id: string;
  society_id: string;
  waste_type: string;
  declared_weight_kg: number;
  location: string;
  status: 'CREATED' | 'IN_TRANSIT' | 'CLAIMED' | 'PROCESSOR_ACCEPTED' | 'EXCEPTION_PENDING';
  collector_id?: string;
  receiver_id?: string;
  received_weight_kg?: number;
  weight_variance_pct?: number;
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
  audit_trail: Array<{
    action: string;
    actor: string;
    role: string;
    timestamp: number;
    idempotency_key?: string;
    note: string;
  }>;
}

const mockLotsTable = new Map<string, LotItem>();
const mockIdempotencyTable = new Map<string, { status: string; created_at: number; lot_id?: string }>();

function seedDemoLots() {
  if (mockLotsTable.size > 0) return;
  const now = Date.now();

  const demoItems: LotItem[] = [
    {
      PK: 'LOT#LOT-SOC-9821',
      SK: 'METADATA',
      lot_id: 'LOT-SOC-9821',
      society_id: 'SOC-SEATTLE-GREEN',
      waste_type: 'Sorted Plastics & Recyclables',
      declared_weight_kg: 50.0,
      location: '742 Evergreen Terrace, Seattle WA',
      status: 'PROCESSOR_ACCEPTED',
      collector_id: 'COLL-DRV-102',
      receiver_id: 'RECV-RECYCLING-PLANT',
      received_weight_kg: 49.2,
      weight_variance_pct: 1.6,
      contamination_flag: false,
      evidence_image_url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80',
      created_at: now - 86400000,
      updated_at: now - 82000000,
      idempotency_key: 'idemp-seed-lot-001',
      audit_trail: [
        {
          action: 'LOT_CREATED',
          actor: 'SOC-SEATTLE-GREEN',
          role: 'Society',
          timestamp: now - 86400000,
          note: 'Lot created with declared weight 50.0kg.'
        },
        {
          action: 'LOT_CLAIMED',
          actor: 'COLL-DRV-102',
          role: 'Collector',
          timestamp: now - 84000000,
          note: 'Collector claimed lot for transit.'
        },
        {
          action: 'CONFIRM_RECEIPT_PROCESSOR_ACCEPTED',
          actor: 'RECV-RECYCLING-PLANT',
          role: 'Receiver',
          timestamp: now - 82000000,
          note: 'Receipt confirmed. Declared: 50kg, Received: 49.2kg (Variance: 1.6%). Status: PROCESSOR_ACCEPTED.'
        }
      ]
    },
    {
      PK: 'LOT#LOT-SOC-4410',
      SK: 'METADATA',
      lot_id: 'LOT-SOC-4410',
      society_id: 'SOC-PIKE-COMMUNITY',
      waste_type: 'Cardboard & Paper Waste',
      declared_weight_kg: 100.0,
      location: '1200 Pike Place, Seattle WA',
      status: 'EXCEPTION_PENDING',
      collector_id: 'COLL-DRV-304',
      receiver_id: 'RECV-RECYCLING-PLANT',
      received_weight_kg: 72.0,
      weight_variance_pct: 28.0,
      contamination_flag: true,
      evidence_image_url: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=800&q=80',
      created_at: now - 43200000,
      updated_at: now - 36000000,
      idempotency_key: 'idemp-seed-lot-002',
      audit_trail: [
        {
          action: 'LOT_CREATED',
          actor: 'SOC-PIKE-COMMUNITY',
          role: 'Society',
          timestamp: now - 43200000,
          note: 'Lot created with declared weight 100.0kg.'
        },
        {
          action: 'LOT_CLAIMED',
          actor: 'COLL-DRV-304',
          role: 'Collector',
          timestamp: now - 40000000,
          note: 'Collector claimed lot.'
        },
        {
          action: 'CONFIRM_RECEIPT_EXCEPTION_PENDING',
          actor: 'RECV-RECYCLING-PLANT',
          role: 'Receiver',
          timestamp: now - 36000000,
          note: 'EXCEPTION: 28% weight variance (Declared: 100kg, Received: 72kg) & contamination flag True. Status set to EXCEPTION_PENDING. EventBridge event published.'
        }
      ]
    }
  ];

  demoItems.forEach(item => {
    mockLotsTable.set(item.PK, item);
    mockIdempotencyTable.set(item.idempotency_key, { status: 'COMPLETED', created_at: item.created_at, lot_id: item.lot_id });
  });
}

seedDemoLots();

// 1. CreateLot API (Society Group)
app.post('/api/aws/lots', (req: Request, res: Response) => {
  const idempotencyKey = (req.headers['idempotency-key'] as string) || `idemp-${Date.now()}`;

  if (mockIdempotencyTable.has(idempotencyKey)) {
    const cached = mockIdempotencyTable.get(idempotencyKey);
    return res.status(409).json({
      error: 'IdempotencyConflict',
      message: `Idempotency Key '${idempotencyKey}' has already been processed in ProofAfterPickup-Lots.`,
      cached_record: cached
    });
  }

  const { lot_id, declared_weight_kg, waste_type, society_id, location } = req.body;
  const id = lot_id || `LOT-SOC-${Math.floor(1000 + Math.random() * 9000)}`;
  const pk = `LOT#${id}`;

  if (mockLotsTable.has(pk)) {
    return res.status(409).json({
      error: 'LotAlreadyExists',
      message: `ConditionalCheckFailed: Item '${pk}' already exists in ProofAfterPickup-Lots.`
    });
  }

  const now = Date.now();
  const newItem: LotItem = {
    PK: pk,
    SK: 'METADATA',
    lot_id: id,
    society_id: society_id || 'SOC-CURRENT-USER',
    waste_type: waste_type || 'Plastics & Polymers',
    declared_weight_kg: Number(declared_weight_kg || 25),
    location: location || 'Seattle WA',
    status: 'CREATED',
    created_at: now,
    updated_at: now,
    idempotency_key: idempotencyKey,
    audit_trail: [
      {
        action: 'LOT_CREATED',
        actor: society_id || 'SOC-CURRENT-USER',
        role: 'Society',
        timestamp: now,
        idempotency_key: idempotencyKey,
        note: `Lot created with declared weight ${declared_weight_kg || 25}kg in ProofAfterPickup-Lots.`
      }
    ]
  };

  mockLotsTable.set(pk, newItem);
  mockIdempotencyTable.set(idempotencyKey, { status: 'COMPLETED', created_at: now, lot_id: id });

  return res.status(201).json({
    message: 'Lot item created in ProofAfterPickup-Lots table.',
    data: newItem
  });
});

// 2. ClaimPickup API (Collector Group)
app.put('/api/aws/lots/:id/claim', (req: Request, res: Response) => {
  const id = req.params.id;
  const pk = `LOT#${id}`;
  const item = mockLotsTable.get(pk);

  if (!item) {
    return res.status(404).json({ error: 'NotFound', message: `Lot ${id} not found.` });
  }

  if (item.status !== 'CREATED') {
    return res.status(409).json({
      error: 'InvalidStateTransition',
      message: `Cannot claim lot ${id}. Current status '${item.status}' is not 'CREATED'.`
    });
  }

  const collectorId = req.body.collector_id || 'COLL-CURRENT-USER';
  const now = Date.now();

  item.status = 'IN_TRANSIT';
  item.collector_id = collectorId;
  item.updated_at = now;
  item.audit_trail.push({
    action: 'LOT_CLAIMED',
    actor: collectorId,
    role: 'Collector',
    timestamp: now,
    note: `Lot claimed by collector ${collectorId}. Status set to IN_TRANSIT.`
  });

  mockLotsTable.set(pk, item);
  return res.json({ message: `Lot ${id} claimed successfully.`, data: item });
});

// 3. Generate S3 Pre-signed POST Endpoint
app.post('/api/aws/lots/:id/evidence-presign', (req: Request, res: Response) => {
  const lotId = req.params.id;
  const fileType = req.body.file_type || 'image/jpeg';
  const fileUuid = Math.random().toString(36).substring(2, 10);
  const extension = fileType.includes('png') ? '.png' : '.jpg';
  const objectKey = `evidence/lots/${lotId}/${fileUuid}${extension}`;
  const bucketName = 'proofafterpickup-evidence-dev';

  // Generate mock S3 Presigned POST data structure
  return res.json({
    message: 'Presigned POST URL generated successfully.',
    lot_id: lotId,
    object_key: objectKey,
    public_s3_url: `https://${bucketName}.s3.amazonaws.com/${objectKey}`,
    expires_in_seconds: 300,
    presigned_post: {
      url: `https://${bucketName}.s3.amazonaws.com/`,
      fields: {
        key: objectKey,
        acl: 'private',
        'Content-Type': fileType,
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
        'X-Amz-Credential': 'AKIAIOSFODNN7EXAMPLE/20261010/us-east-1/s3/aws4_request',
        'X-Amz-Date': '20261010T210000Z',
        'X-Amz-Signature': `mock_signature_${fileUuid}`
      }
    }
  });
});

// 4. ConfirmReceipt API (Receiver Group & Exception Evaluation)
app.post('/api/aws/lots/:id/confirm', async (req: Request, res: Response) => {
  const id = req.params.id;
  const pk = `LOT#${id}`;
  const item = mockLotsTable.get(pk);

  if (!item) {
    return res.status(404).json({ error: 'NotFound', message: `Lot ${id} not found in DynamoDB.` });
  }

  if (item.status !== 'IN_TRANSIT' && item.status !== 'CLAIMED') {
    return res.status(409).json({
      error: 'InvalidStateTransition',
      message: `Cannot confirm receipt for Lot '${id}'. Current status '${item.status}' is not 'IN_TRANSIT'.`
    });
  }

  const receiverId = req.body.receiver_id || 'RECV-PLANT-01';
  const receivedWeight = Number(req.body.received_weight ?? req.body.actual_weight_kg ?? item.declared_weight_kg);
  const contaminationFlag = Boolean(req.body.contamination_flag ?? req.body.is_contaminated);
  const idempotencyKey = req.body.idempotency_key || req.headers['idempotency-key'] as string;
  const evidenceImageUrl = req.body.evidence_image_url || req.body.evidence_object_key;

  const declaredWeight = item.declared_weight_kg;
  const weightVariance = Math.abs(declaredWeight - receivedWeight);
  const variancePct = declaredWeight > 0 ? (weightVariance / declaredWeight) * 100 : 0;

  const isWeightException = variancePct > 10.0;
  const isException = isWeightException || contaminationFlag;
  const newStatus = isException ? 'EXCEPTION_PENDING' : 'PROCESSOR_ACCEPTED';

  const now = Date.now();
  item.receiver_id = receiverId;
  item.received_weight_kg = receivedWeight;
  item.weight_variance_pct = Number(variancePct.toFixed(1));
  item.contamination_flag = contaminationFlag;
  if (evidenceImageUrl) item.evidence_image_url = evidenceImageUrl;
  item.status = newStatus;
  item.updated_at = now;

  item.audit_trail.push({
    action: `CONFIRM_RECEIPT_${newStatus}`,
    actor: receiverId,
    role: 'Receiver',
    timestamp: now,
    idempotency_key: idempotencyKey,
    note: `Receipt processed. Declared: ${declaredWeight}kg, Received: ${receivedWeight}kg (Variance: ${variancePct.toFixed(1)}%). Contaminated: ${contaminationFlag}. Status: ${newStatus}. S3 Object Key: ${evidenceImageUrl || 'N/A'}`
  });

  mockLotsTable.set(pk, item);

  return res.json({
    message: `Lot receipt confirmed with status ${newStatus}.`,
    status: newStatus,
    exception_detected: isException,
    variance_percentage: Number(variancePct.toFixed(1)),
    data: item
  });
});

// 5. Voice Exception Note API (Amazon Transcribe Audio Processing)
const handleVoiceException = (req: Request, res: Response) => {
  const id = req.params.id;
  const pk = `LOT#${id}`;
  const item = mockLotsTable.get(pk);

  if (!item) {
    return res.status(404).json({ error: 'NotFound', message: `Lot ${id} not found in DynamoDB.` });
  }

  const { audio_base64, language_code = 'ta-IN', recorded_by = 'Collector/Receiver', mock_transcript } = req.body;
  const audioUuid = Math.random().toString(36).substring(2, 10);
  const audioS3Url = `https://proofafterpickup-evidence-dev.s3.amazonaws.com/audio-notes/lots/${id}/${audioUuid}.webm`;

  let transcriptText = mock_transcript;
  if (!transcriptText) {
    const isTamil = String(language_code).toLowerCase().includes('ta');
    transcriptText = isTamil
      ? `[தமிழ் Voice Exception Note]: பிளாஸ்டிக் கழிவுகள் சரியாக பிரிக்கப்படவில்லை. மறுஆய்வு தேவைப்படுகிறது (High plastic contamination & weight discrepancy reported for lot ${id}).`
      : `[English Voice Exception Note]: Contamination detected during pickup inspection. Material requires secondary sorting before acceptance for lot ${id}.`;
  }

  const now = Date.now();
  item.voice_transcript = transcriptText;
  item.audio_s3_url = audioS3Url;
  item.voice_language = language_code;
  item.updated_at = now;

  item.audit_trail.push({
    action: 'VOICE_EXCEPTION_NOTE_ATTACHED',
    actor: recorded_by,
    role: 'Collector/Receiver',
    timestamp: now,
    note: `Voice Exception Note (${language_code}): '${transcriptText}'. Audio S3: ${audioS3Url}`
  });

  mockLotsTable.set(pk, item);

  return res.json({
    success: true,
    lot_id: id,
    voice_transcript: transcriptText,
    audio_s3_url: audioS3Url,
    language_code,
    updated_at: now,
    message: `Voice-first exception note successfully converted and linked to Lot '${id}'!`,
    data: item
  });
};

app.post('/api/aws/lots/:id/voice-note', handleVoiceException);
app.post('/api/aws/lots/:id/voice-exception', handleVoiceException);
app.post('/lots/:id/voice-exception', handleVoiceException);

// 6. CPCB EPR Manifest Generator API
app.post('/api/aws/epr-manifest/generate', (req: Request, res: Response) => {
  const { start_date, end_date, state = 'Tamil Nadu', generated_by = 'System Administrator / CPCB Auditor' } = req.body;
  const items = Array.from(mockLotsTable.values());

  // Filter lots with PROCESSOR_ACCEPTED status (or fallback to include all lots if none accepted yet)
  let matchingLots = items.filter(l => l.status === 'PROCESSOR_ACCEPTED');
  if (matchingLots.length === 0) {
    matchingLots = items; // Fallback so demonstration always yields data
  }

  // Calculate CPCB Categories
  let cat1Weight = 0; // Category I: Rigid
  let cat2Weight = 0; // Category II: Flexible
  let cat3Weight = 0; // Category III: MLP
  let cat4Weight = 0; // Category IV: Compostable/Other

  let cat1Count = 0;
  let cat2Count = 0;
  let cat3Count = 0;

  matchingLots.forEach(lot => {
    const w = lot.weight_kg || 0;
    const catUpper = String(lot.cpcb_category || lot.waste_type || '').toUpperCase();

    if (catUpper.includes('CAT_1') || catUpper.includes('RIGID') || catUpper.includes('PET') || catUpper.includes('HDPE')) {
      cat1Weight += w;
      cat1Count++;
    } else if (catUpper.includes('CAT_2') || catUpper.includes('FLEXIBLE') || catUpper.includes('LDPE') || catUpper.includes('PP')) {
      cat2Weight += w;
      cat2Count++;
    } else if (catUpper.includes('CAT_3') || catUpper.includes('MLP') || catUpper.includes('MULTI')) {
      cat3Weight += w;
      cat3Count++;
    } else {
      // Default distribution for demo
      cat1Weight += w * 0.45;
      cat2Weight += w * 0.35;
      cat3Weight += w * 0.20;
    }
  });

  const totalWeightKg = cat1Weight + cat2Weight + cat3Weight + cat4Weight;
  const manifestId = `EPR-MANIFEST-${Date.now().toString(36).toUpperCase()}`;
  const timestampStr = new Date().toISOString();
  const fileName = `cpcb_epr_manifest_${manifestId}.csv`;
  const s3Key = `cpcb-epr-reports/${fileName}`;

  // Generate CSV content
  const csvHeaders = 'Manifest_ID,Lot_ID,Society_ID,Collector_ID,Processor_ID,Waste_Type,CPCB_Category,Net_Weight_KG,Verification_Status,Accepted_At\n';
  const csvRows = matchingLots.map(lot => {
    const cat = lot.cpcb_category || 'Category I (Rigid)';
    return `"${manifestId}","${lot.lot_id}","${lot.society_id}","${lot.collector_id || 'COLL-101'}","PROC-901","${lot.waste_type || 'PET/Mixed Plastic'}","${cat}",${lot.weight_kg || 0},"PROCESSOR_ACCEPTED","${new Date(lot.updated_at || lot.created_at).toISOString()}"`;
  }).join('\n');

  const csvContent = csvHeaders + csvRows;
  const base64Csv = Buffer.from(csvContent).toString('base64');
  const downloadUrl = `data:text/csv;base64,${base64Csv}`;

  return res.json({
    success: true,
    manifest_id: manifestId,
    generated_at: timestampStr,
    generated_by,
    state,
    date_range: {
      start_date: start_date || '2026-01-01',
      end_date: end_date || '2026-12-31'
    },
    s3_bucket: 'pap-audit-archive-bucket',
    s3_key: s3Key,
    presigned_download_url: downloadUrl,
    csv_filename: fileName,
    expires_in_seconds: 3600,
    records_count: matchingLots.length,
    totals_kg: {
      category_1_rigid_kg: Number(cat1Weight.toFixed(2)),
      category_2_flexible_kg: Number(cat2Weight.toFixed(2)),
      category_3_mlp_kg: Number(cat3Weight.toFixed(2)),
      category_4_other_kg: Number(cat4Weight.toFixed(2)),
      total_received_kg: Number(totalWeightKg.toFixed(2))
    },
    message: `CPCB EPR Manifest ${manifestId} generated successfully in /tmp and uploaded to S3.`
  });
});

// Fetch all lots
app.get('/api/aws/lots', (req: Request, res: Response) => {
  const items = Array.from(mockLotsTable.values());
  return res.json({ count: items.length, items });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`ProofAfterPickup AWS Server running on http://localhost:${PORT}`);
  });
}

startServer();
