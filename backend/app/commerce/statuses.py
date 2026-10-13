from abc import ABC, abstractmethod


class StatusMapper(ABC):
    @abstractmethod
    def to_platform(self, external_status: str) -> str | None: ...


class ConfigurableStatusMapper(StatusMapper):
    def __init__(self, mapping: dict[str, str]):
        self.mapping = mapping

    def to_platform(self, external_status: str) -> str | None:
        return self.mapping.get(external_status)


class MockStatusMapper(ConfigurableStatusMapper):
    def __init__(self):
        super().__init__({"MOCK_RECEIVED": "received"})
