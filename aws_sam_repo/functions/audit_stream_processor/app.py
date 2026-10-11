import os
import json
import time
import logging
from datetime import datetime
import boto3
from boto3.dynamodb.types import TypeDeserializer

# Configure CloudWatch logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

AUDIT_BUCKET_NAME = os.environ.get("AUDIT_ARCHIVE_BUCKET_NAME", "pap-audit-archive-bucket")
s3_client = boto3.client("s3")
deserializer = TypeDeserializer()

def deserialize_dynamodb_image(image_dict):
    """Utility to convert DynamoDB low-level AttributeValue format to standard Python dict."""
    if not image_dict:
        return {}
    return {k: deserializer.deserialize(v) for k, v in image_dict.items()}

def lambda_handler(event, context):
    """
    AuditStreamProcessor Lambda Function (Python 3.12)
    - Triggered by DynamoDB Streams (NEW_AND_OLD_IMAGES) on ProofAfterPickup-Lots
    - Processes state changes and custody handovers
    - Formats immutable JSON line audit records
    - Writes JSONL objects into S3 archive bucket ('pap-audit-archive-bucket')
    """
    logger.info(f"Received DynamoDB Stream batch with {len(event.get('Records', []))} record(s).")

    jsonl_entries = []
    now_dt = datetime.utcnow()
    year = now_dt.strftime("%Y")
    month = now_dt.strftime("%m")
    day = now_dt.strftime("%d")

    for record in event.get("Records", []):
        event_name = record.get("eventName")  # INSERT, MODIFY, REMOVE
        event_id = record.get("eventID")
        dynamodb_data = record.get("dynamodb", {})

        new_image = deserialize_dynamodb_image(dynamodb_data.get("NewImage"))
        old_image = deserialize_dynamodb_image(dynamodb_data.get("OldImage"))

        lot_id = new_image.get("lot_id") or old_image.get("lot_id") or "UNKNOWN_LOT"
        old_status = old_image.get("status", "NONE")
        new_status = new_image.get("status", "NONE")

        # Capture custody handover metadata
        audit_record = {
            "audit_event_id": event_id,
            "event_type": event_name,
            "lot_id": lot_id,
            "previous_status": old_status,
            "new_status": new_status,
            "society_id": new_image.get("society_id"),
            "collector_id": new_image.get("collector_id"),
            "receiver_id": new_image.get("receiver_id"),
            "declared_weight_kg": new_image.get("declared_weight_kg"),
            "received_weight_kg": new_image.get("received_weight_kg"),
            "weight_variance_percentage": new_image.get("weight_variance_pct"),
            "contamination_flag": new_image.get("contamination_flag"),
            "evidence_image_url": new_image.get("evidence_image_url"),
            "audit_trail_history": new_image.get("audit_trail", []),
            "stream_timestamp": dynamodb_data.get("ApproximateCreationDateTime"),
            "archived_at_utc": now_dt.isoformat() + "Z"
        }

        jsonl_entries.append(json.dumps(audit_record))
        logger.info(f"Processed custody handover audit for Lot '{lot_id}': {old_status} -> {new_status}")

    if not jsonl_entries:
        return {"status": "NO_RECORDS_PROCESSED"}

    # Construct S3 Object Key with date partitioning: audit-logs/year=YYYY/month=MM/day=DD/{timestamp}-{uuid}.jsonl
    batch_timestamp = int(time.time() * 1000)
    s3_object_key = f"audit-logs/year={year}/month={month}/day={day}/custody-handover-{batch_timestamp}.jsonl"
    jsonl_body = "\n".join(jsonl_entries) + "\n"

    try:
        s3_client.put_object(
            Bucket=AUDIT_BUCKET_NAME,
            Key=s3_object_key,
            Body=jsonl_body.encode("utf-8"),
            ContentType="application/x-ndjson"
        )
        logger.info(f"Successfully wrote {len(jsonl_entries)} audit record(s) to s3://{AUDIT_BUCKET_NAME}/{s3_object_key}")
        return {
            "status": "SUCCESS",
            "archived_records_count": len(jsonl_entries),
            "s3_key": s3_object_key
        }
    except Exception as e:
        logger.error(f"Error archiving audit record to S3 bucket '{AUDIT_BUCKET_NAME}': {str(e)}", exc_info=True)
        raise e
