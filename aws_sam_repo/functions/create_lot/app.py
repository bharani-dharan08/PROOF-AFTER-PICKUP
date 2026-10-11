import os
import json
import time
import logging
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLE_NAME = os.environ.get("TABLE_NAME", "ProofAfterPickup-Lots")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

def lambda_handler(event, context):
    """
    CreateLot Lambda - Strict Least-Privilege IAM (dynamodb:PutItem ONLY).
    Invoked by Society users to create a new pickup lot.
    """
    headers = event.get("headers") or {}
    idempotency_key = headers.get("idempotency-key") or headers.get("Idempotency-Key") or f"idemp-{int(time.time()*1000)}"

    try:
        body = json.loads(event.get("body", "{}"))
        lot_id = body.get("lot_id") or f"LOT-{int(time.time())}"
        declared_weight_kg = float(body.get("declared_weight_kg", 25.0))
        waste_type = body.get("waste_type", "Plastics & Recyclables")
        society_id = body.get("society_id", "SOC-SEATTLE-01")
        location = body.get("location", "742 Evergreen Terrace, Seattle WA")

        now_ts = int(time.time())
        pk = f"LOT#{lot_id}"
        sk = "METADATA"

        item = {
            "PK": pk,
            "SK": sk,
            "GSI1PK": f"SOCIETY#{society_id}",
            "GSI1SK": f"STATUS#CREATED#{now_ts}",
            "lot_id": lot_id,
            "society_id": society_id,
            "waste_type": waste_type,
            "declared_weight_kg": declared_weight_kg,
            "location": location,
            "status": "CREATED",
            "created_at": now_ts,
            "updated_at": now_ts,
            "idempotency_key": idempotency_key,
            "audit_trail": [
                {
                    "action": "LOT_CREATED",
                    "actor": society_id,
                    "role": "Society",
                    "timestamp": now_ts,
                    "note": f"Lot {lot_id} created with declared weight {declared_weight_kg}kg."
                }
            ]
        }

        # Strict PutItem with conditional write (attribute_not_exists(PK))
        table.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(PK)"
        )

        return {
            "statusCode": 201,
            "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"message": f"Lot {lot_id} created successfully.", "data": item})
        }
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            return {
                "statusCode": 409,
                "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
                "body": json.dumps({"error": "LotAlreadyExists", "message": "Conditional check failed: Lot PK already exists."})
            }
        logger.error(f"Error creating lot: {str(e)}")
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": str(e)})
        }
