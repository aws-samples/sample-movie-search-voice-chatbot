"""
AWS WebSocket Message Handler Module

This module provides functionality for sending messages through AWS API Gateway WebSocket connections.
It uses the AWS API Gateway Management API to post messages to connected clients.

Environment Variables:
    WEBSOCKET_URL: The WebSocket endpoint URL from API Gateway

Dependencies:
    - boto3
    - json
    - logging
    - os
"""

import json
import logging
import os
import boto3


logger = logging.getLogger()
logger.setLevel(logging.INFO)

WEBSOCKET_URL = os.environ['WEBSOCKET_URL']
WEBSOCKET_CLIENT = boto3.client(
    'apigatewaymanagementapi', endpoint_url=WEBSOCKET_URL)


def websocket_send_message(connection_id: str, message: dict) -> None:
    """
    Send a message to a connected WebSocket client.

    Args:
        connection_id (str): The unique identifier for the WebSocket connection
        message (dict): The message payload to send to the client

    Returns:
        None

    Silently handles these exceptions:
        - GoneException: When the connection is no longer available
        - PayloadTooLargeException: When the message exceeds size limits
    """
    try:
        WEBSOCKET_CLIENT.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps(message)
        )
    except WEBSOCKET_CLIENT.exceptions.GoneException:
        pass
    except WEBSOCKET_CLIENT.exceptions.PayloadTooLargeException:
        pass
