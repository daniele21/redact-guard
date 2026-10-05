"""Conservative aggregation of Korgis request resource evidence.

Korgis owns measurement. RedactGuard only aggregates evidence whose semantics are
compatible and never fabricates missing values.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from domain.detection import KorgisRequestEvidence


@dataclass(frozen=True)
class ResourceEvidenceSummary:
    inference_requests: int = 0
    evidence_requests: int = 0
    peak_memory_bytes: int | None = None
    peak_memory_delta_bytes: int | None = None
    peak_cpu_percent: float | None = None
    average_cpu_percent: float | None = None
    attribution_scopes: tuple[str, ...] = ()
    attribution_qualities: tuple[str, ...] = ()


@dataclass
class ResourceEvidenceAccumulator:
    """Collect Korgis evidence without changing its attribution semantics."""

    inference_requests: int = 0
    _evidence: list[KorgisRequestEvidence] = field(default_factory=list)

    def record_inference(self, evidence: KorgisRequestEvidence | None) -> None:
        self.inference_requests += 1
        if (
            evidence is not None
            and evidence.execution_source == "inference"
            and evidence.resources is not None
        ):
            self._evidence.append(evidence)

    def summary(self) -> ResourceEvidenceSummary:
        resources = [
            item.resources
            for item in self._evidence
            if item.resources is not None
        ]

        peak_memory = _max_optional(
            item.memory.peak_bytes for item in resources
        )
        peak_delta = _max_optional(
            item.memory.peak_delta_bytes for item in resources
        )
        peak_cpu = _max_optional_float(
            item.cpu.peak_percent for item in resources
        )

        scopes = tuple(sorted({
            item.attribution_scope
            for item in resources
            if item.attribution_scope
        }))
        qualities = tuple(sorted({
            item.attribution_quality
            for item in resources
            if item.attribution_quality
        }))

        return ResourceEvidenceSummary(
            inference_requests=self.inference_requests,
            evidence_requests=len(resources),
            peak_memory_bytes=peak_memory,
            peak_memory_delta_bytes=peak_delta,
            peak_cpu_percent=peak_cpu,
            average_cpu_percent=_compatible_average_cpu(resources),
            attribution_scopes=scopes,
            attribution_qualities=qualities,
        )


def _compatible_average_cpu(resources) -> float | None:
    """Return a sample-weighted CPU average only for compatible samplers.

    Multiple request averages are combined only when sampling interval, scope and
    attribution quality agree and each request has a positive sample count.
    Otherwise the aggregate remains unavailable.
    """
    values = []
    compatibility_keys = set()
    for item in resources:
        average = item.cpu.average_percent
        count = item.sampling.sample_count
        interval = item.sampling.interval_ms
        if average is None or count is None or count <= 0 or interval is None:
            continue
        compatibility_keys.add(
            (interval, item.attribution_scope, item.attribution_quality)
        )
        values.append((average, count))

    if not values or len(values) != len(resources):
        return None
    if len(compatibility_keys) != 1:
        return None

    total_samples = sum(count for _, count in values)
    if total_samples <= 0:
        return None
    return sum(average * count for average, count in values) / total_samples


def _max_optional(values) -> int | None:
    present = [value for value in values if value is not None]
    return max(present) if present else None


def _max_optional_float(values) -> float | None:
    present = [float(value) for value in values if value is not None]
    return max(present) if present else None
