import pytest
from pydantic import ValidationError

from app.schemas.group import GroupCreate, GroupUpdate


def test_defaults_and_age_range_validation():
    group = GroupCreate(name="Python", age_range=" 14–18 lat ")
    assert group.age_range == "14–18 lat"
    assert group.achievements_enabled is True
    assert group.study_streak_enabled is False
    assert GroupUpdate(age_range=None).model_dump(exclude_unset=True) == {"age_range": None}


@pytest.mark.parametrize("payload", [{"age_range": " "}, {"age_range": "x" * 51}, {"age_range": 14},
                                     {"achievements_enabled": None}, {"study_streak_enabled": None},
                                     {"achievements_enabled": "true"}])
def test_invalid_group_defaults(payload):
    with pytest.raises(ValidationError):
        GroupCreate(name="Python", **payload)
    with pytest.raises(ValidationError):
        GroupUpdate(**payload)
