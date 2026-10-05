from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from domain.detection import (
    KorgisCPUUsage,
    KorgisMemoryUsage,
    KorgisRequestEvidence,
    KorgisResourceUsage,
    KorgisSamplingInfo,
)
from services.resource_evidence import ResourceEvidenceAccumulator


def _evidence(
    *,
    peak_memory: int,
    peak_delta: int,
    avg_cpu: float,
    peak_cpu: float,
    samples: int = 4,
    interval: int = 100,
    observation_ms: float | None = None,
    scope: str = "korgis_process_tree",
    quality: str = "process_global",
):
    return KorgisRequestEvidence(
        evidence_version="korgis-request-evidence-v1",
        request_id="req-test",
        execution_source="inference",
        resources=KorgisResourceUsage(
            snapshot_id="resource-test",
            memory=KorgisMemoryUsage(
                baseline_bytes=100,
                peak_bytes=peak_memory,
                end_bytes=110,
                peak_delta_bytes=peak_delta,
            ),
            cpu=KorgisCPUUsage(
                average_percent=avg_cpu,
                peak_percent=peak_cpu,
            ),
            sampling=KorgisSamplingInfo(
                interval_ms=interval,
                sample_count=samples,
                errors=0,
                cpu_observation_ms=(
                    observation_ms
                    if observation_ms is not None
                    else float(samples * interval)
                ),
            ),
            attribution_scope=scope,
            attribution_quality=quality,
            memory_source="ps_process_tree_cpu_time_delta_excluding_sampler",
            cpu_source="ps_process_tree_cpu_time_delta_excluding_sampler",
        ),
    )


class ResourceEvidenceAggregationTests(unittest.TestCase):
    def test_ram_peaks_are_max_not_sum_and_cpu_average_is_duration_weighted(self):
        acc = ResourceEvidenceAccumulator()
        acc.record_inference(
            _evidence(
                peak_memory=500,
                peak_delta=200,
                avg_cpu=100.0,
                peak_cpu=150.0,
                samples=2,
                observation_ms=100.0,
            )
        )
        acc.record_inference(
            _evidence(
                peak_memory=700,
                peak_delta=300,
                avg_cpu=200.0,
                peak_cpu=260.0,
                samples=6,
                observation_ms=900.0,
            )
        )

        summary = acc.summary()

        self.assertEqual(summary.inference_requests, 2)
        self.assertEqual(summary.evidence_requests, 2)
        self.assertEqual(summary.peak_memory_bytes, 700)
        self.assertEqual(summary.peak_memory_delta_bytes, 300)
        self.assertEqual(summary.peak_cpu_percent, 260.0)
        self.assertEqual(summary.average_cpu_percent, 190.0)
        self.assertEqual(summary.cpu_observation_ms, 1000.0)
        self.assertEqual(
            summary.memory_sources,
            ("ps_process_tree_cpu_time_delta_excluding_sampler",),
        )
        self.assertEqual(
            summary.cpu_sources,
            ("ps_process_tree_cpu_time_delta_excluding_sampler",),
        )
        self.assertEqual(
            summary.attribution_qualities,
            ("process_global",),
        )

    def test_incompatible_attribution_keeps_combined_average_cpu_unavailable(self):
        acc = ResourceEvidenceAccumulator()
        acc.record_inference(
            _evidence(
                peak_memory=500,
                peak_delta=200,
                avg_cpu=100.0,
                peak_cpu=150.0,
                quality="process_global",
            )
        )
        acc.record_inference(
            _evidence(
                peak_memory=600,
                peak_delta=250,
                avg_cpu=180.0,
                peak_cpu=220.0,
                quality="exclusive",
            )
        )

        summary = acc.summary()

        self.assertIsNone(summary.average_cpu_percent)
        self.assertEqual(
            summary.attribution_qualities,
            ("exclusive", "process_global"),
        )

    def test_missing_evidence_counts_inference_but_does_not_fabricate_resources(self):
        acc = ResourceEvidenceAccumulator()
        acc.record_inference(None)

        summary = acc.summary()

        self.assertEqual(summary.inference_requests, 1)
        self.assertEqual(summary.evidence_requests, 0)
        self.assertIsNone(summary.peak_memory_bytes)
        self.assertIsNone(summary.peak_cpu_percent)


if __name__ == "__main__":
    unittest.main()
