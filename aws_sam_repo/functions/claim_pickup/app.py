import os
import json
import math
import time
import logging
import boto3
from botocore.exceptions import ClientError

# Configure CloudWatch logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLE_NAME = os.environ.get("TABLE_NAME", "ProofAfterPickup-Lots")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

class GeoFencingViolation(Exception):
    """Custom exception raised when collector device location exceeds the 200m geofence boundary."""
    pass

def calculate_haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculates the great-circle distance between two GPS coordinates in meters
    using the Haversine formula.
    """
    # Earth radius in meters
    R = 6371000.0

    # Convert degrees to radians
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    # Haversine formula
    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    distance_meters = R * c
    return distance_meters

def verify_geofence_proximity(
    device_lat: float,
    device_lng: float,
    facility_lat: float,
    facility_lng: float,
    max_threshold_meters: float = 200.0
) -> float:
    """
    Verifies collector device location against facility location.
    Raises GeoFencingViolation if distance > 200m.
    """
    distance = calculate_haversine_distance_meters(device_lat, device_lng, facility_lat, facility_lng)
    
    logger.info(f"Geofence distance check: {distance:.2f} meters (Threshold: {max_threshold_meters}m)")

    if distance > max_threshold_meters:
        raise GeoFencingViolation(
            f"Collector device is {distance:.1f} meters away from registered facility location. "
            f"Maximum allowed geofence boundary is {max_threshold_meters:.0f} meters."
        )

    return distance

def lambda_handler(event, context):
    """
    ClaimPickup Lambda Function (Python 3.12)
    - Validates collector GPS device coordinates against facility location
    - Enforces Haversine 200m geofence boundary check (raises GeoFencingViolation if exceeded)
    - Transitions lot status CREATED -> IN_TRANSIT with DynamoDB conditional write
    """
    logger.info(f"Incoming ClaimPickup request: {json.dumps(event)}")

    path_params = event.get("pathParameters") or {}
    lot_id = path_params.get("id")

    body = json.loads(event.get("body", "{}"))
    collector_id = body.get("collector_id", "COLL-DRV-102")

    # Extract GPS Coordinates passed from React PWA frontend
    device_lat = body.get("device_lat")
    device_lng = body.get("device_lng")

    if not lot_id:
        return response(400, {"error": "ValidationError", "message": "Missing 'id' path parameter."})

    pk = f"LOT#{lot_id}"
    sk = "METADATA"

    # Fetch lot item to get registered facility coordinates
    try:
        lot_item = table.get_item(Key={"PK": pk, "SK": sk}).get("Item")
        if not lot_item:
            return response(404, {"error": "NotFound", "message": f"Lot item '{lot_id}' not found."})
    except ClientError as e:
        logger.error(f"DynamoDB GetItem Error for {lot_id}: {str(e)}", exc_info=True)
        return response(500, {"error": "DatabaseError", "message": str(e)})

    # Registered facility coordinates (default Seattle location if unset)
    facility_lat = float(lot_item.get("facility_lat", 47.6062))
    facility_lng = float(lot_item.get("facility_lng", -122.3321))

    # Geofence Verification if coordinates provided by collector
    distance_meters = 0.0
    if device_lat is not None and device_lng is not None:
        try:
            distance_meters = verify_geofence_proximity(
                float(device_lat),
                float(device_lng),
                facility_lat,
                facility_lng,
                max_threshold_meters=200.0
            )
        except GeoFencingViolation as geo_err:
            logger.warning(f"GeoFencingViolation for Lot {lot_id}: {str(geo_err)}")
            return response(422, {
                "error": "GeoFencingViolation",
                "message": str(geo_err),
                "distance_meters": round(distance_meters, 1)
            })

    now_ts = int(time.time())

    # Execute DynamoDB Conditional Update
    try:
        res = table.update_item(
            Key={"PK": pk, "SK": sk},
            UpdateExpression="SET #s = :new_s, collector_id = :c, geofence_distance_m = :dist, updated_at = :ts, audit_trail = list_append(audit_trail, :audit)",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":new_s": "IN_TRANSIT",
                ":expected_s": "CREATED",
                ":c": collector_id,
                ":dist": round(distance_meters, 1),
                ":ts": now_ts,
                ":audit": [{
                    "action": "LOT_CLAIMED",
                    "actor": collector_id,
                    "role": "Collector",
                    "timestamp": now_ts,
                    "note": f"Lot claimed by collector {collector_id}. Geofence offset: {round(distance_meters, 1)}m. Status: IN_TRANSIT."
                }]
            },
            ConditionExpression="attribute_exists(PK) AND #s = :expected_s",
            ReturnValues="ALL_NEW"
        )

        return response(200, {
            "message": f"Lot {lot_id} claimed successfully.",
            "geofence_distance_meters": round(distance_meters, 1),
            "data": res.get("Attributes")
        })

    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            return response(409, {
                "error": "InvalidStateTransition",
                "message": f"Cannot claim Lot '{lot_id}'. Current lot status is not 'CREATED'."
            })
        logger.error(f"DynamoDB UpdateItem Error for {lot_id}: {str(e)}", exc_info=True)
        return response(500, {"error": "DatabaseError", "message": str(e)})


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
