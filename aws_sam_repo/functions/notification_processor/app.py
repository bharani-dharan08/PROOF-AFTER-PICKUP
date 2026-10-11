import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    """
    NotificationProcessor Lambda - Triggered by SQS ExceptionQueue events.
    Sends notifications/alerts to Supervisors for weight mismatch or contamination.
    """
    records = event.get("Records", [])
    logger.info(f"NotificationProcessor received {len(records)} SQS exception messages.")

    for record in records:
        body = json.loads(record.get("body", "{}"))
        lot_id = body.get("lot_id")
        mismatch_pct = body.get("mismatch_percentage")
        is_contaminated = body.get("is_contaminated")

        logger.warn(f"[SUPERVISOR ALERT] Exception on Lot '{lot_id}': Mismatch={mismatch_pct}%, Contaminated={is_contaminated}. Evidence photo: {body.get('evidence_image_url')}")

    return {"status": "NOTIFICATIONS_PROCESSED", "count": len(records)}
