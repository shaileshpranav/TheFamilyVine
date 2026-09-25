"""Approximate genealogical dates: "12 March 1931", "about 1920", "between 1900 and 1905".

A date is stored as parts (year, optional month and day) plus a qualifier, rather than as a
real date, because family records are rarely exact. Every stored date also gets a
`sort_date` (the earliest day it could mean) so timelines can be ordered.
"""

import calendar
import enum
from datetime import date

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator


class DateQualifier(enum.StrEnum):
    EXACT = "exact"
    ABOUT = "about"
    BEFORE = "before"
    AFTER = "after"
    BETWEEN = "between"


MONTHS = [calendar.month_name[i] for i in range(1, 13)]


def _check_parts(year: int | None, month: int | None, day: int | None, which: str) -> None:
    if day is not None and month is None:
        raise ValueError(f"A {which}day needs a month")
    if month is not None and year is None:
        raise ValueError(f"A {which}month needs a year")
    if day is not None and year is not None and month is not None:
        last = calendar.monthrange(year, month)[1]
        if day > last:
            raise ValueError(f"{MONTHS[month - 1]} {year} has only {last} days")


def _format_parts(year: int | None, month: int | None, day: int | None) -> str:
    if year is None:
        return ""
    if month is None:
        return str(year)
    if day is None:
        return f"{MONTHS[month - 1]} {year}"
    return f"{day} {MONTHS[month - 1]} {year}"


class FuzzyDate(BaseModel):
    model_config = ConfigDict(json_schema_serialization_defaults_required=True)

    qualifier: DateQualifier = DateQualifier.EXACT
    year: int | None = Field(None, ge=1, le=9999)
    month: int | None = Field(None, ge=1, le=12)
    day: int | None = Field(None, ge=1, le=31)
    # The end of a "between" range.
    year2: int | None = Field(None, ge=1, le=9999)
    month2: int | None = Field(None, ge=1, le=12)
    day2: int | None = Field(None, ge=1, le=31)
    # Free text for dates that don't fit the parts, e.g. "during the war".
    phrase: str = Field("", max_length=200)

    @model_validator(mode="after")
    def _check(self) -> "FuzzyDate":
        _check_parts(self.year, self.month, self.day, "")
        if self.qualifier == DateQualifier.BETWEEN:
            if self.year is None or self.year2 is None:
                raise ValueError("A date range needs a start year and an end year")
            _check_parts(self.year2, self.month2, self.day2, "second ")
            if self._end() < self._start():
                raise ValueError("The date range ends before it starts")
        elif any(v is not None for v in (self.year2, self.month2, self.day2)):
            raise ValueError("Only a 'between' date has an end date")
        if self.year is None and not self.phrase.strip():
            raise ValueError("Give at least a year, or describe the date")
        return self

    def _start(self) -> date:
        return date(self.year or 1, self.month or 1, self.day or 1)

    def _end(self) -> date:
        year, month = self.year2 or 1, self.month2 or 12
        return date(year, month, self.day2 or calendar.monthrange(year, month)[1])

    def sort_date(self) -> date | None:
        """The earliest day the date could mean, for ordering. None when there's no year."""
        return self._start() if self.year is not None else None

    def format_label(self) -> str:
        start = _format_parts(self.year, self.month, self.day)
        if not start:
            return self.phrase.strip()
        match self.qualifier:
            case DateQualifier.ABOUT:
                return f"about {start}"
            case DateQualifier.BEFORE:
                return f"before {start}"
            case DateQualifier.AFTER:
                return f"after {start}"
            case DateQualifier.BETWEEN:
                return f"between {start} and {_format_parts(self.year2, self.month2, self.day2)}"
            case _:
                return start

    def format_short(self) -> str:
        """Year-level form for lifespans: "1931", "c. 1920", "bef. 1885", "1900–1905"."""
        if self.year is None:
            return ""
        match self.qualifier:
            case DateQualifier.ABOUT:
                return f"c. {self.year}"
            case DateQualifier.BEFORE:
                return f"bef. {self.year}"
            case DateQualifier.AFTER:
                return f"aft. {self.year}"
            case DateQualifier.BETWEEN:
                return str(self.year) if self.year == self.year2 else f"{self.year}–{self.year2}"
            case _:
                return str(self.year)


class FuzzyDateOut(FuzzyDate):
    @computed_field  # type: ignore[prop-decorator]
    @property
    def label(self) -> str:
        return self.format_label()

    @computed_field  # type: ignore[prop-decorator]
    @property
    def short(self) -> str:
        return self.format_short()
