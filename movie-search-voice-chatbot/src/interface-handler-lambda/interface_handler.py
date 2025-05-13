"""
Lambda function handler module for processing HTTP requests and serving web assets.
Handles authentication via JWT and serves various file types including HTML, CSS, JS, PNG and WAV.
Also provides functionality for generating WebSocket URLs and managing scenario data.
"""

import base64
import json
import os
from sigv4_presigned_url import generate_apigateway_presigned_url


AWS_REGION = os.environ['AWS_REGION']


def get_jwt_payload(jwt: str) -> dict:
    """
    Extract and decode the payload from a JWT token.

    Args:
        jwt (str): The JWT token string

    Returns:
        dict: The decoded JWT payload as a dictionary
    """
    payload = {}
    try:
        _, jwt_payload, _ = jwt.split('.')
        jwt_payload = base64.b64decode(jwt_payload)
        payload = json.loads(jwt_payload)
    except Exception as err:
        print(f'Error: {err}')
    return payload


def get_scenario_items_html(scenario_items: list) -> str:
    """
    Generate HTML option elements from scenario items.

    Args:
        scenario_items (list): List of scenario item dictionaries

    Returns:
        str: HTML string containing option elements
    """
    html = ''
    for item in scenario_items:
        html += f'<option value="{item['scenario']['scenarioId']['S']}">'
        html += item['scenario']['scenarioName']['S']
        html += '</option>'
    return html


def get_scenario_items_js(scenario_items: list) -> str:
    """
    Generate JavaScript object string from scenario items.

    Args:
        scenario_items (list): List of scenario item dictionaries

    Returns:
        str: JavaScript object string containing scenario data
    """
    if not scenario_items:
        return '{}'
    js = '{'
    js += 'DEFAULT:'
    js += f'"{scenario_items[0]['scenario']['scenarioId']['S']}",'
    for item in scenario_items:
        js += f'{item['scenario']['scenarioId']['S']}:'
        js += f'"{item['scenario']['scenarioName']['S']}",'
    js += '}'
    return js


def lambda_handler(event, _) -> dict:
    """
    AWS Lambda handler function for processing API Gateway proxy events.

    Handles:
    - Authentication via JWT
    - Serving static assets (CSS, JS, PNG, WAV files)
    - Generating WebSocket URLs
    - Serving HTML with scenario data

    Args:
        event (dict): Lambda event object from API Gateway
        _ : Unused context parameter

    Returns:
        dict: Response object containing status code, body and headers
    """
    print(event)
    method = event['httpMethod']
    path = event['path']
    response = {
        'statusCode': 200,
        'body': '',
        'headers': {'Content-Type': 'text/html'}
    }
    jwt_payload = get_jwt_payload(jwt=event['headers']['x-amzn-oidc-data'])
    if not jwt_payload or not bool(list(jwt_payload.keys() & set(['username', 'sub']))):
        print('No username found in JWT payload')
        response['statusCode'] = 401
        response['body'] = 'Unauthorized'
        response['headers'] = {'Content-Type': 'text/plain'}
        return response
    scenario_items = {}
    if method == 'GET' and path.find('assets/') != -1:
        file_name = path.split('/')[-1]
        file_type = file_name.split('.')[-1]
        if file_type == 'css':
            response['headers']['Content-Type'] = 'text/css'
            with open(f'assets/css/{file_name}', 'r', encoding='utf-8') as f:
                response['body'] = f.read()
        elif file_type == 'js':
            response['headers']['Content-Type'] = 'text/javascript'
            with open(f'assets/js/{file_name}', 'r', encoding='utf-8') as f:
                response['body'] = f.read().replace(
                    '__SCENARIO_OPTIONS__',
                    get_scenario_items_js(scenario_items)
                )
        elif file_type == 'png':
            response['headers']['Content-Type'] = 'image/png'
            with open(f'assets/img/{file_name}', 'rb') as f:
                response['body'] = base64.b64encode(f.read())
                response['isBase64Encoded'] = True
        elif file_type == 'wav':
            response['headers']['Content-Type'] = 'audio/wav'
            with open(f'assets/audio/{file_name}', 'rb') as f:
                response['body'] = base64.b64encode(f.read())
                response['isBase64Encoded'] = True
    elif method == 'GET' and path.find('get_websocket_url') != -1:
        url = generate_apigateway_presigned_url(
            region=AWS_REGION,
            expires=60
        )
        response['headers']['Content-Type'] = 'application/json'
        response_object = {
            'websocket_url': url
        }
        response['body'] = json.dumps(response_object, default=str)
    else:
        response['headers']['Content-Type'] = 'text/html'
        with open('html/default.html', 'r', encoding='utf-8') as f:
            response['body'] = f.read().replace(
                '{{SCENARIO_OPTIONS}}',
                get_scenario_items_html(scenario_items)
            )
    return response
