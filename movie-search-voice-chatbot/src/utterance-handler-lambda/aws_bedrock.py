"""
Bedrock Client Module

This module provides functionality to interact with Amazon Bedrock's runtime service
for large language model inference. It sets up a Bedrock client with configuration
from environment variables and provides methods to invoke the model with streaming responses.

Environment Variables:
    REGION: AWS region for Bedrock service
    BEDROCK_MODEL_ID: ID of the Bedrock model to use (defaults to Claude 3 Haiku)
    BEDROCK_MAX_TOKENS: Maximum tokens in model response
    BEDROCK_STREAM_TEMPERATURE: Temperature parameter for model inference
    BEDROCK_TOP_P: Top P parameter for model inference

Dependencies:
    boto3: AWS SDK for Python
    os: For environment variable access
    logging: For logging configuration and messages
"""

import logging
import os
import boto3


logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.getenv('REGION')
SESSION = boto3.Session(
    region_name=REGION,
)
BEDROCK_CLIENT = SESSION.client('bedrock-runtime')
BEDROCK_MODEL_ID = os.getenv('BEDROCK_MODEL_ID')
BEDROCK_MAX_TOKENS = os.getenv('BEDROCK_MAX_TOKENS')
BEDROCK_STREAM_TEMPERATURE = os.getenv('BEDROCK_STREAM_TEMPERATURE')
BEDROCK_TOP_P = os.getenv('BEDROCK_TOP_P')

logger.info('REGION: %s', REGION)
logger.info('BEDROCK_MODEL_ID: %s', BEDROCK_MODEL_ID)
logger.info('BEDROCK_MAX_TOKENS: %s', BEDROCK_MAX_TOKENS)
logger.info('BEDROCK_STREAM_TEMPERATURE: %s', BEDROCK_STREAM_TEMPERATURE)
logger.info('BEDROCK_TOP_P: %s', BEDROCK_TOP_P)


def invoke_model_with_response_stream(
    prompt: str,
) -> dict:
    """
    Invokes the Bedrock model with streaming response.

    Args:
        prompt (str): The input text prompt for the model

    Returns:
        dict: Streaming response from the Bedrock model containing
              generated text and metadata

    The function configures the model call with:
    - Model ID from environment
    - Maximum tokens limit
    - Temperature for response randomness
    - Top P for nucleus sampling
    """
    streaming_response = BEDROCK_CLIENT.converse_stream(
        modelId=BEDROCK_MODEL_ID,
        messages=[
            {
                'role': 'user',
                'content': [
                    {
                        'text': prompt,
                    },
                ],
            }
        ],
        inferenceConfig={
            'maxTokens': int(BEDROCK_MAX_TOKENS),
            'temperature': float(BEDROCK_STREAM_TEMPERATURE),
            'topP': float(BEDROCK_TOP_P)
        },
    )
    return streaming_response
