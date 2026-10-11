import os
import json
import time
import logging
import boto3
from botocore.exceptions import ClientError

# Set up structured logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLE_NAME = os.environ.get("TABLE_NAME", "proof-after-pickup-dev")
IDEMPOTENCY_TABLE = os.environ.get("IDEMPOTENCY_TABLE_NAME", "proof-idempotency-dev")

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)
idempotency_table = dynamodb.Table(IDEMPOTENCY_TABLE)

def lambda_handler(event, context):
    """
    Lambda Handler for Pickup creation & status transitions.
    Implements:
    1. Idempotency Key Lock (attribute_not_exists(id))
    2. DynamoDB Conditional Writes (attribute_not_exists(PK) & state transition validation)
    3. Cognito JWT RBAC Claim Inspection
    """
    method = event.get("httpMethod", "POST")
    headers = event.get("headers") or {}
    
    # Extract Cognito Claims
    authorizer = event.get("requestContext", {}).get("authorizer", {})
    claims = authorizer.get("claims", {})
    user_role = claims.get("custom:role", "Driver")
    user_id = claims.get("sub", "anon_driver_001")

    logger.info(f"Incoming Request: Method={method}, Role={user_role}, UserID={user_id}")

    try:
        if method == "POST":
            return handle_create_pickup(event, headers, user_id, user_role)
        elif method == "PUT":
            return handle_update_status(event, headers, user_id, user_role)
        elif method == "GET":
            return handle_get_pickup(event)
        else:
            return response(405, {"error": "Method Not Allowed"})
    except Exception as e:
        logger.error(f"Unhandled Exception: {str(e)}", exc_info=True)
        return response(500, {"error": "Internal Server Error", "details": str(e)})


def handle_create_pickup(event, headers, user_id, user_role):
    # Idempotency Key check
    idempotency_key = headers.get("Idempotency-Key") or headers.get("idempotency-key")
    if not idempotency_key:
        return response(400, {
            "error": "MissingHeader",
            "message": "Idempotency-Key header is mandatory for POST /pickups to guarantee exactly-once processing."
        })

    # Try acquiring Idempotency Lock in DynamoDB
    ttl_expiry = int(time.time()) + 86400  # 24 hour TTL
    try:
        idempotency_table.put_item(
            Item={
                "id": idempotency_key,
                "status": "PROCESSING",
                "created_at": int(time.time()),
                "ttl": ttl_expiry
            },
            ConditionExpression="attribute_not_exists(id)"
        )
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            # Retrieve existing response or locked state
            existing = idempotency_table.get_item(Key={"id": idempotency_key}).get("Item", {})
            return response(409, {
                "error": "IdempotencyConflict",
                "message": f"Idempotency key '{idempotency_key}' has already been processed or is currently in-flight.",
                "cached_record": existing
            })
        raise e

    # Parse Payload
    body = json.loads(event.get("body", "{}"))
    tracking_number = body.get("tracking_number")
    pickup_address = body.get("pickup_address")
    recipient_name = body.get("recipient_name")
    geofence_coords = body.get("geofence_coords", {"lat": 37.7749, "lng": -122.4194})

    if not tracking_number or not pickup_address:
        return response(400, {"error": "ValidationError", "message": "tracking_number and pickup_address are required."})

    now_ts = int(time.time())
    pickup_id = f"PKUP-{tracking_number}"

    item = {
        "PK": f"PICKUP#{pickup_id}",
        "SK": "METADATA",
        "GSI1PK": f"DRIVER#{user_id}",
        "GSI1SK": f"STATUS#PICKED_UP#{now_ts}",
        "pickup_id": pickup_id,
        "tracking_number": tracking_number,
        "driver_id": user_id,
        "recipient_name": recipient_name,
        "pickup_address": pickup_address,
        "status": "PICKED_UP",
        "geofence_coords": geofence_coords,
        "created_at": now_ts,
        "updated_at": now_ts,
        "idempotency_key": idempotency_key,
        "audit_trail": [
            {
                "action": "PICKUP_INITIATED",
                "actor": user_id,
                "role": user_role,
                "timestamp": now_ts,
                "idempotency_key": idempotency_key,
                "note": "Package picked up by courier. Conditional write lock succeeded."
            }
        ]
    }

    # Strict Conditional Write: Prevent overwriting an existing pickup ID
    try:
        table.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(PK)"
        )
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            return response(409, {
                "error": "PickupAlreadyExists",
                "message": f"Pickup item '{pickup_id}' already exists in DynamoDB. Double-pickup rejected."
            })
        raise e

    # Update Idempotency Table with Completed status
    idempotency_table.update_item(
        Key={"id": idempotency_key},
        UpdateExpression="SET #s = :s, pickup_id = :p",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":s": "COMPLETED", ":p": pickup_id}
    )

    return response(201, {
        "message": "Pickup created successfully with DynamoDB conditional write & idempotency key.",
        "data": item
    })


def handle_update_status(event, headers, user_id, user_role):
    path_parameters = event.get("pathParameters") or {}
    pickup_id = path_parameters.get("id")
    body = json.loads(event.get("body", "{}"))
    new_status = body.get("status")
    expected_status = body.get("expected_status")  # e.g., 'PICKED_UP'

    if not pickup_id or not new_status or not expected_status:
        return response(400, {"error": "ValidationError", "message": "id, status, and expected_status are required."})

    now_ts = int(time.time())

    # Conditional Update: State Machine protection
    try:
        res = table.update_item(
            Key={"PK": f"PICKUP#{pickup_id}", "SK": "METADATA"},
            UpdateExpression="SET #st = :new_st, updated_at = :ts, audit_trail = list_append(audit_trail, :new_audit)",
            ExpressionAttributeNames={"#st": "status"},
            ExpressionAttributeValues={
                ":new_st": new_status,
                ":expected": expected_status,
                ":ts": now_ts,
                ":new_audit": [{
                    "action": f"TRANSITION_TO_{new_status}",
                    "actor": user_id,
                    "role": user_role,
                    "timestamp": now_ts,
                    "note": f"State transition from {expected_status} to {new_status}"
                }]
            },
            ConditionExpression="attribute_exists(PK) AND #st = :expected",
            ReturnValues="ALL_NEW"
        )
        return response(200, {
            "message": "Status updated successfully.",
            "data": res.get("Attributes")
        })
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            return response(409, {
                "error": "StateTransitionConflict",
                "message": f"Cannot transition '{pickup_id}' to '{new_status}'. Expected current status '{expected_status}' did not match DynamoDB record state."
            })
        raise e


def handle_get_pickup(event):
    path_parameters = event.get("pathParameters") or {}
    pickup_id = path_parameters.get("id")
    res = table.get_item(Key={"PK": f"PICKUP#{pickup_id}", "SK": "METADATA"})
    item = res.get("Item")
    if not item:
        return response(404, {"error": "NotFound", "message": f"Pickup '{pickup_id}' not found."})
    return response(200, {"data": item})


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Idempotency-Key",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },
        "body": json.dumps(body)
    }
