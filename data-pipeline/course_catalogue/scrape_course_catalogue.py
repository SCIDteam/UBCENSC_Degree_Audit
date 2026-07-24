import json
import os
import re

import pandas as pd


def load_excel_file():
    base_dir = os.path.abspath(os.path.dirname(__file__))

    file1_path = os.path.join(
        base_dir,
        "data",
        "Course-Data-2026-07-22 12_18 PDT.xlsx",
    )

    # file2_path = os.path.join(
    #     base_dir,
    #     "data",
    #     "Course_Section_Search_-_Central Term 2 and Summer 2025.xlsx",
    # )

    try:
        file1 = pd.read_excel(file1_path, skiprows=15)
        # file2 = pd.read_excel(file2_path, skiprows=1)

        print("Files successfully loaded.")
        return file1 #, file2

    except Exception as error:
        print(f"An error occurred while loading the files: {error}")
        return None #, None


def clean_subject(value):
    if pd.isna(value):
        return ""

    subject = str(value).strip().upper()

    # Remove campus suffixes such as _V.
    subject = re.sub(r"_[A-Z]+$", "", subject)

    return subject


def clean_course_number(value):
    if pd.isna(value):
        return ""

    if isinstance(value, float) and value.is_integer():
        value = int(value)

    course_number = str(value).strip().upper()

    # Remove Excel formatting such as 392.0.
    course_number = re.sub(r"\.0$", "", course_number)

    return course_number


def get_course_level(course_number):
    match = re.search(r"\d", str(course_number))

    if not match:
        return None

    return int(match.group(0)) * 100


def parse_credits(value):
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


def clean_data(df1):
    # combined_df = pd.concat(
    #    [df1, df2],
    #    ignore_index=True,
    combined_df = df1.copy()

    required_columns = {
        "Course Subject",
        "Course Number",
        "Section Title",
        "Maximum Credits",
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

    # Multiple rows may exist for lectures, labs, tutorials, or terms.
    # Keep one row per course code.
    cleaned_df = combined_df.drop_duplicates(
        subset=["course_code"],
        keep="first",
    )

    return cleaned_df


def build_course_catalogue(cleaned_df):
    courses_json = []

    for _, row in cleaned_df.iterrows():
        course_entry = {
            "course_code": row["course_code"],
            "display_code": row["display_code"],
            "subject": row["subject"],
            "course_number": row["course_number"],
            "course_level": row["course_level"],
            "course_title": row["course_title"],
            "credits": row["credits"],
        }

        courses_json.append(course_entry)

    courses_json.sort(
        key=lambda course: course["course_code"]
    )

    return courses_json


if __name__ == "__main__":
    df1 = load_excel_file()

    if df1 is None:
        raise SystemExit(1)

    cleaned_df = clean_data(df1)
    courses_json = build_course_catalogue(cleaned_df)

    base_dir = os.path.abspath(
        os.path.dirname(__file__)
    )

    output_path = os.path.join(
        base_dir,
        "course_catalogue.json",
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

    print(
        f"Generated {len(courses_json)} courses."
    )

    print(
        f"Output written to: {output_path}"
    )