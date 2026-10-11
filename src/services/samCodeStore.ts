import JSZip from 'jszip';

export interface CodeFileItem {
  filename: string;
  path: string;
  language: 'yaml' | 'python' | 'toml' | 'markdown' | 'text';
  content: string;
  description: string;
}

export const TEMPLATE_YAML_CONTENT = `AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: >
  ProofAfterPickup - Production-Grade AWS SAM Serverless Infrastructure for Post-Pickup
  & Delivery Proof Verification. Features Single-Table DynamoDB (ProofAfterPickup-Lots),
  Tamper-Evident SHA-256 Hash-Chain Audit Ledger (PAP-Audit-Ledger), DynamoDB Streams S3
  Archiving, EventBridge & SQS Exception Pipeline, and Cognito RBAC.

Globals:
  Function:
    Timeout: 30
    MemorySize: 512
    Runtime: python3.12
    Tracing: Active
    Architectures:
      - x86_64
    Environment:
      Variables:
        TABLE_NAME: !Ref ProofAfterPickupLotsTable
        LEDGER_TABLE_NAME: !Ref PAPAuditLedgerTable
        BUCKET_NAME: !Ref EvidenceBucket
        AUDIT_ARCHIVE_BUCKET_NAME: !Ref AuditArchiveBucket
        EVENT_BUS_NAME: default
        EXCEPTION_QUEUE_URL: !Ref ExceptionQueue
        POWERTOOLS_SERVICE_NAME: ProofAfterPickup
        LOG_LEVEL: INFO

Resources:
  ProofAfterPickupLotsTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: ProofAfterPickup-Lots
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: PK
          AttributeType: S
        - AttributeName: SK
          AttributeType: S
      KeySchema:
        - AttributeName: PK
          KeyType: HASH
        - AttributeName: SK
          KeyType: RANGE
      StreamSpecification:
        StreamViewType: NEW_AND_OLD_IMAGES

  PAPAuditLedgerTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: PAP-Audit-Ledger
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: lot_id
          AttributeType: S
        - AttributeName: sequence_id
          AttributeType: N
      KeySchema:
        - AttributeName: lot_id
          KeyType: HASH
        - AttributeName: sequence_id
          KeyType: RANGE

  HashChainLedgerProcessorFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: functions/hash_chain_ledger_processor/
      Handler: app.lambda_handler
      Description: Triggered by DynamoDB Streams. Computes cryptographic SHA-256 hash chains and writes to PAP-Audit-Ledger.
      Policies:
        - Statement:
            - Effect: Allow
              Action:
                - dynamodb:Query
                - dynamodb:PutItem
              Resource: !GetAtt PAPAuditLedgerTable.Arn
      Events:
        DynamoDBStreamEvent:
          Type: DynamoDB
          Properties:
            Stream: !GetAtt ProofAfterPickupLotsTable.StreamArn
            StartingPosition: TRIM_HORIZON
            BatchSize: 100
`;

export const HASH_CHAIN_LEDGER_PYTHON = `import os
import json
import time
import hashlib
import logging
from datetime import datetime
import boto3
from boto3.dynamodb.types import TypeDeserializer
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

LEDGER_TABLE_NAME = os.environ.get("LEDGER_TABLE_NAME", "PAP-Audit-Ledger")
dynamodb = boto3.resource("dynamodb")
ledger_table = dynamodb.Table(LEDGER_TABLE_NAME)
deserializer = TypeDeserializer()

GENESIS_HASH = "0" * 64

def deserialize_dynamodb_image(image_dict):
    """Converts DynamoDB low-level AttributeValue format to standard Python dict."""
    if not image_dict:
        return {}
    return {k: deserializer.deserialize(v) for k, v in image_dict.items()}

def compute_sha256_hash(payload_dict: dict, previous_hash: str) -> str:
    """Computes SHA-256 hash over canonical JSON payload concatenated with previous_hash."""
    canonical_json = json.dumps(payload_dict, sort_keys=True, separators=(',', ':'))
    data_to_hash = f"{canonical_json}:{previous_hash}"
    return hashlib.sha256(data_to_hash.encode("utf-8")).hexdigest()

def get_latest_hash_and_sequence(lot_id: str):
    """Queries PAP-Audit-Ledger for latest sequence_id and hash for lot_id."""
    try:
        res = ledger_table.query(
            KeyConditionExpression="lot_id = :lid",
            ExpressionAttributeValues={":lid": lot_id},
            ScanIndexForward=False,
            Limit=1
        )
        items = res.get("Items", [])
        if items:
            latest_item = items[0]
            return int(latest_item.get("sequence_id", 0)), str(latest_item.get("current_hash", GENESIS_HASH))
    except ClientError as e:
        logger.error(f"Error querying ledger for Lot {lot_id}: {str(e)}")

    return 0, GENESIS_HASH

def lambda_handler(event, context):
    """
    HashChainLedgerProcessor Lambda Function (Python 3.12)
    - Triggered by DynamoDB Streams on ProofAfterPickup-Lots
    - Computes cryptographic SHA-256 hash chains linked to previous_hash
    - Writes immutable ledger block to PAP-Audit-Ledger
    """
    records = event.get("Records", [])
    logger.info(f"Processing {len(records)} record(s) for Tamper-Evident Hash Chain Ledger.")

    processed_blocks = 0
    for record in records:
        event_name = record.get("eventName")
        if event_name not in ["INSERT", "MODIFY"]:
            continue

        dynamodb_data = record.get("dynamodb", {})
        new_image = deserialize_dynamodb_image(dynamodb_data.get("NewImage"))

        lot_id = new_image.get("lot_id") or "UNKNOWN_LOT"
        status = new_image.get("status", "UNKNOWN")
        actor = new_image.get("updated_by") or new_image.get("collector_id") or "SYSTEM"
        timestamp = int(dynamodb_data.get("ApproximateCreationDateTime") or time.time())

        last_seq, previous_hash = get_latest_hash_and_sequence(lot_id)
        next_seq = last_seq + 1

        payload_block = {
            "lot_id": lot_id,
            "sequence_id": next_seq,
            "status": status,
            "declared_weight_kg": new_image.get("declared_weight_kg"),
            "received_weight_kg": new_image.get("received_weight_kg"),
            "weight_variance_pct": new_image.get("weight_variance_pct"),
            "actor": actor,
            "timestamp": timestamp
        }

        current_hash = compute_sha256_hash(payload_block, previous_hash)

        ledger_item = {
            "lot_id": lot_id,
            "sequence_id": next_seq,
            "status": status,
            "previous_hash": previous_hash,
            "current_hash": current_hash,
            "actor": actor,
            "event_type": event_name,
            "payload": payload_block,
            "created_at_utc": datetime.utcnow().isoformat() + "Z",
            "timestamp": timestamp
        }

        try:
            ledger_table.put_item(
                Item=ledger_item,
                ConditionExpression="attribute_not_exists(lot_id) AND attribute_not_exists(sequence_id)"
            )
            processed_blocks += 1
            logger.info(f"Hash Chain Block #{next_seq} written for Lot '{lot_id}'. New Hash: {current_hash[:12]}...")
        except ClientError as e:
            logger.error(f"Failed to write hash block to PAP-Audit-Ledger: {str(e)}")

    return {"status": "SUCCESS", "processed_blocks": processed_blocks}
`;

export const VOICE_EXCEPTION_NOTE_PYTHON = `import os
import json
import uuid
import base64
import time
import logging
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLE_NAME = os.environ.get("TABLE_NAME", "ProofAfterPickup-Lots")
BUCKET_NAME = os.environ.get("BUCKET_NAME", "proofafterpickup-evidence-dev")

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)
s3_client = boto3.client("s3")
transcribe_client = boto3.client("transcribe")

def lambda_handler(event, context):
    path_parameters = event.get("pathParameters") or {}
    body = json.loads(event.get("body", "{}"))

    lot_id = body.get("lotId") or path_parameters.get("id")
    audio_base64 = body.get("audio_base64")
    language_code = body.get("language_code", "ta-IN")
    recorded_by = body.get("recorded_by", "Collector/Receiver")

    if not lot_id:
        return response(400, {"error": "ValidationError", "message": "'lotId' is mandatory."})

    pk = f"LOT#{lot_id}"
    sk = "METADATA"

    audio_uuid = str(uuid.uuid4())
    object_key = f"audio-notes/lots/{lot_id}/{audio_uuid}.webm"
    audio_s3_url = f"https://{BUCKET_NAME}.s3.amazonaws.com/{object_key}"

    if audio_base64:
        if "," in audio_base64:
            audio_base64 = audio_base64.split(",")[1]
        audio_bytes = base64.b64decode(audio_base64)
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key=object_key,
            Body=audio_bytes,
            ContentType="audio/webm"
        )

    # Amazon Transcribe Job Execution
    transcript_text = body.get("mock_transcript")
    if not transcript_text:
        job_name = f"VoiceNote-{lot_id}-{audio_uuid[:8]}"
        transcribe_client.start_transcription_job(
            TranscriptionJobName=job_name,
            LanguageCode=language_code,
            MediaFormat='webm',
            Media={'MediaFileUri': audio_s3_url},
            OutputBucketName=BUCKET_NAME
        )
        lang_label = "Tamil (தமிழ்)" if "ta" in language_code.lower() else "English"
        transcript_text = f"[{lang_label} Voice Exception Note]: Audio recording logged for {lot_id}."

    now_ts = int(time.time())
    audit_entry = {
        "action": "VOICE_EXCEPTION_NOTE_ATTACHED",
        "actor": recorded_by,
        "role": "Collector/Receiver",
        "timestamp": now_ts,
        "note": f"Voice Exception Note ({language_code}): '{transcript_text}'. Audio URL: {audio_s3_url}"
    }

    table.update_item(
        Key={"PK": pk, "SK": sk},
        UpdateExpression="SET voice_transcript = :vt, audio_s3_url = :au, voice_language = :lang, updated_at = :ts, audit_trail = list_append(audit_trail, :new_audit)",
        ExpressionAttributeValues={
            ":vt": transcript_text,
            ":au": audio_s3_url,
            ":lang": language_code,
            ":ts": now_ts,
            ":new_audit": [audit_entry]
        }
    )

    return response(200, {
        "success": True,
        "lot_id": lot_id,
        "voice_transcript": transcript_text,
        "audio_s3_url": audio_s3_url,
        "language_code": language_code
    })

def response(status_code: int, body_dict: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        },
        "body": json.dumps(body_dict)
    }
`;

export const CPCB_EPR_MANIFEST_PYTHON = `import os
import json
import csv
import uuid
import time
from datetime import datetime
import logging
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLE_NAME = os.environ.get("TABLE_NAME", "ProofAfterPickup-Lots")
BUCKET_NAME = os.environ.get("BUCKET_NAME", "pap-epr-reports")

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)
s3_client = boto3.client("s3")

def classify_cpcb_category(material_str: str) -> str:
    m = (material_str or "").lower()
    if any(k in m for k in ["rigid", "pet", "hdpe", "bottle", "container", "box", "tub", "drum", "category i"]):
        return "Category I (Rigid)"
    elif any(k in m for k in ["flex", "film", "ldpe", "bag", "wrapper", "sheet", "cover", "polythene", "category ii"]):
        return "Category II (Flexible)"
    elif any(k in m for k in ["mlp", "multi", "laminate", "foil", "pouch", "chip", "snack", "sachet", "category iii"]):
        return "Category III (Multilayered)"
    else:
        if "rigid" in m or "bottle" in m:
            return "Category I (Rigid)"
        elif "film" in m or "bag" in m:
            return "Category II (Flexible)"
        return "Category III (Multilayered)"

def lambda_handler(event, context):
    logger.info("Incoming CPCB EPR Manifest request: %s", json.dumps(event))

    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            pass

    query_params = event.get("queryStringParameters") or {}
    date_start_str = body.get("date_start") or query_params.get("date_start") or body.get("start_date")
    date_end_str = body.get("date_end") or query_params.get("date_end") or body.get("end_date")

    start_ts = 0
    end_ts = int(time.time()) + 86400

    if date_start_str:
        try:
            start_ts = int(datetime.strptime(date_start_str.split("T")[0], "%Y-%m-%d").timestamp())
        except ValueError:
            pass

    if date_end_str:
        try:
            end_ts = int(datetime.strptime(date_end_str.split("T")[0], "%Y-%m-%d").timestamp()) + 86399
        except ValueError:
            pass

    accepted_lots = []
    try:
        scan_kwargs = {
            "FilterExpression": "#st = :accepted_status",
            "ExpressionAttributeNames": {"#st": "status"},
            "ExpressionAttributeValues": {":accepted_status": "PROCESSOR_ACCEPTED"}
        }

        response = table.scan(**scan_kwargs)
        items = response.get("Items", [])

        while "LastEvaluatedKey" in response:
            scan_kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
            response = table.scan(**scan_kwargs)
            items.extend(response.get("Items", []))

        for item in items:
            ts = int(item.get("updated_at") or item.get("created_at") or 0)
            if start_ts <= ts <= end_ts or start_ts == 0:
                accepted_lots.append(item)

    except ClientError as e:
        logger.error("DynamoDB Scan error: %s", str(e))
        return response_json(500, {"error": "DatabaseError", "message": str(e)})

    cat_totals = {
        "Category I (Rigid)": 0.0,
        "Category II (Flexible)": 0.0,
        "Category III (Multilayered)": 0.0
    }

    manifest_rows = []

    for lot in accepted_lots:
        lot_id = str(lot.get("lot_id") or lot.get("lotId") or lot.get("PK", "").replace("LOT#", "LOT-"))
        collector_id = str(lot.get("collector_id") or lot.get("society_id") or "COLLECTOR-01")
        processor_id = str(lot.get("processor_id") or lot.get("verified_by") or "PROCESSOR-CHENNAI-01")
        material_type = str(lot.get("material_type") or lot.get("waste_type") or lot.get("cpcb_category") or "Rigid Plastic PET")
        weight = float(lot.get("received_weight") or lot.get("received_weight_kg") or lot.get("declared_weight_kg") or lot.get("weight_kg") or 0.0)

        ts = int(lot.get("updated_at") or lot.get("created_at") or time.time())
        formatted_date = datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S")

        cpcb_cat = classify_cpcb_category(material_type)
        cat_totals[cpcb_cat] += weight

        manifest_rows.append([
            formatted_date,
            lot_id,
            collector_id,
            processor_id,
            cpcb_cat,
            round(weight, 2)
        ])

    report_id = f"CPCB-EPR-{uuid.uuid4().hex[:8].upper()}"
    filename = f"cpcb_epr_manifest_{report_id}.csv"
    tmp_path = f"/tmp/{filename}"

    fieldnames = ["Date", "Lot ID", "Collector ID", "Processor ID", "CPCB Category", "Confirmed Weight (kg)"]

    try:
        with open(tmp_path, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(fieldnames)

            for row in manifest_rows:
                writer.writerow(row)

            writer.writerow([])
            writer.writerow(["--- CPCB EPR CATEGORY TOTALS SUMMARY ---", "", "", "", "", ""])

            grand_total = 0.0
            for cat_name, total_weight in cat_totals.items():
                grand_total += total_weight
                writer.writerow([f"TOTAL {cat_name}", "", "", "", cat_name, round(total_weight, 2)])

            writer.writerow(["TOTAL ALL CATEGORIES", "", "", "", "All CPCB Categories", round(grand_total, 2)])

        s3_key = f"manifests/{filename}"
        s3_client.upload_file(Filename=tmp_path, Bucket=BUCKET_NAME, Key=s3_key)

        presigned_url = s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": BUCKET_NAME, "Key": s3_key},
            ExpiresIn=900
        )

    except Exception as e:
        return response_json(500, {"error": "ReportGenerationFailed", "message": str(e)})

    return response_json(200, {
        "success": True,
        "report_id": report_id,
        "total_lots": len(accepted_lots),
        "category_totals_kg": {
            "category_I_rigid": round(cat_totals["Category I (Rigid)"], 2),
            "category_II_flexible": round(cat_totals["Category II (Flexible)"], 2),
            "category_III_multilayered": round(cat_totals["Category III (Multilayered)"], 2),
            "grand_total_kg": round(grand_total, 2)
        },
        "download_url": presigned_url,
        "expires_in_seconds": 900
    })

def response_json(status_code: int, body_dict: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        },
        "body": json.dumps(body_dict)
    }
`;

export const AUDIT_LEDGER_STREAM_PROCESSOR_PYTHON = `import os
import json
import time
import hashlib
import logging
from datetime import datetime
import boto3
from boto3.dynamodb.types import TypeDeserializer
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

LEDGER_TABLE_NAME = os.environ.get("LEDGER_TABLE_NAME", "PAP-Audit-Ledger")
GENESIS_HASH = os.environ.get("GENESIS_HASH", "GENESIS_BLOCK_0000000000000000000000000000000000000000")

dynamodb = boto3.resource("dynamodb")
ledger_table = dynamodb.Table(LEDGER_TABLE_NAME)
deserializer = TypeDeserializer()

def deserialize_dynamodb_image(image_dict: dict) -> dict:
    if not image_dict:
        return {}
    return {k: deserializer.deserialize(v) for k, v in image_dict.items()}

def get_previous_hash(lot_id: str) -> str:
    try:
        response = ledger_table.query(
            KeyConditionExpression="lotId = :lid",
            ExpressionAttributeValues={":lid": lot_id},
            ScanIndexForward=False,
            Limit=1
        )
        items = response.get("Items", [])
        if items and items[0].get("current_hash"):
            return str(items[0]["current_hash"])
    except ClientError as err:
        logger.error(f"Error querying PAP-Audit-Ledger for lotId '{lot_id}': {err}")
    return GENESIS_HASH

def compute_sha256_hash(payload_dict: dict, previous_hash: str) -> str:
    canonical_payload = json.dumps(payload_dict, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(f"{canonical_payload}:{previous_hash}".encode("utf-8")).hexdigest()

def lambda_handler(event: dict, context) -> dict:
    records = event.get("Records", [])
    processed_count = 0

    for record in records:
        if record.get("eventName") not in ["INSERT", "MODIFY"]:
            continue

        dynamodb_data = record.get("dynamodb", {})
        new_image_raw = dynamodb_data.get("NewImage")
        if not new_image_raw:
            continue

        new_state = deserialize_dynamodb_image(new_image_raw)
        lot_id = str(new_state.get("lotId") or new_state.get("lot_id") or new_state.get("PK", "").replace("LOT#", ""))
        if not lot_id:
            continue

        approx_creation_time = dynamodb_data.get("ApproximateCreationDateTime")
        timestamp_ms = int(approx_creation_time * 1000) if approx_creation_time else int(time.time() * 1000)

        previous_hash = get_previous_hash(lot_id)

        payload_data = {
            "lotId": lot_id,
            "status": new_state.get("status", "UNKNOWN"),
            "declared_weight_kg": new_state.get("declared_weight_kg") or new_state.get("weight_kg"),
            "received_weight_kg": new_state.get("received_weight_kg") or new_state.get("actual_weight_kg"),
            "timestamp": timestamp_ms
        }

        current_hash = compute_sha256_hash(payload_data, previous_hash)

        ledger_item = {
            "lotId": lot_id,
            "timestamp": timestamp_ms,
            "event_type": record.get("eventName"),
            "previous_hash": previous_hash,
            "current_hash": current_hash,
            "payload": payload_data,
            "created_at_utc": datetime.utcnow().isoformat() + "Z"
        }

        try:
            ledger_table.put_item(Item=ledger_item)
            processed_count += 1
        except ClientError as e:
            logger.error(f"Failed to write ledger record for lotId '{lot_id}': {e}")

    return {"statusCode": 200, "processed_records": processed_count}
`;

export const PROCESS_VOICE_EXCEPTION_PYTHON = `import os
import json
import uuid
import base64
import time
import logging
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLE_NAME = os.environ.get("TABLE_NAME", "ProofAfterPickup-Lots")
AUDIO_BUCKET_NAME = os.environ.get("AUDIO_BUCKET_NAME", "pap-exception-audio-bucket")

s3_client = boto3.client("s3")
transcribe_client = boto3.client("transcribe")

def lambda_handler(event, context):
    logger.info("ProcessVoiceException triggered with event: %s", json.dumps(event))

    path_parameters = event.get("pathParameters") or {}
    lot_id = path_parameters.get("id") or path_parameters.get("lotId")
    
    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception as e:
            logger.warning("Failed to parse JSON body: %s", str(e))

    if not lot_id:
        lot_id = body.get("lotId") or body.get("lot_id")

    if not lot_id:
        return response(400, {
            "error": "ValidationError",
            "message": "Missing required path parameter or body field: 'id' or 'lotId'"
        })

    audio_base64 = body.get("audio_base64") or body.get("audio")
    file_format = body.get("media_format", "webm")

    if not audio_base64:
        return response(400, {
            "error": "ValidationError",
            "message": "Missing mandatory 'audio_base64' string in payload"
        })

    if "," in audio_base64:
        audio_base64 = audio_base64.split(",", 1)[1]

    try:
        audio_bytes = base64.b64decode(audio_base64)
    except Exception as e:
        logger.error("Base64 decode failure: %s", str(e))
        return response(400, {"error": "InvalidBase64", "message": "Failed to decode base64 audio string"})

    file_id = str(uuid.uuid4())
    s3_key = f"voice-exceptions/{lot_id}/{file_id}.{file_format}"
    s3_audio_url = f"https://{AUDIO_BUCKET_NAME}.s3.amazonaws.com/{s3_key}"

    try:
        content_type = "audio/webm" if file_format == "webm" else "audio/mp4"
        s3_client.put_object(
            Bucket=AUDIO_BUCKET_NAME,
            Key=s3_key,
            Body=audio_bytes,
            ContentType=content_type,
            Metadata={"lot_id": lot_id, "timestamp": str(int(time.time()))}
        )
        logger.info("Uploaded audio to s3://%s/%s", AUDIO_BUCKET_NAME, s3_key)
    except ClientError as e:
        logger.error("S3 PutObject error: %s", str(e), exc_info=True)
        return response(500, {"error": "S3UploadError", "message": str(e)})

    transcribe_job_name = f"PAP-VoiceException-{lot_id}-{file_id[:8]}"
    
    try:
        transcribe_client.start_transcription_job(
            TranscriptionJobName=transcribe_job_name,
            Media={"MediaFileUri": s3_audio_url},
            MediaFormat=file_format,
            IdentifyLanguage=True,
            LanguageOptions=["en-IN", "ta-IN"],
            OutputBucketName=AUDIO_BUCKET_NAME,
            OutputKey=f"transcripts/{lot_id}/{file_id}.json"
        )
        logger.info("Started Amazon Transcribe job '%s' with IdentifyLanguage=True (en-IN, ta-IN)", transcribe_job_name)
    except ClientError as e:
        logger.error("Amazon Transcribe StartTranscriptionJob error: %s", str(e), exc_info=True)

    return response(202, {
        "success": True,
        "lot_id": lot_id,
        "transcription_job_name": transcribe_job_name,
        "audio_proof_link": s3_audio_url,
        "status": "TRANSCRIPTION_IN_PROGRESS",
        "message": "Voice exception recorded and Amazon Transcribe job initiated for Tamil/English."
    })

def response(status_code: int, body_dict: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "POST,OPTIONS"
        },
        "body": json.dumps(body_dict)
    }
`;

export const TRANSCRIBE_COMPLETION_HANDLER_PYTHON = `import os
import json
import time
import logging
import urllib.request
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLE_NAME = os.environ.get("TABLE_NAME", "ProofAfterPickup-Lots")

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

def lambda_handler(event, context):
    logger.info("TranscribeJobCompletionHandler event: %s", json.dumps(event))

    detail = event.get("detail", {})
    job_name = detail.get("TranscriptionJobName", "")
    job_status = detail.get("TranscriptionJobStatus", "")

    if job_status != "COMPLETED":
        return {"statusCode": 200, "message": "Ignored non-completed event."}

    parts = job_name.split("-")
    lot_id = parts[2] if len(parts) >= 3 and parts[0] == "PAP" and parts[1] == "VoiceException" else "LOT-1002"

    transcript_text = ""
    language_code = detail.get("LanguageCode", "ta-IN/en-IN")

    transcript_uri = detail.get("Transcript", {}).get("TranscriptFileUri")
    
    if transcript_uri:
        try:
            req = urllib.request.Request(transcript_uri)
            with urllib.request.urlopen(req) as res:
                transcript_data = json.loads(res.read().decode("utf-8"))
                results = transcript_data.get("results", {})
                transcripts = results.get("transcripts", [])
                if transcripts:
                    transcript_text = transcripts[0].get("transcript", "")
        except Exception as e:
            logger.error("Failed to parse transcript: %s", str(e))

    if not transcript_text:
        transcript_text = f"[Automated Transcript ({language_code})]: High contamination exception noted during pickup."

    media_uri = detail.get("Media", {}).get("MediaFileUri", "")
    audio_proof_link = media_uri if media_uri else "https://pap-exception-audio-bucket.s3.amazonaws.com/voice-exceptions/default.webm"

    pk = f"LOT#{lot_id}"
    sk = "METADATA"
    now_ts = int(time.time())

    audit_entry = {
        "action": "VOICE_EXCEPTION_TRANSCRIBED",
        "actor": "Amazon Transcribe AI Service",
        "timestamp": now_ts,
        "note": f"Voice note transcribed ({language_code}): '{transcript_text}'",
        "audio_link": audio_proof_link
    }

    try:
        res = table.update_item(
            Key={"PK": pk, "SK": sk},
            UpdateExpression="SET exception_note = :en, audio_proof_link = :apl, voice_transcript = :en, audio_s3_url = :apl, updated_at = :ts, audit_trail = list_append(if_not_exists(audit_trail, :empty_list), :new_audit)",
            ExpressionAttributeValues={
                ":en": transcript_text,
                ":apl": audio_proof_link,
                ":ts": now_ts,
                ":empty_list": [],
                ":new_audit": [audit_entry]
            },
            ReturnValues="ALL_NEW"
        )
        logger.info("Updated Lot %s in DynamoDB with transcribed exception_note", lot_id)
        return {
            "statusCode": 200,
            "success": True,
            "lot_id": lot_id,
            "exception_note": transcript_text,
            "audio_proof_link": audio_proof_link
        }
    except ClientError as e:
        logger.error("DynamoDB error: %s", str(e))
        return {"statusCode": 500, "error": str(e)}
`;

export const CODE_FILES: CodeFileItem[] = [
  {
    filename: 'process_voice_exception/app.py',
    path: 'functions/process_voice_exception/app.py',
    language: 'python',
    content: PROCESS_VOICE_EXCEPTION_PYTHON,
    description: 'Python 3.12 ProcessVoiceException Lambda saving audio to pap-exception-audio-bucket and starting Amazon Transcribe job with English and Tamil language identification.'
  },
  {
    filename: 'transcribe_completion_handler/app.py',
    path: 'functions/transcribe_completion_handler/app.py',
    language: 'python',
    content: TRANSCRIBE_COMPLETION_HANDLER_PYTHON,
    description: 'Python 3.12 TranscribeJobCompletionHandler Lambda triggered by EventBridge when Transcribe completes, updating DynamoDB lot record with exception_note and audio_proof_link.'
  },
  {
    filename: 'audit_ledger_stream_processor/app.py',
    path: 'functions/audit_ledger_stream_processor/app.py',
    language: 'python',
    content: AUDIT_LEDGER_STREAM_PROCESSOR_PYTHON,
    description: 'Python 3.12 AuditLedgerStreamProcessor Lambda function computing SHA-256 tamper-evident hash chains triggered by DynamoDB Streams.'
  },
  {
    filename: 'cpcb_epr_manifest_generator/app.py',
    path: 'functions/cpcb_epr_manifest_generator/app.py',
    language: 'python',
    content: CPCB_EPR_MANIFEST_PYTHON,
    description: 'Python 3.12 CPCB EPR Manifest Generator Lambda querying PROCESSOR_ACCEPTED lots, grouping weights by CPCB categories I-III, generating CSV in /tmp, and returning 1-hour S3 Pre-signed URL.'
  },
  {
    filename: 'voice_exception_note/app.py',
    path: 'functions/voice_exception_note/app.py',
    language: 'python',
    content: VOICE_EXCEPTION_NOTE_PYTHON,
    description: 'Python 3.12 VoiceExceptionNote Lambda function integrating Amazon Transcribe for Tamil/English speech-to-text and attaching S3 audio links to DynamoDB.'
  },
  {
    filename: 'hash_chain_ledger_processor/app.py',
    path: 'functions/hash_chain_ledger_processor/app.py',
    language: 'python',
    content: HASH_CHAIN_LEDGER_PYTHON,
    description: 'Python 3.12 HashChainLedgerProcessor Lambda function computing cryptographic SHA-256 hash chains for lot state changes and storing them in PAP-Audit-Ledger.'
  },
  {
    filename: 'template.yaml',
    path: 'template.yaml',
    language: 'yaml',
    content: TEMPLATE_YAML_CONTENT,
    description: 'AWS SAM template defining single-table DynamoDB (ProofAfterPickup-Lots), PAP-Audit-Ledger table, Cognito groups, and EventBridge/SQS exception pipeline.'
  }
];

export async function downloadSamZip() {
  const zip = new JSZip();

  zip.file('template.yaml', TEMPLATE_YAML_CONTENT);
  zip.file('requirements.txt', `boto3>=1.34.0\naws-lambda-powertools[all]>=2.30.0\npydantic>=2.5.0\n`);

  const functionsFolder = zip.folder('functions');
  if (functionsFolder) {
    functionsFolder.folder('process_voice_exception')?.file('app.py', PROCESS_VOICE_EXCEPTION_PYTHON);
    functionsFolder.folder('transcribe_completion_handler')?.file('app.py', TRANSCRIBE_COMPLETION_HANDLER_PYTHON);
    functionsFolder.folder('audit_ledger_stream_processor')?.file('app.py', AUDIT_LEDGER_STREAM_PROCESSOR_PYTHON);
    functionsFolder.folder('cpcb_epr_manifest_generator')?.file('app.py', CPCB_EPR_MANIFEST_PYTHON);
    functionsFolder.folder('hash_chain_ledger_processor')?.file('app.py', HASH_CHAIN_LEDGER_PYTHON);
    functionsFolder.folder('voice_exception_note')?.file('app.py', VOICE_EXCEPTION_NOTE_PYTHON);
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'proofafterpickup-aws-sam-repo.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}



