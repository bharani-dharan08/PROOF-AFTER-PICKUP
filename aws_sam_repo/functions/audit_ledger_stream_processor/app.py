import os
import json
import time
import hashlib
import logging
from datetime import datetime
import boto3
from boto3.dynamodb.types import TypeDeserializer
from botocore.exceptions import ClientError

# =============================================================================
# LOGGING CONFIGURATION
# =============================================================================
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment variables with sensible defaults
LEDGER_TABLE_NAME = os.environ.get("LEDGER_TABLE_NAME", "PAP-Audit-Ledger")
GENESIS_HASH = os.environ.get("GENESIS_HASH", "GENESIS_BLOCK_000000000000000000000000000000000000000000000000000000000000")

# AWS SDK Resources
dynamodb = boto3.resource("dynamodb")
ledger_table = dynamodb.Table(LEDGER_TABLE_NAME)
deserializer = TypeDeserializer()

def deserialize_dynamodb_image(image_dict: dict) -> dict:
    """
    Deserializes a low-level DynamoDB Stream image (AttributeValue map) into a
    native Python dictionary.
    """
    if not image_dict:
        return {}
    return {k: deserializer.deserialize(v) for k, v in image_dict.items()}

def get_previous_hash(lot_id: str) -> str:
    """
    Queries the PAP-Audit-Ledger table for the most recent entry for a given lotId
    to retrieve its 'current_hash' (which serves as the 'previous_hash' for the new block).

    Returns GENESIS_HASH if no previous entry exists for this lotId.
    """
    try:
        response = ledger_table.query(
            KeyConditionExpression="lotId = :lid",
            ExpressionAttributeValues={":lid": lot_id},
            ScanIndexForward=False,  # Descending order by sort key (timestamp)
            Limit=1
        )
        items = response.get("Items", [])
        if items:
            latest_item = items[0]
            prev = latest_item.get("current_hash")
            if prev:
                return str(prev)
    except ClientError as err:
        logger.error(f"Error querying PAP-Audit-Ledger for lotId '{lot_id}': {err.response['Error']['Message']}")

    return GENESIS_HASH

def compute_sha256_hash(payload_dict: dict, previous_hash: str) -> str:
    """
    Computes a cryptographic SHA-256 hash over a canonicalized JSON string of the new lot state
    concatenated with the previous_hash.
    
    Hash = SHA256( canonical_json(payload) + ":" + previous_hash )
    """
    canonical_payload = json.dumps(payload_dict, sort_keys=True, separators=(',', ':'))
    data_to_hash = f"{canonical_payload}:{previous_hash}"
    return hashlib.sha256(data_to_hash.encode("utf-8")).hexdigest()

def lambda_handler(event: dict, context) -> dict:
    """
    AuditLedgerStreamProcessor Lambda Function (Python 3.12)
    
    Triggered by DynamoDB Streams (NEW_AND_OLD_IMAGES) on the ProofAfterPickup-Lots table.
    For every INSERT or MODIFY event:
      1. Extracts new lot state from stream record.
      2. Queries PAP-Audit-Ledger for previous 'current_hash' associated with lotId.
      3. Computes a tamper-evident SHA-256 hash over (payload + previous_hash).
      4. Appends a new immutable audit record into PAP-Audit-Ledger.
    """
    records = event.get("Records", [])
    logger.info(f"AuditLedgerStreamProcessor triggered with {len(records)} stream record(s).")

    processed_count = 0

    for record in records:
        event_name = record.get("eventName")  # INSERT or MODIFY
        if event_name not in ["INSERT", "MODIFY"]:
            logger.debug(f"Skipping non-mutation stream event: {event_name}")
            continue

        dynamodb_data = record.get("dynamodb", {})
        new_image_raw = dynamodb_data.get("NewImage")
        if not new_image_raw:
            logger.warning("Stream record missing NewImage. Skipping.")
            continue

        # Deserialize new image payload
        new_state = deserialize_dynamodb_image(new_image_raw)
        
        # Extract lotId (handling PK or lot_id or lotId)
        lot_id = str(new_state.get("lotId") or new_state.get("lot_id") or new_state.get("PK", "").replace("LOT#", ""))
        if not lot_id:
            logger.error("Could not extract lotId from stream event. Skipping.")
            continue

        # Approximate stream timestamp in milliseconds
        approx_creation_time = dynamodb_data.get("ApproximateCreationDateTime")
        if approx_creation_time:
            timestamp_ms = int(approx_creation_time * 1000)
        else:
            timestamp_ms = int(time.time() * 1000)

        # 1. Retrieve current_hash from the latest ledger entry (becomes previous_hash)
        previous_hash = get_previous_hash(lot_id)

        # 2. Prepare payload block for hashing
        payload_data = {
            "lotId": lot_id,
            "status": new_state.get("status", "UNKNOWN"),
            "waste_type": new_state.get("waste_type") or new_state.get("wasteType"),
            "declared_weight_kg": new_state.get("declared_weight_kg") or new_state.get("weight_kg"),
            "received_weight_kg": new_state.get("received_weight_kg") or new_state.get("actual_weight_kg"),
            "collector_id": new_state.get("collector_id"),
            "receiver_id": new_state.get("receiver_id"),
            "society_id": new_state.get("society_id"),
            "contamination_flag": new_state.get("contamination_flag") or new_state.get("is_contaminated", False),
            "evidence_image_url": new_state.get("evidence_image_url"),
            "voice_transcript": new_state.get("voice_transcript"),
            "idempotency_key": new_state.get("idempotency_key"),
            "timestamp": timestamp_ms
        }

        # 3. Compute new SHA-256 hash
        current_hash = compute_sha256_hash(payload_data, previous_hash)

        # 4. Construct ledger audit item
        ledger_item = {
            "lotId": lot_id,
            "timestamp": timestamp_ms,
            "event_type": event_name,
            "previous_hash": previous_hash,
            "current_hash": current_hash,
            "payload": payload_data,
            "created_at_utc": datetime.utcnow().isoformat() + "Z"
        }

        # 5. Persist to PAP-Audit-Ledger
        try:
            ledger_table.put_item(Item=ledger_item)
            processed_count += 1
            logger.info(
                f"[LEDGER SUCCESS] Hash block appended for lotId '{lot_id}' at {timestamp_ms}. "
                f"PreviousHash: {previous_hash[:16]}... -> CurrentHash: {current_hash[:16]}..."
            )
        except ClientError as e:
            logger.error(
                f"Failed to write audit ledger record for lotId '{lot_id}': {e.response['Error']['Message']}",
                exc_info=True
            )

    return {
        "statusCode": 200,
        "body": json.dumps({
            "message": "Audit ledger stream processing complete.",
            "processed_records": processed_count
        })
    }
