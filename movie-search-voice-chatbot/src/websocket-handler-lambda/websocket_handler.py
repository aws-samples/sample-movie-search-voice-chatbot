"""
WebSocket handler Lambda function for managing real-time communications.

This module handles WebSocket connections and messages for a service integrating
with Amazon Transcribe. It manages connection lifecycle, processes user utterances,
and coordinates with other AWS services including CloudWatch, DynamoDB, and SQS.
"""

import datetime
import json
import logging
import os
import time
import uuid
import boto3
from sigv4_presigned_url import generate_transcribestreaming_presigned_url


logger = logging.getLogger()
logger.setLevel(logging.INFO)

AWS_REGION = os.environ['AWS_REGION']
CLOUDWATCH_NAMESPACE = 'MOVIE_SEARCH_VOICE_CHATBOT'
DYNAMODB_TABLE = os.environ['DYNAMODB_TABLE']
UTTERANCE_QUEUE_FIFO_URL = os.environ['UTTERANCE_QUEUE_FIFO_URL']

CLOUDWATCH_CLIENT = boto3.client('cloudwatch')
DYNAMODB_CLIENT = boto3.client('dynamodb')
SQS_CLIENT = boto3.client('sqs')


def cloudwatch_put_metric(metric_name: str, value: float = 1.0, dimensions: list = []) -> None:
    """
    Put a metric data point to CloudWatch.

    Args:
        metric_name (str): Name of the metric to record
        value (float, optional): Value for the metric. Defaults to 1.0
        dimensions (list, optional): List of dimension dictionaries. Defaults to []

    Returns:
        None
    """
    CLOUDWATCH_CLIENT.put_metric_data(
        Namespace=CLOUDWATCH_NAMESPACE,
        MetricData=[
            {
                'MetricName': metric_name,
                'Dimensions': dimensions,
                'Timestamp': datetime.datetime.now(datetime.timezone.utc),
                'Value': value,
                'Unit': 'Count',
                'StorageResolution': 60,
            },
        ]
    )


def dynamodb_put_item(connection_id: str, timestamp: int, data: dict = None) -> None:
    """
    Store an item in DynamoDB with connection details and optional data.

    Args:
        connection_id (str): WebSocket connection identifier
        timestamp (int): Unix timestamp for the record
        data (dict, optional): Additional data to store. Defaults to None

    Returns:
        None
    """
    if data is None:
        data = {}
    DYNAMODB_CLIENT.put_item(
        TableName=DYNAMODB_TABLE,
        Item={
            'connectionId': {'S': connection_id},
            'timestamp': {'N': str(timestamp)},
            'timestamp_iso': {'S': datetime.datetime.now().isoformat()},
            'data': {'S': json.dumps(data)},
            'ttl': {'N': str(int(time.time()) + 86400)},
        }
    )


def sqs_put_message(queue_url: str, connection_id: str, message_body: dict = None) -> None:
    """
    Send a message to an SQS FIFO queue.

    Args:
        queue_url (str): URL of the SQS queue
        connection_id (str): WebSocket connection identifier used as MessageGroupId
        message_body (dict, optional): Message content to send. Defaults to None

    Returns:
        None
    """
    if message_body is None:
        message_body = {}
    SQS_CLIENT.send_message(
        QueueUrl=queue_url,
        MessageBody=json.dumps(message_body),
        MessageGroupId=connection_id,
        MessageDeduplicationId=str(uuid.uuid4()),
    )


def lambda_handler(event, _) -> dict:
    """
    AWS Lambda handler for WebSocket connections and messages.

    Handles various WebSocket routes including:
    - $connect: New WebSocket connections
    - $disconnect: Connection termination
    - ping: Connection health check
    - startProcess: Initiates processing with Transcribe
    - sendUtterance: Handles user utterances

    Args:
        event: AWS Lambda event object containing WebSocket details
        _: AWS Lambda context object (unused)

    Returns:
        dict: Response object with statusCode and body
    """
    logging.info(event)

    if 'requestContext' not in event:
        return {
            'statusCode': 400,
            'body': json.dumps({
                'action': 'ERROR',
                'value': 'no request context found',
                'type': 'TEXT'
            })
        }
    request_context = event['requestContext']
    if 'connectionId' not in request_context:
        return {
            'statusCode': 400,
            'body': json.dumps({
                'action': 'ERROR',
                'value': 'no connection id found',
                'type': 'TEXT'
            })
        }
    connection_id = request_context['connectionId']
    if 'routeKey' not in request_context:
        return {
            'statusCode': 400,
            'body': json.dumps({
                'action': 'ERROR',
                'value': 'no route key found',
                'type': 'TEXT'
            })
        }
    route_key = request_context['routeKey']

    if route_key == '$connect':
        # NO bidirectional response
        # Handle new connection
        cloudwatch_put_metric(
            metric_name='WEBSOCKET_CONNECTION',
        )
        try:
            dimensions = []
            dimensions.append(
                {
                    'Name': 'userAgent',
                    'Value': request_context['identity']['userAgent']
                }
            )
            dimensions.append(
                {
                    'Name': 'sourceIp',
                    'Value': request_context['identity']['sourceIp']
                }
            )
            cloudwatch_put_metric(
                metric_name='WEBSOCKET_CONNECTION',
                dimensions=dimensions
            )
        except Exception:
            pass

    elif route_key == '$disconnect':
        # NO bidirectional response
        # Handle disconnection
        pass

    elif route_key == 'ping':
        return {
            'statusCode': 200,
            'body': json.dumps({
                'action': 'PONG',
                'value': 'PONG',
                'type': 'PONG'
            })
        }

    elif route_key == 'startProcess':
        # accepts bidirectional response
        body = {}
        if 'body' in event:
            body = json.loads(event['body'])

        controls = {}
        if 'controls' in body:
            controls = json.loads(body['controls'])

        language_code = 'en-US'
        if 'languageCode' in controls:
            language_code = controls['languageCode']

        presigned_url = generate_transcribestreaming_presigned_url(
            region=AWS_REGION,
            language_code=language_code,
            sample_rate=16000,
            expires=60,
            encoding='pcm'
        )
        dynamodb_put_item(
            connection_id=connection_id,
            timestamp=int(time.time()),
            data={
                'controls': controls
            },
        )
        sqs_put_message(
            queue_url=UTTERANCE_QUEUE_FIFO_URL,
            connection_id=connection_id,
            message_body={
                'connectionId': connection_id,
                'action': 'CREATE_SCENARIO'
            }
        )
        cloudwatch_put_metric(
            metric_name='TRANSCRIBE_CONNECTION',
        )
        return {
            'statusCode': 200,
            'body': json.dumps({
                'action': 'TRANSCRIBE_CONNECTION',
                'value': presigned_url,
                'type': 'URL'
            })
        }

    elif route_key == 'sendUtterance':
        # NO bidirectional response
        if 'body' not in event:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'action': 'ERROR',
                    'value': 'no body found',
                    'type': 'TEXT'
                })
            }
        body = json.loads(event['body'])
        if 'utterance' not in body:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'action': 'ERROR',
                    'value': 'no utterance found',
                    'type': 'TEXT'
                })
            }
        utterance = body['utterance']
        sqs_put_message(
            queue_url=UTTERANCE_QUEUE_FIFO_URL,
            connection_id=connection_id,
            message_body={
                'connectionId': connection_id,
                'utterance': utterance
            }
        )
        cloudwatch_put_metric(
            metric_name='UTTERANCE_RECEIVED',
        )

    else:
        # NO bidirectional response
        # Handle other route keys
        pass

    return {
        'statusCode': 200,
        'body': json.dumps({
            'action': 'INFO',
            'value': 'Hello world from Websocket Lambda!',
            'type': 'TEXT'
        })
    }
