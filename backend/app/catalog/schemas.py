"""Catalog wire contract. Money is serialized as a decimal string, never a float."""

import json
import re
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator

from app.catalog.assets import public_assets
from app.core.config import get_settings
from app.core.schemas import APIRequest

# ISO 4217 active currency codes (including fund/metal codes). No regional default.
CURRENCY_CODES = frozenset(
    "AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BOV "
    "BRL BSD BTN BWP BYN BZD CAD CDF CHE CHF CHW CLF CLP CNY COP COU CRC CUP CVE CZK "
    "DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL "
    "HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT "
    "LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR "
    "MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF "
    "SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP "
    "TRY TTD TWD TZS UAH UGX USD USN UYI UYU UYW UZS VED VES VND VUV WST XAF XAG XAU "
    "XBA XBB XBC XBD XCD XCG XDR XOF XPD XPF XPT XSU XUA YER ZAR ZMW ZWG".split()
)
Key = Annotated[
    str, StringConstraints(min_length=1, max_length=240, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
]
Status = Literal["draft", "published", "hidden"]
PriceMode = Literal["on_request", "fixed"]
Money = Annotated[Decimal, Field(ge=0, max_digits=18, decimal_places=2, allow_inf_nan=False)]


class MediaRef(APIRequest):
    path: str = Field(max_length=500)
    kind: Literal["image", "document"] = "image"
    alt: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def local_asset_only(self):
        # Reject protocol-relative URLs, encoded traversal, query strings and active documents.
        if not re.fullmatch(
            r"/(?:catalog-products|catalog-source|brand)/[A-Za-z0-9_./-]+", self.path
        ):
            raise ValueError("Media must reference a local public catalog asset")
        if any(part in {"", ".", ".."} for part in self.path[1:].split("/")):
            raise ValueError("Media path must be canonical")
        extensions = (".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif")
        if self.kind == "document":
            extensions = (".pdf",)
        if not self.path.lower().endswith(extensions):
            raise ValueError("Unsupported public asset type")
        if self.path not in public_assets():
            raise ValueError("Media asset is not included in the published catalog release")
        return self


class ProductFields(APIRequest):
    category_id: uuid.UUID
    slug: Key
    sku: str | None = Field(default=None, min_length=1, max_length=120)
    translations: dict[str, dict[str, str]]
    status: Status = "draft"
    comparable: bool = True
    price: Money | None = None
    currency: str | None = None
    price_mode: PriceMode = "on_request"
    specs: dict[str, Any] = Field(default_factory=dict)
    provenance: dict[str, Any] = Field(default_factory=dict)
    media: list[MediaRef] = Field(default_factory=list, max_length=50)

    @field_validator("specs", "provenance")
    @classmethod
    def bounded_json(cls, value):
        try:
            payload = json.dumps(value, allow_nan=False)
        except (ValueError, TypeError, RecursionError) as exc:
            raise ValueError("Catalog data must be finite valid JSON") from exc
        if len(payload.encode("utf-8")) > 256 * 1024:
            raise ValueError("Catalog data must not exceed 256 KiB")
        return value

    @field_validator("specs")
    @classmethod
    def valid_specs(cls, value):
        def spec_rows(rows):
            if not isinstance(rows, list) or len(rows) > 500:
                raise ValueError("Specifications must be a list of up to 500 rows")
            for row in rows:
                if not isinstance(row, dict) or not isinstance(row.get("label"), str):
                    raise ValueError("Each specification needs a text label")
                if not isinstance(row.get("value"), (str, int, float)) or isinstance(
                    row.get("value"), bool
                ):
                    raise ValueError("Each specification needs a text or numeric value")
                if row.get("unit") is not None and not isinstance(row["unit"], str):
                    raise ValueError("Specification units must be text")
                if row.get("page") is not None and (
                    type(row["page"]) is not int or row["page"] < 1
                ):
                    raise ValueError("Source pages must be positive integers")

        for name in ("technicalSpecs", "variantSpecs"):
            if name in value:
                spec_rows(value[name])
        if "configurations" in value:
            configurations = value["configurations"]
            if not isinstance(configurations, list) or len(configurations) > 500:
                raise ValueError("Configurations must be a list of up to 500 rows")
            for configuration in configurations:
                if not isinstance(configuration, dict) or not isinstance(
                    configuration.get("designation"), str
                ):
                    raise ValueError("Configurations require a designation")
                spec_rows(configuration.get("specifications", []))
        for name in ("notes", "manufacturers", "variantIds"):
            if name in value and (
                not isinstance(value[name], list)
                or any(not isinstance(v, str) for v in value[name])
            ):
                raise ValueError(f"{name} must be a list of strings")
        for name in (
            "voltage",
            "voltageUnit",
            "cooling",
            "installation",
            "subtype",
            "manufacturer",
            "recordKind",
            "recordType",
            "series",
            "familyId",
            "familyName",
        ):
            if value.get(name) is not None and not isinstance(value[name], str):
                raise ValueError(f"{name} must be text or null")
        if value.get("power") is not None and (
            type(value["power"]) not in (int, float) or value["power"] < 0
        ):
            raise ValueError("power must be a nonnegative number or null")
        if "isOrderableSku" in value and type(value["isOrderableSku"]) is not bool:
            raise ValueError("isOrderableSku must be a boolean")
        return value

    @field_validator("provenance")
    @classmethod
    def valid_provenance(cls, value):
        def safe_url(url):
            if not isinstance(url, str) or len(url) > 2000 or any(ord(c) < 33 for c in url):
                raise ValueError("Source URL must be an HTTP(S) URL")
            parsed = urlsplit(url)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.hostname
                or parsed.username
                or parsed.password
                or "\\" in url
            ):
                raise ValueError("Source URL must be an HTTP(S) URL without credentials")

        if value.get("sourceUrl") is not None and value.get("sourceUrl") != "":
            safe_url(value["sourceUrl"])
        if "additionalSources" in value:
            sources = value["additionalSources"]
            if not isinstance(sources, list) or len(sources) > 50:
                raise ValueError("additionalSources must be a list of up to 50 links")
            for source in sources:
                if not isinstance(source, dict) or not isinstance(source.get("label", ""), str):
                    raise ValueError("Source links require an object with a text label")
                safe_url(source.get("url"))
        if "sourcePages" in value and (
            not isinstance(value["sourcePages"], list)
            or any(type(page) is not int or page < 1 for page in value["sourcePages"])
        ):
            raise ValueError("Source pages must be positive integers")
        for name in ("sourceKind", "sourceTitle", "sourceCheckedAt"):
            if value.get(name) is not None and not isinstance(value[name], str):
                raise ValueError(f"{name} must be text or null")
        return value

    @field_validator("sku")
    @classmethod
    def valid_sku(cls, value):
        if value is not None and (value != value.strip() or any(ord(c) < 32 for c in value)):
            raise ValueError("SKU must be nonblank and have no surrounding whitespace or controls")
        return value

    @field_validator("translations")
    @classmethod
    def valid_translations(cls, value):
        if not value or not any(item.get("name", "").strip() for item in value.values()):
            raise ValueError("At least one translated product name is required")
        for locale, item in value.items():
            if not re.fullmatch(r"[a-z]{2}(?:-[A-Z]{2})?", locale):
                raise ValueError("Invalid locale")
            if any(key not in {"name", "description"} for key in item):
                raise ValueError("Translations accept name and description only")
            if len(item.get("name", "")) > 500 or len(item.get("description", "")) > 20000:
                raise ValueError("Product text is too long")
        return value

    @field_validator("currency")
    @classmethod
    def valid_currency(cls, value):
        if value is not None:
            if value not in CURRENCY_CODES:
                raise ValueError("Currency must be an uppercase ISO 4217 code")
            allowed = get_settings().catalog_allowed_currencies
            if allowed and value not in allowed:
                raise ValueError("Currency is not enabled for this catalog")
        return value

    @model_validator(mode="after")
    def consistent_price(self):
        if self.price_mode == "fixed" and (self.price is None or self.currency is None):
            raise ValueError("Fixed prices require price and currency")
        if self.price_mode == "on_request" and self.price is not None:
            raise ValueError("On-request prices must be null")
        return self


class ProductCreate(ProductFields):
    public_key: Key


class ProductUpdate(APIRequest):
    version: int = Field(ge=1, strict=True)
    category_id: uuid.UUID | None = None
    slug: Key | None = None
    sku: str | None = Field(default=None, min_length=1, max_length=120)
    translations: dict[str, dict[str, str]] | None = None
    status: Status | None = None
    comparable: bool | None = None
    price: Money | None = None
    currency: str | None = None
    price_mode: PriceMode | None = None
    specs: dict[str, Any] | None = None
    provenance: dict[str, Any] | None = None
    media: list[MediaRef] | None = Field(default=None, max_length=50)

    @model_validator(mode="after")
    def no_null_required_fields(self):
        nullable = {"sku", "price", "currency"}
        for field in self.model_fields_set - nullable:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class VersionRequest(APIRequest):
    version: int = Field(ge=1, strict=True)


class CategoryOut(BaseModel):
    id: uuid.UUID
    public_key: str
    parent_id: uuid.UUID | None
    slug: str
    translations: dict[str, Any]
    is_published: bool
    sort_order: int
    model_config = {"from_attributes": True}


class AttributeOut(BaseModel):
    code: str
    value: Any
    unit: str | None


class PublicProductOut(BaseModel):
    id: uuid.UUID
    category_public_key: str = ""
    public_key: str
    category_id: uuid.UUID
    slug: str
    sku: str | None
    translations: dict[str, Any]
    status: Status
    comparable: bool
    price: Decimal | None
    currency: str | None
    price_mode: PriceMode
    version: int
    sort_order: int
    specs: dict[str, Any]
    provenance: dict[str, Any]
    media: list[dict[str, Any]]
    attributes: list[AttributeOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class ProductOut(PublicProductOut):
    """Admin response retains immutable original import evidence."""

    source_data: dict[str, Any]
