# -*- coding: utf-8 -*-
"""
Shared pure course-classification helpers.

Extracted from CourseClassifier so the same rule-matching logic can be
reused by the frontend catalogue generation script without duplicating
Tim's Faculty classification rules.

Uses:
- faculty_course_classification_rules.csv
- faculty_breadth_categories.csv

Each function takes a plain mapping (dict or pandas Series) with:
- effective_course_code
- subject
- course_number
- course_level (only used by is_upper_level)
"""

from __future__ import annotations

import re

import pandas as pd

PRIORITY_RULE_TYPES = [
    "specific_course",
    "course_range",
    "subject_special",
    "subject_all",
    "faculty_all",
]


def is_upper_level(course_level) -> bool:
    return bool(pd.notna(course_level) and float(course_level) >= 300)


def last_two_digits_between(course_number, lower: int, upper: int) -> bool:
    if pd.isna(course_number):
        return False

    last_two = int(course_number) % 100

    return lower <= last_two <= upper


def is_psyc_science_exception(course_code: str, course_number) -> bool:
    if course_code in {"PSYC348", "PSYC448"}:
        return True

    return last_two_digits_between(course_number, lower=60, upper=89)


def normalize_specific_course_subject(value: str) -> str:
    return str(value).strip().upper().replace(" ", "").replace("_V", "")


def matches_course_range(course_number, include_pattern: str) -> bool:
    if pd.isna(course_number):
        return False

    match = re.match(r"^(\d{3})\s*-\s*(\d{3})$", include_pattern.strip())

    if not match:
        return False

    lower = int(match.group(1))
    upper = int(match.group(2))

    return lower <= int(course_number) <= upper


def matches_special_pattern(course_number, include_pattern: str) -> bool:
    pattern = include_pattern.strip().lower()

    if pattern == "last_two_digits_60_to_89":
        return last_two_digits_between(course_number, lower=60, upper=89)

    return False


def is_excluded(
    course_code: str,
    course_subject: str,
    course_number,
    exclude_pattern: str,
) -> bool:
    if not exclude_pattern:
        return False

    exclusions = [
        item.strip().upper()
        for item in exclude_pattern.split(";")
        if item.strip()
    ]

    for exclusion in exclusions:
        if exclusion == course_code:
            return True

        if exclusion == course_subject:
            return True

        if exclusion == "PSYC_LAST_TWO_DIGITS_60_TO_89":
            if course_subject == "PSYC" and last_two_digits_between(
                course_number, lower=60, upper=89
            ):
                return True

        if exclusion == "PSYC_SCIENCE_CREDIT":
            if is_psyc_science_exception(course_code, course_number):
                return True

    return False


def matches_rule(row, rule) -> bool:
    rule_type = str(rule.get("rule_type", "")).strip()
    subject = str(rule.get("subject", "")).strip().upper()
    include_pattern = str(rule.get("include_pattern", "")).strip()
    exclude_pattern = str(rule.get("exclude_pattern", "")).strip()

    course_code = str(row.get("effective_course_code", "")).strip().upper()
    course_subject = str(row.get("subject", "")).strip().upper()
    course_number = row.get("course_number", None)

    if not course_code:
        return False

    if is_excluded(
        course_code=course_code,
        course_subject=course_subject,
        course_number=course_number,
        exclude_pattern=exclude_pattern,
    ):
        return False

    if rule_type == "specific_course":
        return course_code == normalize_specific_course_subject(subject)

    if rule_type == "subject_all":
        return course_subject == subject

    if rule_type == "course_range":
        if course_subject != subject:
            return False

        return matches_course_range(course_number, include_pattern)

    if rule_type == "subject_special":
        if course_subject != subject:
            return False

        return matches_special_pattern(course_number, include_pattern)

    if rule_type == "faculty_all":
        # For now, faculty_all is intentionally conservative.
        # Subject-level Arts rows are preferred.
        return False

    return False


def matches_classification(row, classification_rules, classification: str) -> bool:
    rules = classification_rules[
        classification_rules["classification"] == classification
    ]

    for rule_type in PRIORITY_RULE_TYPES:
        subset = rules[rules["rule_type"] == rule_type]

        for _, rule in subset.iterrows():
            if matches_rule(row, rule):
                return True

    return False


def is_science_credit(row, classification_rules) -> bool:
    return matches_classification(row, classification_rules, "science_credit")


def is_arts_credit(row, classification_rules, science_credit: bool | None = None) -> bool:
    """
    Arts credit is checked after Science credit. A course that matches
    Science credit does not also count as Arts credit.
    """

    if science_credit is None:
        science_credit = is_science_credit(row, classification_rules)

    if science_credit:
        return False

    return matches_classification(row, classification_rules, "arts_credit")


def get_breadth_categories(row, breadth_rules) -> list[str]:
    """
    Return the ordered, de-duplicated list of breadth categories matched
    by this course.
    """

    if breadth_rules is None or breadth_rules.empty:
        return []

    categories: list[str] = []

    for _, rule in breadth_rules.iterrows():
        if matches_rule(row, rule):
            category = str(rule.get("breadth_category", "")).strip()

            if category and category not in categories:
                categories.append(category)

    return categories
