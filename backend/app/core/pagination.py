from fastapi import Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from app.core.config import get_settings


class PageParams:
    def __init__(
        self,
        page: int = Query(default=1, ge=1),
        page_size: int | None = Query(default=None, ge=1),
    ):
        settings = get_settings()
        self.page = page
        self.page_size = min(page_size or settings.default_page_size, settings.max_page_size)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class Page[T](BaseModel):
    items: list[T]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1)
    total: int = Field(ge=0)


async def paginate[T](
    session: AsyncSession, statement: Select[tuple[T]], params: PageParams
) -> tuple[list[T], int]:
    count_query = select(func.count()).select_from(statement.order_by(None).subquery())
    total = await session.scalar(count_query)
    items = await session.scalars(statement.offset(params.offset).limit(params.page_size))
    return list(items.unique().all()), int(total or 0)
