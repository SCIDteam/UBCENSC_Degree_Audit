export type PlannerTermLabel =
  | "Winter Term 1"
  | "Winter Term 2"
  | "Summer";

export type CatalogueCourse = {
  course_code: string;
  display_code: string;
  subject: string;
  course_number: string;
  course_level: number;
  course_title: string;
  credits: number;
  terms_offered: PlannerTermLabel[];
  prerequisite_text: string;
  corequisite_text: string;
  prerequisites: string[];
  corequisites: string[];
};