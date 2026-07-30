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
            lambda value: "COMMUNICATION" in classification_core.split_requirement_matches(value)
        )

        df["is_lab_course"] = df["faculty_requirement_matches"].apply(
            lambda value: "LAB_REQUIREMENT" in classification_core.split_requirement_matches(value)
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
            if classification_core.faculty_requirement_course_matches(row, mapping):
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

        return classification_core.get_relevant_faculty_requirement_courses(
            self.faculty_requirement_courses,
            program=self.profile.program,
            calendar_year=self.profile.calendar_year,
            program_type=self.profile.program_type,
        )