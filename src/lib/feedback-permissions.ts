/** Inbox access only. Never use this permission to authorize other admin features. */
export function canReviewFeedback(user: {
  canReviewFeedback?: boolean;
  roles: { role: { name: string } }[];
}): boolean {
  return (
    user.canReviewFeedback === true ||
    user.roles.some(({ role }) => role.name === "SUPER_ADMIN" || role.name === "SOPORTE")
  );
}
