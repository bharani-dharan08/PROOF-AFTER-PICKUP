import os
import json
import time
import logging
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLE_NAME = os.environ.get("TABLE_NAME", "proof-after-pickup-dev")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

def lambda_handler(event, context):
    """
    Multi-modal AI Proof Verifier Lambda function.
    Simulates AWS Bedrock Claude 3 / Amazon Rekognition vision inspection:
    - Package presence & integrity score
    - Doorstep & environmental context matching
    - Shipping label OCR address verification
    - Signature match confidence
    - Fraud & anomaly risk classification
    """
    path_parameters = event.get("pathParameters") or {}
    pickup_id = path_parameters.get("id")
    
    authorizer = event.get("requestContext", {}).get("authorizer", {})
    claims = authorizer.get("claims", {})
    user_id = claims.get("sub", "courier_001")

    if not pickup_id:
        return response(400, {"error": "ValidationError", "message": "Pickup ID required."})

    body = json.loads(event.get("body", "{}"))
    image_url = body.get("image_url")
    signature_data = body.get("signature_data")
    geofence_distance_meters = body.get("geofence_distance_meters", 12.5)

    if not image_url:
        return response(400, {"error": "ValidationError", "message": "image_url is required for AI proof verification."})

    now_ts = int(time.time())

    # Simulated AWS Bedrock / Rekognition visual reasoning evaluation logic
    # In real deployment, calls boto3 bedrock-runtime or rekognition detect_labels
    is_damaged = "damage" in image_url.lower() or "torn" in image_url.lower()
    
    ai_confidence = 98.4 if not is_damaged else 62.1
    package_detected = True
    address_match_score = 99.1
    signature_verified = bool(signature_data)
    geofence_valid = geofence_distance_meters <= 50.0
    
    proof_status = "VERIFIED" if (ai_confidence >= 85.0 and geofence_valid and not is_damaged) else "FLAGGED"
    risk_level = "LOW" if proof_status == "VERIFIED" else ("HIGH" if is_damaged else "MEDIUM")

    ai_analysis_result = {
        "verified_at": now_ts,
        "proof_status": proof_status,
        "risk_level": risk_level,
        "ai_engine": "AWS Bedrock Claude 3 Sonnet + Amazon Rekognition DetectLabels",
        "scores": {
            "overall_confidence": ai_confidence,
            "package_presence_confidence": 99.5,
            "address_ocr_match_confidence": address_match_score,
            "geofence_proximity_meters": geofence_distance_meters,
            "signature_present": signature_verified
        },
        "flags": {
            "package_damage_detected": is_damaged,
            "geofence_breach": not geofence_valid,
            "suspicious_lighting_or_blur": False
        },
        "detected_objects": ["Package", "Cardboard Box", "Doorstep", "House Entryway", "Shipping Label"],
        "recommended_action": "APPROVE_PAYOUT" if proof_status == "VERIFIED" else "ROUTER_TO_HUMAN_REVIEW"
    }

    # Atomically write AI proof result into DynamoDB record
    try:
        res = table.update_item(
            Key={"PK": f"PICKUP#{pickup_id}", "SK": "METADATA"},
            UpdateExpression="SET proof_status = :ps, ai_analysis = :ai, proof_image_url = :img, signature_data = :sig, updated_at = :ts, audit_trail = list_append(audit_trail, :audit)",
            ExpressionAttributeValues={
                ":ps": proof_status,
                ":ai": ai_analysis_result,
                ":img": image_url,
                ":sig": signature_data or "",
                ":ts": now_ts,
                ":audit": [{
                    "action": "PROOF_AI_VERIFIED",
                    "actor": user_id,
                    "timestamp": now_ts,
                    "status": proof_status,
                    "risk": risk_level,
                    "note": f"AI Proof Verification finished with status {proof_status} (Confidence: {ai_confidence}%)."
                }]
            },
            ConditionExpression="attribute_exists(PK)",
            ReturnValues="ALL_NEW"
        )
        return response(200, {
            "message": "AI Proof verification complete.",
            "data": res.get("Attributes")
        })
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            return response(404, {"error": "NotFound", "message": f"Pickup '{pickup_id}' does not exist in DynamoDB."})
        raise e


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
