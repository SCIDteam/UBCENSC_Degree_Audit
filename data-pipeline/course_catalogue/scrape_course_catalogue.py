import json
import os
import re
import sys
from typing import Any

import pandas as pd

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from audit import course_classification_core as classification_core

INPUT_FILENAME = "Course-Data_2024-2027.xlsx"

FACULTY_REQUIREMENTS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "faculty_requirements",
)


def load_classification_rules() -> pd.DataFrame:
    path = os.path.join(
        FACULTY_REQUIREMENTS_DIR,
        "faculty_course_classification_rules.csv",
    )

    return pd.read_csv(path).fillna("")


def load_breadth_rules() -> pd.DataFrame:
    path = os.path.join(
        FACULTY_REQUIREMENTS_DIR,
        "faculty_breadth_categories.csv",
    )

    return pd.read_csv(path).fillna("")


def load_faculty_requirement_courses() -> pd.DataFrame:
    path = os.path.join(
        FACULTY_REQUIREMENTS_DIR,
        "faculty_requirement_courses.csv",
    )

    return pd.read_csv(path).fillna("")


def classify_catalogue_course(
    row: dict[str, Any],
    classification_rules: pd.DataFrame,
    breadth_rules: pd.DataFrame,
    faculty_requirement_courses: pd.DataFrame,
) -> dict[str, Any]:
    """
    Classify a single catalogue course using the same Faculty rule
    semantics as CourseClassifier. Catalogue courses have no student
    overrides, so effective_course_code is always the course's own code.
    """

    classification_row = {
        "effective_course_code": row["course_code"],
        "subject": row["subject"],
        "course_number": row["course_number"],
    }

    is_science_credit = classification_core.is_science_credit(
        classification_row, classification_rules
    )
    is_arts_credit = classification_core.is_arts_credit(
        classification_row, classification_rules, science_credit=is_science_credit
    )
    breadth_categories = classification_core.get_breadth_categories(
        classification_row, breadth_rules
    )

    faculty_requirement_matches = classification_core.get_faculty_requirement_matches(
        classification_row,
        faculty_requirement_courses,
        program="ENSC",
        calendar_year="ALL",
        program_type="ALL",
    )
    matched_requirement_ids = classification_core.split_requirement_matches(
        faculty_requirement_matches
    )
    is_communication_course = "COMMUNICATION" in matched_requirement_ids
    is_lab_course = "LAB_REQUIREMENT" in matched_requirement_ids

    notes: list[str] = []

    if is_science_credit:
        notes.append("Science credit")

    if is_arts_credit:
        notes.append("Arts credit")

    if breadth_categories:
        notes.append(f"Breadth: {';'.join(breadth_categories)}")

    return {
        "is_science_credit": is_science_credit,
        "is_arts_credit": is_arts_credit,
        "is_upper_level": classification_core.is_upper_level(
            row["course_level"]
        ),
        "breadth_categories": breadth_categories,
        "is_communication_course": is_communication_course,
        "is_lab_course": is_lab_course,
        "classification_notes": notes,
    }

TERM_ORDER = {
    "Winter Term 1": 0,
    "Winter Term 2": 1,
    "Summer": 2,
}

REQUISITE_HEADINGS = (
    "Prerequisite",
    "Corequisite",
    "Pre- or Corequisite",
    "Equivalency",
    "Equivalent",
    "Restriction",
)


def load_excel_file(skiprows=15) -> pd.DataFrame | None:
    base_dir = os.path.abspath(os.path.dirname(__file__))

    input_path = os.path.join(
        base_dir,
        "data",
        INPUT_FILENAME,
    )

    try:
        dataframe = pd.read_excel(
            input_path,
            skiprows=skiprows,
        )

        print(f"File successfully loaded: {input_path}")
        return dataframe

    except Exception as error:
        print(f"An error occurred while loading the file: {error}")
        return None


def clean_subject(value: Any) -> str:
    if pd.isna(value):
        return ""

    subject = str(value).strip().upper()

    # Remove campus suffixes such as _V.
    subject = re.sub(r"_[A-Z]+$", "", subject)

    return subject


def clean_course_number(value: Any) -> str:
    if pd.isna(value):
        return ""

    if isinstance(value, float) and value.is_integer():
        value = int(value)

    course_number = str(value).strip().upper()

    # Remove Excel formatting such as 392.0.
    course_number = re.sub(r"\.0$", "", course_number)

    return course_number


def get_course_level(course_number: Any) -> int | None:
    match = re.search(r"\d", str(course_number))

    if not match:
        return None

    return int(match.group(0)) * 100


def parse_credits(value: Any) -> int | float | None:
    if pd.isna(value):
        return None

    text = str(value).strip()

    if not text:
        return None

    try:
        credits = float(text)
    except ValueError:
        match = re.search(r"\d+(?:\.\d+)?", text)

        if not match:
            return None

        credits = float(match.group(0))

    if credits.is_integer():
        return int(credits)

    return credits


def clean_description(value: Any) -> str:
    if pd.isna(value):
        return ""

    description = str(value).strip()

    # Collapse repeated whitespace while keeping the original wording.
    description = re.sub(r"\s+", " ", description)

    return description


def extract_requisite_text(
    description: Any,
    heading: str,
) -> str:
    """
    Extract a complete requisite clause while retaining its heading.

    Example:
        Prerequisite: BIOL 112. Corequisite: BIOL 310.

    Prerequisite result:
        Prerequisite: BIOL 112.

    Corequisite result:
        Corequisite: BIOL 310.
    """
    text = clean_description(description)

    if not text:
        return ""

    other_headings = [
        item
        for item in REQUISITE_HEADINGS
        if item.lower() != heading.lower()
    ]

    stop_pattern = "|".join(
        re.escape(item)
        for item in other_headings
    )

    pattern = re.compile(
        rf"(?P<result>"
        rf"\b{re.escape(heading)}\s*:"
        rf".*?"
        rf")"
        rf"(?="
        rf"\s+(?:{stop_pattern})\s*:"
        rf"|$"
        rf")",
        flags=re.IGNORECASE,
    )

    match = pattern.search(text)

    if not match:
        return ""

    result = match.group("result").strip()

    # Normalize the heading capitalization while keeping its contents.
    result = re.sub(
        rf"^{re.escape(heading)}\s*:",
        f"{heading}:",
        result,
        count=1,
        flags=re.IGNORECASE,
    )

    return result


def extract_course_codes(value: Any) -> list[str]:
    """
    Extract normalized course codes such as BIOL112 from requisite text.
    Examples:
        BIOL 112   -> BIOL112
        CLST_V 232 -> CLST232
        AMNE_V 216 -> AMNE216
    """
    text = clean_description(value)

    if not text:
        return []

    matches = re.findall(
        r"\b([A-Z]{2,5})(?:_[A-Z]+)?[\s-]*(\d{3}[A-Z]?)\b",
        text.upper(),
    )

    normalized_codes = [
        f"{subject}{number}"
        for subject, number in matches
    ]

    return list(dict.fromkeys(normalized_codes))


def parse_terms_offered(value: Any) -> list[str]:
    """
    Convert catalogue term codes into planner term labels.

    W1   -> Winter Term 1
    W2   -> Winter Term 2
    W1-2 -> Winter Term 1 and Winter Term 2
    S1   -> Summer
    S2   -> Summer
    S1-2 -> Summer

    Mixed values such as W1, S1 are also supported.
    """
    if pd.isna(value):
        return []

    raw_term = str(value).strip().upper()

    if not raw_term:
        return []

    terms: list[str] = []

    if re.search(r"\bW1\s*-\s*2\b", raw_term):
        terms.extend(
            [
                "Winter Term 1",
                "Winter Term 2",
            ]
        )
    else:
        if re.search(r"\bW1\b", raw_term):
            terms.append("Winter Term 1")

        if re.search(r"\bW2\b", raw_term):
            terms.append("Winter Term 2")

    if (
        re.search(r"\bS1\s*-\s*2\b", raw_term)
        or re.search(r"\bS1\b", raw_term)
        or re.search(r"\bS2\b", raw_term)
    ):
        terms.append("Summer")

    # Preserve order while removing duplicates.
    return list(dict.fromkeys(terms))


def combine_terms(term_lists: pd.Series) -> list[str]:
    combined_terms: list[str] = []

    for term_list in term_lists:
        if not isinstance(term_list, list):
            continue

        for term in term_list:
            if term not in combined_terms:
                combined_terms.append(term)

    if not combined_terms:
        return ["Winter Term 1"]

    return sorted(
        combined_terms,
        key=lambda term: TERM_ORDER.get(term, 99),
    )


def first_non_empty(values: pd.Series) -> Any:
    for value in values:
        if isinstance(value, str):
            if value.strip():
                return value.strip()
        elif pd.notna(value):
            return value

    return ""


def combine_course_codes(
    code_lists: pd.Series,
    valid_course_codes: set[str],
) -> list[str]:
    combined_codes: list[str] = []

    for code_list in code_lists:
        if not isinstance(code_list, list):
            continue

        for course_code in code_list:
            if (
                course_code in valid_course_codes
                and course_code not in combined_codes
            ):
                combined_codes.append(course_code)

    return combined_codes


def clean_data(df1: pd.DataFrame) -> pd.DataFrame:
    combined_df = df1.copy()

    required_columns = {
        "Course Subject",
        "Course Number",
        "Section Title",
        "Maximum Credits",
        "Description",
        "Term",
    }

    missing_columns = required_columns.difference(
        combined_df.columns
    )

    if missing_columns:
        missing = ", ".join(sorted(missing_columns))

        raise ValueError(
            f"Missing required columns: {missing}"
        )

    combined_df["subject"] = combined_df[
        "Course Subject"
    ].apply(clean_subject)

    combined_df["course_number"] = combined_df[
        "Course Number"
    ].apply(clean_course_number)

    combined_df["course_code"] = (
        combined_df["subject"]
        + combined_df["course_number"]
    )

    combined_df["display_code"] = (
        combined_df["subject"]
        + " "
        + combined_df["course_number"]
    )

    combined_df["course_level"] = combined_df[
        "course_number"
    ].apply(get_course_level)

    combined_df["credits"] = combined_df[
        "Maximum Credits"
    ].apply(parse_credits)

    combined_df["course_title"] = combined_df[
        "Section Title"
    ].fillna("").astype(str).str.strip()

    combined_df["description"] = combined_df[
        "Description"
    ].apply(clean_description)

    combined_df["prerequisite_text"] = combined_df[
        "description"
    ].apply(
        lambda description: extract_requisite_text(
            description,
            "Prerequisite",
        )
    )

    combined_df["corequisite_text"] = combined_df[
        "description"
    ].apply(
        lambda description: extract_requisite_text(
            description,
            "Corequisite",
        )
    )

    combined_df["prerequisite_codes_raw"] = combined_df[
        "prerequisite_text"
    ].apply(extract_course_codes)

    combined_df["corequisite_codes_raw"] = combined_df[
        "corequisite_text"
    ].apply(extract_course_codes)

    combined_df["terms_offered_raw"] = combined_df[
        "Term"
    ].apply(parse_terms_offered)

    # Keep only valid undergraduate course numbers below 500.
    numeric_course_numbers = pd.to_numeric(
        combined_df["course_number"],
        errors="coerce",
    )

    combined_df = combined_df[
        numeric_course_numbers.notna()
        & (numeric_course_numbers < 500)
    ].copy()

    # Remove rows that could not produce a valid course identity.
    combined_df = combined_df[
        combined_df["subject"].ne("")
        & combined_df["course_number"].ne("")
        & combined_df["course_code"].ne("")
    ].copy()

    valid_course_codes = set(
        combined_df["course_code"].dropna().astype(str)
    )

    grouped_rows: list[dict[str, Any]] = []

    for course_code, group in combined_df.groupby(
        "course_code",
        sort=False,
    ):
        prerequisite_text = first_non_empty(
            group["prerequisite_text"]
        )

        corequisite_text = first_non_empty(
            group["corequisite_text"]
        )

        grouped_rows.append(
            {
                "course_code": course_code,
                "display_code": first_non_empty(
                    group["display_code"]
                ),
                "subject": first_non_empty(
                    group["subject"]
                ),
                "course_number": first_non_empty(
                    group["course_number"]
                ),
                "course_level": first_non_empty(
                    group["course_level"]
                ),
                "course_title": first_non_empty(
                    group["course_title"]
                ),
                "credits": first_non_empty(
                    group["credits"]
                ),
                "terms_offered": combine_terms(
                    group["terms_offered_raw"]
                ),
                "prerequisite_text": prerequisite_text,
                "corequisite_text": corequisite_text,
                "prerequisites": combine_course_codes(
                    group["prerequisite_codes_raw"],
                    valid_course_codes,
                ),
                "corequisites": combine_course_codes(
                    group["corequisite_codes_raw"],
                    valid_course_codes,
                ),
            }
        )

    return pd.DataFrame(grouped_rows)


def build_course_catalogue(
    cleaned_df: pd.DataFrame,
    classification_rules: pd.DataFrame,
    breadth_rules: pd.DataFrame,
    faculty_requirement_courses: pd.DataFrame,
) -> list[dict[str, Any]]:
    courses_json: list[dict[str, Any]] = []

    for _, row in cleaned_df.iterrows():
        course_level = row["course_level"]

        if pd.isna(course_level):
            normalized_course_level = None
        else:
            normalized_course_level = int(course_level)

        credits = row["credits"]

        if pd.isna(credits):
            normalized_credits = None
        elif isinstance(credits, float) and credits.is_integer():
            normalized_credits = int(credits)
        else:
            normalized_credits = credits

        course_entry = {
            "course_code": row["course_code"],
            "display_code": row["display_code"],
            "subject": row["subject"],
            "course_number": row["course_number"],
            "course_level": normalized_course_level,
            "course_title": row["course_title"],
            "credits": normalized_credits,
            "terms_offered": row["terms_offered"],
            "prerequisite_text": row["prerequisite_text"],
            "corequisite_text": row["corequisite_text"],
            "prerequisites": row["prerequisites"],
            "corequisites": row["corequisites"],
        }

        course_entry.update(
            classify_catalogue_course(
                course_entry,
                classification_rules,
                breadth_rules,
                faculty_requirement_courses,
            )
        )

        courses_json.append(course_entry)

    courses_json.sort(
        key=lambda course: course["course_code"]
    )

    return courses_json


def write_catalogue(
    courses_json: list[dict[str, Any]],
) -> str:
    base_dir = os.path.abspath(
        os.path.dirname(__file__)
    )

    output_path = os.path.join(
        base_dir,
        "course-catalogue.json",
    )

    with open(
        output_path,
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            courses_json,
            file,
            indent=2,
            ensure_ascii=False,
            allow_nan=False,
        )

        file.write("\n")

    return output_path


if __name__ == "__main__":
    dataframe = load_excel_file(skiprows=0)

    if dataframe is None:
        raise SystemExit(1)

    cleaned_dataframe = clean_data(dataframe)
    catalogue = build_course_catalogue(
        cleaned_dataframe,
        classification_rules=load_classification_rules(),
        breadth_rules=load_breadth_rules(),
        faculty_requirement_courses=load_faculty_requirement_courses(),
    )

    generated_output_path = write_catalogue(
        catalogue
    )

    print(f"Generated {len(catalogue)} courses.")
    print(f"Output written to: {generated_output_path}")