"""Pydantic models for the JSON slides intermediate layer."""

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Layout 1: Cover
# ---------------------------------------------------------------------------

class CoverSlide(BaseModel):
    layout: Literal["cover"]
    title: str = Field(max_length=15)
    subtitle: str | None = None


# ---------------------------------------------------------------------------
# Layout 2: Section Divider
# ---------------------------------------------------------------------------

class SectionDividerSlide(BaseModel):
    layout: Literal["section_divider"]
    label: str | None = None
    title: str = Field(max_length=15)
    description: str | None = None


# ---------------------------------------------------------------------------
# Layout 3: Big Number
# ---------------------------------------------------------------------------

class BigNumberItem(BaseModel):
    value: str
    unit: str | None = None
    label: str | None = None


class BigNumberSlide(BaseModel):
    layout: Literal["big_number"]
    title: str = Field(max_length=15)
    items: list[BigNumberItem] = Field(min_length=1, max_length=3)


# ---------------------------------------------------------------------------
# Layout 4: Card Grid
# ---------------------------------------------------------------------------

class CardItem(BaseModel):
    icon: str | None = None
    title: str = Field(max_length=15)
    description: str | None = Field(default=None, max_length=40)


class CardGridSlide(BaseModel):
    layout: Literal["card_grid"]
    title: str = Field(max_length=15)
    cards: list[CardItem] = Field(min_length=2, max_length=4)


# ---------------------------------------------------------------------------
# Layout 5: Dual Column
# ---------------------------------------------------------------------------

class DualColumnSide(BaseModel):
    icon: str | None = None
    title: str = Field(max_length=15)
    points: list[Annotated[str, Field(max_length=25)]]


class DualColumnSlide(BaseModel):
    layout: Literal["dual_column"]
    title: str = Field(max_length=15)
    left: DualColumnSide
    right: DualColumnSide


# ---------------------------------------------------------------------------
# Layout 6: Process Flow
# ---------------------------------------------------------------------------

class ProcessStep(BaseModel):
    title: str = Field(max_length=15)
    description: str | None = Field(default=None, max_length=40)


class ProcessFlowSlide(BaseModel):
    layout: Literal["process_flow"]
    title: str = Field(max_length=15)
    steps: list[ProcessStep] = Field(min_length=2, max_length=5)


# ---------------------------------------------------------------------------
# Layout 7: Content With Icon
# ---------------------------------------------------------------------------

class ContentBlock(BaseModel):
    title: str = Field(max_length=15)
    description: str = Field(max_length=60)


class ContentWithIconSlide(BaseModel):
    layout: Literal["content_with_icon"]
    title: str = Field(max_length=15)
    icon: str | None = None
    blocks: list[ContentBlock] = Field(min_length=1, max_length=4)


# ---------------------------------------------------------------------------
# Layout 8: Quote
# ---------------------------------------------------------------------------

class QuoteSlide(BaseModel):
    layout: Literal["quote_slide"]
    quote: str = Field(max_length=80)
    source: str | None = Field(default=None, max_length=30)


# ---------------------------------------------------------------------------
# Layout 9: Table
# ---------------------------------------------------------------------------

class TableSlide(BaseModel):
    layout: Literal["table"]
    title: str = Field(max_length=15)
    headers: list[str] = Field(min_length=2, max_length=8)
    rows: list[list[str]] = Field(min_length=1, max_length=12)


# ---------------------------------------------------------------------------
# Layout 10: Chart
# ---------------------------------------------------------------------------

class ChartSlide(BaseModel):
    layout: Literal["chart"]
    title: str = Field(max_length=15)
    chart_type: Literal["BAR", "PIE"]
    labels: list[str] = Field(min_length=2, max_length=8)
    values: list[float] = Field(min_length=2, max_length=8)


# ---------------------------------------------------------------------------
# Layout 11: Conclusion
# ---------------------------------------------------------------------------

class ConclusionPoint(BaseModel):
    text: str = Field(max_length=25)
    icon: str = "FaCheck"


class ConclusionSlide(BaseModel):
    layout: Literal["conclusion"]
    title: str = Field(max_length=15)
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
