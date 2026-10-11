import os
import json
import csv
import uuid
import time
from datetime import datetime
import logging
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLE_NAME = os.environ.get("TABLE_NAME", "ProofAfterPickup-Lots")
BUCKET_NAME = os.environ.get("BUCKET_NAME", "pap-epr-reports")

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)
s3_client = boto3.client("s3")

def classify_cpcb_category(material_str: str) -> str:
    """
    Categorizes plastic waste under CPCB EPR Rules:
    - Category I: Rigid Plastic (Containers, PET, HDPE, Rigid PP)
    - Category II: Flexible Plastic (Films, LDPE, Bags, Wrappers)
    - Category III: Multilayered Plastic / MLP (Laminates, Pouches, Packets)
    """
    m = (material_str or "").lower()
    if any(k in m for k in ["rigid", "pet", "hdpe", "bottle", "container", "box", "tub", "drum", "category i"]):
        return "Category I (Rigid)"
    elif any(k in m for k in ["flex", "film", "ldpe", "bag", "wrapper", "sheet", "cover", "polythene", "category ii"]):
        return "Category II (Flexible)"
    elif any(k in m for k in ["mlp", "multi", "laminate", "foil", "pouch", "chip", "snack", "sachet", "category iii"]):
        return "Category III (Multilayered)"
    else:
        if "rigid" in m or "bottle" in m:
            return "Category I (Rigid)"
        elif "film" in m or "bag" in m:
            return "Category II (Flexible)"
        return "Category III (Multilayered)"

def lambda_handler(event, context):
    """
    CPCB EPR Manifest Generator Lambda Function (Python 3.12)
    - Takes date_start and date_end parameters
    - Queries ProofAfterPickup-Lots DynamoDB table for status = PROCESSOR_ACCEPTED
    - Groups received_weight into CPCB plastic categories (Cat I, Cat II, Cat III)
    - Generates structured CSV in /tmp/ directory with column headers and category totals
    - Uploads CSV to 'pap-epr-reports' S3 bucket
    - Returns a 15-minute (900s) S3 Pre-signed download URL
    """
    logger.info("Incoming CPCB EPR Manifest generation request: %s", json.dumps(event))

    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception as e:
            logger.warning("Failed to parse event body as JSON: %s", str(e))

    query_params = event.get("queryStringParameters") or {}
    date_start_str = body.get("date_start") or query_params.get("date_start") or body.get("start_date") or query_params.get("start_date")
    date_end_str = body.get("date_end") or query_params.get("date_end") or body.get("end_date") or query_params.get("end_date")

    start_ts = 0
    end_ts = int(time.time()) + 86400

    if date_start_str:
        try:
            start_ts = int(datetime.strptime(date_start_str.split("T")[0], "%Y-%m-%d").timestamp())
        except ValueError:
            logger.warning("Invalid date_start format '%s'. Expected YYYY-MM-DD.", date_start_str)

    if date_end_str:
        try:
            end_ts = int(datetime.strptime(date_end_str.split("T")[0], "%Y-%m-%d").timestamp()) + 86399
        except ValueError:
            logger.warning("Invalid date_end format '%s'. Expected YYYY-MM-DD.", date_end_str)

    accepted_lots = []
    try:
        scan_kwargs = {
            "FilterExpression": "#st = :accepted_status",
            "ExpressionAttributeNames": {"#st": "status"},
            "ExpressionAttributeValues": {":accepted_status": "PROCESSOR_ACCEPTED"}
        }

        response = table.scan(**scan_kwargs)
        items = response.get("Items", [])

        while "LastEvaluatedKey" in response:
            scan_kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
            response = table.scan(**scan_kwargs)
            items.extend(response.get("Items", []))

        for item in items:
            ts = int(item.get("updated_at") or item.get("created_at") or 0)
            if start_ts <= ts <= end_ts or start_ts == 0:
                accepted_lots.append(item)

    except ClientError as e:
        logger.error("DynamoDB Scan error: %s", str(e), exc_info=True)
        return response_json(500, {"error": "DatabaseError", "message": str(e)})

    logger.info("Retrieved %d PROCESSOR_ACCEPTED lot(s) for manifest date window.", len(accepted_lots))

    cat_totals = {
        "Category I (Rigid)": 0.0,
        "Category II (Flexible)": 0.0,
        "Category III (Multilayered)": 0.0
    }

    manifest_rows = []

    for lot in accepted_lots:
        lot_id = str(lot.get("lot_id") or lot.get("lotId") or lot.get("PK", "").replace("LOT#", "LOT-"))
        collector_id = str(lot.get("collector_id") or lot.get("society_id") or "COLLECTOR-01")
        processor_id = str(lot.get("processor_id") or lot.get("verified_by") or "PROCESSOR-CHENNAI-01")
        material_type = str(lot.get("material_type") or lot.get("waste_type") or lot.get("cpcb_category") or "Rigid Plastic PET")
        weight = float(lot.get("received_weight") or lot.get("received_weight_kg") or lot.get("declared_weight_kg") or lot.get("weight_kg") or 0.0)

        ts = int(lot.get("updated_at") or lot.get("created_at") or time.time())
        formatted_date = datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S")

        cpcb_cat = classify_cpcb_category(material_type)
        cat_totals[cpcb_cat] += weight

        manifest_rows.append([
            formatted_date,
            lot_id,
            collector_id,
            processor_id,
            cpcb_cat,
            round(weight, 2)
        ])

    report_id = f"CPCB-EPR-{uuid.uuid4().hex[:8].upper()}"
    filename = f"cpcb_epr_manifest_{report_id}.csv"
    tmp_path = f"/tmp/{filename}"

    fieldnames = ["Date", "Lot ID", "Collector ID", "Processor ID", "CPCB Category", "Confirmed Weight (kg)"]

    try:
        with open(tmp_path, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(fieldnames)

            for row in manifest_rows:
                writer.writerow(row)

            writer.writerow([])
            writer.writerow(["--- CPCB EPR CATEGORY TOTALS SUMMARY ---", "", "", "", "", ""])

            grand_total = 0.0
            for cat_name, total_weight in cat_totals.items():
                grand_total += total_weight
                writer.writerow([f"TOTAL {cat_name}", "", "", "", cat_name, round(total_weight, 2)])

            writer.writerow(["TOTAL ALL CATEGORIES", "", "", "", "All CPCB Categories", round(grand_total, 2)])

        logger.info("CSV report written to %s", tmp_path)

        s3_key = f"manifests/{filename}"
        s3_client.upload_file(
            Filename=tmp_path,
            Bucket=BUCKET_NAME,
            Key=s3_key,
            ExtraArgs={
                "ContentType": "text/csv",
                "Metadata": {
                    "report_id": report_id,
                    "total_lots": str(len(accepted_lots)),
                    "total_weight_kg": str(round(grand_total, 2))
                }
            }
        )
        logger.info("Successfully uploaded CSV to s3://%s/%s", BUCKET_NAME, s3_key)

        presigned_url = s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": BUCKET_NAME, "Key": s3_key},
            ExpiresIn=900
        )

    except Exception as e:
        logger.error("Failed to generate or upload CPCB CSV manifest: %s", str(e), exc_info=True)
        return response_json(500, {"error": "ReportGenerationFailed", "message": str(e)})

    return response_json(200, {
        "success": True,
        "report_id": report_id,
        "total_lots": len(accepted_lots),
        "category_totals_kg": {
            "category_I_rigid": round(cat_totals["Category I (Rigid)"], 2),
            "category_II_flexible": round(cat_totals["Category II (Flexible)"], 2),
            "category_III_multilayered": round(cat_totals["Category III (Multilayered)"], 2),
            "grand_total_kg": round(grand_total, 2)
        },
        "s3_bucket": BUCKET_NAME,
        "s3_key": s3_key,
        "download_url": presigned_url,
        "expires_in_seconds": 900,
        "message": f"CPCB EPR Compliance Manifest successfully generated for {len(accepted_lots)} lot(s)."
    })

def response_json(status_code: int, body_dict: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
        },
        "body": json.dumps(body_dict)
    }
