# -*- coding: utf-8 -*-
"""
Created on Tue Jul  7 16:11:58 2026

@author: Tim Rodgers with M365 CoPilot

Course classifier for the degree audit pipeline.

Adds:
- is_science_credit
- is_arts_credit
- is_upper_level
- breadth_categories
- classification_notes

Uses:
- faculty_course_classification_rules.csv
- faculty_breadth_categories.csv
"""

from __future__ import annotations

import re
from typing import Optional

import pandas as pd

from . import course_classification_core as classification_core


class CourseClassifier:
    def __init__(
        self,
        classification_rules,
        breadth_rules=None,
        student_courses=None,
        faculty_requirement_courses=None,
        profile=None,
    ):
        self.classification_rules = classification_rules.copy().fillna("")
        self.breadth_rules = (
            breadth_rules.copy().fillna("")
            if breadth_rules is not None
            else pd.DataFrame()
        )
        self.student_courses = student_courses
        self.faculty_requirement_courses = (
            faculty_requirement_courses.copy().fillna("")
            if faculty_requirement_courses is not None
            else pd.DataFrame()
        )
        self.profile = profile

    @classmethod
    def from_audit_bundle(cls, bundle):
        faculty_files = bundle.faculty_requirements.files
    
        return cls(
            classification_rules=faculty_files["faculty_course_classification_rules"],
            breadth_rules=faculty_files.get("faculty_breadth_categories"),
            faculty_requirement_courses=faculty_files.get("faculty_requirement_courses"),
            student_courses=bundle.student_courses.courses,
            profile=bundle.profile,
        )

    def classify(self, student_courses=None):
        if student_courses is None:
            student_courses = self.student_courses

        if student_courses is None:
            raise ValueError("No student courses provided for classification.")

        return self.classify_courses(student_courses)

    def classify_courses(
        self,
        student_courses: pd.DataFrame,
    ) -> pd.DataFrame:
        """
        Return a classified copy of the student courses dataframe.
        """

        df = student_courses.copy()

        df["is_science_credit"] = df.apply(
            self._is_science_credit,
            axis=1
        )

        df["is_arts_credit"] = df.apply(
            self._is_arts_credit,
            axis=1
        )

        df["is_upper_level"] = df["course_level"].apply(
            classification_core.is_upper_level
        )

        df["breadth_categories"] = df.apply(
            self._get_breadth_categories,
            axis=1
        )
        
        df["faculty_requirement_matches"] = df.apply(
            self._get_faculty_requirement_matches,
            axis=1
        )
        
        df["is_communication_course"] = df["faculty_requirement_matches"].apply(
            lambda value: "COMMUNICATION" in self._split_requirement_matches(value)
        )

        df["is_lab_course"] = df["faculty_requirement_matches"].apply(
            lambda value: "LAB_REQUIREMENT" in self._split_requirement_matches(value)
        )        

        df["classification_notes"] = df.apply(
            self._classification_notes,
            axis=1
        )

        return df

    # ------------------------------------------------------------------
    # Main classification checks
    # ------------------------------------------------------------------

    def _is_science_credit(self, row) -> bool:
        return classification_core.is_science_credit(
            row, self.classification_rules
        )

    def _is_arts_credit(self, row) -> bool:
        """
        Arts credit is checked after Science credit.

        If a course matches Science credit, it should not also count as Arts
        credit unless a future rule explicitly says otherwise.
        """

        return classification_core.is_arts_credit(
            row, self.classification_rules
        )

    # ------------------------------------------------------------------
    # Breadth
    # ------------------------------------------------------------------

    def _get_breadth_categories(self, row) -> str:
        """
        Return semicolon-separated breadth categories.
        """

        categories = classification_core.get_breadth_categories(
            row, self.breadth_rules
        )

        return ";".join(categories)

    # ------------------------------------------------------------------
    # Notes
    # ------------------------------------------------------------------

    def _classification_notes(self, row) -> str:
        notes = []
    
        if row.get("override_course_code", ""):
            notes.append(
                f"Override used: {row.get('course_code')} counted as "
                f"{row.get('effective_course_code')}"
            )
    
        if bool(row.get("is_science_credit", False)):
            notes.append("Science credit")
    
        if bool(row.get("is_arts_credit", False)):
            notes.append("Arts credit")
    
        breadth = row.get("breadth_categories", "")
    
        if breadth:
            notes.append(f"Breadth: {breadth}")
    
        faculty_matches = row.get("faculty_requirement_matches", "")
    
        if faculty_matches:
            notes.append(f"Faculty requirement: {faculty_matches}")
    
        if bool(row.get("is_communication_course", False)):
            notes.append("Communication requirement course")
    
        return "; ".join(notes)
    
    # ------------------------------------------------------------------
    # Faculty requirement course mappings
    # ------------------------------------------------------------------
    
    def _get_faculty_requirement_matches(self, row) -> str:
        """
        Return semicolon-separated Faculty requirement IDs satisfied by this course.
    
        Uses faculty_requirement_courses.csv.
    
        Example:
        SCIE113 -> COMMUNICATION
        ENVR200 -> COMMUNICATION
        CHEM121 -> LAB_REQUIREMENT
        """
    
        if self.faculty_requirement_courses.empty:
            return ""
    
        mappings = self._get_relevant_faculty_requirement_courses()
    
        if mappings.empty:
            return ""
    
        matched_requirement_ids = []
    
        for _, mapping in mappings.iterrows():
            if self._faculty_requirement_course_matches(row, mapping):
                requirement_id = str(
                    mapping.get("requirement_id", "")
                ).strip().upper()
    
                if requirement_id and requirement_id not in matched_requirement_ids:
                    matched_requirement_ids.append(requirement_id)
    
        return ";".join(matched_requirement_ids)
    
    
    def _get_relevant_faculty_requirement_courses(self) -> pd.DataFrame:
        """
        Filter faculty_requirement_courses.csv by student profile.
    
        Rules with ALL are treated as global.
        """
    
        df = self.faculty_requirement_courses.copy()
    
        if df.empty:
            return df
    
        if self.profile is None:
            return df
    
        required_columns = [
            "program",
            "calendar_year",
            "program_type",
        ]
    
        for column in required_columns:
            if column not in df.columns:
                df[column] = "ALL"
    
        profile_program = str(self.profile.program).strip().upper()
        profile_calendar_year = str(self.profile.calendar_year).strip()
        profile_program_type = str(self.profile.program_type).strip().upper()
    
        df["program"] = df["program"].astype(str).str.strip().str.upper()
        df["calendar_year"] = df["calendar_year"].astype(str).str.strip()
        df["program_type"] = df["program_type"].astype(str).str.strip().str.upper()
    
        relevant = df[
            ((df["program"] == profile_program) | (df["program"] == "ALL"))
            &
            (
                (df["calendar_year"] == profile_calendar_year)
                | (df["calendar_year"] == "ALL")
            )
            &
            (
                (df["program_type"] == profile_program_type)
                | (df["program_type"] == "ALL")
            )
        ].copy()
    
        return relevant
    
    
    def _faculty_requirement_course_matches(self, row, mapping) -> bool:
        """
        Check whether a student course matches one row from faculty_requirement_courses.csv.
        """
    
        student_course = str(
            row.get("effective_course_code", "")
        ).strip().upper()
    
        student_subject = str(
            row.get("subject", "")
        ).strip().upper()
    
        mapped_course = str(
            mapping.get("course_code", "")
        ).strip().upper()
    
        if not student_course or not mapped_course:
            return False
    
        normalized_mapped_course = self._normalize_mapping_course_code(
            mapped_course
        )
    
        # Wildcard, e.g. HGSE*
        if normalized_mapped_course.endswith("*"):
            prefix = normalized_mapped_course.replace("*", "")
            return student_course.startswith(prefix)
    
        # Exact course match, e.g. SCIE113
        if normalized_mapped_course == student_course:
            return True
    
        # Subject-only match, e.g. WRCM
        # This is useful if a mapping row intentionally names a subject rather
        # than a specific course number.
        if not any(char.isdigit() for char in normalized_mapped_course):
            return student_subject == normalized_mapped_course
    
        return False
    
    
    def _normalize_mapping_course_code(self, value: str) -> str:
        """
        Normalize a course code from faculty_requirement_courses.csv.
    
        Preserves:
        - wildcards like HGSE*
        - subject-only mappings like WRCM
        """
    
        text = str(value).strip().upper()
    
        if not text:
            return ""
    
        if text.endswith("*"):
            return text.replace(" ", "").replace("_V", "")
    
        # Try normal course normalization first.
        match = re.search(
            r"\b([A-Z]{2,5})_?V?\s*[-_]?\s*(\d{3}[A-Z]?)\b",
            text
        )
    
        if match:
            return f"{match.group(1)}{match.group(2)}"
    
        # If no course number is present, treat as subject-only.
        return text.replace(" ", "").replace("_V", "")
    
    
    @staticmethod
    def _split_requirement_matches(value: str) -> list:
        if value is None:
            return []
    
        return [
            item.strip().upper()
            for item in str(value).split(";")
            if item.strip()
        ]