export interface LinkedInSnapshot {
  name: string;
  headline: string;
  location?: string;
  about?: string;
  experience: Array<{
    title: string;
    company: string;
    duration?: string;
    description?: string;
  }>;
  education: Array<{
    school: string;
    degree?: string;
    field?: string;
    years?: string;
  }>;
  skills: string[];
}
