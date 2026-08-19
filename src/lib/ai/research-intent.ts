const REMINDER_TERMS = /\b(remind|reminder|notify|notification|alert)\b/i;
const MOVIE_TERMS = /\b(movie|film|cinema|theatrical)\b/i;
const RELEASE_TIMING_TERMS =
  /\b(premiere(?:s|d)?|release(?:d| date)?|comes?\s+out|in\s+theaters?|stream(?:ing)?\s+(?:date|release))\b/i;
const DATE_QUESTION_TERMS = /\b(date|when)\b/i;

/** True when a reminder depends on looking up a movie's release date. */
export function isMovieReleaseReminderIntent(text: string): boolean {
  return (
    REMINDER_TERMS.test(text) &&
    (RELEASE_TIMING_TERMS.test(text) ||
      (MOVIE_TERMS.test(text) && DATE_QUESTION_TERMS.test(text)))
  );
}
