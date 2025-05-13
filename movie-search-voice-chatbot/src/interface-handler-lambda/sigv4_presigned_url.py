"""
Module for generating SigV4 presigned URLs for AWS services.

This module provides functionality to create presigned URLs using AWS Signature Version 4,
allowing secure, temporary access to AWS resources.
"""

import datetime
import hashlib
import hmac
import os
import urllib.parse
import boto3


WEBSOCKET_URL = os.environ['WEBSOCKET_URL']


def to_time(timestamp: datetime) -> str:
    """
    Convert a datetime object to an AWS formatted timestamp string.

    Args:
        timestamp (datetime): The datetime object to convert

    Returns:
        str: Formatted timestamp string in the format 'YYYYMMDDTHHMMSSZ'
              Example: '20240101T120000Z' for January 1st, 2024 12:00:00 UTC

    Note:
        The returned timestamp is always in UTC format and uses the ISO 8601 basic format
        without milliseconds, as required by many AWS services for request signing.
    """
    return timestamp.strftime('%Y%m%dT%H%M%SZ')


def to_date(timestamp: datetime) -> str:
    """
    Convert a datetime object to an AWS formatted date string.

    Args:
        timestamp (datetime): The datetime object to convert

    Returns:
        str: Formatted date string in the format 'YYYYMMDD'
             Example: '20240101' for January 1st, 2024

    Note:
        The returned date is always in UTC format and uses the basic date format
        without separators, as required by AWS services for credential scopes.
    """
    return timestamp.strftime('%Y%m%d')


def create_canonical_request(
        method: str,
        pathname: str,
        query: dict,
        headers: dict,
        payload: str
) -> str:
    """
    Create a canonical request string for AWS SigV4 signing.

    Args:
        method (str): HTTP method
        path (str): Request path
        query_params (dict): Query string parameters
        headers (dict): HTTP headers

    Returns:
        str: Canonical request string formatted according to AWS specifications
    """
    r = ''
    r += method.upper() + '\n'
    r += pathname + '\n'
    r += create_canonical_query_string(query) + '\n'
    r += create_canonical_headers(headers) + '\n'
    r += create_signed_headers(headers) + '\n'
    r += payload
    return r


def create_canonical_query_string(params: dict) -> str:
    """
    Create a canonical query string from a dictionary of parameters.

    Args:
        params (dict): Dictionary of query parameters

    Returns:
        str: URL-encoded query string with parameters sorted by key
             Example: 'param1=value1&param2=value2'

    Note:
        Parameters are sorted by key and URL-encoded according to AWS SigV4
        requirements for canonical query strings.
    """
    return urllib.parse.urlencode((dict(sorted(params.items()))))


def create_canonical_headers(headers: dict) -> str:
    """
    Create a canonical string of HTTP headers for AWS SigV4 signing.

    Args:
        headers (dict): Dictionary of HTTP headers

    Returns:
        str: Canonical header string with headers sorted by key
             Example: 'header1:value1\nheader2:value2\n'

    Note:
        Headers are normalized by:
        - Converting header names to lowercase
        - Removing leading/trailing whitespace from names and values
        - Sorting headers by name
        - Adding a newline after each header
    """
    h = ''
    for k, v in sorted(headers.items()):
        h += f'{k.lower().strip()}:{v.strip()}\n'
    return h


def create_signed_headers(headers: dict) -> str:
    """
    Create a semicolon-delimited string of header names for AWS SigV4 signing.

    Args:
        headers (dict): Dictionary of HTTP headers

    Returns:
        str: Semicolon-delimited string of header names in alphabetical order
             Example: 'header1;header2;header3'

    Note:
        Header names are sorted alphabetically and joined with semicolons as required
        by AWS SigV4 signed headers specification. Only header names are included,
        not their values.
    """
    return ';'.join(sorted(headers.keys()))


def create_credential_scope(timestamp: datetime, region: str, service: str) -> str:
    """
    Create an AWS credential scope string for SigV4 signing.

    Args:
        timestamp (datetime): The timestamp to use for the credential scope
        region (str): AWS region name (e.g. 'us-east-1')
        service (str): AWS service name (e.g. 's3', 'execute-api')

    Returns:
        str: Credential scope string in format 'YYYYMMDD/region/service/aws4_request'
             Example: '20240101/us-east-1/s3/aws4_request'

    Note:
        The credential scope is used as part of the string-to-sign in AWS SigV4
        request signing process. It helps scope the signing key to a specific
        date, region and service.
    """
    return f'{to_date(timestamp)}/{region}/{service}/aws4_request'


def create_string_to_sign(timestamp: datetime, region: str, service: str, request: str) -> str:
    """
    Create the string to sign for AWS SigV4 request signing.

    Args:
        timestamp (datetime): The timestamp to use for the string to sign
        region (str): AWS region name (e.g. 'us-east-1')
        service (str): AWS service name (e.g. 's3', 'execute-api')
        request (str): The canonical request string to hash

    Returns:
        str: The string to sign in the format:
            AWS4-HMAC-SHA256\n
            <timestamp>\n
            <credential scope>\n
            <hashed canonical request>

    Note:
        The string to sign is a key component of the AWS SigV4 signing process.
        It combines the algorithm, timestamp, credential scope, and hashed canonical
        request into a single string that will be signed with the signing key.
    """
    return '\n'.join([
        'AWS4-HMAC-SHA256',
        to_time(timestamp),
        create_credential_scope(timestamp, region, service),
        hashlib.sha256(request.encode('utf-8')).hexdigest()
    ])


def hmac_sign(key: str, msg: str) -> str:
    """
    Generate an HMAC-SHA256 signature for a message using a key.

    Args:
        key (str): The key to use for HMAC signing
        msg (str): The message to sign

    Returns:
        str: The binary digest of the HMAC-SHA256 signature

    Note:
        This function is used as part of the AWS SigV4 signing process to generate
        signing keys and signatures. The message is UTF-8 encoded before signing.
    """
    return hmac.new(key, msg.encode('utf-8'), hashlib.sha256).digest()


def get_signature_key(key: str, timestamp: datetime, region: str, service: str) -> str:
    """
    Generate a signing key for AWS SigV4 request signing.

    Args:
        key (str): The AWS secret access key
        timestamp (datetime): The timestamp to use for the signing key
        region (str): AWS region name (e.g. 'us-east-1')
        service (str): AWS service name (e.g. 's3', 'execute-api')

    Returns:
        str: The signing key derived through the AWS SigV4 key derivation process

    Note:
        This implements the AWS Signature Version 4 key derivation process which creates
        a signing key through multiple rounds of HMAC-SHA256 operations. The key is
        derived by signing:
        1. The date with "AWS4<secret key>"
        2. The region with the result of #1
        3. The service name with the result of #2
        4. "aws4_request" with the result of #3
    """
    key_date = hmac_sign(('AWS4' + key).encode('utf-8'), to_date(timestamp))
    key_region = hmac_sign(key_date, region)
    key_service = hmac_sign(key_region, service)
    key_signing = hmac_sign(key_service, 'aws4_request')
    return key_signing


def create_presigned_url(
        method: str,
        host: str,
        path: str,
        service: str,
        payload: str,
        options: dict
) -> str:
    """
    Create a presigned URL for AWS services using SigV4 signing.

    Args:
        method (str): HTTP method for the request (e.g. 'GET', 'POST')
        host (str): Hostname for the AWS service endpoint
        path (str): URL path for the request
        service (str): AWS service name (e.g. 's3', 'execute-api')
        payload (str): Request payload to be signed
        options (dict): Additional options for URL generation including:
            - protocol (str): URL protocol (default: 'https')
            - headers (dict): HTTP headers (default: {})
            - timestamp (datetime): Request timestamp (default: current UTC time)
            - region (str): AWS region (default: 'us-east-1')
            - expires (int): URL expiration in seconds (default: 86400)
            - query (dict): Additional query parameters (default: {})
            - key (str): AWS access key ID
            - secret (str): AWS secret access key
            - sessionToken (str): AWS session token

    Returns:
        str: Presigned URL with SigV4 signature and authentication parameters

    Note:
        The generated URL includes all required AWS SigV4 authentication parameters
        and can be used to make authenticated requests to AWS services without
        requiring AWS credentials at request time.
    """
    options = options or {}
    options['protocol'] = options.get('protocol', 'https')
    options['headers'] = options.get('headers', {})
    options['timestamp'] = options.get(
        'timestamp', datetime.datetime.now().astimezone(datetime.UTC))
    options['region'] = options.get('region', 'us-east-1')
    options['expires'] = options.get('expires', 86400)  # 24 hours
    options['query'] = options.get('query', {})
    options['headers']['host'] = host  # host is required

    query = {}
    for k, v in options['query'].items():
        query[k] = str(v)
    query['X-Amz-Algorithm'] = 'AWS4-HMAC-SHA256'
    query['X-Amz-Credential'] = f'{options["key"]}/{
        create_credential_scope(options["timestamp"], options["region"], service)}'
    query['X-Amz-Date'] = to_time(options['timestamp'])
    query['X-Amz-Expires'] = options['expires']
    query['X-Amz-SignedHeaders'] = create_signed_headers(options['headers'])
    query['X-Amz-Security-Token'] = options['sessionToken']

    canonical_request = create_canonical_request(
        method, path, query, options['headers'], payload)
    string_to_sign = create_string_to_sign(
        options['timestamp'], options['region'], service, canonical_request)
    signing_key = get_signature_key(
        options['secret'], options['timestamp'], options['region'], service)
    signature = hmac.new(signing_key, (string_to_sign).encode(
        'utf-8'), hashlib.sha256).hexdigest()
    query['X-Amz-Signature'] = signature

    return f'{options['protocol']}://{host}{path}?{urllib.parse.urlencode((dict(sorted(query.items()))))}'


def generate_presigned_url(
        host: str,
        path: str,
        service: str,
        region: str,
        protocol: str = 'wss',
        expires: int = 15,
        method: str = 'GET',
        query: dict = {}
) -> str:
    """
    Generates a pre-signed URL for accessing an AWS service.

    Args:
        host (str): The hostname of the service.
        path (str): The path of the resource to access.
        service (str): The name of the AWS service.
        region (str): The AWS region where the service is located.
        protocol (str, optional): The protocol to use (e.g., 'https', 'wss').
        expires (int, optional): The number of seconds for which the pre-signed URL is valid.
        method (str, optional): The HTTP method to use (e.g., 'GET', 'POST').
        query (dict, optional): Additional query parameters to include in the pre-signed URL.

    Returns:
        str: The pre-signed URL for accessing the specified AWS service and resource.
    """
    credentials = boto3.Session().get_credentials()
    url = create_presigned_url(
        method=method,
        host=host,
        path=path,
        service=service,
        payload=hashlib.sha256(''.encode('utf-8')).hexdigest(),
        options={
            'key': credentials.access_key,
            'secret': credentials.secret_key,
            'sessionToken': credentials.token,
            'protocol': protocol,
            'expires': expires,
            'region': region,
            'query': query,
            'timestamp': datetime.datetime.now().astimezone(datetime.UTC)
        }
    )
    return url


def generate_transcribestreaming_presigned_url(
        region: str,
        language_code: str = 'en-US',
        sample_rate: int = 16000,
        expires: int = 15,
        encoding: str = 'pcm'
) -> str:
    """
    Generates a pre-signed URL for accessing the Amazon Transcribe Streaming service.

    Args:
        region (str): The AWS region where the Amazon Transcribe Streaming service is located.
        language_code (str, optional): The language code of the audio to be transcribed.
        sample_rate (int, optional): The sample rate of the audio in Hertz. Defaults to 16000.
        expires (int, optional): The number of seconds for which the pre-signed URL is valid.
        encoding (str, optional): The encoding of the audio data. Defaults to 'pcm'.

    Returns:
        str: The pre-signed URL for accessing the Amazon Transcribe Streaming service.
    """
    return generate_presigned_url(
        host=f'transcribestreaming.{region}.amazonaws.com:8443',
        path='/stream-transcription-websocket',
        service='transcribe',
        region=region,
        protocol='wss',
        expires=expires,
        method='GET',
        query={
            'language-code': language_code,
            'media-encoding': encoding,
            'sample-rate': str(sample_rate)
        }
    )


def generate_apigateway_presigned_url(
        region: str,
        expires: int = 15
) -> str:
    """
    Generates a pre-signed URL for accessing an AWS API Gateway WebSocket API.

    Args:
        region (str): The AWS region where the API Gateway WebSocket API is located.
        expires (int, optional): The number of seconds for which the pre-signed URL is valid.

    Returns:
        str: The pre-signed URL for accessing the API Gateway WebSocket API.

    Note:
        This function assumes the existence of a global variable `WEBSOCKET_URL` containing
        the URL of the API Gateway WebSocket API.
    """
    return generate_presigned_url(
        host=WEBSOCKET_URL.split('//')[1].split('/')[0],
        path=f'/{WEBSOCKET_URL.split('//')[1].split('/')[1]}',
        service='execute-api',
        region=region,
        protocol='wss',
        expires=expires,
        method='GET',
        query={}
    )
