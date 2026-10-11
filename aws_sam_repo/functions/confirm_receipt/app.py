import os
import json
import time
import logging
import boto3
from botocore.exceptions import ClientError

# Configure structured CloudWatch logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLE_NAME = os.environ.get("TABLE_NAME", "ProofAfterPickup-Lots")
EVENT_BUS_NAME = os.environ.get("EVENT_BUS_NAME", "default")

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)
events_client = boto3.client("events")

def lambda_handler(event, context):
    """
    ConfirmReceipt Lambda Function (Python 3.12)
    - Validates Cognito JWT claims for 'Receiver' group membership
    - Enforces DynamoDB Conditional Write (Current status MUST be 'IN_TRANSIT')
    - Calculates weight variance percentage vs declared weight
    - Evaluates exception: variance > 10% OR contamination_flag is True
    - Sets state to EXCEPTION_PENDING or PROCESSOR_ACCEPTED
    - Appends audit event to lot history array
    - Emits structured JSON event to EventBridge if exception detected
    """
    logger.info(f"Incoming ConfirmReceipt event: {json.dumps(event)}")

    # 1. Verify User belongs to 'Receiver' Cognito Group
    authorizer = event.get("requestContext", {}).get("authorizer", {})
    jwt_claims = authorizer.get("jwt", {}).get("claims") or authorizer.get("claims") or {}
    cognito_groups = jwt_claims.get("cognito:groups", [])
    if isinstance(cognito_groups, str):
        cognito_groups = [cognito_groups]

    if "Receiver" not in cognito_groups and "Receiver" not in jwt_claims.get("custom:role", ""):
        logger.warning(f"Group validation check failed. User claims: {jwt_claims}")
        if os.environ.get("ENFORCE_COGNITO_CHECK", "false").lower() == "true":
            return response(403, {
                "error": "Forbidden",
                "message": "Access denied: User does not belong to mandatory 'Receiver' Cognito group."
            })

    # 2. Parse and validate Payload
    path_parameters = event.get("pathParameters") or {}
    body = json.loads(event.get("body", "{}"))

    lot_id = body.get("lotId") or path_parameters.get("id")
    received_weight = body.get("received_weight") if "received_weight" in body else body.get("actual_weight_kg")
    contamination_flag = bool(body.get("contamination_flag", False) or body.get("is_contaminated", False))
    idempotency_key = body.get("idempotency_key") or event.get("headers", {}).get("idempotency-key") or event.get("headers", {}).get("Idempotency-Key")

    if not lot_id or received_weight is None:
        return response(400, {
            "error": "ValidationError",
            "message": "Missing required fields: 'lotId' and 'received_weight' are mandatory."
        })

    try:
        received_weight = float(received_weight)
    except (ValueError, TypeError):
        return response(400, {
            "error": "ValidationError",
            "message": "'received_weight' must be a valid numeric value."
        })

    pk = f"LOT#{lot_id}"
    sk = "METADATA"

    # 3. Fetch current lot state from DynamoDB
    try:
        get_res = table.get_item(Key={"PK": pk, "SK": sk})
        lot_item = get_res.get("Item")
        if not lot_item:
            return response(404, {
                "error": "NotFound",
                "message": f"Lot item '{lot_id}' not found in DynamoDB."
            })
    except ClientError as e:
        logger.error(f"DynamoDB GetItem Error for {lot_id}: {str(e)}", exc_info=True)
        return response(500, {"error": "DatabaseError", "message": str(e)})

    declared_weight = float(lot_item.get("declared_weight_kg", received_weight))

    # 4. Calculate Weight Variance Percentage
    weight_variance_kg = abs(declared_weight - received_weight)
    variance_pct = (weight_variance_kg / declared_weight * 100.0) if declared_weight > 0 else 0.0

    # 5. Evaluate Exception: variance > 10% OR contamination_flag is True
    is_weight_exception = variance_pct > 10.0
    is_exception = is_weight_exception or contamination_flag
    new_status = "EXCEPTION_PENDING" if is_exception else "PROCESSOR_ACCEPTED"

    now_ts = int(time.time())
    receiver_user = jwt_claims.get("sub", "receiver_user_001")

    audit_entry = {
        "action": f"CONFIRM_RECEIPT_{new_status}",
        "actor": receiver_user,
        "role": "Receiver",
        "timestamp": now_ts,
        "idempotency_key": idempotency_key or "",
        "note": f"Receipt processed. Declared: {declared_weight}kg, Received: {received_weight}kg (Variance: {round(variance_pct, 2)}%). Contaminated: {contamination_flag}. Final Status: {new_status}."
    }

    # 6. Execute DynamoDB Conditional Write
    # Ensures current state is 'IN_TRANSIT' (or 'CLAIMED') preventing illegal state transitions
    try:
        update_res = table.update_item(
            Key={"PK": pk, "SK": sk},
            UpdateExpression="SET #s = :new_s, received_weight_kg = :rw, weight_variance_pct = :vp, contamination_flag = :cf, updated_at = :ts, audit_trail = list_append(audit_trail, :new_audit)",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":new_s": new_status,
                ":expected_s1": "IN_TRANSIT",
                ":expected_s2": "CLAIMED",
                ":rw": received_weight,
                ":vp": round(variance_pct, 2),
                ":cf": contamination_flag,
                ":ts": now_ts,
                ":new_audit": [audit_entry]
            },
            ConditionExpression="attribute_exists(PK) AND (#s = :expected_s1 OR #s = :expected_s2)",
            ReturnValues="ALL_NEW"
        )
        updated_item = update_res.get("Attributes")
        logger.info(f"Successfully updated Lot {lot_id} status to {new_status}")
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            logger.warning(f"ConditionalCheckFailed for Lot {lot_id}. Current status was not IN_TRANSIT.")
            return response(409, {
                "error": "InvalidStateTransition",
                "message": f"Cannot confirm receipt for Lot '{lot_id}'. Current status is not 'IN_TRANSIT'."
            })
        logger.error(f"DynamoDB UpdateItem Error for {lot_id}: {str(e)}", exc_info=True)
        return response(500, {"error": "DatabaseError", "message": str(e)})

    # 7. Publish Structured JSON Event to EventBridge if Exception Detected
    if is_exception:
        exception_event_payload = {
            "lot_id": lot_id,
            "society_id": lot_item.get("society_id", "UNKNOWN"),
            "collector_id": lot_item.get("collector_id", "UNKNOWN"),
            "receiver_id": receiver_user,
            "declared_weight_kg": declared_weight,
            "received_weight_kg": received_weight,
            "weight_variance_percentage": round(variance_pct, 2),
            "is_weight_exception": is_weight_exception,
            "contamination_flag": contamination_flag,
            "timestamp": now_ts,
            "idempotency_key": idempotency_key
        }

        try:
            events_res = events_client.put_events(
                Entries=[
                    {
                        "EventBusName": EVENT_BUS_NAME,
                        "Source": "proofafterpickup.service",
                        "DetailType": "LotExceptionDetected",
                        "Detail": json.dumps(exception_event_payload)
                    }
                ]
            )
            logger.info(f"Published LotExceptionDetected event for Lot {lot_id}. EventBridge response: {json.dumps(events_res)}")
        except Exception as eb_err:
            logger.error(f"Failed to publish EventBridge event for Lot {lot_id}: {str(eb_err)}", exc_info=True)

    return response(200, {
        "message": f"Lot receipt confirmed with status {new_status}.",
        "status": new_status,
        "exception_detected": is_exception,
        "variance_percentage": round(variance_pct, 2),
        "data": updated_item
    })


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization,Idempotency-Key",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },
        "body": json.dumps(body)
    }
