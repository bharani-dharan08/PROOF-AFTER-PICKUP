import os
import json
import time
import hashlib
import logging
from datetime import datetime
import boto3
from boto3.dynamodb.types import TypeDeserializer
from botocore.exceptions import ClientError

# Configure CloudWatch logger
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
    """
    Computes a deterministic SHA-256 cryptographic hash over a canonical JSON payload
    concatenated with the previous block's hash to maintain a tamper-evident hash chain.
    """
    canonical_json = json.dumps(payload_dict, sort_keys=True, separators=(',', ':'))
    data_to_hash = f"{canonical_json}:{previous_hash}"
    return hashlib.sha256(data_to_hash.encode("utf-8")).hexdigest()

def get_latest_hash_and_sequence(lot_id: str):
    """
    Queries the PAP-Audit-Ledger table for the latest sequence_id and hash for a given lot_id.
    Returns (sequence_id, latest_hash). Defaults to (0, GENESIS_HASH) if no prior records exist.
    """
    try:
        res = ledger_table.query(
            KeyConditionExpression="lot_id = :lid",
            ExpressionAttributeValues={":lid": lot_id},
            ScanIndexForward=False,  # Descending order (latest sequence first)
            Limit=1
        )
        items = res.get("Items", [])
        if items:
            latest_item = items[0]
            seq_id = int(latest_item.get("sequence_id", 0))
            latest_hash = str(latest_item.get("current_hash", GENESIS_HASH))
            return seq_id, latest_hash
    except ClientError as e:
        logger.error(f"Error querying latest hash for Lot {lot_id}: {str(e)}")

    return 0, GENESIS_HASH

def lambda_handler(event, context):
    """
    HashChainLedgerProcessor Lambda Function (Python 3.12)
    - Triggered by DynamoDB Streams (INSERT / MODIFY) on ProofAfterPickup-Lots table
    - Extracts new lot state and calculates SHA-256 hash chained to previous_hash
    - Writes tamper-evident cryptographic block into PAP-Audit-Ledger DynamoDB table
    """
    records = event.get("Records", [])
    logger.info(f"Processing DynamoDB Stream batch with {len(records)} record(s) for Tamper-Evident Hash Chain Ledger.")

    processed_blocks = 0

    for record in records:
        event_name = record.get("eventName")  # INSERT or MODIFY
        if event_name not in ["INSERT", "MODIFY"]:
            continue

        dynamodb_data = record.get("dynamodb", {})
        new_image = deserialize_dynamodb_image(dynamodb_data.get("NewImage"))
        old_image = deserialize_dynamodb_image(dynamodb_data.get("OldImage"))

        lot_id = new_image.get("lot_id") or "UNKNOWN_LOT"
        status = new_image.get("status", "UNKNOWN")
        actor = new_image.get("updated_by") or new_image.get("collector_id") or new_image.get("society_id") or "SYSTEM"
        timestamp = int(dynamodb_data.get("ApproximateCreationDateTime") or time.time())

        # Retrieve latest sequence ID and previous hash from Ledger table
        last_seq, previous_hash = get_latest_hash_and_sequence(lot_id)
        next_seq = last_seq + 1

        # Build canonical payload block for hashing
        payload_block = {
            "lot_id": lot_id,
            "sequence_id": next_seq,
            "status": status,
            "declared_weight_kg": new_image.get("declared_weight_kg"),
            "received_weight_kg": new_image.get("received_weight_kg"),
            "weight_variance_pct": new_image.get("weight_variance_pct"),
            "contamination_flag": new_image.get("contamination_flag"),
            "evidence_image_url": new_image.get("evidence_image_url"),
            "actor": actor,
            "timestamp": timestamp
        }

        # Compute new chained SHA-256 hash
        current_hash = compute_sha256_hash(payload_block, previous_hash)

        # Construct immutable ledger item
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

        # Write to PAP-Audit-Ledger with conditional write (prevent duplicate sequence)
        try:
            ledger_table.put_item(
                Item=ledger_item,
                ConditionExpression="attribute_not_exists(lot_id) AND attribute_not_exists(sequence_id)"
            )
            processed_blocks += 1
            logger.info(
                f"Tamper-Evident Hash Chain Block #{next_seq} written for Lot '{lot_id}'. "
                f"Prev Hash: {previous_hash[:12]}... -> New Hash: {current_hash[:12]}..."
            )
        except ClientError as e:
            if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                logger.warn(f"Duplicate sequence block {next_seq} for Lot {lot_id} already exists in Ledger.")
            else:
                logger.error(f"Failed to write hash block to PAP-Audit-Ledger: {str(e)}", exc_info=True)

    return {
        "status": "SUCCESS",
        "processed_blocks": processed_blocks
    }
