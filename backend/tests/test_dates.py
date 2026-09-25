from datetime import date

import pytest
from pydantic import ValidationError

from app.dates import FuzzyDate, FuzzyDateOut


@pytest.mark.parametrize(
    ("parts", "label", "short"),
    [
        ({"year": 1931, "month": 3, "day": 12}, "12 March 1931", "1931"),
        ({"year": 1931, "month": 3}, "March 1931", "1931"),
        ({"qualifier": "about", "year": 1920}, "about 1920", "c. 1920"),
        ({"qualifier": "before", "year": 1885, "month": 6}, "before June 1885", "bef. 1885"),
        ({"qualifier": "after", "year": 1900}, "after 1900", "aft. 1900"),
        (
            {"qualifier": "between", "year": 1900, "year2": 1905},
            "between 1900 and 1905",
            "1900–1905",
        ),
        (
            {"qualifier": "between", "year": 1900, "month": 1, "year2": 1900, "month2": 6},
            "between January 1900 and June 1900",
            "1900",
        ),
        ({"phrase": "during the war"}, "during the war", ""),
    ],
)
def test_labels(parts, label, short):
    d = FuzzyDateOut(**parts)
    assert d.label == label
    assert d.short == short


def test_sort_date_is_the_earliest_possible_day():
    assert FuzzyDate(year=1931).sort_date() == date(1931, 1, 1)
    assert FuzzyDate(year=1931, month=3, day=12).sort_date() == date(1931, 3, 12)
    assert FuzzyDate(phrase="long ago").sort_date() is None


@pytest.mark.parametrize(
    ("parts", "message"),
    [
        ({"year": 1931, "day": 3}, "needs a month"),
        ({"month": 3}, "needs a year"),
        ({"year": 1931, "month": 2, "day": 30}, "only 28 days"),
        ({"year": 1900, "month": 2, "day": 29}, "only 28 days"),  # not a leap year
        ({"qualifier": "between", "year": 1905, "year2": 1900}, "ends before it starts"),
        ({"qualifier": "between", "year": 1900}, "end year"),
        ({"year": 1900, "year2": 1905}, "Only a 'between' date"),
        ({}, "at least a year"),
        ({"year": 0}, "greater than or equal to 1"),
    ],
)
def test_invalid_dates(parts, message):
    with pytest.raises(ValidationError, match=message):
        FuzzyDate(**parts)


def test_leap_day_is_fine():
    assert FuzzyDate(year=2000, month=2, day=29).sort_date() == date(2000, 2, 29)
