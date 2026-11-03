from sqlalchemy import select
from app.models.review import SubmissionReview


def public_review(review=None):
    # Deliberately excludes reviewer identity and all private-note data.
    return dict(status=review.decision if review else "PENDING",
                feedback=review.feedback if review else "", reviewed_at=review.reviewed_at if review else None)


def review_map(db, ids):
    if not ids:
        return {}
    return {r.submission_id: r for r in db.scalars(select(SubmissionReview).where(SubmissionReview.submission_id.in_(ids)))}
