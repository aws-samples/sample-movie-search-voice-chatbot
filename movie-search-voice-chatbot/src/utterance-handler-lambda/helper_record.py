"""
HTML Record Processing Module

This module provides functions for processing and manipulating HTML records, particularly
focused on movie/show records with tags. It handles tag balancing, record separation,
and enrichment with movie metadata.

Functions:
    is_balanced_tag(text: str) -> bool:
        Checks if HTML tags in the text are properly balanced and matched.

    remove_empty_tag(text: str) -> str:
        Removes any empty HTML tags from the text.

    is_full_record(text: str) -> bool:
        Checks if text contains a complete record (has both opening and closing tags).

    is_full_unclosed_record(text: str) -> bool:
        Checks if text contains an unclosed record.

    fix_unclosed_record(text: str, is_last: bool = False) -> str:
        Fixes unclosed records by adding proper closing tags.

    correct_record_tag(text: str) -> str:
        Corrects record tags by ensuring proper tag structure.

    separate_record(text: str) -> tuple:
        Separates a record from remaining text.

    append_description_to_record(record: str) -> str:
        Appends description tags to the end of a record.

    append_image_to_record(record: str) -> str:
        Enriches record with movie poster image and rating information.
"""

import logging
import re
from typing import Tuple

from helper_movie import get_movie_database_record, get_title_and_year, \
    generate_movie_database_rating

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def is_balanced_tag(text: str) -> bool:
    """
    Check if HTML tags in the text are properly balanced and matched.

    Args:
        text (str): Text containing HTML tags to check

    Returns:
        bool: True if tags are balanced, False otherwise
    """
    if text.count('<') == 0:
        return True
    if text.count('<') != text.count('>'):
        logging.debug('Unbalanced tags')
        return False
    tags = re.findall(r'<([^>^/]*)>', text)
    for tag in tags:
        if text.count(f'<{tag}>') != text.count(f'</{tag}>'):
            logging.debug('Unmatched tag: %s', tag)
            return False
    return True


def remove_escaped_quotes(text: str) -> str:
    """
    Remove escaped quotes from the text.

    Args:
        text (str): Text containing escaped quotes

    Returns:
        str: Text with escaped quotes removed
    """
    text = text.replace("\'", "'")
    text = text.replace('\"', '"')
    return text


def remove_empty_tag(text: str) -> str:
    """
    Remove any empty HTML tags from the text.

    Args:
        text (str): Text containing HTML tags

    Returns:
        str: Text with empty tags removed
    """
    text = remove_escaped_quotes(text)
    while True:
        tags = re.findall(r'<([^>^/]*)>[\s]*<\/\1>', text)
        if not tags:
            break
        for tag in tags:
            text = re.sub(rf'<{tag}>[\s]*</{tag}>', '', text)
    return text


def is_full_record(text: str) -> bool:
    """
    Check if text contains a complete record with both opening and closing tags.

    Args:
        text (str): Text to check for complete record

    Returns:
        bool: True if record is complete, False otherwise
    """
    if text.find('<record') < text.find('</record>'):
        return True
    return False


def is_full_answer(text: str) -> bool:
    """
    Check if text contains a complete record with both opening and closing tags.

    Args:
        text (str): Text to check for complete record

    Returns:
        bool: True if record is complete, False otherwise
    """
    if text.find('<answer') < text.find('</answer>'):
        return True
    return False


def is_full_unclosed_record(text: str) -> bool:
    """
    Check if text contains an unclosed record.

    Args:
        text (str): Text to check for unclosed record

    Returns:
        bool: True if record is unclosed, False otherwise
    """
    if text.count('<record') == 2 and text.count('</record') == 0:
        logging.info("Found unclosed record")
        return True
    return False


def fix_unclosed_record(text: str, is_last: bool = False) -> str:
    """
    Fix unclosed records by adding proper closing tags.

    Args:
        text (str): Text containing unclosed record
        is_last (bool): Whether this is the last record

    Returns:
        str: Text with fixed record tags
    """
    if not is_last:
        parts = text.split('<record>')
        text = '<record>'.join(parts[:-1]) + '</record><record>' + parts[-1]
    else:
        parts = text.split('>')
        text = '>'.join(parts[:-1]) + '></record>' + parts[-1]
    return text


def correct_record_tag(text: str) -> str:
    """
    Correct record tags by ensuring proper tag structure.

    Args:
        text (str): Text containing record tags to correct

    Returns:
        str: Text with corrected record tags
    """
    last_tag_index = text.find('>', text.rfind('</')) + 1
    if text.count('<record') == 2 and text.count('</record') == 0:
        text_pieces = text.split('<record')
        text = '<record'.join(
            text_pieces[:-1]) + '</record><record' + text_pieces[-1]
    elif text.count('<record') == 1 and text.find('\n', last_tag_index) == last_tag_index:
        text = text[:last_tag_index] + '</record>' + text[last_tag_index:]
    return text


def separate_record(text: str) -> Tuple[str, str]:
    """
    Separate a record from remaining text.

    Args:
        text (str): Text containing record to separate

    Returns:
        tuple: (record, remaining_text)
    """
    text_pieces = text.split('</record>')
    text = text_pieces[0] + '</record>'
    remained = '</record>'.join(text_pieces[1:])
    return text, remained


def separate_answer(text: str) -> Tuple[str, str]:
    """
    Separate a answer from remaining text.

    Args:
        text (str): Text containing answer to separate

    Returns:
        tuple: (answer, remaining_text)
    """
    text_pieces = text.split('</answer>')
    text = text_pieces[0] + '</answer>'
    remained = '</answer>'.join(text_pieces[1:])
    return text, remained


def append_description_to_record(record: str) -> str:
    """
    Append description tags to the end of a record.

    Args:
        record (str): Record to append description to

    Returns:
        str: Record with description tags appended
    """
    descriptions = re.findall(r'<description>(.+)<\/description>', record)
    if not descriptions:
        return record
    record = record.replace('</record>', '')
    for description in descriptions:
        record = record.replace(
            f'<description>{description}</description>', '')
    for description in descriptions:
        record += f'<description>{description}</description>'
    record += '</record>'
    return record


def append_image_to_record(record: str) -> str:
    """
    Enrich record with movie poster image and rating information.

    Args:
        record (str): Record to enrich with image and rating

    Returns:
        str: Record with image and rating information added
    """
    title, year, actors, directors = get_title_and_year(payload=record)
    logging.debug('Title: %s Year: %s Actors: %s Directors: %s',
                  title, year, actors, directors)
    movie_database_record = get_movie_database_record(
        title, year, actors, directors)
    if movie_database_record and \
            'Poster' in movie_database_record and \
            movie_database_record['Poster'] and \
            movie_database_record['Poster'].startswith('https://'):
        logging.debug('Poster url: %s', movie_database_record['Poster'])
        stars = generate_movie_database_rating(movie_database_record)
        record = record.replace(
            f'<show>{title}',
            '<img class="poster" src="' +
            movie_database_record['Poster'] +
            f'" /><stars>{stars}</stars> ' +
            '<play><i class="bi bi-play-btn-fill"></i></play>' +
            f'<show>{title}'
        )
    return record
