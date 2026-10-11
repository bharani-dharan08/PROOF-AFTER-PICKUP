import os
import json
import uuid
import logging
import boto3
from botocore.exceptions import ClientError

# Configure structured CloudWatch logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

BUCKET_NAME = os.environ.get("BUCKET_NAME", "proofafterpickup-evidence-dev")
s3_client = boto3.client("s3")

def lambda_handler(event, context):
    """
    GeneratePresignedPost Lambda Function (Python 3.12)
    Generates a 5-minute (300s) S3 Pre-signed POST URL with fields and conditions:
    - Object Key linked to lotId: evidence/lots/{lotId}/{uuid}.jpg
    - Expiration: 300 seconds (5 minutes)
    - File size limit: Up to 10MB (10,485,760 bytes)
    """
    logger.info(f"Incoming Presigned POST request: {json.dumps(event)}")

    path_parameters = event.get("pathParameters") or {}
    body = json.loads(event.get("body", "{}"))

    lot_id = body.get("lotId") or path_parameters.get("id")
    file_type = body.get("file_type", "image/jpeg")

    if not lot_id:
        return response(400, {
            "error": "ValidationError",
            "message": "'lotId' is required to link S3 evidence object key."
        })

    # Generate unique object key linked to lotId
    file_uuid = str(uuid.uuid4())
    extension = ".png" if "png" in file_type.lower() else ".jpg"
    object_key = f"evidence/lots/{lot_id}/{file_uuid}{extension}"

    try:
        # Generate S3 Pre-signed POST payload with 5-minute expiration
        presigned_post = s3_client.generate_presigned_post(
            Bucket=BUCKET_NAME,
            Key=object_key,
            Fields={
                "acl": "private",
                "Content-Type": file_type
            },
            Conditions=[
                {"acl": "private"},
                {"Content-Type": file_type},
                ["content-length-range", 100, 10485760]  # 100 bytes to 10MB limit
            ],
            ExpiresIn=300  # 5 minutes
        )

        public_s3_url = f"https://{BUCKET_NAME}.s3.amazonaws.com/{object_key}"

        logger.info(f"Successfully generated 5-min presigned POST for lotId={lot_id}, Key={object_key}")

        return response(200, {
            "message": "Presigned POST URL generated successfully.",
            "lot_id": lot_id,
            "object_key": object_key,
            "public_s3_url": public_s3_url,
            "expires_in_seconds": 300,
            "presigned_post": presigned_post
        })

    except ClientError as e:
        logger.error(f"S3 ClientError generating presigned POST: {str(e)}", exc_info=True)
        return response(500, {"error": "S3PresignError", "message": str(e)})


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
