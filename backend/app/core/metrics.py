from collections import defaultdict
from threading import Lock


class MetricsRecorder:
    """Provider-neutral, low-cardinality metrics boundary."""

    def increment(self, name: str, value: int = 1) -> None:
        raise NotImplementedError

    def observe(self, name: str, value: float) -> None:
        raise NotImplementedError

    def snapshot(self) -> dict[str, int | float]:
        raise NotImplementedError


class MemoryMetricsRecorder(MetricsRecorder):
    """Single-process DEV/test recorder; production exporters implement the same boundary."""

    def __init__(self) -> None:
        self._counters: dict[str, int] = defaultdict(int)
        self._totals: dict[str, float] = defaultdict(float)
        self._samples: dict[str, int] = defaultdict(int)
        self._lock = Lock()

    def increment(self, name: str, value: int = 1) -> None:
        with self._lock:
            self._counters[name] += value

    def observe(self, name: str, value: float) -> None:
        with self._lock:
            self._totals[name] += value
            self._samples[name] += 1

    def snapshot(self) -> dict[str, int | float]:
        with self._lock:
            values: dict[str, int | float] = dict(self._counters)
            for name, total in self._totals.items():
                values[f"{name}_sum"] = round(total, 6)
                values[f"{name}_count"] = self._samples[name]
            return values

    def clear(self) -> None:
        with self._lock:
            self._counters.clear()
            self._totals.clear()
            self._samples.clear()


metrics = MemoryMetricsRecorder()

