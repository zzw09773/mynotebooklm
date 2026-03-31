"""Pydantic models for the JSON slides intermediate layer."""

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, model_validator


# ---------------------------------------------------------------------------
# Shared base — every slide model carries optional speaker notes
# ---------------------------------------------------------------------------

class SlideBase(BaseModel):
    speaker_notes: str | None = Field(default=None, max_length=200)


# ---------------------------------------------------------------------------
# Layout 1: Cover
# ---------------------------------------------------------------------------

class CoverSlide(SlideBase):
    layout: Literal["cover"]
    title: str = Field(max_length=20)
    subtitle: str | None = Field(default=None, max_length=30)


# ---------------------------------------------------------------------------
# Layout 2: Section Divider
# ---------------------------------------------------------------------------

class SectionDividerSlide(SlideBase):
    layout: Literal["section_divider"]
    label: str | None = None
    title: str = Field(max_length=20)
    description: str | None = Field(default=None, max_length=40)


# ---------------------------------------------------------------------------
# Layout 3: Big Number
# ---------------------------------------------------------------------------

class BigNumberItem(BaseModel):
    value: str = Field(max_length=10)
    unit: str | None = Field(default=None, max_length=10)
    label: str | None = Field(default=None, max_length=15)


class BigNumberSlide(SlideBase):
    layout: Literal["big_number"]
    title: str = Field(max_length=20)
    items: list[BigNumberItem] = Field(min_length=1, max_length=3)


# ---------------------------------------------------------------------------
# Layout 4: Card Grid
# ---------------------------------------------------------------------------

class CardItem(BaseModel):
    icon: str | None = None
    title: str = Field(max_length=20)
    description: str | None = Field(default=None, max_length=40)


class CardGridSlide(SlideBase):
    layout: Literal["card_grid"]
    title: str = Field(max_length=20)
    cards: list[CardItem] = Field(min_length=2, max_length=4)


# ---------------------------------------------------------------------------
# Layout 5: Dual Column
# ---------------------------------------------------------------------------

class DualColumnSide(BaseModel):
    icon: str | None = None
    title: str = Field(max_length=20)
    points: list[Annotated[str, Field(max_length=25)]] = Field(min_length=1, max_length=5)


class DualColumnSlide(SlideBase):
    layout: Literal["dual_column"]
    title: str = Field(max_length=20)
    left: DualColumnSide
    right: DualColumnSide


# ---------------------------------------------------------------------------
# Layout 6: Process Flow
# ---------------------------------------------------------------------------

class ProcessStep(BaseModel):
    title: str = Field(max_length=20)
    description: str | None = Field(default=None, max_length=40)


class ProcessFlowSlide(SlideBase):
    layout: Literal["process_flow"]
    title: str = Field(max_length=20)
    steps: list[ProcessStep] = Field(min_length=3, max_length=5)


# ---------------------------------------------------------------------------
# Layout 7: Content With Icon
# ---------------------------------------------------------------------------

class ContentBlock(BaseModel):
    title: str = Field(max_length=20)
    description: str = Field(max_length=40)


class ContentWithIconSlide(SlideBase):
    layout: Literal["content_with_icon"]
    title: str = Field(max_length=20)
    icon: str | None = None
    blocks: list[ContentBlock] = Field(min_length=1, max_length=4)


# ---------------------------------------------------------------------------
# Layout 8: Quote
# ---------------------------------------------------------------------------

class QuoteSlide(SlideBase):
    layout: Literal["quote_slide"]
    quote: str = Field(max_length=60)
    source: str | None = Field(default=None, max_length=30)


# ---------------------------------------------------------------------------
# Layout 9: Table
# ---------------------------------------------------------------------------

class TableSlide(SlideBase):
    layout: Literal["table"]
    title: str = Field(max_length=20)
    headers: list[Annotated[str, Field(max_length=20)]] = Field(min_length=2, max_length=8)
    rows: list[list[Annotated[str, Field(max_length=20)]]] = Field(min_length=1, max_length=12)

    @model_validator(mode='after')
    def rows_match_header_count(self) -> 'TableSlide':
        n = len(self.headers)
        for i, row in enumerate(self.rows):
            if len(row) != n:
                raise ValueError(
                    f"Row {i} has {len(row)} cells but headers has {n} columns"
                )
        return self


# ---------------------------------------------------------------------------
# Layout 10: Chart
# ---------------------------------------------------------------------------

class ChartSlide(SlideBase):
    layout: Literal["chart"]
    title: str = Field(max_length=20)
    chart_type: Literal["BAR", "PIE"]
    labels: list[str] = Field(min_length=2, max_length=8)
    values: list[float] = Field(min_length=2, max_length=8)

    @model_validator(mode='after')
    def labels_values_same_length(self) -> 'ChartSlide':
        if len(self.labels) != len(self.values):
            raise ValueError(
                f"labels length ({len(self.labels)}) must equal values length ({len(self.values)})"
            )
        return self


# ---------------------------------------------------------------------------
# Layout 11: Conclusion
# ---------------------------------------------------------------------------

class ConclusionPoint(BaseModel):
    text: str = Field(max_length=25)
    icon: str = "FaCheck"


class ConclusionSlide(SlideBase):
    layout: Literal["conclusion"]
    title: str = Field(max_length=20)
    summary: str | None = Field(default=None, max_length=40)
    points: list[ConclusionPoint] = Field(min_length=1, max_length=5)


# ---------------------------------------------------------------------------
# Top-level discriminated union and spec
# ---------------------------------------------------------------------------

SlideData = Annotated[
    Union[
        CoverSlide,
        SectionDividerSlide,
        BigNumberSlide,
        CardGridSlide,
        DualColumnSlide,
        ProcessFlowSlide,
        ContentWithIconSlide,
        QuoteSlide,
        TableSlide,
        ChartSlide,
        ConclusionSlide,
    ],
    Field(discriminator="layout"),
]


class SlidesSpec(BaseModel):
    theme: Literal["tech", "ocean", "golden", "frost", "garden", "sports"] = "tech"
    narrative: str | None = None
    slides: list[SlideData] = Field(min_length=10, max_length=18)

    @model_validator(mode='after')
    def cover_first_conclusion_last(self) -> 'SlidesSpec':
        if not self.slides:
            return self
        first = self.slides[0]
        last = self.slides[-1]
        if getattr(first, 'layout', None) != 'cover':
            raise ValueError(
                f"First slide must be 'cover', got '{getattr(first, 'layout', '?')}'"
            )
        if getattr(last, 'layout', None) != 'conclusion':
            raise ValueError(
                f"Last slide must be 'conclusion', got '{getattr(last, 'layout', '?')}'"
            )
        return self
