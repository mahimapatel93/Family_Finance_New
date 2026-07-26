import json
import os
import urllib.request
import urllib.error
from urllib.parse import quote  
import logging
from datetime import datetime, timezone

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ENVIRONMENT = os.environ.get("ENVIRONMENT", "prod")
AWS_REGION  = os.environ.get("AWS_REGION_NAME", "us-east-1")

SLACK_WEBHOOK_URL = os.environ.get("SLACK_WEBHOOK_URL", "")

STATE_STYLE = {
    "ALARM":             {"emoji": "🚨", "color": "#FF0000"},
    "OK":                {"emoji": "✅", "color": "#36A64F"},
    "INSUFFICIENT_DATA": {"emoji": "⚠️",  "color": "#FFA500"},
}


def handler(event, context):
    logger.info("Received event: %s", json.dumps(event))

    if not SLACK_WEBHOOK_URL:
        logger.error(
            "SLACK_WEBHOOK_URL env var is not set. "
            "Ensure Terraform sets it in the Lambda environment block."
        )
        return {"statusCode": 500, "body": "SLACK_WEBHOOK_URL not configured"}

    for record in event.get("Records", []):
        try:
            raw_message = record["Sns"]["Message"]
            message = json.loads(raw_message)
            process_alarm(message)
        except json.JSONDecodeError as exc:
            logger.error("SNS message is not valid JSON: %s | error: %s", raw_message, exc)
        except Exception as exc:
            logger.error("Failed to process record: %s | error: %s", record, exc)
            raise  

    return {"statusCode": 200, "body": "OK"}


def process_alarm(message: dict):
    alarm_name   = message.get("AlarmName",        "Unknown Alarm")
    alarm_desc   = message.get("AlarmDescription", "No description")
    new_state    = message.get("NewStateValue",    "UNKNOWN")
    old_state    = message.get("OldStateValue",    "UNKNOWN")
    state_reason = message.get("NewStateReason",   "No reason provided")
    namespace    = message.get("Trigger", {}).get("Namespace",  "Unknown")
    metric_name  = message.get("Trigger", {}).get("MetricName", "Unknown")
    timestamp    = message.get("StateChangeTime",  datetime.now(timezone.utc).isoformat())

    style = STATE_STYLE.get(new_state, {"emoji": "ℹ️", "color": "#808080"})
    emoji = style["emoji"]
    color = style["color"]

    encoded_alarm = quote(alarm_name)   
    console_url = (
        f"https://{AWS_REGION}.console.aws.amazon.com/cloudwatch/home"
        f"?region={AWS_REGION}#alarmsV2:alarm/{encoded_alarm}"
    )

    payload = {
        "attachments": [
            {
                "color": color,
                "blocks": [
                    {
                        "type": "header",
                        "text": {
                            "type": "plain_text",
                            "text": f"{emoji} CloudWatch Alarm — {new_state}",
                            "emoji": True,
                        },
                    },
                    {
                        "type": "section",
                        "fields": [
                            {"type": "mrkdwn", "text": f"*Alarm:*\n{alarm_name}"},
                            {"type": "mrkdwn", "text": f"*Environment:*\n{ENVIRONMENT.upper()}"},
                            {"type": "mrkdwn", "text": f"*State:*\n{old_state} → {new_state}"},
                            {"type": "mrkdwn", "text": f"*Metric:*\n{namespace} / {metric_name}"},
                        ],
                    },
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": (
                                f"*Description:*\n{alarm_desc}\n\n"
                                f"*Reason:*\n{state_reason}"
                            ),
                        },
                    },
                    {
                        "type": "context",
                        "elements": [
                            {
                                "type": "mrkdwn",
                                "text": f"⏰ {timestamp} | 🌍 {AWS_REGION}",
                            }
                        ],
                    },
                    {
                        "type": "actions",
                        "elements": [
                            {
                                "type": "button",
                                "text": {"type": "plain_text", "text": "View in CloudWatch"},
                                "url": console_url,
                                "style": "primary" if new_state == "OK" else "danger",
                            }
                        ],
                    },
                    {"type": "divider"},
                ],
            }
        ]
    }

    post_to_slack(payload)


def post_to_slack(payload: dict):
    data    = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        SLACK_WEBHOOK_URL,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            body = response.read().decode()
            logger.info("Slack response %s: %s", response.status, body)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode()
        logger.error("Slack HTTP error %s: %s", exc.code, body)
        raise
    except urllib.error.URLError as exc:
        logger.error("Slack URL error: %s", exc.reason)
        raise
