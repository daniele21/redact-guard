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
    cpu_sample_count: int | None = None
    sampling_interval_ms: int | None = None
    cpu_observation_ms: float | None = None
    memory_sources: tuple[str, ...] = ()
    cpu_sources: tuple[str, ...] = ()
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

        memory_sources = tuple(sorted({
            item.memory_source
            for item in resources
            if item.memory_source
        }))
        cpu_sources = tuple(sorted({
            item.cpu_source
            for item in resources
            if item.cpu_source
        }))
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

        (
            average_cpu,
            cpu_sample_count,
            sampling_interval,
            cpu_observation_ms,
        ) = _compatible_cpu_aggregate(resources)

        return ResourceEvidenceSummary(
            inference_requests=self.inference_requests,
            evidence_requests=len(resources),
            peak_memory_bytes=peak_memory,
            peak_memory_delta_bytes=peak_delta,
            peak_cpu_percent=peak_cpu,
            average_cpu_percent=average_cpu,
            cpu_sample_count=cpu_sample_count,
            sampling_interval_ms=sampling_interval,
            cpu_observation_ms=cpu_observation_ms,
            memory_sources=memory_sources,
            cpu_sources=cpu_sources,
            attribution_scopes=scopes,
            attribution_qualities=qualities,
        )


def _compatible_cpu_aggregate(
    resources,
) -> tuple[float | None, int | None, int | None, float | None]:
    """Combine CPU averages only when sampling and attribution semantics match."""
    entries = []
    compatibility_keys = set()
    for item in resources:
        average = item.cpu.average_percent
        count = item.sampling.sample_count
        interval = item.sampling.interval_ms
        if average is None or count is None or count <= 0 or interval is None:
            continue
        observed_ms = item.sampling.cpu_observation_ms
        weight_ms = (
            observed_ms
            if observed_ms is not None and observed_ms > 0
            else float(count * interval)
        )
        compatibility_keys.add(
            (interval, item.attribution_scope, item.attribution_quality)
        )
        entries.append((average, count, weight_ms, observed_ms))

    if not entries or len(entries) != len(resources):
        return None, None, None, None
    if len(compatibility_keys) != 1:
        return None, None, None, None

    total_weight_ms = sum(weight_ms for _, _, weight_ms, _ in entries)
    total_samples = sum(count for _, count, _, _ in entries)
    if total_weight_ms <= 0 or total_samples <= 0:
        return None, None, None, None

    interval = next(iter(compatibility_keys))[0]
    average = (
        sum(value * weight_ms for value, _, weight_ms, _ in entries)
        / total_weight_ms
    )
    exact_observation_ms = (
        sum(float(observed_ms) for _, _, _, observed_ms in entries)
        if all(
            observed_ms is not None and observed_ms > 0
            for _, _, _, observed_ms in entries
        )
        else None
    )
    return average, total_samples, interval, exact_observation_ms


def _max_optional(values) -> int | None:
    present = [value for value in values if value is not None]
    return max(present) if present else None


def _max_optional_float(values) -> float | None:
    present = [float(value) for value in values if value is not None]
    return max(present) if present else None
