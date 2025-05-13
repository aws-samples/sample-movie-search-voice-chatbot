"""
DynamoDB Operations Module

This module provides functions for interacting with a DynamoDB table to store and retrieve
connection-based data. It uses environment variables for configuration and provides a simple
interface for updating and retrieving items with TTL support.

The module requires the following environment variables:
    DYNAMODB_TABLE: Name of the DynamoDB table to use

Functions:
    dynamodb_update_item_data: Updates an item with connection ID and data
    dynamodb_get_item: Retrieves a raw item from DynamoDB
    get_item_data: Retrieves and deserializes the data field from an item

Dependencies:
    boto3: AWS SDK for Python
    json: For JSON serialization/deserialization
    time: For TTL calculations
    os: For environment variable access
    logging: For logging configuration
"""

import json
import logging
import os
import time
import boto3


logger = logging.getLogger()
logger.setLevel(logging.INFO)

DYNAMODB_TABLE = os.environ['DYNAMODB_TABLE']
DYNAMODB_CLIENT = boto3.client('dynamodb')


def dynamodb_update_item_data(connection_id: str, data: dict) -> None:
    """
    Updates an item in DynamoDB with the provided connection ID and data.

    Args:
        connection_id (str): The connection ID to use as the primary key
        data (dict): The data to store in the item

    Returns:
        None

    The function stores the data as a JSON string and adds a TTL of 24 hours (86400 seconds)
    from the current time.
    """
    DYNAMODB_CLIENT.update_item(
        TableName=DYNAMODB_TABLE,
        Key={
            'connectionId': {'S': connection_id}
        },
        AttributeUpdates={
            'data': {'Value': {'S': json.dumps(data)},
                     'Action': 'PUT'},
            'ttl': {'Value': {'N': str(int(time.time()) + 86400)},
                    'Action': 'PUT'},
        }
    )


def dynamodb_get_item(connection_id: str) -> dict:
    """
    Retrieves an item from DynamoDB using the provided connection ID.

    Args:
        connection_id (str): The connection ID to use as the primary key

    Returns:
        dict: The item from DynamoDB if found, otherwise an empty dictionary.
              The returned item contains the DynamoDB attribute type information.
    """
    response = DYNAMODB_CLIENT.get_item(
        TableName=DYNAMODB_TABLE,
        Key={
            'connectionId': {'S': connection_id}
        }
    )
    if 'Item' in response:
        return response['Item']
    return {}


def get_item_data(connection_id: str) -> dict:
    """
    Retrieves and deserializes the data field from a DynamoDB item.

    Args:
        connection_id (str): The connection ID to use as the primary key

    Returns:
        dict: The deserialized data from the item if found, otherwise an empty dictionary.
              The data is stored as a JSON string in DynamoDB and is parsed into a Python dict.
    """
    item = dynamodb_get_item(connection_id)
    if 'data' in item:
        return json.loads(item['data']['S'])
    return {}
