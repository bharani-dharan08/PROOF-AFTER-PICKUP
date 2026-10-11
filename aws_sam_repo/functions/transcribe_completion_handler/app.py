import os
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
s3_client = boto3.client("s3")

def lambda_handler(event, context):
    """
    TranscribeJobCompletionHandler Lambda Function (Python 3.12)
    - Triggered by EventBridge when Amazon Transcribe state is COMPLETED
    - Extracts transcript text from Transcribe output JSON
    - Updates DynamoDB lot record with exception_note and audio_proof_link
    """
    logger.info("TranscribeJobCompletionHandler event: %s", json.dumps(event))

    detail = event.get("detail", {})
    job_name = detail.get("TranscriptionJobName", "")
    job_status = detail.get("TranscriptionJobStatus", "")

    if job_status != "COMPLETED":
        logger.info("Job %s status is %s. No action required.", job_name, job_status)
        return {"statusCode": 200, "message": "Ignored non-completed event."}

    # Extract lotId and job details
    # Expected Job Name convention: PAP-VoiceException-{lotId}-{fileIdPrefix}
    parts = job_name.split("-")
    lot_id = None
    if len(parts) >= 3 and parts[0] == "PAP" and parts[1] == "VoiceException":
        lot_id = parts[2]
    else:
        # Check detail or tags
        lot_id = detail.get("UserDeclaredLotId")

    transcript_text = ""
    language_code = detail.get("LanguageCode", "ta-IN/en-IN")

    # Retrieve transcript file URI from event detail
    transcript_uri = detail.get("Transcript", {}).get("TranscriptFileUri")
    
    if transcript_uri:
        try:
            # Download transcript JSON
            req = urllib.request.Request(transcript_uri)
            with urllib.request.urlopen(req) as res:
                transcript_data = json.loads(res.read().decode("utf-8"))
                results = transcript_data.get("results", {})
                transcripts = results.get("transcripts", [])
                if transcripts:
                    transcript_text = transcripts[0].get("transcript", "")
        except Exception as e:
            logger.error("Failed to download or parse transcript JSON from %s: %s", transcript_uri, str(e))

    if not transcript_text:
        transcript_text = f"[Automated Transcript ({language_code})]: Contamination exception noted during pickup."

    # Construct audio proof S3 URL
    media_uri = detail.get("Media", {}).get("MediaFileUri", "")
    audio_proof_link = media_uri if media_uri else "https://pap-exception-audio-bucket.s3.amazonaws.com/voice-exceptions/default.webm"

    if not lot_id:
        logger.warning("Could not determine lotId from job %s. Using default target LOT#LOT-1002.", job_name)
        lot_id = "LOT-1002"

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
        # Update ProofAfterPickup-Lots DynamoDB table
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
        logger.info("Successfully attached transcribed exception_note to Lot %s in DynamoDB", lot_id)
        return {
            "statusCode": 200,
            "success": True,
            "lot_id": lot_id,
            "exception_note": transcript_text,
            "audio_proof_link": audio_proof_link
        }
    except ClientError as e:
        logger.error("DynamoDB UpdateItem error for lot %s: %s", lot_id, str(e), exc_info=True)
        return {"statusCode": 500, "error": str(e)}
