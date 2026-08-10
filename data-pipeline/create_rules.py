import pandas as pd
from pathlib import Path
import numpy as np
import json
import os

def read_data(dir_path):
    dir_path = Path(dir_path)

    requirements_df = {}
    for file_path in dir_path.glob("*.csv*"):
        try:
            name = file_path.name.replace('.csv', '')
            requirements_df[name] = pd.read_csv(file_path)
        except Exception as e:
            print(f"Error reading {file_path.name}: {e}")

    return requirements_df

def write_json_to(result, output_path):
    with open(output_path, "w", encoding="utf-8") as file:
        json.dump(result, file, indent=4)

def create_faculty_requirement_rules(faculty_requirement_rules: pd.DataFrame):
    return (
        faculty_requirement_rules
        .rename(
            columns = {
                "requirement_id": "id",
                "rule_type": "metric",
                "program_context": "applicable_program"
            }
        )
        .drop(columns=["requirement_area"])
        .to_dict(orient='records')
    )


def create_course_rules(courseRules: pd.DataFrame):
    courseRules['unit'] = 'credits'
    return (
        courseRules
        .rename(
            columns = {
                "requirement_id": "id",
                "rule_type": "metric",
                "program_type": "applicable_program",
                "program": "program_context",
                "credits": "value"
            }
        )
        .drop(columns=["requirement_area"])
        .to_dict(orient='records')
    )

def create_promotion_rules(promotion_rules: pd.DataFrame):
    promotion_rules['course_level_min'] = (
        promotion_rules['course_level_min']
        .astype("Int64")
        .astype(str)
        .fillna("")
    )
    promotion_rules['course_level_max'] = (
        promotion_rules['course_level_max']
        .astype("Int64")
        .astype(str)
        .fillna("")
    )
    return (
        promotion_rules
        .rename(
            columns = {
                "rule_id": "id",
                "rule_type": "metric",
                "program_context": "context"
            }
        )
        .drop(columns=["requirement_area"])
        .to_dict(orient='records')
    )

def create_course_requirements(course_requirements: pd.DataFrame):
    course_requirements['unit'] = 'credits'
    # For rule types where the rule value relates to credits
    course_requirements['rule_value'] = np.where(
        course_requirements['rule_type'].str.contains('credit'), 
        course_requirements['credits'], 
        course_requirements['rule_value']
    )
    course_requirements['rule_unit'] = np.where(
        course_requirements['rule_type'].str.contains('credit'), 
        'credits', 
        course_requirements['rule_unit']
    )
    course_requirements['rule_value'] = (
        course_requirements['rule_value']
        .astype("Int64")
        .fillna(-1)
    )
    course_requirements['rule_unit'] = (
        course_requirements['rule_unit']
        .astype(str)
        .fillna("")
    )
    return (
        course_requirements
        .rename(
            columns = {
                "group_id": "id",
                "rule_type": "metric",
                "rule_value": "value",
                "source_text": "notes",
                "program_type": "applicable_program"
            }
        )
        .drop(
            columns = [
                'credits',
                'year_level', 
                'requirement_area', 
                'option_id',
                'option_name',
                'option_name_raw',
                'theme',
                'is_recommended',
                'label',
                'rule_subject',
                'include_pattern',
                'exclude_pattern'
            ]
        )
        .to_dict(orient='records')
    )

if __name__ == "__main__":
    output_path = "./output/rules.json"

    rules = {}

    # Faculty Requirements
    faculty_requirements_dir = "./faculty_requirements"
    requirements = read_data(faculty_requirements_dir)

    rules['facultyRequirements'] = create_faculty_requirement_rules(requirements['faculty_requirement_rules'])
    rules['courseRules'] = create_course_rules(requirements['faculty_requirement_courses'])
    rules['promotionRules'] = create_promotion_rules(requirements['promotion_rules'])

    # Course Requirements
    course_requirements_dir = "./course_requirements"
    rules[f"courseRequirements"] = []
    for program_year in ['ensc_2024_2025', 'ensc_2026_2027']:
        dir_name = os.path.join(course_requirements_dir, program_year)
        requirements = read_data(dir_name)    
        rules[f"courseRequirements"].extend(
            create_course_requirements(
                requirements['requirement_groups']
            )
        )
    
    write_json_to(rules, output_path)