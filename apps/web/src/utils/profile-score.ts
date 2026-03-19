/**
 * Profile Completeness Scoring Utility
 * 
 * Weights:
 * - Basic Info (20%): first_name, last_name, phone, location, linkedin_url
 * - About/Headline (10%): headline, bio/about
 * - Experience (25%): at least 1 entry with description
 * - Education (15%): at least 1 entry
 * - Skills (15%): at least 5 skills
 * - Projects (15%): at least 1 project with description
 */

export function calculateProfileScore(profile: any): number {
  if (!profile) return 0;
  
  let score = 0;

  // 1. Basic Info (Max 20)
  if (profile.first_name) score += 4;
  if (profile.last_name) score += 4;
  if (profile.phone) score += 4;
  if (profile.location_city || profile.location_country) score += 4;
  if (profile.linkedin_url) score += 4;

  // 2. Headline & About (Max 10)
  if (profile.headline) score += 5;
  if (profile.about || (profile.experience && profile.experience.length > 0)) score += 5;

  // 3. Experience (Max 25)
  if (Array.isArray(profile.experience) && profile.experience.length > 0) {
    score += 15; // At least one entry
    const hasDescription = profile.experience.some((exp: any) => 
      exp.responsibilities && exp.responsibilities.length > 0
    );
    if (hasDescription) score += 10;
  }

  // 4. Education (Max 15)
  if (Array.isArray(profile.education) && profile.education.length > 0) {
    score += 15;
  }

  // 5. Skills (Max 15)
  if (Array.isArray(profile.skills) && profile.skills.length > 0) {
    const skillCount = profile.skills.length;
    if (skillCount >= 5) score += 15;
    else if (skillCount >= 1) score += 5;
  }

  // 6. Projects (Max 15)
  if (Array.isArray(profile.projects) && profile.projects.length > 0) {
    score += 10;
    const hasDescription = profile.projects.some((p: any) => p.description);
    if (hasDescription) score += 5;
  }

  return Math.min(score, 100);
}
