import os
import json
import logging
import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SQS_QUEUE_URL = os.environ.get("EXCEPTION_QUEUE_URL", "")
sqs = boto3.client("sqs")

def lambda_handler(event, context):
    """
    ExceptionProcessor Lambda - Triggered by EventBridge 'LotExceptionDetected'.
    Publishes exception messages to the SQS FIFO queue.
    """
    logger.info(f"Received EventBridge exception event: {json.dumps(event)}")
    detail = event.get("detail", {})
    lot_id = detail.get("lot_id", "UNKNOWN")

    try:
        if SQS_QUEUE_URL:
            sqs.send_message(
                QueueUrl=SQS_QUEUE_URL,
                MessageBody=json.dumps(detail),
                MessageGroupId="LotExceptions",
                MessageDeduplicationId=f"{lot_id}-{detail.get('timestamp')}"
            )
            logger.info(f"Pushed exception for Lot {lot_id} to SQS FIFO Queue.")
    except Exception as e:
        logger.error(f"Error sending message to SQS: {str(e)}")

    return {"status": "SUCCESS", "lot_id": lot_id}
