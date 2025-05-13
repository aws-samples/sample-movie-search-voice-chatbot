"""
Movie Database Interface Module

This module provides functionality to interact with a movie database API and handle movie ratings.
It includes caching capabilities and functions to parse and format movie information.

Key Components:
- Movie database API integration with caching support
- Title and date extraction from XML-style payload
- Rating generation and formatting (both random and IMDB-based)

Environment Variables:
    MOVIE_DATABASE_KEY: API key for movie database access
    MOVIE_DATABASE_URL: Base URL for movie database API
    MEMCACHED_ENDPOINT: Optional memcached endpoint for caching (currently disabled)
"""

import json
import logging
import os
import random
import re
from typing import Tuple
import requests


logger = logging.getLogger()
logger.setLevel(logging.INFO)

MOVIE_DATABASE_URL = os.getenv('MOVIE_DATABASE_URL')
logger.info('MOVIE_DATABASE_URL: %s', MOVIE_DATABASE_URL)


def get_movie_database_record(title: str, year: str, actors: str, directors: str) -> dict:
    """
    Retrieves movie information from database with caching support.

    Args:
        title: Movie title to search for
        year: Release year of the movie

    Returns:
        dict: Movie information from the database
    """
    response = None
    logging.info('Movie database lookup: %s %s %s %s',
                 title, year, actors, directors)
    params = {}
    params['title'] = title
    if year:
        params['year'] = year
    params['actors'] = actors
    params['directors'] = directors
    try:
        response = requests.get(
            url=MOVIE_DATABASE_URL,
            params=params,
            timeout=10
        ).json()[0]['_source']
    except Exception as e:
        logging.error('Movie database response: %s', e)
        return {
            'Poster': '',
            'Rating': random.randint(1, 10) / 2,
            'Votes': 0
        }
    movie_database_record = {}
    movie_database_record['Poster'] = response.get('poster_url', '')
    movie_database_record['Rating'] = response.get('rating', {}).get(
        'rating', random.randint(1, 10) / 2)
    movie_database_record['Votes'] = response.get(
        'rating', {}).get('numberOfVotes', 0)

    logging.info('Movie database record: %s',
                 json.dumps(movie_database_record))
    return movie_database_record


def get_title_and_year(payload: str) -> Tuple[str, str]:
    """
    Extracts movie titles and years from XML-style payload.

    Args:
        payload: String containing <show> and optional <year> tags

    Returns:
        dict: Mapping of show titles to their years
    """
    title = re.search(
        r'<show>(.*?)</show>', payload)
    year = re.search(
        r'<year>(\d*?)</year>', payload)
    actors = " ".join(re.findall(r'<actor>(.*?)</actor>', payload))
    directors = " ".join(re.findall(r'<director>(.*?)</director>', payload))
    if title:
        title = title.group(1)
    else:
        title = ''
    if year:
        year = year.group(1)
    else:
        year = ''
    return title, year, actors, directors


def generate_random_rating() -> str:
    """
    Generates a random rating with star icons and view count.

    Returns:
        str: HTML string with star icons and fake view count
    """
    r = random.randint(1, 10)
    stars = [
        '<i class="bi bi-star-fill"></i>' if i <= r
        else '<i class="bi bi-star-half"></i>' if i == r + 1
        else ''
        for i in range(2, 11, 2)
    ]

    n = random.randint(0, 3)
    d = random.randint(1, 9)
    return ''.join(stars) + f' {n}.{d}K'


def generate_movie_database_rating(movie_database_record: dict) -> str:
    """
    Generates rating display from movie database record.

    Args:
        movie_database_record: Dictionary containing movie info including IMDb rating

    Returns:
        str: HTML string with star icons based on IMDb rating and view count
    """
    try:
        stars = []
        r = round(movie_database_record['Rating'])

        # Build list of star elements
        for i in range(2, 11, 2):
            if i <= r:
                stars.append('<i class="bi bi-star-fill"></i>')
            elif i == r + 1:
                stars.append('<i class="bi bi-star-half"></i>')

        # Calculate view count
        i = int(re.sub(r'[\D]', '', str(movie_database_record['Votes'])))
        n = int(i / 1000)
        d = int((i % 1000) / 100)

        # Join stars and append view count
        return ''.join(stars) + f' {n}.{d}K'

    except ValueError:
        return generate_random_rating()
