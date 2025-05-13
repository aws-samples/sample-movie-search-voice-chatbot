"""
AWS Lambda function for searching movie/TV titles in OpenSearch.

This module provides functionality to search for movies and TV series in an OpenSearch index
based on title, year, actors and directors. It uses AWS credentials for authentication
and returns matching results in JSON format.

Environment variables required:
    OS_REGION: AWS region for OpenSearch domain
    OS_HOST: OpenSearch domain host
    OS_INDEX: OpenSearch index name
"""

import html
import json
import logging
import os
import re
import boto3
import requests
from requests_aws4auth import AWS4Auth


logger = logging.getLogger()
logger.setLevel(logging.INFO)


OS_REGION = os.environ['OS_REGION']
OS_HOST = os.environ['OS_HOST']
OS_INDEX = os.environ['OS_INDEX']
OS_SERVICE = 'es'

# The OpenSearch domain endpoint with https:// and without a trailing slash
os_url = 'https://' + OS_HOST + '/' + OS_INDEX + '/_search'

credentials = boto3.Session().get_credentials()
awsauth = AWS4Auth(credentials.access_key, credentials.secret_key,
                   OS_REGION, OS_SERVICE, session_token=credentials.token)


def lambda_handler(event, _) -> dict:
    """
    AWS Lambda handler for searching titles in OpenSearch.

    Searches for movies and TV series based on query parameters. Required parameter is 'title'.
    Optional parameters are 'year', 'actors' and 'directors' to refine the search.

    Args:
        event: AWS Lambda event object containing query parameters
        _: AWS Lambda context object (unused)

    Returns:
        dict: Response object with status code, headers and search results in body
              Status code 400 if title parameter is missing or empty
              Status code 200 with search results on success

    Raises:
        KeyError: If required environment variables are missing
    """
    logger.info(event)

    if not 'queryStringParameters' in event or not 'title' in event['queryStringParameters']:
        return {
            "statusCode": 400,
            "body": "Missing query string parameter 'title'"
        }

    if len(event['queryStringParameters']['title']) == 0:
        return {
            "statusCode": 400,
            "body": "Query string parameter 'title' must not be empty"
        }

    query = {
        "size": 1,
        "query": {
            "bool": {
                "must": [
                    {
                        "match": {
                            "titleDisplay": {
                                "query": html.unescape(event['queryStringParameters']['title']),
                                "_name": "query-must"
                            }
                        }
                    },
                    {
                        "match": {
                            "titleType": {
                                "query": "movie^10 tvSeries tvMiniSeries",
                                "_name": "query-must"
                            }
                        }
                    }
                ],
                "should": []
            }
        }
    }

    if 'year' in event['queryStringParameters'] and \
            len(event['queryStringParameters']['year']) > 0:
        query["query"]["bool"]["should"].append(
            {
                "match": {
                    "year": {
                        "query": event['queryStringParameters']['year'],
                        "_name": "query-should"
                    }
                }
            }
        )

    if 'actors' in event['queryStringParameters'] and \
            len(event['queryStringParameters']['actors']) > 0:
        query["query"]["bool"]["should"].append(
            {
                "match": {
                    "stars": {
                        "query": html.unescape(event['queryStringParameters']['actors']),
                        "_name": "query-should"
                    }
                }
            }
        )

    if 'directors' in event['queryStringParameters'] and \
            len(event['queryStringParameters']['directors']) > 0:
        query["query"]["bool"]["should"].append(
            {
                "match": {
                    "directors": {
                        "query": html.unescape(event['queryStringParameters']['directors']),
                        "_name": "query-should"
                    }
                }
            }
        )

    # Elasticsearch 6.x requires an explicit Content-Type header
    headers = {"Content-Type": "application/json"}

    # Make the signed HTTP request
    r = requests.get(
        url=os_url,
        auth=awsauth,
        headers=headers,
        data=json.dumps(query)
    )

    # Create the response and add some extra content to support CORS
    response = {
        "statusCode": 200,
        "headers": {
            "Access-Control-Allow-Origin": '*'
        },
        "isBase64Encoded": False,
        "body": json.dumps([])
    }

    items = r.json()['hits']['hits']

    response['body'] = json.dumps([items[0]])

    logging.info(response)
    return response
