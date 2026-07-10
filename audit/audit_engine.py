# -*- coding: utf-8 -*-
"""
Created on Fri Jul 10 08:25:56 2026

@author: Tim Rodgers w M365 Copilot

Audit engine for the degree audit pipeline.

Coordinates:
- Course classification
- Faculty audit
- Specialization possible-match audit
- Promotion audit
- Course allocation
- Allocated specialization audit
- Output writing
- Concise console summary
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from .models import AuditInputBundle
from .models import AuditWorkingData
from .models import AllocationConfig

from .course_classifier import CourseClassifier
from .faculty_auditor import FacultyAuditor
from .specialization_auditor import SpecializationAuditor
from .promotion_auditor import PromotionAuditor
from .allocation_engine import AllocationEngine


class AuditEngine:
    """
    Coordinates a complete audit run for one loaded audit bundle.
    """

    def __init__(
        self,
        bundle: AuditInputBundle,
        allocation_config: AllocationConfig | None = None,
    ):
        self.bundle = bundle
        self.allocation_config = allocation_config

        self.course_classifier = CourseClassifier.from_audit_bundle(
            bundle
        )

        self.faculty_auditor = FacultyAuditor.from_audit_bundle(
            bundle
        )

        self.specialization_auditor = SpecializationAuditor.from_audit_bundle(
            bundle
        )

        self.promotion_auditor = PromotionAuditor.from_audit_bundle(
            bundle
        )

        self.allocation_engine = AllocationEngine.from_audit_bundle(
            bundle,
            allocation_config=allocation_config,
        )

    @classmethod
    def from_bundle(
        cls,
        bundle: AuditInputBundle,
        allocation_config: AllocationConfig | None = None,
    ):
        """
        Build AuditEngine from a loaded AuditInputBundle.
        """

        return cls(
            bundle=bundle,
            allocation_config=allocation_config,
        )

    # ------------------------------------------------------------------
    # Main pipeline
    # ------------------------------------------------------------------

    def run(self) -> AuditWorkingData:
        """
        Run the full audit pipeline.

        Returns
        -------
        AuditWorkingData
            Object containing intermediate and final audit dataframes.
        """

        working = AuditWorkingData(
            bundle=self.bundle
        )

        working.classified_courses = self.course_classifier.classify()

        working.faculty_audit_summary = self.faculty_auditor.audit(
            working.classified_courses
        )

        working.specialization_audit = self.specialization_auditor.audit(
            working.classified_courses
        )

        working.promotion_audit = self.promotion_auditor.audit(
            working.classified_courses
        )

        working.course_allocation = self.allocation_engine.allocate(
            classified_courses=working.classified_courses,
            specialization_audit=working.specialization_audit,
        )

        working.allocated_specialization_audit = (
            self.allocation_engine.build_allocated_specialization_audit(
                course_allocation=working.course_allocation,
                specialization_audit=working.specialization_audit,
            )
        )

        return working

    # ------------------------------------------------------------------
    # Output writing
    # ------------------------------------------------------------------

    def get_output_dir(
        self,
        base_output_dir: str | Path = "audit_outputs",
    ) -> Path:
        """
        Get output directory for this audit case.
        """

        return Path(base_output_dir) / self.bundle.profile.case_id

    def write_outputs(
        self,
        working: AuditWorkingData,
        base_output_dir: str | Path = "audit_outputs",
    ) -> dict:
        """
        Write audit outputs to CSV files.

        Returns
        -------
        dict
            Mapping from output name to output path.
        """

        output_dir = self.get_output_dir(
            base_output_dir=base_output_dir
        )

        output_dir.mkdir(
            parents=True,
            exist_ok=True
        )

        output_paths = {}

        self._write_if_present(
            output_paths=output_paths,
            key="course_classification",
            df=working.classified_courses,
            path=output_dir / "course_classification.csv",
        )

        self._write_if_present(
            output_paths=output_paths,
            key="faculty_audit_summary",
            df=working.faculty_audit_summary,
            path=output_dir / "faculty_audit_summary.csv",
        )

        self._write_if_present(
            output_paths=output_paths,
            key="specialization_audit",
            df=working.specialization_audit,
            path=output_dir / "specialization_audit.csv",
        )

        self._write_if_present(
            output_paths=output_paths,
            key="promotion_audit",
            df=working.promotion_audit,
            path=output_dir / "promotion_audit.csv",
        )

        self._write_if_present(
            output_paths=output_paths,
            key="course_allocation",
            df=working.course_allocation,
            path=output_dir / "course_allocation.csv",
        )

        self._write_if_present(
            output_paths=output_paths,
            key="allocated_specialization_audit",
            df=working.allocated_specialization_audit,
            path=output_dir / "allocated_specialization_audit.csv",
        )

        return output_paths

    @staticmethod
    def _write_if_present(
        output_paths: dict,
        key: str,
        df: pd.DataFrame | None,
        path: Path,
    ) -> None:
        if df is None:
            return

        df.to_csv(
            path,
            index=False
        )

        output_paths[key] = path

    # ------------------------------------------------------------------
    # Concise console summaries
    # ------------------------------------------------------------------

    def print_summary(
        self,
        working: AuditWorkingData,
        max_missing_rows: int = 12,
        max_courses_to_show: int = 3,
    ) -> None:
        """
        Print concise audit summary.

        This is intended for quick command-line inspection.
        """

        self.print_case_header(working)

        self.print_quick_counts(working)

        self.print_promotion_target_summary(working)

        self.print_missing_or_partial_requirements(
            working=working,
            max_missing_rows=max_missing_rows,
            max_courses_to_show=max_courses_to_show,
        )

    def print_case_header(
        self,
        working: AuditWorkingData,
    ) -> None:
        profile = self.bundle.profile
        options = self.bundle.options

        print()
        print("Degree Audit")
        print("============")
        print(f"Case ID: {profile.case_id}")
        print(f"Calendar year: {profile.calendar_year}")
        print(f"Program: {profile.program}")
        print(f"Program type: {profile.program_type}")
        print(f"Option ID: {profile.option_id}")
        print(f"Academic year: {profile.academic_year}")
        print(f"Audit mode: {options.audit_mode}")
        print(f"Counted statuses: {options.count_statuses}")

        counted_credits = self._counted_credits(
            working.classified_courses
        )

        print(f"Total counted credits: {self._format_number(counted_credits)}")
        print()

    def print_quick_counts(
        self,
        working: AuditWorkingData,
    ) -> None:
        faculty_satisfied, faculty_total = self._status_counts(
            working.faculty_audit_summary,
            status_column="status",
        )

        spec_satisfied, spec_total = self._status_counts(
            working.allocated_specialization_audit,
            status_column="allocated_status",
        )

        print("Quick Audit Summary")
        print("-------------------")
        print(
            f"Faculty audit: "
            f"{faculty_satisfied}/{faculty_total} specifications satisfied"
        )
        print(
            f"Allocated specialization audit: "
            f"{spec_satisfied}/{spec_total} specifications satisfied"
        )
        print()

    def print_promotion_target_summary(
        self,
        working: AuditWorkingData,
    ) -> None:
        target_year = self._promotion_target_year()

        if target_year is None:
            print("Promotion target: unknown because academic_year is missing.")
            print()
            return

        rows = self._promotion_rows_for_target(
            working.promotion_audit,
            target_year,
        )

        if rows.empty:
            print(f"Promotion to Year {target_year}: not evaluated")
            print()
            return

        satisfied, total = self._status_counts(
            rows,
            status_column="status",
        )

        if satisfied == total:
            status = "satisfied"
        elif satisfied > 0:
            status = "partial"
        else:
            status = "missing"

        print(
            f"Promotion to Year {target_year}: "
            f"{status} ({satisfied}/{total} specifications satisfied)"
        )
        print()

    def print_missing_or_partial_requirements(
        self,
        working: AuditWorkingData,
        max_missing_rows: int = 12,
        max_courses_to_show: int = 3,
    ) -> None:
        print("Missing or Partial Requirements")
        print("-------------------------------")

        sections_printed = 0

        sections_printed += self._print_missing_faculty_rows(
            working.faculty_audit_summary,
            max_rows=max_missing_rows,
        )

        sections_printed += self._print_missing_allocated_specialization_rows(
            working.allocated_specialization_audit,
            max_rows=max_missing_rows,
            max_courses_to_show=max_courses_to_show,
        )

        sections_printed += self._print_missing_promotion_target_rows(
            working.promotion_audit,
            max_rows=max_missing_rows,
        )

        if sections_printed == 0:
            print()
            print("No missing or partial requirements found in the selected audit mode.")

        print()

    # ------------------------------------------------------------------
    # Missing/partial section printers
    # ------------------------------------------------------------------

    def _print_missing_faculty_rows(
        self,
        faculty_df: pd.DataFrame | None,
        max_rows: int,
    ) -> int:
        if faculty_df is None or faculty_df.empty:
            return 0

        missing = faculty_df[
            faculty_df["status"].astype(str).str.lower() != "satisfied"
        ].copy()

        if missing.empty:
            return 0

        print()
        print("Faculty:")

        for _, row in missing.head(max_rows).iterrows():
            print(self._describe_faculty_row(row))
            print()

        remaining = len(missing) - max_rows

        if remaining > 0:
            print(f"... {remaining} additional Faculty requirement(s) not shown.")
            print()

        return 1

    def _print_missing_allocated_specialization_rows(
        self,
        allocated_df: pd.DataFrame | None,
        max_rows: int,
        max_courses_to_show: int,
    ) -> int:
        if allocated_df is None or allocated_df.empty:
            return 0

        status_column = (
            "allocated_status"
            if "allocated_status" in allocated_df.columns
            else "status"
        )

        missing = allocated_df[
            allocated_df[status_column].astype(str).str.lower() != "satisfied"
        ].copy()

        if missing.empty:
            return 0

        print()
        print("Specialization:")

        for _, row in missing.head(max_rows).iterrows():
            print(
                self._describe_allocated_specialization_row(
                    row,
                    status_column=status_column,
                    max_courses_to_show=max_courses_to_show,
                )
            )
            print()

        remaining = len(missing) - max_rows

        if remaining > 0:
            print(
                f"... {remaining} additional specialization requirement(s) not shown."
            )
            print()

        return 1

    def _print_missing_promotion_target_rows(
        self,
        promotion_df: pd.DataFrame | None,
        max_rows: int,
    ) -> int:
        target_year = self._promotion_target_year()

        if target_year is None:
            return 0

        rows = self._promotion_rows_for_target(
            promotion_df,
            target_year,
        )

        if rows.empty:
            return 0

        missing = rows[
            rows["status"].astype(str).str.lower() != "satisfied"
        ].copy()

        if missing.empty:
            return 0

        print()
        print(f"Promotion to Year {target_year}:")

        for _, row in missing.head(max_rows).iterrows():
            print(self._describe_promotion_row(row))
            print()

        remaining = len(missing) - max_rows

        if remaining > 0:
            print(f"... {remaining} additional promotion requirement(s) not shown.")
            print()

        return 1

    # ------------------------------------------------------------------
    # Row description helpers
    # ------------------------------------------------------------------

    def _describe_faculty_row(
        self,
        row,
    ) -> str:
        requirement_id = row.get("requirement_id", "Faculty requirement")
        status = row.get("status", "")
        completed = row.get("completed", "")
        required = row.get("required", "")
        remaining = row.get("remaining", "")
        unit = row.get("unit", "")
        notes = row.get("notes", "")

        lines = [
            f"{requirement_id}: {status}",
            (
                f"  Progress: {self._format_number(completed)} / "
                f"{self._format_number(required)} {unit}; "
                f"remaining: {self._format_number(remaining)} {unit}"
            ),
        ]

        if str(requirement_id).upper() == "TOTAL_CREDITS":
            lines.append(
                f"  Require {self._format_number(remaining)} more credits to graduate."
            )

        if notes:
            lines.append(f"  Notes: {notes}")

        return "\n".join(lines)

    def _describe_allocated_specialization_row(
        self,
        row,
        status_column: str,
        max_courses_to_show: int,
    ) -> str:
        group_id = row.get("group_id", "Specialization requirement")
        status = row.get(status_column, "")
        label = row.get("label", "")
        area = row.get("requirement_area", "")

        completed = row.get("allocated_completed", row.get("completed", ""))
        required = row.get("allocated_required", row.get("required", ""))
        remaining = row.get("allocated_remaining", row.get("remaining", ""))
        unit = row.get("allocated_unit", row.get("unit", ""))

        allocated_courses = row.get(
            "allocated_courses",
            row.get("matched_courses", "")
        )

        allocation_notes = row.get(
            "allocation_notes",
            row.get("notes", "")
        )

        lines = [
            f"{group_id}: {status}",
        ]

        if area:
            lines.append(f"  Area: {area}")

        if label:
            lines.append(f"  Label: {label}")

        if unit:
            lines.append(
                f"  Progress: {self._format_number(completed)} / "
                f"{self._format_number(required)} {unit}; "
                f"remaining: {self._format_number(remaining)} {unit}"
            )

        limited_courses = self._limited_course_list(
            allocated_courses,
            max_courses=max_courses_to_show,
        )

        if limited_courses:
            lines.append(f"  Allocated courses: {limited_courses}")

        if allocation_notes:
            lines.append(f"  Notes: {allocation_notes}")

        return "\n".join(lines)

    def _describe_promotion_row(
        self,
        row,
    ) -> str:
        rule_id = row.get("rule_id", "Promotion requirement")
        status = row.get("status", "")
        completed = row.get("completed", "")
        required = row.get("required", "")
        remaining = row.get("remaining", "")
        unit = row.get("unit", "")
        notes = row.get("notes", "")

        lines = [
            f"{rule_id}: {status}",
            (
                f"  Progress: {self._format_number(completed)} / "
                f"{self._format_number(required)} {unit}; "
                f"remaining: {self._format_number(remaining)} {unit}"
            ),
        ]

        if notes:
            lines.append(f"  Notes: {notes}")

        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Summary calculation helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _status_counts(
        df: pd.DataFrame | None,
        status_column: str,
    ) -> tuple[int, int]:
        if df is None or df.empty:
            return 0, 0

        if status_column not in df.columns:
            return 0, len(df)

        statuses = df[status_column].astype(str).str.lower()

        satisfied = statuses.eq("satisfied").sum()
        total = len(df)

        return int(satisfied), int(total)

    def _promotion_target_year(self) -> int | None:
        academic_year = self.bundle.profile.academic_year

        if academic_year is None:
            return None

        return int(academic_year) + 1

    @staticmethod
    def _promotion_rows_for_target(
        promotion_df: pd.DataFrame | None,
        target_year: int,
    ) -> pd.DataFrame:
        if promotion_df is None or promotion_df.empty:
            return pd.DataFrame()

        return promotion_df[
            promotion_df["promotion_to"].astype(str) == str(target_year)
        ].copy()

    def _counted_credits(
        self,
        classified_courses: pd.DataFrame | None,
    ) -> float:
        if classified_courses is None or classified_courses.empty:
            return 0

        statuses = {
            status.strip().lower()
            for status in self.bundle.options.count_statuses
        }

        excluded = {
            "failed",
            "withdrawn",
            "w",
            "fail",
        }

        df = classified_courses.copy()

        normalized = df["status"].astype(str).str.strip().str.lower()

        counted = df[
            normalized.isin(statuses)
            & ~normalized.isin(excluded)
        ].copy()

        return float(counted["credits"].sum())

    @staticmethod
    def _format_number(value) -> str:
        try:
            value = float(value)
        except (TypeError, ValueError):
            return str(value)

        if value.is_integer():
            return str(int(value))

        return f"{value:.1f}"

    @staticmethod
    def _limited_course_list(
        course_string,
        max_courses: int,
    ) -> str:
        if course_string is None:
            return ""

        courses = [
            item.strip()
            for item in str(course_string).split(";")
            if item.strip()
        ]

        if not courses:
            return ""

        shown = courses[:max_courses]
        remaining = len(courses) - len(shown)

        text = ";".join(shown)

        if remaining > 0:
            text = f"{text}; ... +{remaining} more"

        return text