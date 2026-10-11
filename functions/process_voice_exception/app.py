import os
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
    """
    ProcessVoiceException Lambda Function (Python 3.12)
    - Path parameter: {id} or body.lotId
    - Receives Base64 audio, saves as .webm or .mp4 in S3 (pap-exception-audio-bucket)
    - Triggers asynchronous Amazon Transcribe job with IdentifyLanguage=True or LanguageOptions=['en-IN', 'ta-IN']
    """
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
            Metadata={
                "lot_id": lot_id,
                "timestamp": str(int(time.time()))
            }
        )
        logger.info("Successfully uploaded audio to s3://%s/%s", AUDIO_BUCKET_NAME, s3_key)
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
